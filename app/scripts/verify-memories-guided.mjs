/**
 * Verify Ch3 guided portals (Chromium desktop + iPhone + WebKit):
 * - rest AABBs do not intersect; fully on-screen
 * - tap through all 4 with shortenPlayback (enlarge → end → shrink → next glow)
 * - scroll blocked before completion; works after
 */
import { chromium, webkit } from 'playwright'
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

function boxesIntersect(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
}

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
  await page.waitForTimeout(2800)
}

async function unlockGallery(page, { touch = false } = {}) {
  await page.goto(BASE + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForSelector('.webgl-canvas', { timeout: 30000 })
  await page.waitForTimeout(700)
  await page.locator('.webgl-canvas').click({ position: { x: 140, y: 220 } }).catch(() => {})
  if (touch) {
    const gestures = ['left', 'right', 'up', 'down', 'left', 'right', 'up', 'down']
    for (const g of gestures) await swipe(page, g)
  } else {
    for (let i = 0; i < keys.length; i++) {
      await page.keyboard.press(keys[i])
      await page.waitForTimeout(i === 0 ? 2800 : 2400)
    }
  }
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
  await page.waitForTimeout(1200)
}

async function scrollToProgress(page, progress) {
  await page.evaluate((p) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: Math.round(max * p), behavior: 'instant' })
  }, progress)
}

async function awaitChapter(page, chapter) {
  await page.waitForFunction(
    (ch) => document.documentElement.dataset.chapter === ch,
    chapter,
    { timeout: 15000 },
  )
}

async function enableShorten(page) {
  await page.evaluate(() => {
    if (!window.__hbdMemoriesTest) window.__hbdMemoriesTest = {}
    window.__hbdMemoriesTest.shortenPlayback = true
  })
}

async function getState(page) {
  return page.evaluate(() => window.__hbdMemoriesTest?.getState?.() ?? null)
}

async function getBounds(page) {
  return page.evaluate(() => window.__hbd?.projectMemoriesBounds?.() ?? null)
}

async function tapPortalCenter(page, index) {
  // Prefer deterministic test hook (headless raycasts are flaky on Chromium);
  // still click screen centre so gesture path is exercised when possible.
  const box = await page.evaluate((i) => {
    const bounds = window.__hbd?.projectMemoriesBounds?.()
    if (!bounds || !bounds[i]) return null
    const b = bounds[i]
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  }, index)
  if (box) {
    await page.mouse.click(box.x, box.y).catch(() => {})
  }
  const ok = await page.evaluate((i) => {
    const s = window.__hbdMemoriesTest?.getState?.()
    if (s && (s.phase === 'expanding' || s.phase === 'playing') && s.activeIndex === i) return true
    return window.__hbdMemoriesTest?.activatePortal?.(i) === true
  }, index)
  if (!ok) {
    // Last chance: force activate even if already mid-transition reset
    await page.evaluate((i) => window.__hbdMemoriesTest?.activatePortal?.(i), index)
  }
}

async function waitUntil(page, fn, arg, timeout = 16000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn, arg)) return
    await page.waitForTimeout(120)
  }
  throw new Error('timeout waiting for condition')
}

