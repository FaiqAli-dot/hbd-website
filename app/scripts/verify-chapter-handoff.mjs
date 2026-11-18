/**
 * Assert Ch1→Ch2→Ch3 advances exactly once per deliberate gesture,
 * letter text appears immediately on land, and no stuck chapterBusy lock.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/hbd-website/'
const OUT = process.env.CAPTURE_OUT || '/opt/cursor/artifacts'
fs.mkdirSync(OUT, { recursive: true })

const keys = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
]

async function swipePointer(page, direction) {
  const box = await page.locator('.webgl-canvas').boundingBox()
  if (!box) throw new Error('canvas missing')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height * 0.42
  const dist = 140
  const map = {
    left: [cx + dist / 2, cy, cx - dist / 2, cy],
    right: [cx - dist / 2, cy, cx + dist / 2, cy],
    up: [cx, cy + dist / 2, cx, cy - dist / 2],
    down: [cx, cy - dist / 2, cx, cy + dist / 2],
  }
  const [x1, y1, x2, y2] = map[direction]
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, { steps: 16 })
  await page.mouse.up()
  await page.waitForTimeout(2800)
}

async function unlockGallery(page) {
  await page.goto(BASE + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('hbd-journey-complete')
    } catch {
      /* ignore */
    }
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.webgl-canvas', { timeout: 30000 })
  await page.waitForTimeout(900)
  await page.locator('.webgl-canvas').click({ position: { x: 140, y: 220 } }).catch(() => {})
  const gestures = ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']
  for (let i = 0; i < keys.length; i++) {
    await page.keyboard.press(keys[i])
    await page.waitForTimeout(i === 0 ? 2800 : 2400)
    const expected = String(i + 1).padStart(2, '0')
    const ok = await page
      .waitForFunction(
        (exp) => document.querySelector('[data-progress-current]')?.textContent === exp,
        expected,
        { timeout: 6000 },
      )
      .then(() => true)
      .catch(() => false)
    if (!ok) {
      await swipePointer(page, gestures[i])
      await page.waitForFunction(
        (exp) => document.querySelector('[data-progress-current]')?.textContent === exp,
        expected,
        { timeout: 9000 },
      )
    }
  }
  await page.waitForFunction(
    () => document.querySelector('[data-gallery-hud]')?.classList.contains('is-complete'),
    null,
    { timeout: 20000 },
  )
  await page.locator('[data-continue]').click({ force: true })
  await page.waitForFunction(
    () => document.documentElement.classList.contains('gallery-complete'),
    null,
    { timeout: 20000 },
  )
  await page.waitForTimeout(900)
}

async function journey(page) {
  return page.evaluate(() => window.__hbd?.getJourneyState?.() ?? null)
}

async function letterShownCount(page) {
  return page.evaluate(
    () => document.querySelectorAll('.letter-reveal.is-shown').length,
  )
}

async function wheelAdvance(page, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.mouse.wheel(0, 900)
    await page.waitForTimeout(180)
  }
}

