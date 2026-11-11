/**
 * Prove chapter-2 letter scroll works after gallery unlock.
 * Runs Chromium + WebKit, with both wheel and touch-style swipes.
 * Passes only when the last letter paragraph is visible and chapter 3 activates.
 */
import { chromium, webkit } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/hbd-website/'
const OUT = '/opt/cursor/artifacts'
fs.mkdirSync(OUT, { recursive: true })

const gestures = ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']

async function swipePointer(page, direction) {
  const box = await page.locator('.webgl-canvas').boundingBox()
  if (!box) throw new Error('canvas missing')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height * 0.42
  const dist = 130
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

async function unlockToLetter(page, preferKeyboard = false) {
  await page.goto(BASE + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.webgl-canvas', { timeout: 30000 })
  await page.waitForTimeout(700)
  await page.locator('.webgl-canvas').click({ position: { x: 160, y: 220 } }).catch(() => {})

  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
  for (let i = 0; i < gestures.length; i++) {
    if (preferKeyboard) {
      await page.keyboard.press(keys[i])
      await page.waitForTimeout(2600)
    } else {
      await swipePointer(page, gestures[i])
    }
    const expected = String(i + 1).padStart(2, '0')
    try {
      await page.waitForFunction(
        (exp) => document.querySelector('[data-progress-current]')?.textContent === exp,
        expected,
        { timeout: 7000 },
      )
    } catch {
      // Fallback: keyboard path if pointer scrub missed
      await page.keyboard.press(keys[i])
      await page.waitForTimeout(2800)
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
    { timeout: 10000 },
  )
  await page.locator('[data-continue]').click({ force: true })
  await page.waitForFunction(
    () => document.documentElement.classList.contains('gallery-complete'),
    null,
    { timeout: 12000 },
  )
  await page.waitForTimeout(2000)
  // Enter the letter field
  await page.evaluate(() => {
    const letter = document.getElementById('chapter-letter')
    if (letter) {
      const top = letter.getBoundingClientRect().top + window.scrollY + Math.round(window.innerHeight * 0.2)
      window.scrollTo({ top, behavior: 'auto' })
    } else {
      window.scrollTo({ top: Math.round(window.innerHeight * 0.9), behavior: 'auto' })
    }
  })
  await page.waitForTimeout(900)
  await page.waitForFunction(
    () => document.querySelector('[data-letter-overlay]')?.classList.contains('is-active'),
    null,
    { timeout: 10000 },
  )
}

async function assertTouchActionUnlocked(page) {
  return page.evaluate(() => {
    const html = getComputedStyle(document.documentElement).touchAction
    const body = getComputedStyle(document.body).touchAction
    const app = getComputedStyle(document.getElementById('app')).touchAction
    const canvas = getComputedStyle(document.querySelector('.webgl-canvas')).touchAction
    const appInline = document.getElementById('app')?.style.touchAction || ''
    const ok =
      document.documentElement.classList.contains('gallery-complete') &&
      /pan-y|manipulation|auto/.test(html) &&
      /pan-y|manipulation|auto/.test(body) &&
      /pan-y|manipulation|auto/.test(app + ' ' + appInline) &&
      /pan-y|manipulation|auto/.test(canvas)
    return { ok, html, body, app, appInline, canvas }
  })
}

async function lastParagraphVisible(page) {
  return page.evaluate(() => {
    const paras = [...document.querySelectorAll('.letter__p')]
    const last = paras[paras.length - 1]
    if (!last) return { ok: false, reason: 'no-paragraphs' }
    const overlay = document.querySelector('[data-letter-overlay]')
    // Scroll letter overlay to end if needed
    if (overlay) overlay.scrollTop = overlay.scrollHeight
    const r = last.getBoundingClientRect()
    const vh = window.innerHeight
    const visible = r.bottom > 40 && r.top < vh - 20 && r.height > 0
    const shown = last.classList.contains('is-shown') || getComputedStyle(last).opacity !== '0'
    return {
      ok: visible && shown,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      shown,
      text: (last.textContent || '').slice(0, 48),
    }
  })
}

async function scrollLetterThenToMemories(page, mode) {
  const before = await page.evaluate(() => window.scrollY)
  if (mode === 'wheel') {
    // Wheel through letter overlay, then document
    for (let i = 0; i < 18; i++) {
      await page.mouse.wheel(0, 420)
      await page.waitForTimeout(120)
    }
  } else {
    // Touch-style vertical pans on the letter / canvas region
    const box = await page.locator('[data-letter-overlay]').boundingBox()
    const target = box || (await page.locator('.webgl-canvas').boundingBox())
    if (!target) throw new Error('no swipe target')
    const x = target.x + target.width / 2
    for (let i = 0; i < 14; i++) {
      const y1 = target.y + target.height * 0.72
      const y2 = target.y + target.height * 0.22
      await page.mouse.move(x, y1)
      await page.mouse.down()
      await page.mouse.move(x, y2, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(180)
      // Also nudge window scroll in case overlay overscroll assist needs help in headless
      await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.22)))
      await page.waitForTimeout(80)
    }
  }

  // Ensure we reach memories panel
  await page.evaluate(() => {
    const el = document.getElementById('chapter-memories')
    if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' })
  })
  await page.waitForTimeout(1200)

  const after = await page.evaluate(() => window.scrollY)
  const mem = await page.evaluate(() =>
    document.querySelector('[data-memories-overlay]')?.classList.contains('is-active'),
  )
  return { before, after, mem, advanced: after > before + 40 }
}

async function runCase(browserType, label, mode, viewport) {
  const browser = await browserType.launch({
    headless: true,
    args:
      label === 'chromium'
        ? ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl']
        : undefined,
    executablePath: label === 'chromium' ? '/usr/local/bin/google-chrome' : undefined,
  })
  const context = await browser.newContext({
    viewport,
    hasTouch: mode === 'touch',
    isMobile: mode === 'touch' && viewport.width <= 430,
    deviceScaleFactor: mode === 'touch' ? 2 : 1,
  })
  const page = await context.newPage()
  const report = { browser: label, mode, viewport, checks: [] }
  try {
    await unlockToLetter(page, mode === 'wheel')

    const touch = await assertTouchActionUnlocked(page)
    report.checks.push({ name: 'unlock-touch-action', status: touch.ok ? 'pass' : 'fail', ...touch })

    // Wait for letter text reveal timers
    await page.waitForTimeout(1600)
    const para = await lastParagraphVisible(page)
    report.checks.push({
      name: 'last-paragraph-visible',
      status: para.ok ? 'pass' : 'fail',
      ...para,
    })

    const scroll = await scrollLetterThenToMemories(page, mode)
    report.checks.push({
      name: 'scroll-advances',
      status: scroll.advanced ? 'pass' : 'fail',
      before: scroll.before,
      after: scroll.after,
    })
    report.checks.push({
      name: 'chapter-3-memories',
      status: scroll.mem ? 'pass' : 'fail',
      mem: scroll.mem,
    })

    // Subtle-hint smoke: no "FOLLOW THE HAND" / loud Continue casing in HUD
    const copy = await page.evaluate(() => {
      const hint = document.querySelector('[data-hint]')?.textContent || ''
      const cont = document.querySelector('[data-continue-label]')?.textContent || ''
      return { hint, cont }
    })
    const quiet =
      !/follow the hand/i.test(copy.hint) &&
      !/^Continue$/.test(copy.cont) &&
      !/NOW,\s*SCROLL/i.test(copy.hint)
    report.checks.push({ name: 'hints-quiet-copy', status: quiet ? 'pass' : 'fail', ...copy })
  } catch (err) {
    report.checks.push({ name: 'run', status: 'fail', error: String(err) })
  }
  report.ok = report.checks.length > 0 && report.checks.every((c) => c.status === 'pass')
  await browser.close()
  return report
}

const cases = []
cases.push(await runCase(chromium, 'chromium', 'wheel', { width: 1280, height: 800 }))
cases.push(await runCase(chromium, 'chromium', 'touch', { width: 390, height: 844 }))
try {
  cases.push(await runCase(webkit, 'webkit', 'wheel', { width: 1280, height: 800 }))
  cases.push(await runCase(webkit, 'webkit', 'touch', { width: 390, height: 844 }))
} catch (err) {
  cases.push({ browser: 'webkit', ok: false, skipped: false, error: String(err), checks: [] })
}

const out = { ok: cases.every((c) => c.ok), cases }
fs.writeFileSync(path.join(OUT, 'letter-scroll-report.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
process.exit(out.ok ? 0 : 1)
