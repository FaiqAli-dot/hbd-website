import * as THREE from 'three'
import gsap from 'gsap'
import { createTimeline, stagger, utils } from 'animejs'
import STROKES from './strokesData.js'
import { finaleCopy } from '../../content/config'
import { particleBudget, type QualityTier } from '../../utils/quality'
import { prefersReducedMotion } from '../../utils/motion'
import { sound } from '../../components/sound'

const NS = 'http://www.w3.org/2000/svg'
const PALETTE = ['#FCE6EA', '#F4C9D1', '#E8A0AE', '#F2B7C2', '#FBE0E5']

interface StrokeRuntime {
  word: number
  kind: string
  center: string
  outline: string
  len: number
  start: number[]
  end: number[]
  wmax: number
  mp: SVGPathElement
  L: number
  obj: { p: number }
  el: SVGPathElement
  t0: number
  t1: number
}

/**
 * Chapter 4 — handwritten soft-pink finale.
 * Anime.js SVG stroke drawing + Three.js rose particle trails.
 * Portal particles gather into the nib before writing begins.
 */
export class FinaleWorld {
  readonly group = new THREE.Group()
  private played = false
  private points: THREE.Points
  private mat: THREE.ShaderMaterial
  private count: number
  private startPositions: Float32Array
  private colors: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private age: Float32Array
  private head = 0
  private morph = { t: 0 }
  private morphing = false
  private writing = false
  private writeStartedAt = 0
  private lastNib: [number, number] | null = null
  private lastStepWall = 0
  private nibObj = { x: 0, y: 0, lift: 1, w: 0 }
  private strokes: StrokeRuntime[] = []
  private wordGroups: SVGGElement[] = []
  private svg: SVGSVGElement | null = null
  private nibEl: SVGGElement | null = null
  private tl: ReturnType<typeof createTimeline> | null = null
  private marks: Record<string, number> = {}
  private spans: HTMLElement[] = []
  private shimmer: Array<{ x: number; y: number; w: number }> = []
  private seed = 12345
  private gatherTargets: THREE.Vector3[] = []
  private fxCam: THREE.OrthographicCamera