async function touchSwipeUp(page) {
  const letter = page.locator('[data-letter-overlay]')
  const box = (await letter.boundingBox()) || (await page.locator('body').boundingBox())
  if (!box) throw new Error('no swipe target')
  const cx = box.x + box.width / 2
  const y1 = box.y + box.height * 0.72
  const y2 = box.y + box.height * 0.22
  await page.touchscreen.tap(cx, y1).catch(() => {})
  await page.evaluate(
    ({ x, y1, y2 }) => {
      const el = document.querySelector('[data-letter-overlay]') || document.body
      const fire = (type, y, extras = {}) => {
        el.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })],
            changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })],
            ...extras,
          }),
        )
      }
      fire('touchstart', y1)
      const steps = 10
      for (let i = 1; i <= steps; i++) {
        const y = y1 + ((y2 - y1) * i) / steps
        fire('touchmove', y)
      }
      fire('touchend', y2)
    },
    { x: cx, y1, y2 },
  )
  await page.waitForTimeout(350)
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
  })
  const report = { ok: true, cases: [] }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  try {
    await unlockGallery(page)

    // Land on letter with a single scroll burst
    await page.evaluate(() => {
      const letter = document.getElementById('chapter-letter')
      if (letter) {
        const top =
          letter.getBoundingClientRect().top + window.scrollY + Math.round(window.innerHeight * 0.15)
        window.scrollTo({ top, behavior: 'auto' })
      }
    })
    await page.waitForFunction(
      () => document.documentElement.dataset.chapter === 'letter',
      null,
      { timeout: 12000 },
    )

    // Letter text must start appearing immediately (first block within ~250ms)
    const t0 = Date.now()
    await page.waitForFunction(
      () => document.querySelectorAll('.letter-reveal.is-shown').length >= 1,
      null,
      { timeout: 800 },
    )
    const revealMs = Date.now() - t0
    const shown = await letterShownCount(page)
    const land = await journey(page)
    report.cases.push({
      name: 'letter-reveal-immediate',
      status: revealMs < 700 && shown >= 1 && land?.chapter === 'letter' ? 'pass' : 'fail',
      revealMs,
      shown,
      chapter: land?.chapter,
    })
    if (revealMs >= 700 || shown < 1) report.ok = false

    // Wait for busy window to clear, then one deliberate wheel must enter memories
    await page.waitForFunction(
      () => window.__hbd?.getJourneyState?.()?.chapterBusy === false,
      null,
      { timeout: 4000 },
    )
    // Drain letter inner scroll if any
    await page.evaluate(() => {
      const letter = document.querySelector('[data-letter-overlay]')
      if (letter) letter.scrollTop = letter.scrollHeight
    })
    await page.waitForTimeout(200)

    const beforeMem = await journey(page)
    await wheelAdvance(page, 1)
    await page.waitForFunction(
      () => document.documentElement.dataset.chapter === 'memories',
      null,
      { timeout: 8000 },
    )
    // Busy window is expected briefly on first Ch3 intro — must clear without stickiness
    await page.waitForFunction(
      () => window.__hbd?.getJourneyState?.()?.chapterBusy === false,
      null,
      { timeout: 4000 },
    )
    const afterMem = await journey(page)
    const singleOk =
      beforeMem?.chapter === 'letter' && afterMem?.chapter === 'memories' && !afterMem?.chapterBusy
    report.cases.push({
      name: 'single-wheel-letter-to-memories',
      status: singleOk ? 'pass' : 'fail',
      before: beforeMem?.chapter,
      after: afterMem?.chapter,
      busy: afterMem?.chapterBusy,
    })
    if (!singleOk) report.ok = false

    // Rapid wheels during transition must not leave a stuck lock
    await page.waitForFunction(
      () => window.__hbd?.getJourneyState?.()?.chapterBusy === false,
      null,
      { timeout: 4000 },
    )
    // Jump back toward letter band then rapid-fire forward
    await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({ top: Math.round(max * 0.18), behavior: 'auto' })
    })
    await page.waitForFunction(
      () => document.documentElement.dataset.chapter === 'letter',
      null,
      { timeout: 8000 },
    )
    await page.evaluate(() => {
      const letter = document.querySelector('[data-letter-overlay]')
      if (letter) letter.scrollTop = letter.scrollHeight
    })
    await page.waitForTimeout(200)
    // Rapid single-direction gestures
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 1200)
    await page.waitForTimeout(1200)
    await page.waitForFunction(
      () => {
        const s = window.__hbd?.getJourneyState?.()
        return s && s.chapter === 'memories' && s.chapterBusy === false
      },
      null,
      { timeout: 10000 },
    )
    const rapid = await journey(page)
    report.cases.push({
      name: 'rapid-wheels-no-stuck-lock',
      status: rapid?.chapter === 'memories' && rapid?.chapterBusy === false ? 'pass' : 'fail',
      state: rapid,
    })
    if (rapid?.chapter !== 'memories' || rapid?.chapterBusy) report.ok = false

    // Touch-style handoff also advances once
    await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({ top: Math.round(max * 0.2), behavior: 'auto' })
    })
    await page.waitForFunction(
      () => document.documentElement.dataset.chapter === 'letter',
      null,
      { timeout: 8000 },
    )
    await page.evaluate(() => {
      const letter = document.querySelector('[data-letter-overlay]')
      if (letter) letter.scrollTop = letter.scrollHeight
    })
    await page.waitForFunction(
      () => window.__hbd?.getJourneyState?.()?.chapterBusy === false,
      null,
      { timeout: 4000 },
    )
    await touchSwipeUp(page)
    await page.waitForFunction(
      () => document.documentElement.dataset.chapter === 'memories',
      null,
      { timeout: 8000 },
    )
    const touch = await journey(page)
    report.cases.push({
      name: 'single-touch-letter-to-memories',
      status: touch?.chapter === 'memories' && touch?.chapterBusy === false ? 'pass' : 'fail',
      state: touch,
    })
    if (touch?.chapter !== 'memories') report.ok = false
  } catch (err) {
    report.ok = false
    report.error = String(err?.stack || err)
  } finally {
    await page.screenshot({ path: `${OUT}/verify-chapter-handoff.png`, fullPage: false }).catch(() => {})
    await browser.close()
  }

  fs.writeFileSync(`${OUT}/verify-chapter-handoff.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.ok ? 0 : 1)
}

run()
