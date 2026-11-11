/**
 * Capture key cinematic states for PR evidence.
 * Requires Pages-like static server already running on PORT (default 4173).
 */
import { chromium, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PORT = process.env.PORT || '4173'
const BASE = `http://127.0.0.1:${PORT}/hbd-website/`
const OUT = process.env.CAPTURE_OUT || '/opt/cursor/artifacts'
await mkdir(OUT, { recursive: true })

const gestures = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log('shot', name)
  return file
}

async function runDesktop() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas.webgl-canvas')
  await page.waitForTimeout(1200)
  await page.locator('canvas.webgl-canvas').click({ position: { x: 400, y: 300 } })
  await shot(page, 'cine-desktop-00-start')

  // Mid-flight captures: fire gesture then screenshot at mid waypoint
  for (let i = 0; i < gestures.length; i++) {
    const key = gestures[i]
    const dir = key.replace('Arrow', '').toLowerCase()
    await page.keyboard.press(key)
    // Approach (~0.5s) then close-pass hold (~1.15s)
    await page.waitForTimeout(500)
    await shot(page, `cine-ch1-midflight-${String(i + 1).padStart(2, '0')}-${dir}-approach`)
    await page.waitForTimeout(650)
    await shot(page, `cine-ch1-midflight-${String(i + 1).padStart(2, '0')}-${dir}`)
    // Let settle finish (~2.05s total)
    await page.waitForTimeout(1100)
    if (i === 0 || i === 3 || i === 7) {
      await shot(page, `cine-ch1-settled-${String(i + 1).padStart(2, '0')}`)
    }
  }

  await page.waitForTimeout(400)
  await shot(page, 'cine-ch1-collage-complete')

  // Continue into journey
  const cont = page.locator('[data-continue], button:has-text("Continue")')
  if (await cont.count()) {
    await cont.first().click().catch(() => undefined)
  }
  await page.waitForTimeout(600)

  // Scroll through chapters — use panel offsets so we land in the right chapter
  const panelY = async (id) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return 0
      const r = el.getBoundingClientRect()
      return Math.round(r.top + window.scrollY + 40)
    }, id)

  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), await panelY('#chapter-letter'))
  await page.waitForTimeout(1100)
  await shot(page, 'cine-ch1-to-ch2-transform')
  await page.waitForTimeout(700)
  await shot(page, 'cine-ch2-letter')

  // Approach memories — circles expanding
  const memY = await panelY('#chapter-memories')
  await page.evaluate((y) => window.scrollTo({ top: y - 200, behavior: 'instant' }), memY)
  await page.waitForTimeout(1000)
  await shot(page, 'cine-circles-expanding')
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), memY)
  await page.waitForTimeout(1200)
  await shot(page, 'cine-ch3-portals')

  // Tap/hover a portal — click center-left portal area
  await page.mouse.move(520, 380)
  await page.waitForTimeout(900)
  await shot(page, 'cine-portal-playing')

  // Enter finale just past threshold, capture mid-disintegration while particles fly
  const finY = await panelY('#chapter-finale')
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), finY)
  await page.waitForTimeout(500)
  await shot(page, 'cine-portals-disintegrating')
  await page.waitForTimeout(1000)
  await shot(page, 'cine-finale-forming')
  await page.evaluate((y) => window.scrollTo({ top: y + 400, behavior: 'instant' }), finY)
  await page.waitForTimeout(2200)
  await shot(page, 'cine-finale-composition')

  // Record a short desktop walkthrough via CDP screencast frames is heavy;
  // instead write a note file and rely on Playwright video below.
  await browser.close()
}

async function runDesktopVideo() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  // Slow pointer drift so camera parallax is visible in the recording
  for (const key of gestures) {
    await page.mouse.move(200 + Math.random() * 900, 180 + Math.random() * 500)
    await page.keyboard.press(key)
    await page.waitForTimeout(700)
    await page.mouse.move(400 + Math.random() * 700, 220 + Math.random() * 420)
    await page.waitForTimeout(1400)
  }
  await page.waitForTimeout(400)
  const cont = page.locator('button:has-text("Continue")')
  if (await cont.count()) await cont.first().click().catch(() => undefined)
  await page.waitForTimeout(500)
  const heights = await page.evaluate(() => document.documentElement.scrollHeight)
  for (const frac of [0.12, 0.28, 0.45, 0.55, 0.72, 0.85, 0.95]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(heights * frac))
    await page.waitForTimeout(1100)
  }
  await page.waitForTimeout(1500)
  const vid = page.video()
  await context.close()
  await browser.close()
  if (vid) {
    const vpath = await vid.path()
    const dest = path.join(OUT, 'cinematic-desktop-walkthrough.webm')
    const { copyFile } = await import('node:fs/promises')
    await copyFile(vpath, dest)
    console.log('video', dest)
  }
}

async function runMobileVideo() {
  const browser = await chromium.launch({ headless: true })
  const iPhone = devices['iPhone 13']
  const context = await browser.newContext({
    ...iPhone,
    recordVideo: { dir: OUT, size: { width: iPhone.viewport.width, height: iPhone.viewport.height } },
  })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  const swipe = async (dir) => {
    const box = { x: 195, y: 400 }
    const dist = 120
    const map = {
      left: { x: box.x + dist, y: box.y, x2: box.x - dist, y2: box.y },
      right: { x: box.x - dist, y: box.y, x2: box.x + dist, y2: box.y },
      up: { x: box.x, y: box.y + dist, x2: box.x, y2: box.y - dist },
      down: { x: box.x, y: box.y - dist, x2: box.x, y2: box.y + dist },
    }
    const m = map[dir]
    await page.touchscreen.tap(m.x, m.y) // warm
    await page.mouse.move(m.x, m.y) // fallback
    // Playwright touch swipe via CDP
    const client = await page.context().newCDPSession(page)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: m.x, y: m.y }],
    })
    await page.waitForTimeout(30)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: (m.x + m.x2) / 2, y: (m.y + m.y2) / 2 }],
    })
    await page.waitForTimeout(30)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: m.x2, y: m.y2 }],
    })
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
  }

  const dirs = ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']
  for (let i = 0; i < dirs.length; i++) {
    await swipe(dirs[i])
    await page.waitForTimeout(1000)
    if (i < 4) await shot(page, `cine-mobile-midflight-${dirs[i]}-${i}`)
    await page.waitForTimeout(1200)
  }
  await shot(page, 'cine-mobile-collage')

  // Continue + scroll handoff
  const cont = page.locator('button:has-text("Continue")')
  if (await cont.count()) await cont.first().click().catch(() => undefined)
  await page.waitForTimeout(500)
  const heights = await page.evaluate(() => document.documentElement.scrollHeight)
  for (const frac of [0.15, 0.3, 0.5, 0.7, 0.9]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(heights * frac))
    await page.waitForTimeout(1000)
  }
  await shot(page, 'cine-mobile-finale')
  await page.waitForTimeout(800)

  const vid = page.video()
  await context.close()
  await browser.close()
  if (vid) {
    const vpath = await vid.path()
    const dest = path.join(OUT, 'cinematic-mobile-touch-walkthrough.webm')
    const { copyFile } = await import('node:fs/promises')
    await copyFile(vpath, dest)
    console.log('mobile video', dest)
  }
}

const manifest = { base: BASE, out: OUT, at: new Date().toISOString() }
await runDesktop()
await runDesktopVideo()
await runMobileVideo()
await writeFile(path.join(OUT, 'cinematic-capture-manifest.json'), JSON.stringify(manifest, null, 2))
console.log('done')
