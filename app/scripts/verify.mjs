import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/hbd-website/'
const OUT = '/opt/cursor/artifacts'
fs.mkdirSync(OUT, { recursive: true })

const gestures = ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']

async function swipe(page, direction) {
  const box = await page.locator('.webgl-canvas').boundingBox()
  if (!box) throw new Error('webgl canvas missing')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height * 0.45
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
  await page.mouse.move(x2, y2, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(1600)
}

async function progress(page) {
  return page.locator('[data-progress-current]').innerText()
}

const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/local/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
})
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(String(err)))

const report = { ok: true, checks: [], consoleErrors: [], assetFails: [], fps: null }

try {
  const res = await page.goto(BASE, { waitUntil: 'networkidle' })
  report.checks.push({ name: 'load', status: res?.ok() ? 'pass' : 'fail', code: res?.status() })

  await page.waitForSelector('.webgl-canvas')
  await page.waitForSelector('[data-gallery-hud]')
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, 'chapter1-gallery-start.png'), fullPage: false })

  const before = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(200)
  const after = await page.evaluate(() => window.scrollY)
  const locked =
    after === before &&
    !(await page.evaluate(() => document.documentElement.classList.contains('gallery-complete')))
  report.checks.push({ name: 'scroll-locked-before-complete', status: locked ? 'pass' : 'fail', before, after })

  await swipe(page, 'right')
  let p = await progress(page)
  report.checks.push({ name: 'wrong-gesture-ignored', status: p === '00' ? 'pass' : 'fail', progress: p })

  await swipe(page, 'left')
  p = await progress(page)
  report.checks.push({ name: 'first-reveal', status: p === '01' ? 'pass' : 'fail', progress: p })
  await page.screenshot({ path: path.join(OUT, 'chapter1-gallery-first-reveal.png'), fullPage: false })

  await page.waitForTimeout(200)
  await page.locator('[data-undo]').click({ force: true })
  await page.waitForTimeout(600)
  p = await progress(page)
  report.checks.push({ name: 'undo', status: p === '00' ? 'pass' : 'fail', progress: p })

  for (let i = 0; i < gestures.length; i++) {
    await swipe(page, gestures[i])
    const expected = String(i + 1).padStart(2, '0')
    try {
      await page.waitForFunction(
        (exp) => document.querySelector('[data-progress-current]')?.textContent === exp,
        expected,
        { timeout: 4000 },
      )
    } catch {
      report.checks.push({
        name: `gesture-step-${i + 1}`,
        status: 'fail',
        expected,
        progress: await progress(page),
      })
      break
    }
  }
  p = await progress(page)
  const complete = await page.evaluate(() =>
    document.documentElement.classList.contains('gallery-complete'),
  )
  const hint = await page.locator('[data-hint]').innerText()
  report.checks.push({
    name: 'gallery-complete',
    status: complete && p === '08' && /scroll/i.test(hint) ? 'pass' : 'fail',
    progress: p,
    complete,
    hint,
  })
  await page.screenshot({ path: path.join(OUT, 'chapter1-gallery-complete.png'), fullPage: false })

  await page.mouse.wheel(0, 1600)
  await page.waitForTimeout(700)
  const scrolled = await page.evaluate(() => window.scrollY)
  report.checks.push({ name: 'scroll-unlocked', status: scrolled > 0 ? 'pass' : 'fail', scrolled })

  await page.locator('#chapter-letter').scrollIntoViewIfNeeded()
  await page.waitForTimeout(900)
  await page.screenshot({ path: path.join(OUT, 'chapter2-letter.png'), fullPage: false })
  const letterActive = await page.locator('[data-letter-overlay]').evaluate((el) => el.classList.contains('is-active'))
  report.checks.push({ name: 'letter-overlay', status: letterActive ? 'pass' : 'fail', letterActive })

  await page.locator('#chapter-memories').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: path.join(OUT, 'chapter3-memories.png'), fullPage: false })
  const memActive = await page.locator('[data-memories-overlay]').evaluate((el) => el.classList.contains('is-active'))
  report.checks.push({ name: 'memories-overlay', status: memActive ? 'pass' : 'fail', memActive })

  // Tap/hover center-left portal region
  await page.mouse.move(420, 320)
  await page.waitForTimeout(500)

  await page.locator('#chapter-finale').scrollIntoViewIfNeeded()
  await page.waitForTimeout(2800)
  await page.screenshot({ path: path.join(OUT, 'chapter4-finale.png'), fullPage: false })
  const finaleActive = await page.locator('[data-finale-overlay]').evaluate((el) => el.classList.contains('is-active'))
  report.checks.push({ name: 'finale-overlay', status: finaleActive ? 'pass' : 'fail', finaleActive })

  // Rough FPS via rAF over ~1s
  report.fps = await page.evaluate(async () => {
    let frames = 0
    const start = performance.now()
    await new Promise((resolve) => {
      const tick = (now) => {
        frames += 1
        if (now - start < 1000) requestAnimationFrame(tick)
        else resolve(null)
      }
      requestAnimationFrame(tick)
    })
    return frames
  })
  // Headless GL is often capped; treat as informational unless extremely broken.
  report.checks.push({
    name: 'fps-sample',
    status: report.fps >= 8 ? 'pass' : 'fail',
    fps: report.fps,
    note: 'headless WebGL sample — not a device benchmark',
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, 'mobile-gallery.png'), fullPage: false })
  await page.locator('#chapter-memories').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, 'mobile-memories.png'), fullPage: false })

  const assetSample = await page.evaluate(() => {
    const canvas = document.querySelector('.webgl-canvas')
    const scripts = [...document.scripts].map((s) => s.src).filter(Boolean)
    return { hasCanvas: !!canvas, scripts }
  })
  const pathsOk = assetSample.scripts.some((s) => s.includes('/hbd-website/assets/'))
  report.checks.push({ name: 'asset-base-path', status: pathsOk ? 'pass' : 'fail', assetSample })

  await page.setViewportSize({ width: 1280, height: 800 })
  const soundPressed = await page.locator('[data-sound]').getAttribute('aria-pressed')
  report.checks.push({
    name: 'sound-off-by-default',
    status: soundPressed === 'false' ? 'pass' : 'fail',
    soundPressed,
  })
} catch (err) {
  report.ok = false
  report.error = String(err)
}

report.consoleErrors = consoleErrors
report.ok = report.ok && report.checks.every((c) => c.status === 'pass') && consoleErrors.length === 0
fs.writeFileSync(path.join(OUT, 'verify-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
process.exit(report.ok ? 0 : 1)
