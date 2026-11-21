/**
 * Real-media review stills (desktop 1440×900 + mobile 390×844):
 * - ch1 photo 1
 * - ch1 mid-gallery (~04/08)
 * - ch1 collage / all 8
 * - ch3 grid with posters
 * - ch3 one portrait circle enlarged+playing
 */
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

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
  await page.waitForTimeout(2600)
}

/** Advance from current progress until `target` photos revealed (1..8). */
async function advanceGalleryTo(page, target) {
  const curText = await page.locator('[data-progress-current]').textContent()
  let cur = Number.parseInt(curText || '0', 10) || 0
  while (cur < target) {
    const i = cur // next gesture index
    await page.keyboard.press(keys[i])
    await page.waitForTimeout(i === 0 ? 2600 : 2200)
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
  await page.waitForTimeout(800)
  await page.locator('.webgl-canvas').click({ position: { x: 120, y: 200 } }).catch(() => {})
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
    await page.waitForTimeout(500)
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

async function shoot(page, name) {
  const file = path.join(OUT, name)
  await page.waitForTimeout(400)
  await page.screenshot({ path: file, fullPage: false })
  console.log('wrote', file)
}

async function captureSuite(page, tag) {
  await freshStart(page)

  // Ch1 photo 1
  await advanceGalleryTo(page, 1)
  await page.waitForTimeout(700)
  await shoot(page, `${tag}-ch1-photo-01.png`)

  // Ch1 mid (~04/08)
  await advanceGalleryTo(page, 4)
  await page.waitForTimeout(700)
  await shoot(page, `${tag}-ch1-mid-gallery.png`)

  // Finish gallery → collage overview
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
  // Shoot collage during the post-pull-out hold (before scrollIntoJourney ~1800ms)
  await page.waitForFunction(
    () => document.querySelector('[data-progress-current]')?.textContent === '08',
    null,
    { timeout: 5000 },
  )
  await page.waitForTimeout(700)
  await shoot(page, `${tag}-ch1-collage-all8.png`)
  // Let scrollIntoJourney land, then continue to Ch3
  await page.waitForTimeout(1600)

  // Ch3 grid with posters
  await holdChapter(page, 0.48, 'memories')
  await page.waitForFunction(
    () => {
      const bounds = window.__hbd?.projectMemoriesBounds?.() || []
      return bounds.length === 4 && bounds.every((b) => b.w >= 90)
    },
    null,
    { timeout: 12000 },
  )
  await page.waitForTimeout(1600)
  await shoot(page, `${tag}-ch3-grid-posters.png`)

  // Enlarge a portrait portal (index 1 — night ride smile) and play briefly
  await page.evaluate(() => {
    if (!window.__hbdMemoriesTest) window.__hbdMemoriesTest = {}
    window.__hbdMemoriesTest.shortenPlayback = false
  })
  const activated = await page.evaluate(() => window.__hbdMemoriesTest?.activatePortal?.(1))
  if (!activated) {
    // Fallback: try portal 0
    await page.evaluate(() => window.__hbdMemoriesTest?.activatePortal?.(0))
  }
  await page.waitForFunction(
    () => {
      const s = window.__hbdMemoriesTest?.getState?.()
      return s?.phase === 'playing' || s?.phase === 'expanding'
    },
    null,
    { timeout: 8000 },
  )
  await page.waitForTimeout(1400)
  await shoot(page, `${tag}-ch3-enlarged-playing.png`)
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
  })
  try {
    const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await captureSuite(desk, 'desktop-1440x900')
    await desk.close()

    const phone = await browser.newPage({
      ...devices['iPhone 12'],
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    await captureSuite(phone, 'mobile-390x844')
    await phone.close()
  } finally {
    await browser.close()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
