import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/hbd-website/'
const OUT = '/opt/cursor/artifacts'
fs.mkdirSync(OUT, { recursive: true })

const gestures = ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']

async function swipe(page, direction) {
  const box = await page.locator('.chapter--gallery').boundingBox()
  if (!box) throw new Error('gallery missing')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const dist = 120
  const map = {
    left: [cx + dist / 2, cy, cx - dist / 2, cy],
    right: [cx - dist / 2, cy, cx + dist / 2, cy],
    up: [cx, cy + dist / 2, cx, cy - dist / 2],
    down: [cx, cy - dist / 2, cx, cy + dist / 2],
  }
  const [x1, y1, x2, y2] = map[direction]
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(750)
}

async function progress(page) {
  return page.locator('[data-progress-current]').innerText()
}

const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/local/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
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

const report = { ok: true, checks: [], consoleErrors: [], assetFails: [] }

try {
  const res = await page.goto(BASE, { waitUntil: 'networkidle' })
  report.checks.push({ name: 'load', status: res?.ok() ? 'pass' : 'fail', code: res?.status() })

  await page.waitForSelector('.chapter--gallery')
  await page.screenshot({ path: path.join(OUT, 'chapter1-gallery-start.png'), fullPage: false })

  // Scroll should be blocked
  const before = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(200)
  const after = await page.evaluate(() => window.scrollY)
  const locked = after === before && !(await page.evaluate(() => document.documentElement.classList.contains('gallery-complete')))
  report.checks.push({ name: 'scroll-locked-before-complete', status: locked ? 'pass' : 'fail', before, after })

  // Wrong gesture should not advance
  await swipe(page, 'right') // first expected is left
  let p = await progress(page)
  report.checks.push({ name: 'wrong-gesture-ignored', status: p === '00' ? 'pass' : 'fail', progress: p })

  // Correct first swipe
  await swipe(page, 'left')
  p = await progress(page)
  report.checks.push({ name: 'first-reveal', status: p === '01' ? 'pass' : 'fail', progress: p })
  await page.screenshot({ path: path.join(OUT, 'chapter1-gallery-first-reveal.png'), fullPage: false })

  // Undo
  await page.waitForTimeout(200)
  await page.locator('[data-undo]').click({ force: true })
  await page.waitForTimeout(500)
  p = await progress(page)
  report.checks.push({ name: 'undo', status: p === '00' ? 'pass' : 'fail', progress: p })

  // Complete all gestures
  for (const g of gestures) {
    await swipe(page, g)
  }
  p = await progress(page)
  const complete = await page.evaluate(() => document.documentElement.classList.contains('gallery-complete'))
  const hint = await page.locator('[data-hint]').innerText()
  report.checks.push({
    name: 'gallery-complete',
    status: complete && p === '08' && /scroll/i.test(hint) ? 'pass' : 'fail',
    progress: p,
    complete,
    hint,
  })
  await page.screenshot({ path: path.join(OUT, 'chapter1-gallery-complete.png'), fullPage: false })

  // Scroll should now work
  await page.mouse.wheel(0, 1200)
  await page.waitForTimeout(400)
  const scrolled = await page.evaluate(() => window.scrollY)
  report.checks.push({ name: 'scroll-unlocked', status: scrolled > 0 ? 'pass' : 'fail', scrolled })

  // Letter chapter
  await page.locator('#chapter-letter').scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(OUT, 'chapter2-letter.png'), fullPage: false })
  const circles = await page.locator('.letter__circle').count()
  report.checks.push({ name: 'letter-circles', status: circles >= 4 ? 'pass' : 'fail', circles })

  // Memories
  await page.locator('#chapter-memories').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, 'chapter3-memories.png'), fullPage: false })
  const memories = await page.locator('.memory').count()
  report.checks.push({ name: 'four-memories', status: memories === 4 ? 'pass' : 'fail', memories })

  // Hover play first video
  const video = page.locator('.memory video').first()
  await page.locator('.memory').first().hover()
  await page.waitForTimeout(500)
  const playing = await video.evaluate((v) => !v.paused)
  report.checks.push({ name: 'video-hover-play', status: playing ? 'pass' : 'fail', playing })

  // Finale
  await page.locator('#chapter-finale').scrollIntoViewIfNeeded()
  await page.waitForTimeout(2200)
  await page.screenshot({ path: path.join(OUT, 'chapter4-finale.png'), fullPage: false })
  const finaleText = await page.locator('.finale__draw-text').textContent()
  report.checks.push({ name: 'finale-text', status: /HAPPY BIRTHDAY/.test(finaleText || '') ? 'pass' : 'fail', finaleText })

  // Mobile layout
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, 'mobile-gallery.png'), fullPage: false })
  await page.locator('#chapter-memories').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, 'mobile-memories.png'), fullPage: false })

  // Asset path check from network
  const assetSample = await page.evaluate(() => {
    const img = document.querySelector('.gallery__card img, .letter__circle img')
    const v = document.querySelector('.memory video')
    return { img: img?.getAttribute('src') || img?.src, video: v?.getAttribute('src') || v?.src }
  })
  const pathsOk =
    String(assetSample.img || '').includes('/hbd-website/') &&
    String(assetSample.video || '').includes('/hbd-website/')
  report.checks.push({ name: 'asset-base-path', status: pathsOk ? 'pass' : 'fail', assetSample })

  // Sound toggle does not autoplay ambient beforehand
  await page.setViewportSize({ width: 1280, height: 800 })
  const soundPressed = await page.locator('[data-sound]').getAttribute('aria-pressed')
  report.checks.push({ name: 'sound-off-by-default', status: soundPressed === 'false' ? 'pass' : 'fail', soundPressed })
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
