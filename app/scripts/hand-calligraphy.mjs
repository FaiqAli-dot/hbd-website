/**
 * Capitals must OCR as "Happy Birthday" through the finale MASK.
 * Keep PR6 lowercase; replace H/B outlines with clear silhouettes and
 * matching centerlines for the mask reveal / nib.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const strokesPath = path.resolve(__dirname, '../src/world/finale/strokesData.js')

const pr6Src = execSync('git show 7b47d64:app/src/world/finale/strokesData.js', {
  encoding: 'utf8',
  maxBuffer: 20e6,
})
fs.writeFileSync(strokesPath, pr6Src)
const S = structuredClone((await import(pathToFileURL(strokesPath).href + '?v=' + Date.now())).default)

function pathd(pts, close = false) {
  return (
    pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ') +
    (close ? ' Z' : '')
  )
}

function cubic(p0, p1, p2, p3, n = 20) {
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return out
}

function resample(pts, step = 0.55) {
  if (pts.length < 2) return pts
  const out = [pts[0]]
  let carry = 0
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0]
    const ay = pts[i - 1][1]
    const bx = pts[i][0]
    const by = pts[i][1]
    const dx = bx - ax
    const dy = by - ay
    const dist = Math.hypot(dx, dy)
    if (dist < 1e-6) continue
    let t = (step - carry) / dist
    while (t <= 1) {
      out.push([ax + dx * t, ay + dy * t])
      t += step / dist
    }
    carry = (carry + dist) % step
  }
  return out
}

function lengthOf(pts) {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return L
}

function ellipse(cx, cy, rx, ry, n = 36, reverse = false) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = reverse ? 1 - i / n : i / n
    const a = t * Math.PI * 2 - Math.PI / 2
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return pts
}

// Clear H silhouette with thick crossbar
const Houtline = pathd(
  [
    [5, 1],
    [12.5, 1],
    [12.5, 24],
    [21.5, 24],
    [21.5, 1],
    [29, 1],
    [29, 58],
    [21.5, 58],
    [21.5, 34],
    [12.5, 34],
    [12.5, 58],
    [5, 58],
  ],
  true,
)
const Hcenter = resample(
  [
    ...cubic([8.5, 1], [8.5, 20], [8.5, 40], [8.5, 58], 22),
    ...cubic([8.5, 58], [8.5, 44], [8.5, 36], [8.5, 29], 12).slice(1),
    ...cubic([8.5, 29], [14, 29], [19, 29], [25.5, 29], 14).slice(1),
    ...cubic([25.5, 29], [25.5, 40], [25.5, 50], [25.5, 58], 14).slice(1),
    ...cubic([25.5, 58], [23, 48], [21, 40], [20.1, 35.7], 10).slice(1),
  ],
  0.55,
)
S.strokes[0] = {
  ...S.strokes[0],
  outline: Houtline,
  center: pathd(Hcenter),
  len: Math.round(lengthOf(Hcenter) * 100) / 100,
  start: Hcenter[0].map((v) => Math.round(v * 100) / 100),
  end: Hcenter[Hcenter.length - 1].map((v) => Math.round(v * 100) / 100),
  wmax: 9,
}

// Clear B: stem + two bowls with open counters (evenodd)
const Bstem = [
  [301, 2],
  [308.5, 2],
  [308.5, 60],
  [301, 60],
]
const BuOut = ellipse(320, 16, 12, 12, 36)
const BuIn = ellipse(320, 16, 5.5, 5.2, 28, true)
const BlOut = ellipse(321, 44, 13.5, 13, 36)
const BlIn = ellipse(321, 44, 6.2, 5.8, 28, true)
const Boutline = [pathd(Bstem, true), pathd(BuOut, true), pathd(BuIn, true), pathd(BlOut, true), pathd(BlIn, true)].join(
  ' ',
)
S.strokes[8] = {
  ...S.strokes[8],
  outline: Boutline,
  wmax: 8.5,
  fillRule: 'evenodd',
}

// Clearer i-dot
S.strokes[17] = {
  ...S.strokes[17],
  center: 'M358.00,18.00 L361.50,15.00',
  outline:
    'M355.5,16.5 C355.5,13.5 358.5,11.5 361.5,13.5 C364.5,15.5 363.5,19.5 360.5,20.5 C357.5,21.5 355.5,19.5 355.5,16.5 Z',
  len: 8,
  wmax: 5,
}

S.bbox = [-8, -8, 655.9, 144.03]

fs.writeFileSync(strokesPath, `const STROKES = ${JSON.stringify(S)};\nexport default STROKES;\n`)
console.log('hand calligraphy written (OCR-tuned H/B)', {
  H: S.strokes[0].len,
  B: S.strokes[8].len,
})