  constructor(tier: QualityTier) {
    this.group.position.set(0, 0, -56)
    this.count = Math.min(2600, particleBudget(tier).finale)

    const pos = new Float32Array(this.count * 3)
    this.colors = new Float32Array(this.count * 3)
    const siz = new Float32Array(this.count)
    const alp = new Float32Array(this.count)
    this.startPositions = pos
    this.vel = new Float32Array(this.count * 2)
    this.life = new Float32Array(this.count)
    this.age = new Float32Array(this.count).fill(1e9)

    const rose = PALETTE.map((c) => new THREE.Color(c))
    for (let i = 0; i < this.count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8
      pos[i * 3 + 1] = (Math.random() - 0.5) * 5
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2
      const c = rose[(Math.random() * rose.length) | 0]
      this.colors[i * 3] = c.r
      this.colors[i * 3 + 1] = c.g
      this.colors[i * 3 + 2] = c.b
      siz[i] = 2 + Math.random() * 5
      alp[i] = 0
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(siz, 1))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1))

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // Normal blending — additive pile-ups were blowing out to white
      blending: THREE.NormalBlending,
      uniforms: {
        uPR: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uSize: { value: 0.55 },
      },
      vertexShader: `
        attribute float size;
        attribute float aAlpha;
        attribute vec3 color;
        varying vec3 vC;
        varying float vA;
        uniform float uPR;
        uniform float uSize;
        void main() {
          vC = color;
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float psz = size * uSize * uPR * (90.0 / max(1.0, -mv.z));
          gl_PointSize = clamp(psz, 1.0, 14.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vC;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vA;
          if (a < 0.02) discard;
          // Soft rose only — never push toward white
          vec3 c = min(vC, vec3(0.96, 0.82, 0.86));
          gl_FragColor = vec4(c, a * 0.7);
        }
      `,
    })

    this.points = new THREE.Points(geo, this.mat)
    this.group.add(this.points)

    this.fxCam = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10)
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }

  onResize(w: number, h: number): void {
    this.fxCam.left = 0
    this.fxCam.right = w
    this.fxCam.top = 0
    this.fxCam.bottom = h
    this.fxCam.updateProjectionMatrix()
    this.mat.uniforms.uPR.value = Math.min(window.devicePixelRatio || 1, 2)
  }

  /**
   * Portal particles gather into the writing nib, then handwriting begins.
   */
  playFromPortals(
    portalWorldPositions: Array<{ x: number; y: number; z: number }>,
    portalColors?: Float32Array[],
  ): void {
    if (this.played) return
    this.played = true
    sound.play('finale', 0.45)

    // Seed particles at portal locations in world space (relative to finale group)
    const pos = this.startPositions
    const nPortals = Math.max(1, portalWorldPositions.length)
    for (let i = 0; i < this.count; i++) {
      const p = portalWorldPositions[i % nPortals]
      pos[i * 3] = p.x - this.group.position.x + (Math.random() - 0.5) * 0.8
      pos[i * 3 + 1] = p.y - this.group.position.y + (Math.random() - 0.5) * 0.8
      pos[i * 3 + 2] = p.z - this.group.position.z + (Math.random() - 0.5) * 0.4
      const portalCol = portalColors?.[i % nPortals]
      if (portalCol && portalCol.length >= 3) {
        const ci = (i * 3) % Math.max(3, portalCol.length - 2)
        // Blend portal sample toward soft rose
        this.colors[i * 3] = portalCol[ci] * 0.35 + 0.95 * 0.65
        this.colors[i * 3 + 1] = portalCol[ci + 1] * 0.35 + 0.78 * 0.65
        this.colors[i * 3 + 2] = portalCol[ci + 2] * 0.35 + 0.82 * 0.65
      }
      const alp = this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
      alp.setX(i, 0.55)
      this.age[i] = 0
      this.life[i] = 4
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.color.needsUpdate = true
    this.points.geometry.attributes.aAlpha.needsUpdate = true

    // Gather toward a soft nib point, then fully clear the cloud so nothing
    // remains as a blown-out disc behind the writing.
    this.gatherTargets = [new THREE.Vector3(0, 0.35, 0)]

    if (prefersReducedMotion()) {
      this.clearParticles()
      this.mountSvgInstant()
      return
    }

    this.morphing = true
    this.morph.t = 0
    gsap.to(this.morph, {
      t: 1,
      duration: 1.05,
      ease: 'power3.inOut',
      onUpdate: () => this.applyGather(),
      onComplete: () => {
        // Dissolve the gathered cloud completely — portals are gone
        gsap.to(this.morph, {
          t: 0,
          duration: 0.45,
          ease: 'power2.in',
          onUpdate: () => {
            const alp = this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
            for (let i = 0; i < this.count; i++) alp.setX(i, Math.max(0, alp.getX(i) * 0.82))
            alp.needsUpdate = true
          },
          onComplete: () => {
            this.clearParticles()
            this.morphing = false
            this.mountAndWrite()
          },
        })
      },
    })
  }

  private clearParticles(): void {
    const alp = this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    for (let i = 0; i < this.count; i++) {
      alp.setX(i, 0)
      this.age[i] = 1e9
      this.life[i] = 0
    }
    alp.needsUpdate = true
  }

  private applyGather(): void {
    const t = this.morph.t
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const target = this.gatherTargets[0]
    const alp = this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    const siz = this.points.geometry.getAttribute('size') as THREE.BufferAttribute
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3
      const ang = t * 3.6 + i * 0.09
      const radius = (1 - t) * (1.6 + (i % 7) * 0.4)
      const tx = target.x + Math.cos(ang) * radius * 0.22
      const ty = target.y + Math.sin(ang * 1.2) * radius * 0.14
      const tz = target.z + (1 - t) * ((i % 5) - 2) * 0.06
      posAttr.array[ix] += (tx - posAttr.array[ix]) * (0.1 + t * 0.22)
      posAttr.array[ix + 1] += (ty - posAttr.array[ix + 1]) * (0.1 + t * 0.22)
      posAttr.array[ix + 2] += (tz - posAttr.array[ix + 2]) * (0.1 + t * 0.22)
      // Stay dim — never pile into a white hotspot
      alp.setX(i, 0.12 + 0.22 * t)
      siz.setX(i, 1.4 + this.rnd() * 2.2)
    }
    posAttr.needsUpdate = true
    alp.needsUpdate = true
    siz.needsUpdate = true
  }

  private mountSvgInstant(): void {
    this.mountSvgDom()
    // Show full ink + message immediately
    this.strokes.forEach((s) => {
      s.obj.p = 1
      s.mp.style.strokeDashoffset = '0'
    })
    this.spans.forEach((sp) => {
      sp.style.opacity = '1'
      sp.style.filter = 'none'
      sp.style.transform = 'none'
    })
    const rule = document.querySelector('[data-finale-rule]') as HTMLElement | null
    if (rule) rule.style.transform = 'scaleX(1)'
    this.writing = false
  }

  private mountAndWrite(): void {
    this.mountSvgDom()
    this.buildTimeline()
    this.writing = true
    this.writeStartedAt = performance.now()
    this.lastStepWall = this.writeStartedAt
    this.tl?.seek(0)
  }

  private mountSvgDom(): void {
    const svg = document.getElementById('finale-write-svg') as unknown as SVGSVGElement | null
    if (!svg) return
    this.svg = svg
    svg.innerHTML = ''

    const defs = document.createElementNS(NS, 'defs')
    defs.innerHTML = `
      <linearGradient id="inkG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FBE0E5"/>
        <stop offset=".55" stop-color="#F4C9D1"/>
        <stop offset="1" stop-color="#E4A3B1"/>
      </linearGradient>
      <radialGradient id="nibHalo">
        <stop offset="0" stop-color="#F4C9D1" stop-opacity=".85"/>
        <stop offset=".35" stop-color="#E8A0AE" stop-opacity=".35"/>
        <stop offset="1" stop-color="#E8A0AE" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter>
    `
    svg.appendChild(defs)

    const maskG = document.createElementNS(NS, 'g')
    maskG.setAttribute('id', 'finale-masks')
    svg.appendChild(maskG)

    const inkUseSoft = document.createElementNS(NS, 'use')
    inkUseSoft.setAttribute('href', '#finale-ink')
    inkUseSoft.setAttribute('filter', 'url(#soft)')
    inkUseSoft.setAttribute('opacity', '0.22')
    svg.appendChild(inkUseSoft)

    const inkG = document.createElementNS(NS, 'g')
    inkG.setAttribute('id', 'finale-ink')
    svg.appendChild(inkG)

    const nib = document.createElementNS(NS, 'g')
    nib.setAttribute('id', 'finale-nib')
    nib.setAttribute('opacity', '0')
    // Soft rose nib only — no white core
    nib.innerHTML = `<circle r="6.5" fill="url(#nibHalo)"/><circle r="1.05" fill="#E8A0AE"/>`
    svg.appendChild(nib)
    this.nibEl = nib

    const portrait = window.innerWidth / window.innerHeight < 1
    const BIRTH_X = 296
    const wordTf = portrait
      ? [`translate(70,0)`, `translate(${-BIRTH_X + 40},132)`]
      : ['', '']
    let [bx, by, bw, bh] = STROKES.bbox as number[]
    if (portrait) {
      bx = -4
      by = -10
      bw = 392
      bh = 290
    }
    svg.setAttribute('viewBox', `${bx} ${by} ${bw} ${bh}`)

    this.wordGroups = [0, 1].map((i) => {
      const g = document.createElementNS(NS, 'g')
      g.setAttribute('transform', wordTf[i])
      inkG.appendChild(g)
      return g
    })

    this.strokes = (STROKES.strokes as Array<Omit<StrokeRuntime, 'mp' | 'L' | 'obj' | 'el' | 't0' | 't1'>>).map(
      (s, i) => {
        const m = document.createElementNS(NS, 'mask')
        m.id = `fm${i}`
        m.setAttribute('maskUnits', 'userSpaceOnUse')
        m.setAttribute('x', '-1000')
        m.setAttribute('y', '-1000')
        m.setAttribute('width', '4000')
        m.setAttribute('height', '4000')
        const mp = document.createElementNS(NS, 'path')
        mp.setAttribute('d', s.center)
        mp.setAttribute('fill', 'none')
        mp.setAttribute('stroke', '#fff')
        mp.setAttribute('stroke-width', (s.wmax + 2.2).toFixed(2))
        mp.setAttribute('stroke-linecap', 'butt')
        mp.setAttribute('stroke-linejoin', 'round')
        m.appendChild(mp)
        maskG.appendChild(m)

        const p = document.createElementNS(NS, 'path')
        p.setAttribute('d', s.outline)
        p.setAttribute('fill', 'url(#inkG)')
        p.setAttribute('mask', `url(#fm${i})`)
        this.wordGroups[s.word].appendChild(p)

        const L = mp.getTotalLength()
        mp.style.strokeDasharray = `${L} ${L + 10}`
        mp.style.strokeDashoffset = String(L)
        return { ...s, mp, L, obj: { p: 0 }, el: p, t0: 0, t1: 0 }
      },
    )

    // Message words
    const COPY = {
      sub: finaleCopy.subline,
      closing: finaleCopy.closing,
      sig: '— WITH ALL MY LOVE —',
    }
    this.spans = []
    for (const [key, sel] of [
      ['sub', '[data-finale-sub]'],
      ['closing', '[data-finale-closing]'],
      ['sig', '[data-finale-sig]'],
    ] as const) {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) continue
      el.textContent = ''
      const text = COPY[key]
      text.split(' ').forEach((w, i, a) => {
        const sp = document.createElement('span')
        sp.textContent = w
        sp.style.opacity = '0'
        el.appendChild(sp)
        if (i < a.length - 1) el.appendChild(document.createTextNode(' '))
        this.spans.push(sp)
      })
    }

    this.shimmer = []
    this.strokes.forEach((s) => {
      for (let k = 0; k < Math.ceil(s.L / 14); k++) {
        const q = s.mp.getPointAtLength(this.rnd() * s.L)
        this.shimmer.push({ x: q.x, y: q.y, w: s.word })
      }
    })
  }

  private buildTimeline(): void {
    const tl = createTimeline({ autoplay: false, defaults: { ease: 'inOutSine' } })
    const SPEED = { 0: 520, 1: 540 }
    let t = 500
    let prevEnd: { s: StrokeRuntime } | null = null
    const marks: Record<string, number> = {}

    this.strokes.forEach((s, k) => {
      if (prevEnd) {
        const dx = s.start[0] - prevEnd.s.end[0]
        const dy = s.start[1] - prevEnd.s.end[1]
        const gap =
          s.word !== prevEnd.s.word
            ? 480
            : s.kind === 'detail' || s.kind === 'swash'
              ? 240
              : 70 + Math.hypot(dx, dy) * 0.55
        tl.add(
          this.nibObj,
          {
            x: [prevEnd.s.end[0], s.start[0]],
            y: [prevEnd.s.end[1], s.start[1]],
            lift: [1, 1],
            duration: gap,
            ease: 'inOutQuad',
          },
          t,
        )
        t += gap
      }
      if (k === 0) marks.start = t
      if (s.word === 1 && marks.word2 == null) marks.word2 = t
      if (s.kind === 'swash') marks.swash = t
      const dur =
        s.kind === 'swash'
          ? 950
          : s.kind === 'detail'
            ? 160 + s.len * 6
            : Math.max(240, (s.len / SPEED[s.word as 0 | 1]) * 1000)
      tl.add(s.obj, { p: [0, 1], duration: dur, ease: s.kind === 'swash' ? 'inOutSine' : 'inOut(1.4)' }, t)
      s.t0 = t
      s.t1 = t + dur
      t += dur
      prevEnd = { s }
    })

    marks.inkDone = t
    t += 650
    marks.msg = t

    const rule = document.querySelector('[data-finale-rule]')
    if (rule) {
      tl.add(rule, { scaleX: [0, 1], duration: 900, ease: 'out(3)' }, t)
    }
    if (this.spans.length) {
      tl.add(
        this.spans,
        {
          opacity: [0, 1],
          translateY: [10, 0],
          filter: ['blur(6px)', 'blur(0px)'],
          duration: 900,
          ease: 'out(3)',
          delay: stagger(55, { start: 250 }),
        },
        t,
      )
    }
    marks.end = t + 250 + this.spans.length * 55 + 900
    this.marks = marks
    this.tl = tl
  }

  private toScreen(x: number, y: number, word: number): [number, number] {
    if (!this.svg || !this.wordGroups[word]) return [window.innerWidth / 2, window.innerHeight / 2]
    const pt = this.svg.createSVGPoint()
    pt.x = x
    pt.y = y
    const m = this.wordGroups[word].getScreenCTM()
    if (!m) return [window.innerWidth / 2, window.innerHeight / 2]
    const q = pt.matrixTransform(m)
    return [q.x, q.y]
  }

  private emit(x: number, y: number, vx: number, vy: number, n: number, glowy: boolean): void {
    const pos = this.startPositions
    const alp = this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    const siz = this.points.geometry.getAttribute('size') as THREE.BufferAttribute
    const lx = ((x / window.innerWidth) * 2 - 1) * 4.5
    const ly = -((y / window.innerHeight) * 2 - 1) * 2.6

    const count = Math.min(n, glowy ? 1 : 3)
    for (let k = 0; k < count; k++) {
      const i = this.head
      this.head = (this.head + 1) % this.count
      const a = this.rnd() * Math.PI * 2
      const sp = 0.008 + this.rnd() * 0.02
      pos[i * 3] = lx + (this.rnd() - 0.5) * 0.05
      pos[i * 3 + 1] = ly + (this.rnd() - 0.5) * 0.05
      pos[i * 3 + 2] = (this.rnd() - 0.5) * 0.12
      this.vel[i * 2] = Math.cos(a) * sp - vx * 0.00004
      this.vel[i * 2 + 1] = Math.sin(a) * sp - vy * 0.00004 - 0.006
      this.life[i] = (glowy ? 1.2 : 0.7) + this.rnd() * 0.6
      this.age[i] = 0
      siz.setX(i, (glowy ? 2.4 : 1.2) + this.rnd() * (glowy ? 2.2 : 1.8))
      const c = new THREE.Color(PALETTE[(this.rnd() * PALETTE.length) | 0])
      this.colors[i * 3] = Math.min(c.r, 0.96)
      this.colors[i * 3 + 1] = Math.min(c.g, 0.82)
      this.colors[i * 3 + 2] = Math.min(c.b, 0.86)
      alp.setX(i, glowy ? 0.35 : 0.28)
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.color.needsUpdate = true
    this.points.geometry.attributes.size.needsUpdate = true
    alp.needsUpdate = true
  }

  private stepWriting(_frameDt: number): void {
    if (!this.tl || !this.writing) return
    // Drive from wall clock so low headless FPS cannot crawl the handwriting.
    const now = performance.now()
    const ms = Math.max(0, now - this.writeStartedAt)
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastStepWall) / 1000))
    this.lastStepWall = now
    this.tl.seek(ms)
    void _frameDt

    let active: StrokeRuntime | null = null
    for (const s of this.strokes) {
      const p = s.obj.p
      s.mp.style.strokeDashoffset = (s.L * (1 - p)).toFixed(2)
      if (p > 0 && p < 1) active = s
    }

    let nx: number
    let ny: number
    let word: number
    let lift: number
    if (active) {
      const q = active.mp.getPointAtLength(active.L * active.obj.p)
      nx = q.x
      ny = q.y
      word = active.word
      lift = 0
    } else {
      nx = this.nibObj.x
      ny = this.nibObj.y
      const nxt = this.strokes.find((s) => s.t0 >= ms)
      const prv = [...this.strokes].reverse().find((s) => s.t1 <= ms)
      word = (nxt || prv || this.strokes[0]).word
      lift = 1
      if (ms < this.strokes[0].t0) {
        nx = this.strokes[0].start[0]
        ny = this.strokes[0].start[1]
      }
    }

    const writing =
      ms >= this.strokes[0].t0 - 350 && ms <= (this.marks.inkDone ?? 9000) + 250
    const nibA =
      ms < this.strokes[0].t0
        ? utils.clamp((ms - (this.strokes[0].t0 - 450)) / 350, 0, 1)
        : ms > (this.marks.inkDone ?? 9000)
          ? utils.clamp(1 - (ms - (this.marks.inkDone ?? 9000)) / 420, 0, 1)
          : lift
            ? 0.55
            : 1

    if (this.nibEl) {
      const tf = this.wordGroups[word]?.getAttribute('transform') || ''
      this.nibEl.setAttribute(
        'transform',
        `${tf} translate(${nx.toFixed(2)},${ny.toFixed(2)}) scale(${lift ? 1.25 : 1})`,
      )
      this.nibEl.setAttribute('opacity', nibA.toFixed(3))
    }

    const [sx, sy] = this.toScreen(nx, ny, word)
    if (this.lastNib && writing && !lift) {
      const vx = (sx - this.lastNib[0]) / Math.max(dt, 1e-3)
      const vy = (sy - this.lastNib[1]) / Math.max(dt, 1e-3)
      const spd = Math.hypot(vx, vy)
      const n = Math.min(3, 1 + Math.floor(spd / 400))
      this.emit(sx, sy, vx, vy, n, false)
      if (this.rnd() < 0.08) this.emit(sx, sy, vx, vy, 1, true)
    }
    this.lastNib = [sx, sy]

    const pos = this.startPositions
    const alp = this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] > this.life[i]) {
        alp.setX(i, 0)
        continue
      }
      this.age[i] += dt
      const k = this.age[i] / this.life[i]
      const cx = Math.sin(pos[i * 3 + 1] * 2 + this.age[i] * 1.3) * 0.01
      this.vel[i * 2] += cx * dt
      this.vel[i * 2] *= 0.98
      this.vel[i * 2 + 1] = this.vel[i * 2 + 1] * 0.98 - 0.008 * dt
      pos[i * 3] += this.vel[i * 2]
      pos[i * 3 + 1] += this.vel[i * 2 + 1]
      alp.setX(i, Math.pow(1 - k, 1.6) * Math.min(1, this.age[i] * 6) * 0.28)
    }

    // After ink is done, keep trails extremely sparse — no glowing disc buildup
    if (ms > (this.marks.inkDone ?? 9000)) {
      const g = utils.clamp((ms - (this.marks.inkDone ?? 9000)) / 1500, 0, 1)
      if (this.rnd() < 0.06 * g && this.shimmer.length) {
        const m = this.shimmer[(this.rnd() * this.shimmer.length) | 0]
        const [qx, qy] = this.toScreen(m.x, m.y, m.w)
        this.emit(qx, qy, 0, 0, 1, false)
      }
    }

    this.points.geometry.attributes.position.needsUpdate = true
    alp.needsUpdate = true

    if (ms >= (this.marks.end ?? 12300)) {
      this.writing = false
    }
  }

  /** Seek writing animation to a fraction (0–1 of ink+message) for captures */
  seekFraction(frac: number): void {
    if (!this.tl) {
      this.mountAndWrite()
    }
    if (!this.tl) return
    const end = this.marks.end ?? 12300
    const ms = Math.max(0, Math.min(end, frac * end))
    this.writeStartedAt = performance.now() - ms
    this.lastStepWall = performance.now()
    this.writing = true
    this.stepWriting(0.008)
  }

  update(time: number, dt = 1 / 60): void {
    void time
    void this.fxCam
    if (this.morphing) return
    if (this.writing) this.stepWriting(dt)
  }

  dispose(): void {
    this.points.geometry.dispose()
    this.mat.dispose()
    this.tl = null
  }
}
