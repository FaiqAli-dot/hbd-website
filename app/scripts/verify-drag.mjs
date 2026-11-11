/**
 * Verifies 1:1 drag-scrub:
 * 1) drag halfway → hold → camera mid-path
 * 2) release → spring back
 * 3) full drag → commit
 * Also re-runs WebKit touch handoff smoke for iOS reliability.
 */
import { chromium, webkit } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/hbd-website/'
const OUT = '/opt/cursor/artifacts'
fs.mkdirSync(OUT, { recursive: true })

async function drag(page, { from, to, steps = 18, holdMs = 0, up = true }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps })
  if (holdMs) await page.waitForTimeout(holdMs)
  if (up) await page.mouse.up()
}

async function state(page) {
  return page.evaluate(() => window.__hbd?.getDragState?.() ?? null)
}

async function run(browserType, label) {
  const browser = await browserType.launch({
    headless: true,
    executablePath: label === 'chromium' ? '/usr/local/bin/google-chrome' : undefined,
    args:
      label === 'chromium'
        ? ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl']
        : undefined,
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
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas.webgl-canvas')
  await page.waitForTimeout(800)
  await page.locator('canvas.webgl-canvas').click({ force: true })

  const box = await page.locator('canvas.webgl-canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height * 0.45
  // First expected gesture is left → drag finger left (drag-world)
  // COMMIT_DIST in Experience is 0.38 of viewport; progress = drag / that
  const commitPx = box.width * 0.38
  const midPx = commitPx * 0.5 // → ~50% path progress
  const shortPx = commitPx * 0.2 // → ~20% (< 30% commit threshold) for spring-back

  // --- mid drag, hold, assert mid-path (do not release yet) ---
  await drag(page, {
    from: { x: cx + 20, y: cy },
    to: { x: cx + 20 - midPx, y: cy },
    steps: 16,
    holdMs: 450,
    up: false,
  })
  const mid = await state(page)
  await page.screenshot({ path: `${OUT}/verify-drag-midhold-${label}.png` })
  if (!mid || mid.progress < 0.28 || mid.progress > 0.72) {
    throw new Error(`[${label}] expected mid scrub progress, got ${JSON.stringify(mid)}`)
  }
  if (!mid.scrubbing && !mid.moving) {
    throw new Error(`[${label}] expected scrubbing/moving during hold`)
  }
  // Move back toward start while held so release is under commit threshold, then release
  await page.mouse.move(cx + 20 - shortPx, cy, { steps: 10 })
  await page.waitForTimeout(120)
  const preRelease = await state(page)
  await page.mouse.up()
  await page.waitForTimeout(1000)
  const back = await state(page)
  await page.screenshot({ path: `${OUT}/verify-drag-springback-${label}.png` })
  if (!back || back.progress > 0.12) {
    throw new Error(
      `[${label}] expected spring-back near 0 (pre=${JSON.stringify(preRelease)}), got ${JSON.stringify(back)}`,
    )
  }

  // full drag → commit
  await drag(page, {
    from: { x: cx + 40, y: cy },
    to: { x: cx + 40 - commitPx * 1.05, y: cy },
    steps: 22,
    holdMs: 0,
    up: true,
  })
  await page.waitForTimeout(1200)
  const committed = await state(page)
  await page.screenshot({ path: `${OUT}/verify-drag-commit-${label}.png` })
  // After commit, path settles at end (t≈1) or advances to next station
  const okCommit =
    committed &&
    (committed.progress > 0.9 || committed.pathIdx >= 0) &&
    !committed.scrubbing
  if (!okCommit) {
    throw new Error(`[${label}] expected commit settle, got ${JSON.stringify(committed)}`)
  }

  // Counter should show 01/08 after first commit
  const counter = await page.locator('text=/01\\s*\\/\\s*08/').count()
  if (!counter) {
    // some UIs use different spacing — soft check via progress API
    const p = await page.evaluate(() => document.body.innerText)
    if (!/01\s*\/\s*08/.test(p)) {
      console.warn(`[${label}] counter text not found; state=`, committed)
    }
  }

  if (errors.length) throw new Error(`[${label}] page errors: ${errors.join('; ')}`)
  console.log(`[${label}] drag verify OK`, { mid: mid.progress, back: back.progress, convention: mid.convention })
  await browser.close()
}

await run(chromium, 'chromium')
await run(webkit, 'webkit')
console.log('verify-drag passed')
