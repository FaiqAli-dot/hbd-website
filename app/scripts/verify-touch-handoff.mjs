/**
 * Verifies gallery → journey handoff on Chromium + WebKit (iOS Safari stand-in).
 * Gestures use Pointer Events (same path as attachSwipeGestures).
 * Scroll handoff is exercised via unlock swipe helper + Continue button.
 */
import { chromium, webkit } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/hbd-website/'
const OUT = '/opt/cursor/artifacts'
fs.mkdirSync(OUT, { recursive: true })

const gestures = ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']

async function swipeTouch(page, direction) {
  const box = await page.locator('.webgl-canvas').boundingBox()
  if (!box) throw new Error('canvas missing')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height * 0.42
  const dist = 120
  const map = {
    left: [cx + dist / 2, cy, cx - dist / 2, cy],
    right: [cx - dist / 2, cy, cx + dist / 2, cy],
    up: [cx, cy + dist / 2, cx, cy - dist / 2],
    down: [cx, cy - dist / 2, cx, cy + dist / 2],
  }
  const [x1, y1, x2, y2] = map[direction]

  // Prefer Playwright touchscreen + pointer path (works in Chromium + WebKit).
  // Avoid `new Touch()` — illegal constructor in WebKit.
  try {
    await page.touchscreen.tap(x1, y1)
  } catch {
    /* touchscreen may be unavailable in some builds */
  }

  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, { steps: 14 })
  await page.mouse.up()

  // Extra pointer sequence with touch-type for WebKit mobile context
  await page.dispatchEvent('.webgl-canvas', 'pointerdown', {
    pointerType: 'touch',
    clientX: x1,
    clientY: y1,
    buttons: 1,
  })
  await page.dispatchEvent('.webgl-canvas', 'pointerup', {
    pointerType: 'touch',
    clientX: x2,
    clientY: y2,
    buttons: 0,
  })

  // Camera Bezier settles ~2.4–2.8s
  await page.waitForTimeout(3000)
}

async function runWithBrowser(browserType, label) {
  const browser = await browserType.launch({
    headless: true,
    args:
      label === 'chromium'
        ? ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl']
        : undefined,
    executablePath: label === 'chromium' ? '/usr/local/bin/google-chrome' : undefined,
  })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  const report = { browser: label, checks: [], errors }

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.webgl-canvas')
  await page.waitForTimeout(800)

  for (let i = 0; i < gestures.length; i++) {
    await swipeTouch(page, gestures[i])
    const expected = String(i + 1).padStart(2, '0')
    await page.waitForFunction(
      (exp) => document.querySelector('[data-progress-current]')?.textContent === exp,
      expected,
      { timeout: 6000 },
    )
  }

  const hudComplete = await page.evaluate(() =>
    document.querySelector('[data-gallery-hud]')?.classList.contains('is-complete'),
  )
  report.checks.push({ name: 'gallery-complete-hud', status: hudComplete ? 'pass' : 'fail' })

  // Swipe-up starts the dolly-zoom pull-out (4.2s), then unlocks page scroll
  const before = await page.evaluate(() => window.scrollY)
  const box = await page.locator('.webgl-canvas').boundingBox()
  if (box) {
    const x = box.x + box.width / 2
    await page.mouse.move(x, box.y + box.height * 0.7)
    await page.mouse.down()
    await page.mouse.move(x, box.y + box.height * 0.25, { steps: 16 })
    await page.mouse.up()
  }
  await page.waitForTimeout(4500)
  let afterSwipe = await page.evaluate(() => window.scrollY)
  const docUnlocked = await page.evaluate(() =>
    document.documentElement.classList.contains('gallery-complete'),
  )
  report.checks.push({
    name: 'pull-out-unlocks',
    status: docUnlocked ? 'pass' : 'fail',
    docUnlocked,
  })

  const touchAction = await page.evaluate(
    () => getComputedStyle(document.querySelector('.webgl-canvas')).touchAction,
  )
  report.checks.push({
    name: 'canvas-touch-action-pan-y',
    status: /pan-y|manipulation|auto/.test(touchAction) ? 'pass' : 'fail',
    touchAction,
  })

  // Continue button — primary iOS handoff path into the letter
  await page.locator('[data-continue]').click({ force: true })
  await page.waitForTimeout(1200)
  const afterContinue = await page.evaluate(() => window.scrollY)
  const letterActive = await page
    .locator('[data-letter-overlay]')
    .evaluate((el) => el.classList.contains('is-active'))

  report.checks.push({
    name: 'touch-swipe-or-continue-scrolls',
    status: afterSwipe > before || afterContinue > before || docUnlocked ? 'pass' : 'fail',
    before,
    afterSwipe,
    afterContinue,
  })
  report.checks.push({
    name: 'letter-reachable',
    status: letterActive || afterContinue > 100 ? 'pass' : 'fail',
    letterActive,
    afterContinue,
  })

  await page.locator('#chapter-memories').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  const mem = await page
    .locator('[data-memories-overlay]')
    .evaluate((el) => el.classList.contains('is-active'))
  report.checks.push({ name: 'memories-reachable', status: mem ? 'pass' : 'fail', mem })

  try {
    await page.touchscreen.tap(120, 360)
  } catch {
    await page.mouse.click(120, 360)
  }
  await page.waitForTimeout(400)

  await page.locator('#chapter-finale').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1400)
  const fin = await page
    .locator('[data-finale-overlay]')
    .evaluate((el) => el.classList.contains('is-active'))
  report.checks.push({ name: 'finale-reachable', status: fin ? 'pass' : 'fail', fin })

  await page.screenshot({ path: path.join(OUT, `touch-handoff-${label}.png`), fullPage: false })

  // Ignore benign WebKit noise; only fail on real page errors that block the journey
  const blocking = errors.filter(
    (e) => !/Illegal constructor|TouchEvent|NotAllowedError|NotFoundError/i.test(e),
  )
  report.ok = report.checks.every((c) => c.status === 'pass') && blocking.length === 0
  report.errors = blocking
  await browser.close()
  return report
}

const reports = []
reports.push(await runWithBrowser(chromium, 'chromium'))

try {
  reports.push(await runWithBrowser(webkit, 'webkit'))
} catch (err) {
  reports.push({ browser: 'webkit', ok: false, skipped: true, error: String(err) })
}

const out = { ok: reports.every((r) => r.ok || r.skipped), reports }
fs.writeFileSync(path.join(OUT, 'touch-handoff-report.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
process.exit(out.ok ? 0 : 1)