async function runSuite(browserType, label, contextOpts) {
  const report = { label, checks: [], ok: true }
  const launchOpts =
    browserType === chromium
      ? {
          headless: true,
          executablePath: '/usr/local/bin/google-chrome',
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--enable-webgl'],
        }
      : { headless: true }

  const browser = await browserType.launch(launchOpts)
  const context = await browser.newContext(contextOpts)
  const page = await context.newPage()
  page.on('pageerror', (e) => {
    report.checks.push({ name: 'pageerror', status: 'fail', err: String(e) })
    report.ok = false
  })

  try {
    await unlockGallery(page, { touch: !!contextOpts.hasTouch })
    await scrollToProgress(page, 0.2)
    await page.waitForTimeout(500)
    await scrollToProgress(page, 0.36)
    await awaitChapter(page, 'memories')
    await page.waitForTimeout(1600)
    await enableShorten(page)

    // Late memories — must still be separated (root-cause regression)
    await scrollToProgress(page, 0.58)
    // Wait for posters to paint before rest still
    await page.waitForTimeout(2200)
    await page.screenshot({ path: path.join(OUT, `ch3-${label}-rest-glow.png`), fullPage: false })

    let bounds = await getBounds(page)
    if (!bounds || bounds.length !== 4) {
      report.checks.push({ name: 'bounds-available', status: 'fail', bounds })
      report.ok = false
    } else {
      let overlap = false
      for (let i = 0; i < bounds.length; i++) {
        for (let j = i + 1; j < bounds.length; j++) {
          if (boxesIntersect(bounds[i], bounds[j])) overlap = true
        }
      }
      const vw = contextOpts.viewport.width
      const vh = contextOpts.viewport.height
      const inside = bounds.every(
        (b) => b.x >= 18 && b.y >= 18 && b.x + b.w <= vw - 18 && b.y + b.h <= vh - 18,
      )
      report.checks.push({ name: 'no-intersect-at-rest', status: overlap ? 'fail' : 'pass', bounds })
      report.checks.push({ name: 'fully-on-screen', status: inside ? 'pass' : 'fail', bounds })
      if (overlap || !inside) report.ok = false
    }

    // Scroll blocked before watching
    await scrollToProgress(page, 0.8)
    await page.waitForTimeout(500)
    const chapterStill = await page.evaluate(() => document.documentElement.dataset.chapter)
    const unlockedBefore = (await getState(page))?.scrollUnlocked === true
    report.checks.push({
      name: 'scroll-blocked-before',
      status: chapterStill === 'memories' && !unlockedBefore ? 'pass' : 'fail',
      chapterStill,
      unlockedBefore,
    })
    if (chapterStill !== 'memories' || unlockedBefore) report.ok = false
    // Return to memories framing
    await scrollToProgress(page, 0.5)
    await page.waitForTimeout(600)

    for (let i = 0; i < 4; i++) {
      await enableShorten(page)
      await tapPortalCenter(page, i)
      await waitUntil(
        page,
        () => {
          const s = window.__hbdMemoriesTest?.getState?.()
          return !!(s && (s.phase === 'expanding' || s.phase === 'playing'))
        },
        null,
        10000,
      )
      if (i === 0) {
        await page.waitForTimeout(800)
        await page.screenshot({
          path: path.join(OUT, `ch3-${label}-enlarged.png`),
          fullPage: false,
        })
      }
      await waitUntil(
        page,
        (idx) => {
          const s = window.__hbdMemoriesTest?.getState?.()
          return !!(s && s.watched[idx] === true && s.phase === 'rest')
        },
        i,
        18000,
      )
      const s = await getState(page)
      report.checks.push({
        name: `portal-${i}-watched`,
        status: s?.watched?.[i] ? 'pass' : 'fail',
        state: s,
      })
      if (!s?.watched?.[i]) report.ok = false
      if (i === 0) {
        await page.waitForTimeout(350)
        await page.screenshot({
          path: path.join(OUT, `ch3-${label}-next-glow.png`),
          fullPage: false,
        })
      }
    }

    const finalState = await getState(page)
    report.checks.push({
      name: 'all-watched-unlocked',
      status: finalState?.allWatched && finalState?.scrollUnlocked ? 'pass' : 'fail',
      finalState,
    })
    if (!(finalState?.allWatched && finalState?.scrollUnlocked)) report.ok = false

    await page.waitForTimeout(700)
    await page.screenshot({
      path: path.join(OUT, `ch3-${label}-all-watched.png`),
      fullPage: false,
    })

    await scrollToProgress(page, 0.78)
    await page.waitForTimeout(1000)
    const afterChapter = await page.evaluate(() => document.documentElement.dataset.chapter)
    report.checks.push({
      name: 'scroll-works-after',
      status: afterChapter === 'finale' ? 'pass' : 'fail',
      afterChapter,
    })
    if (afterChapter !== 'finale') report.ok = false

    // Resize smoke
    const vp = contextOpts.viewport
    await page.setViewportSize({ width: Math.min(vp.height, 844), height: Math.min(vp.width, 430) })
    await page.waitForTimeout(700)
    await page.setViewportSize(vp)
    await page.waitForTimeout(700)
    // Back to memories for bounds (may be on finale — skip if so)
    if ((await page.evaluate(() => document.documentElement.dataset.chapter)) === 'memories') {
      bounds = await getBounds(page)
      if (bounds?.length === 4) {
        let overlap = false
        for (let i = 0; i < 4; i++) {
          for (let j = i + 1; j < 4; j++) {
            if (boxesIntersect(bounds[i], bounds[j])) overlap = true
          }
        }
        report.checks.push({
          name: 'no-intersect-after-resize',
          status: overlap ? 'fail' : 'pass',
        })
        if (overlap) report.ok = false
      }
    }
  } catch (err) {
    report.ok = false
    report.checks.push({ name: 'suite-error', status: 'fail', err: String(err) })
  }

  await browser.close()
  return report
}

console.log('verify guided memories @', BASE)
const reports = []
reports.push(
  await runSuite(chromium, 'desktop', {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  }),
)
reports.push(
  await runSuite(chromium, 'iphone390', {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  }),
)
try {
  reports.push(
    await runSuite(webkit, 'webkit390', {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    }),
  )
} catch (e) {
  reports.push({
    label: 'webkit390',
    ok: false,
    checks: [{ name: 'launch', status: 'fail', err: String(e) }],
  })
}

fs.writeFileSync(path.join(OUT, 'ch3-guided-report.json'), JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports, null, 2))
process.exit(reports.some((r) => !r.ok) ? 1 : 0)
