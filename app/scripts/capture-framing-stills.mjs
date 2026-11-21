/**
 * Framing / wash review stills:
 * - ch1 photo 04 (desktop + mobile)
 * - ch3 enlarged playing (desktop + mobile)
 * - desktop contact sheet of all 8 focused photos (1440×900 each, then mosaic)
 */
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

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
const gestures = ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']

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
  await page.waitForTimeout(2400)
}

async function freshStart(page) {
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
  await page.waitForTimeout(700)
  await page.locator('.webgl-canvas').click({ position: { x: 120, y: 200 } }).catch(() => {})
}

async function advanceGalleryTo(page, target) {
  const curText = await page.locator('[data-progress-current]').textContent()
  let cur = Number.parseInt(curText || '0', 10) || 0
  while (cur < target) {
    const i = cur
    await page.keyboard.press(keys[i])
    await page.waitForTimeout(i === 0 ? 2600 : 2100)
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
    cur = i + 1
  }
}

async function shoot(page, name) {
  const file = path.join(OUT, name)
  await page.waitForTimeout(450)
  await page.screenshot({ path: file, fullPage: false })
  console.log('wrote', file)
  return file
}

async function scrollToProgress(page, progress) {
  await page.evaluate((p) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: Math.max(0, Math.round(max * p)), behavior: 'auto' })
  }, progress)
}

async function holdChapter(page, progress, chapter) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await scrollToProgress(page, progress)
    await page.waitForTimeout(350)
    const ok = await page
      .waitForFunction(
        (ch) => {
          const dom = document.documentElement.dataset.chapter
          const j = window.__hbd?.getJourneyState?.()
          return dom === ch && j?.chapter === ch && j?.chapterBusy === false
        },
        chapter,
        { timeout: 2500 },
      )
      .then(() => true)
      .catch(() => false)
    if (!ok) continue
    await page.waitForTimeout(400)
    const still = await page.evaluate(
      (ch) =>
        document.documentElement.dataset.chapter === ch &&
        window.__hbd?.getJourneyState?.()?.chapter === ch,
      chapter,
    )
    if (still) return
  }
  throw new Error(`could not hold chapter ${chapter}`)
}

async function unlockThroughGallery(page) {
  await advanceGalleryTo(page, 8)
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
  await page.waitForTimeout(2400)
}

async function captureCh1Focused(page, tag, n) {
  await freshStart(page)
  await advanceGalleryTo(page, n)
  await page.waitForTimeout(800)
  await shoot(page, `${tag}-ch1-photo-${String(n).padStart(2, '0')}.png`)
}

async function captureCh3Enlarged(page, tag) {
  await freshStart(page)
  await unlockThroughGallery(page)
  await holdChapter(page, 0.48, 'memories')
  await page.waitForFunction(
    () => (window.__hbd?.projectMemoriesBounds?.() || []).every((b) => b.w >= 90),
    null,
    { timeout: 12000 },
  )
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.__hbdMemoriesTest?.activatePortal?.(1))
  await page.waitForFunction(
    () => {
      const s = window.__hbdMemoriesTest?.getState?.()
      return s?.phase === 'playing' || s?.phase === 'expanding'
    },
    null,
    { timeout: 8000 },
  )
  await page.waitForTimeout(1500)
  await shoot(page, `${tag}-ch3-enlarged-playing.png`)
}

async function captureDesktopContactSheet(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await freshStart(page)
  const frames = []
  for (let n = 1; n <= 8; n++) {
    await advanceGalleryTo(page, n)
    await page.waitForTimeout(700)
    const file = path.join(OUT, `desktop-1440x900-ch1-focus-${String(n).padStart(2, '0')}.png`)
    await page.screenshot({ path: file, fullPage: false })
    frames.push(file)
    console.log('wrote', file)
  }
  await page.close()

  // Mosaic 2×4 contact sheet via Python/Pillow
  const sheet = path.join(OUT, 'desktop-1440x900-ch1-all8-contact.png')
  const py = `
from PIL import Image
from pathlib import Path
files = ${JSON.stringify(frames)}
imgs = [Image.open(f).convert('RGB').resize((720, 450)) for f in files]
w, h = 720 * 4, 450 * 2
sheet = Image.new('RGB', (w, h), (255, 253, 240))
for i, im in enumerate(imgs):
    x = (i % 4) * 720
    y = (i // 4) * 450
    sheet.paste(im, (x, y))
sheet.save(${JSON.stringify(sheet)}, 'PNG')
print('wrote', ${JSON.stringify(sheet)})
`
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr)
    throw new Error('contact sheet failed')
  }
  console.log(r.stdout.trim())
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
  })
  try {
    const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await captureCh1Focused(desk, 'desktop-1440x900', 4)
    await captureCh3Enlarged(desk, 'desktop-1440x900')
    await desk.close()

    const phone = await browser.newPage({
      ...devices['iPhone 12'],
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    await captureCh1Focused(phone, 'mobile-390x844', 4)
    await captureCh3Enlarged(phone, 'mobile-390x844')
    await phone.close()

    await captureDesktopContactSheet(browser)
  } finally {
    await browser.close()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
