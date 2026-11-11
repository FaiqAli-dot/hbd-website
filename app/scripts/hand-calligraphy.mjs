/**
 * Hand-author elegant copperplate-leaning centerlines for H, B, y, d
 * while keeping true writing order. Rebuilds pointed-pen outlines.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const strokesPath = path.resolve(__dirname, '../src/world/finale/strokesData.js')

// Start from approved Hershey base
fs.copyFileSync(
  '/tmp/approved-design/storyboard/finale/strokes.js',
  strokesPath.replace(/strokesData\.js$/, '_raw.js'),
)
let raw = fs.readFileSync('/tmp/approved-design/storyboard/finale/strokes.js', 'utf8')
raw = raw.replace(/^window\.STROKES=/, 'const STROKES=') + '\nexport default STROKES;\n'
fs.writeFileSync(strokesPath, raw)

const mod = await import(pathToFileURL(strokesPath).href + '?v=' + Date.now())
const S = structuredClone(mod.default)

function parsePath(d) {
  return d
    .replace(/[MZ]/g, '')
    .trim()
    .split(/\s*L\s*|\s+/)
    .filter(Boolean)
    .map((tok) => tok.split(',').map(Number))
}

function pathd(pts, close = false) {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ') + (close ? ' Z' : '')
}

function cubic(p0, p1, p2, p3, n = 40) {
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

function catmull(pts, nPer = 12) {
  if (pts.length < 2) return pts
  const out = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let j = 1; j <= nPer; j++) {
      const t = j / nPer
      const t2 = t * t
      const t3 = t2 * t
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  return out
}

function resample(pts, step = 0.7) {
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
  const last = pts[pts.length - 1]
  const tip = out[out.length - 1]
  if (Math.hypot(tip[0] - last[0], tip[1] - last[1]) > 0.15) out.push(last)
  return out
}

function lengthOf(pts) {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return L
}

function outline(pts) {
  const SLANT = (58 * Math.PI) / 180
  const down = [Math.cos(SLANT), Math.sin(SLANT)]
  const HAIR = 0.72
  const SHADE = 6.2
  const N = pts.length
  const tang = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(N - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    return [dx / len, dy / len]
  })
  const pressure = tang.map((t) => {
    const dot = t[0] * down[0] + t[1] * down[1]
    return Math.pow(Math.max(0, Math.min(1, (dot - 0.08) / 0.82)), 1.5)
  })
  const k = 8
  const smooth = pressure.map((_, i) => {
    let s = 0
    let c = 0
    for (let j = -k; j <= k; j++) {
      const idx = Math.max(0, Math.min(N - 1, i + j))
      s += pressure[idx]
      c++
    }
    return s / c
  })
  const left = []
  const right = []
  let wmax = 0
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1)
    const taper = Math.min(1, Math.min((s * N) / 7 + 0.18, ((1 - s) * N) / 8 + 0.16))
    const w = ((HAIR + SHADE * smooth[i]) * taper) / 2
    wmax = Math.max(wmax, w * 2)
    const nx = -tang[i][1]
    const ny = tang[i][0]
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w])
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w])
  }
  return { poly: left.concat(right.reverse()), wmax }
}

function rebuild(stroke, centerPts) {
  const pts = resample(centerPts, 0.68)
  const { poly, wmax } = outline(pts)
  const L = lengthOf(pts)
  return {
    ...stroke,
    center: pathd(pts),
    outline: pathd(poly, true),
    len: Math.round(L * 100) / 100,
    start: pts[0].map((v) => Math.round(v * 100) / 100),
    end: pts[pts.length - 1].map((v) => Math.round(v * 100) / 100),
    wmax: Math.round(wmax * 100) / 100,
  }
}

/** Capital H — entrance hairline + shaded stem (stroke 0 of Happy) */
function elegantH() {
  // Confident pointed-pen H entry that lands into the existing 'a' connection zone
  const entry = cubic([18.2, 22], [10, 12], [6, 28], [12, 48], 28)
  const stem = cubic([12, 48], [14, 70], [16, 88], [8, 100], 36)
  // Small exit toward the bowl (stroke 1 still owns the arch)
  const exit = cubic([8, 100], [14, 92], [20, 78], [22, 58], 20)
  return resample([...entry, ...stem.slice(1), ...exit.slice(1)], 0.65)
}

