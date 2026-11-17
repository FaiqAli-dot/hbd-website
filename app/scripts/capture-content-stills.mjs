/**
 * Still frames for content + transition PR:
 * - mid handoffs Ch1→2, Ch2→3, Ch3→4
 * - letter top/bottom on mobile
 * - finished finale message on mobile + desktop
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/hbd-website/'
const OUT = process.env.CAPTURE_OUT || '/opt/cursor/artifacts'
fs.mkdirSync(OUT, { recursive: true })

const gestures = ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']
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

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log('shot', name)
  return file
}

async function unlockGallery(page) {
  await page.goto(BASE + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.webgl-canvas', { timeout: 30000 })
  await page.waitForTimeout(800)
  await page.locator('.webgl-canvas').click({ position: { x: 180, y: 240 } }).catch(() => {})
  for (let i = 0; i < keys.length; i++) {
    await page.keyboard.press(keys[i])
    await page.waitForTimeout(i === 0 ? 3000 : 2600)
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
  await page.waitForTimeout(1600)
}

async function scrollToPanel(page, sel, offset = 40) {
  const y = await page.evaluate(
    ({ sel, offset }) => {
      const el = document.querySelector(sel)
      if (!el) return 0
      const r = el.getBoundingClientRect()
      return Math.round(r.top + window.scrollY + offset)
    },
    { sel, offset },
  )
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
}

/** Drive ScrollTrigger chapter bands: letter <0.33, memories 0.33–0.66, finale >0.66 */
async function scrollToProgress(page, progress) {
  await page.evaluate((p) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: Math.round(max * p), behavior: 'instant' })
  }, progress)
}

async function awaitChapter(page, chapter, ms = 12000) {
  await page.waitForFunction(
    (ch) => document.documentElement.dataset.chapter === ch,
    chapter,
    { timeout: ms },
  )
}

async function runDesktop() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await unlockGallery(page)

  // Mid Ch1→Ch2: start scroll into letter field
  await shot(page, 't12-palette-ch1-gallery-desktop')
  await scrollToPanel(page, '#chapter-letter', -80)
  await page.waitForTimeout(700)
  await shot(page, 't12-mid-ch1-to-ch2')
  await scrollToPanel(page, '#chapter-letter', 40)
  // Wait until letter discs + gallery are fully retired (no faces / streaks over copy)
  await page.waitForTimeout(3200)
  await page.evaluate(() => window.__hbd?.forceCleanLetterStage?.())
  await page.waitForTimeout(200)
  await shot(page, 't12-letter-desktop')
  await shot(page, 't12-palette-ch2-letter-desktop')

  // Mid Ch2→Ch3 — catch portals mid-spread with cream rims (letter mostly gone)
  await scrollToProgress(page, 0.36)
  await awaitChapter(page, 'memories')
  await page.waitForTimeout(900)
  await shot(page, 't12-mid-ch2-to-ch3')
  await scrollToProgress(page, 0.48)
  await awaitChapter(page, 'memories')
  // Posters + muted autoplay need a beat to blit into portal canvases
  await page.waitForTimeout(2800)
  await shot(page, 't12-memories-desktop')
  await shot(page, 't12-palette-ch3-memories-desktop')

  // Mid Ch3→Ch4 — catch portals drawing inward + rose gather (not empty navy)
  await scrollToProgress(page, 0.68)
  await page.waitForTimeout(380)
  await shot(page, 't12-mid-ch3-to-ch4')
  await scrollToProgress(page, 0.82)
  await awaitChapter(page, 'finale').catch(() => {})
  // Wait through handwriting + message reveal
  await page.waitForTimeout(15000)
  await shot(page, 't12-finale-message-desktop')
  await shot(page, 't12-palette-ch4-finale-desktop')

  await browser.close()
}

async function runMobile() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
  })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await unlockGallery(page)

  await shot(page, 't12-palette-ch1-gallery-mobile')
  await scrollToPanel(page, '#chapter-letter', 40)
  await page.waitForTimeout(3200)
  await page.evaluate(() => window.__hbd?.forceCleanLetterStage?.())
  await page.waitForTimeout(200)
  // Letter top — discs must already be retired
  await page.evaluate(() => {
    const el = document.querySelector('[data-letter-overlay]')
    if (el) el.scrollTop = 0
  })
  await page.waitForTimeout(400)
  await shot(page, 't12-letter-top-mobile')
  await shot(page, 't12-palette-ch2-letter-mobile')

  // Letter bottom — scroll overlay to end
  await page.evaluate(() => window.__hbd?.forceCleanLetterStage?.())
  await page.evaluate(() => {
    const el = document.querySelector('[data-letter-overlay]')
    if (el) el.scrollTop = el.scrollHeight
  })
  await page.waitForTimeout(500)
  await shot(page, 't12-letter-bottom-mobile')

  await scrollToProgress(page, 0.2)
  await page.waitForTimeout(400)
  await scrollToProgress(page, 0.48)
  await awaitChapter(page, 'memories')
  await page.waitForTimeout(2800)
  await shot(page, 't12-palette-ch3-memories-mobile')
  await shot(page, 't12-memories-mobile')

  await scrollToProgress(page, 0.82)
  await awaitChapter(page, 'finale').catch(() => {})
  await page.waitForTimeout(14000)
  await shot(page, 't12-finale-message-mobile')
  await shot(page, 't12-palette-ch4-finale-mobile')

  await browser.close()
}

console.log('capturing stills from', BASE)
await runDesktop()
await runMobile()
console.log('done')
void gestures
