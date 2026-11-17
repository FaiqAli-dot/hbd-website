/** Capture rest-glow (desktop+mobile) and next-glow (mobile) */
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/hbd-website/'
const OUT = process.env.CAPTURE_OUT || '/opt/cursor/artifacts'
fs.mkdirSync(OUT, { recursive: true })

const keys = [
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
]

async function swipe(page, direction) {
  const box = await page.locator('.webgl-canvas').boundingBox()
  if (!box) throw new Error('no canvas')
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
  await page.waitForTimeout(2800)
}

async function unlock(page, touch) {
  await page.goto(BASE + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForSelector('.webgl-canvas', { timeout: 30000 })
  await page.waitForTimeout(700)
  await page.locator('.webgl-canvas').click({ position: { x: 140, y: 220 } }).catch(() => {})
  if (touch) {
    for (const g of ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']) {
      await swipe(page, g)
    }
  } else {
    for (let i = 0; i < keys.length; i++) {
      await page.keyboard.press(keys[i])
      await page.waitForTimeout(i === 0 ? 2800 : 2400)
    }
  }
  await page.waitForFunction(
    () => document.querySelector('[data-gallery-hud]')?.classList.contains('is-complete'),
    null,
    { timeout: 30000 },
  )
  await page.locator('[data-continue]').click({ force: true })
  await page.waitForFunction(
    () => document.documentElement.classList.contains('gallery-complete'),
    null,
    { timeout: 30000 },
  )
  await page.waitForTimeout(1400)
}

async function toMemories(page) {
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: Math.round(max * 0.22), behavior: 'instant' })
  })
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: Math.round(max * 0.5), behavior: 'instant' })
  })
  await page.waitForFunction(() => document.documentElement.dataset.chapter === 'memories', null, {
    timeout: 20000,
  })
  await page.waitForSelector('.memories-overlay.is-active', { timeout: 12000 })
  // Settle FOV + posters + glow pulse mid-cycle
  await page.waitForTimeout(3200)
}

async function margins(page) {
  return page.evaluate(() => {
    const b = window.__hbd?.projectMemoriesBounds?.()
    if (!b || b.length !== 4) return null
    const left = Math.min(...b.map((x) => x.x))
    const right = Math.max(...b.map((x) => x.x + x.w))
    const sizes = b.map((x) => Math.round(x.w))
    return {
      left: Math.round(left),
      right: Math.round(window.innerWidth - right),
      delta: Math.round(Math.abs(left - (window.innerWidth - right))),
      sizes,
      chapter: document.documentElement.dataset.chapter,
      letterActive: document.querySelector('[data-letter-overlay]')?.classList.contains('is-active'),
      memoriesActive: document.querySelector('[data-memories-overlay]')?.classList.contains('is-active'),
    }
  })
}

const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/local/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
})

{
  console.log('desktop…')
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await unlock(page, false)
  await toMemories(page)
  console.log('desktop margins', await margins(page))
  await page.screenshot({ path: path.join(OUT, 'ch3-desktop-rest-glow.png'), fullPage: false })
  await page.close()
}

{
  console.log('mobile…')
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await unlock(page, true)
  await toMemories(page)
  console.log('mobile rest margins', await margins(page))
  await page.screenshot({ path: path.join(OUT, 'ch3-iphone390-rest-glow.png'), fullPage: false })

  await page.evaluate(() => {
    window.__hbdMemoriesTest.shortenPlayback = true
    window.__hbdMemoriesTest.activatePortal(0)
  })
  const start = Date.now()
  while (Date.now() - start < 20000) {
    const s = await page.evaluate(() => window.__hbdMemoriesTest?.getState?.())
    if (s?.watched?.[0] && s.phase === 'rest' && s.activeIndex === 1) break
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(900)
  console.log('mobile next margins', await margins(page))
  await page.screenshot({ path: path.join(OUT, 'ch3-iphone390-next-glow.png'), fullPage: false })
  await page.close()
  await ctx.close()
}

await browser.close()
console.log('done')