/** Happy / Birthday y descender — graceful loop below the baseline */
function elegantY(start, end) {
  const top = start
  // Long confident descender: shaded downstroke into a full oval, hairline exit
  const down = cubic(top, [top[0] + 5, top[1] + 22], [top[0] + 3, 112], [top[0] - 10, 132], 36)
  const loop = cubic(
    down[down.length - 1],
    [top[0] - 28, 144],
    [top[0] - 20, 104],
    end ?? [top[0] + 10, 46],
    40,
  )
  return resample([...down, ...loop.slice(1)], 0.62)
}

/** Capital B of Birthday — confident pointed-pen stem (bowls stay on stroke 9) */
function elegantB(start, end) {
  const s = start ?? [320.55, 7.77]
  const tip = end ?? [321.88, 30.3]
  // Hairline entry into a tall shaded stem with a slight pen flourish at the foot
  const entry = cubic([s[0] - 6, s[1] + 14], [s[0] - 10, s[1] + 4], [s[0] - 2, s[1] - 2], s, 18)
  const stem = cubic(s, [s[0] - 1.5, 32], [s[0] - 0.5, 72], [s[0] + 1.2, 102], 44)
  const foot = cubic(stem[stem.length - 1], [s[0] + 6, 96], [tip[0] + 4, tip[1] + 8], tip, 22)
  return resample([...entry, ...stem.slice(1), ...foot.slice(1)], 0.62)
}

/** Tall d ascender — soft rise, shaded down, into oval body start */
function elegantD(start, end) {
  const s = start
  // Higher pointed-pen apex, then a decisive shaded descent into the bowl
  const up = cubic(s, [s[0] - 3, 18], [s[0] - 6, -12], [s[0] - 2, -18], 30)
  const down = cubic(up[up.length - 1], [s[0] + 1, 16], [s[0] + 5, 68], [s[0] + 4, 94], 40)
  const into = cubic(down[down.length - 1], [s[0] + 12, 102], [s[0] + 18, 72], end ?? [s[0] + 10, 48], 28)
  return resample([...up, ...down.slice(1), ...into.slice(1)], 0.62)
}

// Soften every ink stroke first (trim early-ink artefacts)
for (let i = 0; i < S.strokes.length; i++) {
  const s = S.strokes[i]
  let pts = parsePath(s.center)
  if (s.kind === 'ink' && pts.length > 18) pts = pts.slice(3)
  else if (pts.length > 10) pts = pts.slice(1)
  S.strokes[i] = rebuild(s, catmull(pts, 8))
}

// Hand-authored replacements (true writing order preserved)
S.strokes[0] = rebuild(S.strokes[0], elegantH())
S.strokes[7] = rebuild(S.strokes[7], elegantY(S.strokes[7].start, S.strokes[7].end))
S.strokes[8] = rebuild(S.strokes[8], elegantB(S.strokes[8].start, S.strokes[8].end))
S.strokes[11] = rebuild(S.strokes[11], elegantD(S.strokes[11].start, S.strokes[11].end))
S.strokes[16] = rebuild(S.strokes[16], elegantY(S.strokes[16].start, S.strokes[16].end))

let minX = Infinity
let minY = Infinity
let maxX = -Infinity
let maxY = -Infinity
for (const s of S.strokes) {
  for (const [x, y] of parsePath(s.center)) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
}
S.bbox = [minX - 10, minY - 12, maxX - minX + 20, maxY - minY + 24]

fs.writeFileSync(strokesPath, `const STROKES = ${JSON.stringify(S)};\nexport default STROKES;\n`)
console.log('hand calligraphy written', {
  H: S.strokes[0].len,
  yHappy: S.strokes[7].len,
  B: S.strokes[8].len,
  d: S.strokes[11].len,
  yBirth: S.strokes[16].len,
  bbox: S.bbox,
})
