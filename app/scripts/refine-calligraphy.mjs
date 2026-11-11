/**
 * Refine Hershey-derived script strokes into more elegant calligraphy.
 * - Softens early-ink loop artefacts (trim + re-taper starts)
 * - Replaces the capital H stem/arch and the tall d hairline with
 *   hand-authored copperplate-leaning centerlines (true writing order kept)
 * - Rebuilds pointed-pen outlines from refined centers
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const strokesPath = path.resolve(__dirname, '../src/world/finale/strokesData.js')

const mod = await import(pathToFileURL(strokesPath).href)
const S = structuredClone(mod.default)

function parsePath(d) {
  return d
    .replace(/[MZ]/g, '')
    .trim()
    .split(/\s*L\s*|\s+/)
    .filter(Boolean)
    .map((tok) => {
      const [x, y] = tok.split(',').map(Number)
      return [x, y]
    })
}

function pathd(pts, close = false) {
  const body = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  return close ? body + ' Z' : body
}

function resample(pts, step = 0.75) {
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
  if (Math.hypot(tip[0] - last[0], tip[1] - last[1]) > 0.2) out.push(last)
  return out
}

function chaikin(pts, it = 2) {
  let p = pts
  for (let n = 0; n < it; n++) {
    if (p.length < 3) return p
    const q = [p[0]]
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]
      const b = p[i + 1]
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]])
      q.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]])
    }
    q.push(p[p.length - 1])
    p = q
  }
  return p
}

function lengthOf(pts) {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return L
}

/** Pointed-pen outline: hairline upstrokes, swelling downstrokes */
function outline(pts) {
  const SLANT = (62 * Math.PI) / 180
  const down = [Math.cos(SLANT), Math.sin(SLANT)]
  const HAIR = 0.85
  const SHADE = 5.4
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
    return Math.pow(Math.max(0, Math.min(1, (dot - 0.12) / 0.78)), 1.35)
  })
  // smooth pressure
  const k = 7
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
    const taper = Math.min(1, Math.min(s * N / 7 + 0.2, (1 - s) * N / 8 + 0.18))
    const w = ((HAIR + SHADE * smooth[i]) * taper) / 2
    wmax = Math.max(wmax, w * 2)
    const nx = -tang[i][1]
    const ny = tang[i][0]
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w])
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w])
  }
  return { poly: left.concat(right.reverse()), wmax }
}

function cubic(p0, p1, p2, p3, n = 48) {
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

/** Elegant capital H — entrance hairline + shaded stem + arch into a */
function elegantH(start) {
  // Keep approximate start near original so pen lifts stay coherent
  const s = start
  const stemTop = [s[0] - 2.2, s[1] - 2.5]
  const stemBot = [s[0] + 6.5, 98]
  const arch = cubic(
    [s[0] - 0.5, s[1] + 4],
    [s[0] + 8, s[1] - 18],
    [s[0] + 22, s[1] - 6],
    [s[0] + 28, s[1] + 16],
    36,
  )
  // Writing order: short entrance → main downstem is stroke0 in Hershey;
  // we keep a single connected flourish that reads as a calligraphic H entry
  const entry = cubic(
    s,
    [s[0] - 6, s[1] - 4],
    [s[0] - 10, s[1] + 8],
    [s[0] - 4, s[1] + 22],
    28,
  )
  const down = cubic(entry[entry.length - 1], [stemTop[0] + 2, 40], [stemBot[0] - 1, 78], stemBot, 40)
  // Prefer a refined first stroke that is the entry+stem; second stroke still does the bowl
  return resample(chaikin([...entry, ...down.slice(1)], 1), 0.7)
}

/** Tall d: soft entrance, shaded ascender, oval body — less school-copperplate hairline */
function elegantTallD(start, endHint) {
  const s = start
  const top = [s[0] - 1.5, -6]
  const asc = cubic(s, [s[0] - 0.5, 18], [top[0] + 1, -2], top, 30)
  // reverse down the shaded stem then into the bowl
  const down = cubic(top, [s[0] + 1.5, 28], [s[0] + 3, 70], [s[0] + 2, 86], 36)
  const bowl = cubic(
    down[down.length - 1],
    [s[0] + 22, 100],
    [s[0] + 28, 52],
    endHint ?? [s[0] + 14, 48],
    40,
  )
  return resample(chaikin([...asc, ...down.slice(1), ...bowl.slice(1)], 1), 0.7)
}

function rebuildStroke(stroke, centerPts) {
  const pts = resample(chaikin(centerPts, 1), 0.72)
  // Trim tiny early-ink stutter at the very start of looped letters
  const trimmed = pts.length > 12 ? pts.slice(2) : pts
  const { poly, wmax } = outline(trimmed)
  const L = lengthOf(trimmed)
  return {
    ...stroke,
    center: pathd(trimmed),
    outline: pathd(poly, true),
    len: Math.round(L * 100) / 100,
    start: trimmed[0].map((v) => Math.round(v * 100) / 100),
    end: trimmed[trimmed.length - 1].map((v) => Math.round(v * 100) / 100),
    wmax: Math.round(wmax * 100) / 100,
  }
}

// Stroke 0 = H entry/stem, stroke 11 = tall d in Birthday
S.strokes[0] = rebuildStroke(S.strokes[0], elegantH(S.strokes[0].start))
S.strokes[11] = rebuildStroke(
  S.strokes[11],
  elegantTallD(S.strokes[11].start, S.strokes[11].end),
)

// Soften remaining ink strokes: chaikin + early trim to kill loop cross artefacts
for (let i = 0; i < S.strokes.length; i++) {
  if (i === 0 || i === 11) continue
  const s = S.strokes[i]
  if (s.kind !== 'ink') continue
  let pts = parsePath(s.center)
  // Drop the first 2–3 samples where Hershey loops often double-ink
  if (pts.length > 20) pts = pts.slice(3)
  S.strokes[i] = rebuildStroke(s, pts)
}

// Recompute bbox
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
S.bbox = [minX - 8, minY - 8, maxX - minX + 16, maxY - minY + 16]

const out = `const STROKES = ${JSON.stringify(S)};\nexport default STROKES;\n`
fs.writeFileSync(strokesPath, out)
console.log('Refined calligraphy →', strokesPath)
console.log('strokes', S.strokes.length, 'bbox', S.bbox)
console.log(
  'H len',
  S.strokes[0].len,
  'd len',
  S.strokes[11].len,
)
