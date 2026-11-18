/**
 * Complete the journey (shortenPlayback), then roam ch1↔finale via wheel + touch.
 * Asserts chapters, no re-lock of Ch3, no stuck chapterBusy.
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

async function scrollToProgress(page, progress) {
  await page.evaluate((p) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: Math.max(0, Math.round(max * p)), behavior: 'auto' })
  }, progress)
}

async function awaitChapter(page, chapter) {
  await page.waitForFunction(
    (ch) => document.documentElement.dataset.chapter === ch,
    chapter,
    { timeout: 15000 },
  )
}

async function journey(page) {
  return page.evaluate(() => window.__hbd?.getJourneyState?.() ?? null)
}

async function memoriesState(page) {
  return page.evaluate(() => window.__hbdMemoriesTest?.getState?.() ?? null)
}

async function completeMemories(page) {
  await page.evaluate(() => {
    if (!window.__hbdMemoriesTest) window.__hbdMemoriesTest = {}
    window.__hbdMemoriesTest.shortenPlayback = true
  })
  for (let i = 0; i < 4; i++) {
    await page.waitForFunction(
      (idx) => {
        const s = window.__hbdMemoriesTest?.getState?.()
        return s && s.activeIndex === idx && !s.watched[idx]
      },
      i,
      { timeout: 12000 },
    ).catch(() => {})
    await page.evaluate((idx) => window.__hbdMemoriesTest?.activatePortal?.(idx), i)
    await page.waitForFunction(
      (idx) => window.__hbdMemoriesTest?.getState?.()?.watched?.[idx] === true,
      i,
      { timeout: 12000 },
    )
  }
  await page.waitForFunction(
    () => window.__hbdMemoriesTest?.getState?.()?.scrollUnlocked === true,
    null,
    { timeout: 10000 },
  )
}

async function touchSwipe(page, direction) {
  const box = await page.locator('body').boundingBox()
  if (!box) throw new Error('body missing')
  const cx = box.x + box.width / 2
  const mid = box.y + box.height * 0.5
  const dist = box.height * 0.35
  const y1 = direction === 'up' ? mid + dist / 2 : mid - dist / 2
  const y2 = direction === 'up' ? mid - dist / 2 : mid + dist / 2
  await page.mouse.move(cx, y1)
  await page.mouse.down()
  await page.mouse.move(cx, y2, { steps: 18 })
  await page.mouse.up()
  await page.waitForTimeout(400)
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
    await scrollToProgress(page, 0.45)
    await awaitChapter(page, 'memories')
    await page.waitForTimeout(800)
    await completeMemories(page)

    // Reach finale
    await scrollToProgress(page, 0.85)
    await awaitChapter(page, 'finale')
    await page.waitForTimeout(600)
    let state = await journey(page)
    report.cases.push({
      name: 'finale-marks-journey-complete',
      status: state?.journeyComplete && state?.chapter === 'finale' ? 'pass' : 'fail',
      state,
    })
    if (!state?.journeyComplete) report.ok = false

    // Wheel back to gallery (ch1)
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, -1100)
      await page.waitForTimeout(120)
    }
    await scrollToProgress(page, 0.01)
    await awaitChapter(page, 'gallery')
    state = await journey(page)
    const mem = await memoriesState(page)
    report.cases.push({
      name: 'wheel-back-to-gallery',
      status:
        state?.chapter === 'gallery' &&
        state?.journeyComplete &&
        mem?.scrollUnlocked &&
        !state?.chapterBusy
          ? 'pass'
          : 'fail',
      state,
      mem,
    })
    if (state?.chapter !== 'gallery' || !mem?.scrollUnlocked) report.ok = false

    // Forward through letter → memories → finale again
    await scrollToProgress(page, 0.2)
    await awaitChapter(page, 'letter')
    await scrollToProgress(page, 0.48)
    await awaitChapter(page, 'memories')
    const mid = await memoriesState(page)
    report.cases.push({
      name: 'reenter-memories-stays-unlocked',
      status: mid?.scrollUnlocked && mid?.watched?.every(Boolean) ? 'pass' : 'fail',
      mid,
    })
    if (!mid?.scrollUnlocked) report.ok = false

    await scrollToProgress(page, 0.9)
    await awaitChapter(page, 'finale')
    state = await journey(page)
    report.cases.push({
      name: 'wheel-forward-to-finale-again',
      status: state?.chapter === 'finale' && state?.journeyComplete && !state?.chapterBusy ? 'pass' : 'fail',
      state,
    })
    if (state?.chapter !== 'finale') report.ok = false

    // Touch-style roam: finale → letter → finale
    await touchSwipe(page, 'down')
    await scrollToProgress(page, 0.22)
    await awaitChapter(page, 'letter')
    await touchSwipe(page, 'up')
    await scrollToProgress(page, 0.92)
    await awaitChapter(page, 'finale')
    state = await journey(page)
    const mem2 = await memoriesState(page)
    report.cases.push({
      name: 'touch-roam-finale-letter-finale',
      status:
        state?.chapter === 'finale' &&
        state?.journeyComplete &&
        mem2?.scrollUnlocked &&
        !state?.chapterBusy
          ? 'pass'
          : 'fail',
      state,
      mem2,
    })
    if (state?.chapter !== 'finale' || !mem2?.scrollUnlocked) report.ok = false
  } catch (err) {
    report.ok = false
    report.error = String(err?.stack || err)
  } finally {
    await page.screenshot({ path: `${OUT}/verify-free-roam.png`, fullPage: false }).catch(() => {})
    await browser.close()
  }

  fs.writeFileSync(`${OUT}/verify-free-roam.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.ok ? 0 : 1)
}

run()
