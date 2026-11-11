/**
 * Capture approved camera-led Ch1 + handwritten Ch4 evidence.
 * Requires Pages-like static server already running on PORT (default 4173).
 */
import { chromium, devices } from 'playwright'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'

const PORT = process.env.PORT || '4173'
const BASE = `http://127.0.0.1:${PORT}/hbd-website/`
const OUT = process.env.CAPTURE_OUT || '/opt/cursor/artifacts'
await mkdir(OUT, { recursive: true })

const gestures = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
]
const dirs = ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log('shot', name)
  return file
}

async function settleWait(page, i) {
  // First move 2.8s, others 2.4s — wait a touch past settle
  await page.waitForTimeout(i === 0 ? 3000 : 2600)
}

async function runDesktop() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas.webgl-canvas')
  await page.waitForTimeout(1200)
  await page.locator('canvas.webgl-canvas').click({ position: { x: 400, y: 300 } })
  await shot(page, 'cine-desktop-00-start')

  const seenDirs = new Set()
  for (let i = 0; i < gestures.length; i++) {
    const key = gestures[i]
    const dir = dirs[i]
    await page.keyboard.press(key)
    // Mid-flight (~45% of memoryGlide)
    await page.waitForTimeout(i === 0 ? 1100 : 950)
    if (!seenDirs.has(dir)) {
      await shot(page, `cine-ch1-midflight-${dir}`)
      seenDirs.add(dir)
    } else {
      await shot(page, `cine-ch1-midflight-${String(i + 1).padStart(2, '0')}-${dir}`)
    }
    await settleWait(page, i)
    await shot(page, `cine-ch1-settled-${String(i + 1).padStart(2, '0')}`)
  }

  await shot(page, 'cine-ch1-awaiting-pullout')

  // Dolly-zoom pull-out via Continue
  const cont = page.locator('[data-continue]')
  await cont.click({ force: true })
  await page.waitForTimeout(1800)
  await shot(page, 'cine-ch1-pullout-mid')
  await page.waitForTimeout(2800)
  await shot(page, 'cine-ch1-collage')

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

  const memY = await panelY('#chapter-memories')
  await page.evaluate((y) => window.scrollTo({ top: y - 200, behavior: 'instant' }), memY)
  await page.waitForTimeout(1000)
  await shot(page, 'cine-circles-expanding')
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), memY)
  await page.waitForTimeout(1200)
  await shot(page, 'cine-ch3-portals')

  await page.mouse.move(520, 380)
  await page.waitForTimeout(900)
  await shot(page, 'cine-portal-playing')

  const finY = await panelY('#chapter-finale')
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), finY)
  // Portal → nib gather
  await page.waitForTimeout(900)
  await shot(page, 'cine-portals-to-nib')
  // Writing stills at ~10 / 35 / 60 / 85 / 100% of ~8.8s ink + message to 12.3s
  await page.waitForTimeout(700)
  await shot(page, 'cine-finale-10pct')
  await page.waitForTimeout(2200)
  await shot(page, 'cine-finale-35pct')
  await page.waitForTimeout(2200)
  await shot(page, 'cine-finale-60pct')
  await page.waitForTimeout(2200)
  await shot(page, 'cine-finale-85pct')
  await page.waitForTimeout(1800)
  await shot(page, 'cine-finale-100pct')
  await page.waitForTimeout(2800)
  await shot(page, 'cine-finale-message')

  await browser.close()
}

async function runDesktopVideo() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  for (let i = 0; i < gestures.length; i++) {
    await page.mouse.move(200 + Math.random() * 900, 180 + Math.random() * 500)
    await page.keyboard.press(gestures[i])
    await page.waitForTimeout(i === 0 ? 2900 : 2500)
  }
  await page.waitForTimeout(400)
  await page.locator('[data-continue]').click({ force: true })
  await page.waitForTimeout(4500)

  const heights = await page.evaluate(() => document.documentElement.scrollHeight)
  for (const frac of [0.12, 0.28, 0.45, 0.55, 0.72, 0.85, 0.95]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(heights * frac))
    await page.waitForTimeout(frac > 0.7 ? 2200 : 1100)
  }
  await page.waitForTimeout(6000)

  const vid = page.video()
  await context.close()
  await browser.close()
  if (vid) {
    const vpath = await vid.path()
    await copyFile(vpath, path.join(OUT, 'cinematic-desktop-walkthrough.webm'))
    console.log('video desktop')
  }
}

async function runMobileVideo() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
  })
  const iPhone = devices['iPhone 13']
  const context = await browser.newContext({
    ...iPhone,
    recordVideo: { dir: OUT, size: { width: iPhone.viewport.width, height: iPhone.viewport.height } },
  })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

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

  for (let i = 0; i < dirs.length; i++) {
    await swipe(dirs[i])
    await page.waitForTimeout(1100)
    if (i < 4) await shot(page, `cine-mobile-midflight-${dirs[i]}`)
    await page.waitForTimeout(1600)
  }
  await shot(page, 'cine-mobile-awaiting-pullout')

  // Swipe up for pull-out
  await swipe('up')
  await page.waitForTimeout(4500)
  await shot(page, 'cine-mobile-collage')

  const cont = page.locator('[data-continue]')
  if (await cont.count()) await cont.first().click({ force: true }).catch(() => undefined)
  await page.waitForTimeout(500)
  const heights = await page.evaluate(() => document.documentElement.scrollHeight)
  for (const frac of [0.15, 0.3, 0.5, 0.7, 0.9]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(heights * frac))
    await page.waitForTimeout(frac > 0.65 ? 2500 : 1000)
  }
  await shot(page, 'cine-mobile-finale')
  await page.waitForTimeout(4000)

  const vid = page.video()
  await context.close()
  await browser.close()
  if (vid) {
    const vpath = await vid.path()
    await copyFile(vpath, path.join(OUT, 'cinematic-mobile-touch-walkthrough.webm'))
    console.log('mobile video')
  }
}

const manifest = { base: BASE, out: OUT, at: new Date().toISOString(), mode: 'camera-led-handwriting' }
await runDesktop()
await runDesktopVideo()
await runMobileVideo()
await writeFile(path.join(OUT, 'cinematic-capture-manifest.json'), JSON.stringify(manifest, null, 2))
console.log('done')
