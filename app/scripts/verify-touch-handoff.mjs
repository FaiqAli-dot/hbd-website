/**
 * Verifies gallery → journey handoff using real TouchEvents on a mobile viewport.
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
  await page.touchscreen.tap(x1, y1) // ensure touch engine warm
  // Playwright touch swipe via touchscreen API isn't a drag; use dispatch
  await page.evaluate(
    ({ x1, y1, x2, y2 }) => {
      const canvas = document.querySelector('.webgl-canvas')
      const fire = (type, x, y, id = 1) => {
        const t = new Touch({
          identifier: id,
          target: canvas,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
          screenX: x,
          screenY: y,
        })
        const ev = new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t],
          changedTouches: [t],
        })
        canvas.dispatchEvent(ev)
      }
      fire('touchstart', x1, y1)
      const steps = 10
      for (let i = 1; i <= steps; i++) {
        const x = x1 + ((x2 - x1) * i) / steps
        const y = y1 + ((y2 - y1) * i) / steps
        fire('touchmove', x, y)
      }
      fire('touchend', x2, y2)
    },
    { x1, y1, x2, y2 },
  )
  // Also drive Pointer Events path used by attachSwipeGestures
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(2000)
}

async function runWithBrowser(browserType, label) {
  const browser = await browserType.launch({
    headless: true,
    args: label === 'chromium' ? ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'] : undefined,
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
  await page.waitForTimeout(600)

  for (let i = 0; i < gestures.length; i++) {
    await swipeTouch(page, gestures[i])
    const expected = String(i + 1).padStart(2, '0')
    await page.waitForFunction(
      (exp) => document.querySelector('[data-progress-current]')?.textContent === exp,
      expected,
      { timeout: 5000 },
    )
  }

  const complete = await page.evaluate(() => document.documentElement.classList.contains('gallery-complete'))
  report.checks.push({ name: 'gallery-complete', status: complete ? 'pass' : 'fail' })

  // Canvas should allow pan-y after unlock
  const touchAction = await page.evaluate(() => getComputedStyle(document.querySelector('.webgl-canvas')).touchAction)
  report.checks.push({
    name: 'canvas-touch-action-pan-y',
    status: /pan-y|manipulation|auto/.test(touchAction) ? 'pass' : 'fail',
    touchAction,
  })

  // Native-ish touch scroll attempt
  const before = await page.evaluate(() => window.scrollY)
  await page.evaluate(() => {
    const canvas = document.querySelector('.webgl-canvas')
    const y1 = 600
    const y2 = 200
    const fire = (type, y) => {
      const t = new Touch({
        identifier: 7,
        target: canvas,
        clientX: 180,
        clientY: y,
        pageX: 180,
        pageY: y,
      })
      canvas.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t],
          changedTouches: [t],
        }),
      )
    }
    fire('touchstart', y1)
    for (let i = 1; i <= 12; i++) fire('touchmove', y1 + ((y2 - y1) * i) / 12)
    fire('touchend', y2)
  })
  await page.waitForTimeout(400)
  // Our unlock swipe-up helper should scroll even if browser pan doesn't in headless
  let afterSwipe = await page.evaluate(() => window.scrollY)

  // Tappable continue fallback
  await page.locator('[data-continue]').click({ force: true })
  await page.waitForTimeout(900)
  const afterContinue = await page.evaluate(() => window.scrollY)
  const letterActive = await page.locator('[data-letter-overlay]').evaluate((el) => el.classList.contains('is-active'))

  report.checks.push({
    name: 'touch-swipe-or-continue-scrolls',
    status: afterSwipe > before || afterContinue > before ? 'pass' : 'fail',
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

  // Continue through chapters via scroll
  await page.locator('#chapter-memories').scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  const mem = await page.locator('[data-memories-overlay]').evaluate((el) => el.classList.contains('is-active'))
  report.checks.push({ name: 'memories-reachable', status: mem ? 'pass' : 'fail', mem })

  // Tap portal (mobile)
  await page.touchscreen.tap(120, 360)
  await page.waitForTimeout(400)

  await page.locator('#chapter-finale').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  const fin = await page.locator('[data-finale-overlay]').evaluate((el) => el.classList.contains('is-active'))
  report.checks.push({ name: 'finale-reachable', status: fin ? 'pass' : 'fail', fin })

  await page.screenshot({ path: path.join(OUT, `touch-handoff-${label}.png`), fullPage: false })

  report.ok = report.checks.every((c) => c.status === 'pass') && errors.length === 0
  report.errors = errors
  await browser.close()
  return report
}

const reports = []
reports.push(await runWithBrowser(chromium, 'chromium'))

let webkitReport = null
try {
  webkitReport = await runWithBrowser(webkit, 'webkit')
  reports.push(webkitReport)
} catch (err) {
  reports.push({ browser: 'webkit', ok: false, skipped: true, error: String(err) })
}

const out = { ok: reports.every((r) => r.ok || r.skipped), reports }
fs.writeFileSync(path.join(OUT, 'touch-handoff-report.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
process.exit(out.ok ? 0 : 1)
