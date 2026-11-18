/**
 * Review stills (desktop 1440×900 + mobile 390×844):
 * - Ch3 blue glowing circle
 * - Letter right after ch1→ch2 lands
 * - Finale
 * - Ch1 after roaming back post-completion
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
  await page.locator('.webgl-canvas').click({ position: { x: 120, y: 200 } }).catch(() => {})
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
    { timeout: 25000 },
  )
  await page.locator('[data-continue]').click({ force: true })
  await page.waitForFunction(
    () => document.documentElement.classList.contains('gallery-complete'),
    null,
    { timeout: 20000 },
  )
  await page.waitForTimeout(1000)
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

async function shoot(page, name) {
  const file = path.join(OUT, name)
  await page.waitForTimeout(500)
  await page.screenshot({ path: file, fullPage: false })
  console.log('wrote', file)
}

async function captureSuite(page, tag) {
  await unlockGallery(page)

  // Letter right after ch1→ch2 lands
  await page.evaluate(() => {
    const letter = document.getElementById('chapter-letter')
    if (letter) {
      const top =
        letter.getBoundingClientRect().top + window.scrollY + Math.round(window.innerHeight * 0.12)
      window.scrollTo({ top, behavior: 'auto' })
    }
  })
  await awaitChapter(page, 'letter')
  await page.waitForFunction(
    () => document.querySelectorAll('.letter-reveal.is-shown').length >= 1,
    null,
    { timeout: 3000 },
  )
  await page.waitForTimeout(350)
  await shoot(page, `${tag}-letter-after-ch1-ch2.png`)

  // Ch3 with blue glowing circle
  await scrollToProgress(page, 0.45)
  await awaitChapter(page, 'memories')
  await page.waitForTimeout(1400)
  await shoot(page, `${tag}-ch3-cobalt-glow.png`)

  // Complete memories + finale
  await page.evaluate(() => {
    if (!window.__hbdMemoriesTest) window.__hbdMemoriesTest = {}
    window.__hbdMemoriesTest.shortenPlayback = true
    window.__hbdMemoriesTest.forceAllWatched?.()
  })
  await page.waitForTimeout(400)
  await scrollToProgress(page, 0.88)
  await awaitChapter(page, 'finale')
  await page.waitForTimeout(2200)
  await shoot(page, `${tag}-finale.png`)

  // Roam back to ch1
  await scrollToProgress(page, 0.01)
  await awaitChapter(page, 'gallery')
  await page.waitForTimeout(700)
  await shoot(page, `${tag}-ch1-after-roam.png`)
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
