import * as THREE from 'three'
import gsap from 'gsap'
import layout from '../../content/layout/memoryLayout.json'
import { galleryPhotos, type GestureDirection } from '../../content/config'
import { prefersReducedMotion } from '../../utils/motion'
import { sound } from '../../components/sound'
import { detectQuality, textureMaxSize } from '../../utils/quality'
import { MEMORY_GLIDE, memoryGlideEase } from './memoryGlide'

void MEMORY_GLIDE

/** drag-the-world: swipe left → camera travels right (approved iPhone Photos convention) */
export const SWIPE_CONVENTION: 'drag-world' | 'point-camera' = 'drag-world'

interface LayoutPhoto {
  id: string
  gesture: GestureDirection
  pos: number[]
  rotDeg: number[]
  size: number[]
  normal: number[]
  cam: number[]
}

interface LayoutTransition {
  frm: string
  to: string
  gesture: string
  C0: number[]
  P1: number[]
  P2: number[]
  C3: number[]
  lookFrom: number[]
  lookTo: number[]
  duration: number
}

interface PhotoNode {
  group: THREE.Group
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  index: number
  layout: LayoutPhoto
  normal: THREE.Vector3
  revealed: boolean
}

interface CamPath {
  curve: THREE.CubicBezierCurve3
  q0: THREE.Quaternion
  q1: THREE.Quaternion
  duration: number
  /** index of photo this path settles on (0..7), or -1 for outro */
  toPhoto: number
}

const photoVertex = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const photoFragment = /* glsl */ `
uniform sampler2D map;
uniform float uReveal;
uniform float uFocus;
uniform vec3 uFog;
uniform float uFogD;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec3 c = texture2D(map, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float sweep = smoothstep(uReveal * 1.6 - 0.35, uReveal * 1.6 - 0.05, (vUv.x * 0.45 + (1.0 - vUv.y) * 0.55));
  float lit = 1.0 - sweep;
  vec3 dark = vec3(l) * vec3(0.065, 0.048, 0.058) + vec3(0.004, 0.0025, 0.0035);
  float edge = 1.0 - smoothstep(0.0, 0.035, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  dark += edge * vec3(0.06, 0.032, 0.04);
  vec3 col = mix(dark, c * (0.80 + 0.08 * uFocus), lit);
  float f = 1.0 - exp(-pow(uFogD * vDepth, 2.0));
  col = mix(col, uFog, clamp(f, 0.0, 0.96));
  gl_FragColor = vec4(col, 1.0);
}
`

function V(a: number[]): THREE.Vector3 {
  return new THREE.Vector3(a[0], a[1], a[2])
}

function lookQ(cam: THREE.Vector3, look: THREE.Vector3): THREE.Quaternion {
  const m = new THREE.Matrix4().lookAt(cam, look, new THREE.Vector3(0, 1, 0))
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

/**
 * Chapter 1 — camera-led memory ribbon.
 * Prints are fixed physical planes; swipes move the camera along cubic Beziers.
 */
export class GalleryWorld {
  readonly group = new THREE.Group()
  private photos: PhotoNode[] = []
  private loader = new THREE.TextureLoader()
  private paths: CamPath[] = []
  private index = 0
  private moving = false
  private complete = false
  private history: number[] = []
  private completeCb: (() => void) | null = null
  private progressCb: (() => void) | null = null
  private state = { k: 0, t: 1 }
  private oriEase = gsap.parseEase('power2.inOut')
  private tmpQ = new THREE.Quaternion()
  private rollQ = new THREE.Quaternion()
  private fwd = new THREE.Vector3()
  private threadMat: THREE.ShaderMaterial | null = null
  private threadU: number[] = []
  private fov = 44
  private aspect = 1
  private captionCb: ((text: string | null) => void) | null = null
  private pullOutActive = false
  private pullOutDone = false
  private dustMats: THREE.ShaderMaterial[] = []

  constructor() {
    const BG = new THREE.Color('#0b080c')
    this.group.position.set(0, 0, 0)

    const maxTex = textureMaxSize(detectQuality())
    const photos = layout.photos as LayoutPhoto[]

    photos.forEach((p, i) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: null },
          uReveal: { value: 0 },
          uFocus: { value: 0 },
          uFog: { value: BG.clone().convertSRGBToLinear() },
          uFogD: { value: 0.03 },
        },
        vertexShader: photoVertex,
        fragmentShader: photoFragment,
      })
      const g = new THREE.Group()
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.size[0], p.size[1]), mat)
      mesh.position.z = 0.03
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(p.size[0], p.size[1], 0.024),
        new THREE.MeshBasicMaterial({ color: '#2a2226' }),
      )
      g.add(back, mesh)
      g.position.fromArray(p.pos)
      const n = new THREE.Vector3().fromArray(p.normal)
      const m = new THREE.Matrix4().lookAt(
        new THREE.Vector3(),
        n.clone().negate(),
        new THREE.Vector3(0, 1, 0),
      )
      g.quaternion.setFromRotationMatrix(m)
      const rolls = [2.5, -3, 1.5, -2, 3, -2.5, 2, 0.7]
      g.rotateZ(THREE.MathUtils.degToRad(rolls[i] ?? 0))
      this.group.add(g)

      this.loader.load(galleryPhotos[i]?.src ?? '', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        if (Math.max(tex.image?.width ?? 0, tex.image?.height ?? 0) > maxTex) {
          tex.generateMipmaps = true
          tex.minFilter = THREE.LinearMipmapLinearFilter
        }
        mat.uniforms.map.value = tex
      })

      this.photos.push({
        group: g,
        mesh,
        material: mat,
        index: i,
        layout: p,
        normal: n,
        revealed: false,
      })
    })

    this.buildThread()
    this.buildAtmosphere(BG)
    this.buildPaths()

    // Start at intro
    this.state = { k: 0, t: 0 }
  }

  private standOff(h: number, w: number): number {
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.fov / 2))
    // Tight framing (~88% height fill) — storyboard settle fills the frame
    return Math.max(h / (0.88 * 2 * tanH), w / (0.96 * 2 * tanH * this.aspect))
  }

  private buildPaths(): void {
    const intro = layout.intro as { cam: number[]; look: number[] }
    const outro = layout.outro as { cam: number[]; look: number[] }
    const transitions = layout.transitions as LayoutTransition[]

    // Aspect-aware stand-off so prints keep physical size on tall phones,
    // while keeping the approved Bezier shape from layout.json.
    const aspectScale = THREE.MathUtils.clamp(1.15 / Math.max(0.55, this.aspect), 0.92, 1.35)

    const stations: Array<{ cam: THREE.Vector3; look: THREE.Vector3; n: THREE.Vector3 }> = [
      { cam: V(intro.cam), look: V(intro.look), n: new THREE.Vector3(0, 0, 1) },
    ]
    this.photos.forEach((pm) => {
      // Always use aspect-aware stand-off so settled/mid-flight framing stays tight
      // (authored layout.cam was calibrated looser and left too much negative space).
      const d = this.standOff(pm.layout.size[1], pm.layout.size[0]) * aspectScale
      const cam = V(pm.layout.pos).add(pm.normal.clone().multiplyScalar(d))
      stations.push({
        cam,
        look: V(pm.layout.pos),
        n: pm.normal.clone(),
      })
    })
    stations.push({ cam: V(outro.cam), look: V(outro.look), n: new THREE.Vector3(0, 0, 1) })

    this.paths = []
    for (let k = 0; k < stations.length - 1; k++) {
      const A = stations[k]
      const B = stations[k + 1]
      const authored = transitions[k]
      let P1: THREE.Vector3
      let P2: THREE.Vector3
      let dur: number
      const isOutro = k === stations.length - 2

      if (authored?.P1 && authored?.P2 && authored?.C0 && authored?.C3) {
        // Remap authored control points into the (possibly aspect-adjusted) stations
        // so anticipation pull-backs from layout.json are preserved.
        const aC0 = V(authored.C0)
        const aC3 = V(authored.C3)
        const aP1 = V(authored.P1)
        const aP2 = V(authored.P2)
        const mapCtrl = (p: THREE.Vector3, nearA: boolean) => {
          const local = nearA ? p.clone().sub(aC0) : p.clone().sub(aC3)
          // Soften anticipation pull-backs so mid-flight stays framed on the ribbon
          if (!isOutro) local.multiplyScalar(0.38)
          return (nearA ? A.cam : B.cam).clone().add(local)
        }
        P1 = mapCtrl(aP1, true)
        P2 = mapCtrl(aP2, false)
        dur = isOutro ? 4.2 : (authored.duration ?? (k === 0 ? 2.8 : 2.4))
      } else if (!isOutro) {
        const lat = B.cam.clone().sub(A.cam)
        lat.z = 0
        P1 = A.cam
          .clone()
          .add(A.n.clone().multiplyScalar(0.9))
          .add(lat.clone().multiplyScalar(-0.12))
          .add(new THREE.Vector3(0, 0.25, 0))
        P2 = B.cam.clone().add(B.n.clone().multiplyScalar(2.4)).add(new THREE.Vector3(0, 0.15, 0))
        dur = k === 0 ? 2.8 : 2.4
      } else {
        P1 = A.cam.clone().add(new THREE.Vector3(0, 0.9, 3.0))
        P2 = B.cam.clone().add(new THREE.Vector3(0, 1.5, -14))
        dur = 4.2
      }

      const look0 = authored?.lookFrom ? V(authored.lookFrom) : A.look
      const look1 = authored?.lookTo ? V(authored.lookTo) : B.look
      this.paths.push({
        curve: new THREE.CubicBezierCurve3(A.cam, P1, P2, B.cam),
        q0: lookQ(A.cam, look0),
        q1: lookQ(B.cam, look1),
        duration: dur,
        toPhoto: k < 8 ? k : -1,
      })
    }
  }

  private buildThread(): void {
    const tp: THREE.Vector3[] = [new THREE.Vector3(3.6, 2.2, 6)]
    this.photos.forEach(({ group, layout: p }, i) => {
      const top = new THREE.Vector3(0, p.size[1] / 2 + 0.07, 0)
        .applyQuaternion(group.quaternion)
        .add(group.position)
      if (i > 0) {
        const prev = tp[tp.length - 1]
        tp.push(prev.clone().lerp(top, 0.5).add(new THREE.Vector3(0, 0.75, -0.6)))
      }
      tp.push(top)
    })
    tp.push(tp[tp.length - 1].clone().add(new THREE.Vector3(-1.5, 1.2, -6)))
    const curve = new THREE.CatmullRomCurve3(tp, false, 'centripetal')
    this.threadMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uLit: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying float vD; void main(){vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vD=-mv.z; gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec2 vUv; varying float vD; uniform float uLit; uniform float uTime; void main(){ float lit=smoothstep(uLit+0.004,uLit-0.004,vUv.x); float spark=smoothstep(0.012,0.,abs(vUv.x-uLit))*1.4; float a=mix(.10,.55,lit)+spark; a*=exp(-pow(.03*vD,2.))*smoothstep(4.6,8.5,vD); gl_FragColor=vec4(vec3(.95,.78,.62)*a,1.);}`,
    })
    this.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 800, 0.0055, 6, false), this.threadMat))
    this.threadU = this.photos.map((_, i) => {
      const idx = 1 + i * 2
      return idx / (tp.length - 1)
    })
  }

  private buildAtmosphere(BG: THREE.Color): void {
    // Soft plum wash at the far end — never a bright white hotspot
    {
      const m = new THREE.ShaderMaterial({
        depthWrite: false,
        transparent: true,
        blending: THREE.NormalBlending,
        fog: false,
        vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 vUv; void main(){ vec2 d=(vUv-vec2(.5,.47))*vec2(1.7,1.); float r=length(d); float a=exp(-r*r*3.5)*.55; vec3 c=vec3(.12,.05,.08); gl_FragColor=vec4(c,a);}`,
      })
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), m)
      pl.position.set(-1, 0, -70)
      this.group.add(pl)
    }

    const budget = detectQuality() === 'low' ? 900 : detectQuality() === 'medium' ? 1600 : 2600
    this.dustMats.push(
      this.makeDust(budget, [16, 10, -44, 16], 5, 0.55, '#f3d9c8', '#e8a6b6', 7),
      this.makeDust(Math.floor(budget * 0.03), [34, 18, -70, -30], 120, 0.1, '#d98fa0', '#e9c58a', 11),
    )
    void BG
  }

  private makeDust(
    count: number,
    spread: [number, number, number, number],
    size: number,
    alpha: number,
    colA: string,
    colB: string,
    seed: number,
  ): THREE.ShaderMaterial {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const sz = new Float32Array(count)
    const ph = new Float32Array(count)
    let s = seed
    const r = () => {
      s = (s * 16807) % 2147483647
      return s / 2147483647
    }
    const a = new THREE.Color(colA)
    const b = new THREE.Color(colB)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (r() - 0.5) * spread[0]
      pos[i * 3 + 1] = (r() - 0.5) * spread[1]
      pos[i * 3 + 2] = spread[2] + r() * (spread[3] - spread[2])
      const c = a.clone().lerp(b, r())
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
      sz[i] = size * (0.4 + r())
      ph[i] = r() * 6.28
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sz, 1))
    geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1))
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: alpha },
        uPx: { value: 900 },
      },
      vertexShader: `attribute float size; attribute float phase; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uTime; uniform float uPx;
        void main(){ vec3 p=position; p.x+=sin(uTime*.13+phase)*.35; p.y+=sin(uTime*.09+phase*1.7)*.28+uTime*.02; vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_PointSize=size*uPx/(-mv.z)*.02; vC=color; vA=(.55+.45*sin(uTime*.7+phase*3.))*smoothstep(0.5,3.,-mv.z)*exp(-pow(.028*-mv.z,2.)); gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec3 vC; varying float vA; uniform float uAlpha; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d); gl_FragColor=vec4(vC*a*a*uAlpha*vA,1.);}`,
    })
    this.group.add(new THREE.Points(geo, mat))
    return mat
  }

  setAspect(aspect: number): void {
    this.aspect = aspect
    // Rebuild station distances for tall phones
    this.buildPaths()
  }

  onCaption(cb: (text: string | null) => void): void {
    this.captionCb = cb
  }

  getProgress(): { seen: number; total: number; index: number; complete: boolean } {
    return {
      seen: this.history.length,
      total: galleryPhotos.length,
      index: this.index,
      complete: this.complete,
    }
  }

  /** True once the dolly-zoom pull-out has finished */
  isPullOutDone(): boolean {
    return this.pullOutDone
  }

  hasStartedPullOut(): boolean {
    return this.pullOutActive
  }

  expectedGesture(): GestureDirection | 'scroll-up' {
    if (this.complete || this.pullOutActive) return 'scroll-up'
    if (this.state.k >= 8) return 'scroll-up'
    // Next gesture is the one that advances FROM current settled photo
    // At intro (k=0,t=0), first gesture is g1's gesture
    const nextIdx = this.state.t < 0.5 && this.state.k === 0 && this.history.length === 0
      ? 0
      : this.history.length
    if (nextIdx >= galleryPhotos.length) return 'scroll-up'
    return galleryPhotos[nextIdx]?.gesture ?? 'scroll-up'
  }

  onComplete(cb: () => void): void {
    this.completeCb = cb
  }

  onProgress(cb: () => void): void {
    this.progressCb = cb
  }

  isMoving(): boolean {
    return this.moving
  }

  /** Alias used by Experience */
  isRevealing(): boolean {
    return this.moving
  }

  getSettledMeshes(): THREE.Mesh[] {
    return this.photos.filter((p) => p.revealed).map((p) => p.mesh)
  }

  getSettledHandoff(): Array<{
    worldPos: THREE.Vector3
    texture: THREE.Texture
    scale: number
    rotation: THREE.Euler
  }> {
    return this.photos
      .filter((p) => p.revealed)
      .map((p) => {
        const worldPos = new THREE.Vector3()
        p.mesh.getWorldPosition(worldPos)
        return {
          worldPos,
          texture: (p.material.uniforms.map.value as THREE.Texture) ?? new THREE.Texture(),
          scale: 1,
          rotation: p.group.rotation.clone(),
        }
      })
  }

  getDiscWorldTargetsFromRibbon(): Array<{ x: number; y: number; z: number }> {
    return this.photos.map((p) => ({
      x: p.layout.pos[0],
      y: p.layout.pos[1],
      z: p.layout.pos[2],
    }))
  }

  tryGesture(direction: GestureDirection, _camera?: THREE.PerspectiveCamera): boolean {
    void _camera
    if (this.moving || this.pullOutActive) return false
    if (this.complete) return false

    const nextIdx = this.history.length
    if (nextIdx >= galleryPhotos.length) return false
    const expected = galleryPhotos[nextIdx].gesture
    if (expected !== direction) return false

    // Path index: intro→g1 is paths[0], g1→g2 is paths[1], ...
    const pathIdx = nextIdx
    return this.animatePath(pathIdx, () => {
      this.history.push(nextIdx)
      this.index = nextIdx + 1
      this.photos[nextIdx].revealed = true
      this.progressCb?.()
      if (this.history.length >= galleryPhotos.length) {
        this.complete = true
        sound.play('transition', 0.35)
        this.completeCb?.()
      }
    })
  }

  /** Dolly-zoom pull-out after 08/08 — pull back, then settle into a large collage */
  pullOut(onDone?: () => void): boolean {
    if (this.moving || this.pullOutActive || this.pullOutDone) return false
    if (!this.complete) return false
    this.pullOutActive = true
    this.captionCb?.(null)
    const pathIdx = this.paths.length - 1
    return this.animatePath(pathIdx, () => {
      this.pullOutDone = true
      this.finalizeCollage()
      onDone?.()
    })
  }

  /** Snap the lit collage into its settled composition (idempotent). */
  finalizeCollage(): void {
    this.composeCollageSettle(1)
    if (this.threadMat) this.threadMat.uniforms.uLit.value = 0.15
    this.photos.forEach((pm) => {
      pm.material.uniforms.uReveal.value = 1
      pm.material.uniforms.uFocus.value = 0.4
      pm.material.uniforms.uFogD.value = 0.004
    })
  }

  /** Near-field framing used after pull-out unlock */
  getCollageCamera(): { x: number; y: number; z: number; lookY: number; fov: number } {
    if (this.aspect < 0.85) {
      // Portrait: pull back a touch so the 4×2 stack stays inside the frame
      return { x: 0.0, y: 0.05, z: 7.2, lookY: 0.0, fov: 32 }
    }
    return { x: 0.05, y: 0.12, z: 5.6, lookY: 0.02, fov: 28 }
  }

  undo(_camera?: unknown): boolean {
    void _camera
    if (this.moving || this.history.length === 0) return false
    if (this.pullOutActive) {
      // Cancel pull-out mid-flight not supported — ignore
      return false
    }
    this.complete = false
    this.pullOutActive = false
    const last = this.history.pop()
    if (last === undefined) return false
    this.photos[last].revealed = false
    this.photos[last].material.uniforms.uReveal.value = 0
    this.photos[last].material.uniforms.uFocus.value = 0
    this.index = last

    // Jump camera back to previous station
    const pathIdx = Math.max(0, last)
    // Settle at end of path that arrived at previous photo, or intro
    if (last === 0) {
      this.state = { k: 0, t: 0 }
    } else {
      this.state = { k: last - 1, t: 1 }
    }
    // Actually after undoing photo N, we should be at station of photo N-1 (or intro)
    // paths[i] arrives at photo i. So after undo of photo last, set k=last-1, t=1 if last>0 else k=0,t=0
    if (last === 0) {
      this.state = { k: 0, t: 0 }
    } else {
      this.state = { k: last - 1, t: 1 }
    }
    void pathIdx
    sound.play('transition', 0.25)
    this.progressCb?.()
    this.captionCb?.(null)
    return true
  }

  private animatePath(pathIdx: number, onComplete: () => void): boolean {
    const path = this.paths[pathIdx]
    if (!path) return false
    this.moving = true
    this.state = { k: pathIdx, t: 0 }
    this.captionCb?.(null)
    sound.play('reveal', 0.35)

    if (prefersReducedMotion()) {
      this.state.t = 1
      this.moving = false
      if (path.toPhoto >= 0) {
        this.photos[path.toPhoto].material.uniforms.uReveal.value = 1
        this.photos[path.toPhoto].material.uniforms.uFocus.value = 1
        this.captionCb?.(galleryPhotos[path.toPhoto]?.caption ?? null)
      }
      onComplete()
      return true
    }

    const proxy = { t: 0 }
    // Linear wall-clock progress — easing is applied once in applyCamera
    gsap.to(proxy, {
      t: 1,
      duration: path.duration,
      ease: 'none',
      onUpdate: () => {
        this.state.t = proxy.t
      },
      onComplete: () => {
        this.state.t = 1
        this.moving = false
        if (path.toPhoto >= 0) {
          this.captionCb?.(galleryPhotos[path.toPhoto]?.caption ?? null)
        }
        onComplete()
      },
    })
    return true
  }

  /**
   * Drive the Experience camera from the ribbon choreography.
   * Call every frame. Returns current FOV for dolly-zoom.
   */
  applyCamera(camera: THREE.PerspectiveCamera, time: number, parallax = { x: 0, y: 0 }): number {
    const pathIdx = Math.min(this.state.k, this.paths.length - 1)
    const P = this.paths[pathIdx]
    if (!P) return this.fov

    const t = this.state.t
    const e = memoryGlideEase(t)
    const pos = P.curve.getPoint(THREE.MathUtils.clamp(e, 0, 1))
    const eo = this.oriEase(Math.min(1, t * 1.12))
    this.tmpQ.copy(P.q0).slerp(P.q1, eo)

    // Banking up to ~3.5°
    const e2 = memoryGlideEase(Math.min(1, t + 0.01))
    const vel = P.curve.getPoint(e2).sub(pos)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.tmpQ)
    const lateral = vel.dot(right) * 60
    const roll = THREE.MathUtils.clamp(-lateral * 0.012, -0.061, 0.061) * Math.sin(Math.PI * t)
    this.fwd.set(0, 0, -1)
    this.rollQ.setFromAxisAngle(this.fwd, roll)
    this.tmpQ.multiply(this.rollQ)

    // Idle breathe + parallax (additive)
    pos.x += Math.sin(time * 0.37) * 0.035 + parallax.x * 0.12
    pos.y += Math.sin(time * 0.29 + 1.3) * 0.028 + parallax.y * 0.08

    camera.position.copy(pos)
    camera.quaternion.copy(this.tmpQ)

    // Dolly-zoom pull-out: dramatic pull-back, then settle into a CLOSE
    // composed collage that fills ~55–65% of the viewport.
    const outro = pathIdx === this.paths.length - 1
    // Outro settle uses eased path progress (single ease from linear gsap clock)
    const fz = outro ? (this.pullOutDone ? 1 : e) : 0
    // 44 → ~16 mid → settle 28° (wider FOV = larger on-screen collage)
    const fov =
      44 +
      (16 - 44) * Math.min(1, fz * 1.15) +
      (28 - 16) * Math.max(0, (fz - 0.58) / 0.42)
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    this.photos.forEach((pm) => {
      pm.material.uniforms.uFogD.value = 0.03 + (0.004 - 0.03) * fz
    })
    if (this.threadMat && outro) {
      this.threadMat.uniforms.uLit.value = Math.max(0.12, 1 - fz * 0.9)
    }

    // Compose prints + pull camera onto the framed settle
    if (outro && fz > 0.42) {
      const settle = (fz - 0.42) / 0.58
      this.composeCollageSettle(settle)
      if (fz > 0.58) {
        const camEase = gsap.parseEase('power2.out')((fz - 0.58) / 0.42)
        const c = this.getCollageCamera()
        const framed = new THREE.Vector3(c.x, c.y, c.z)
        const look = new THREE.Vector3(0, c.lookY, -1.1)
        pos.lerp(framed, camEase)
        const qFramed = lookQ(framed, look)
        this.tmpQ.slerp(qFramed, camEase)
        camera.position.copy(pos)
        camera.quaternion.copy(this.tmpQ)
      }
    }

    this.updateReveals()
    return fov
  }

  /** Deliberate near-field collage — large, legible, rectangular, composed */
  private composeCollageSettle(t: number): void {
    const k = THREE.MathUtils.clamp(t, 0, 1)
    const ease = gsap.parseEase('power2.out')(k)
    // Landscape: 2×4. Portrait: 4×2 so all eight stay inside the frame.
    const portrait = this.aspect < 0.85
    const targets = portrait
      ? [
          { x: -1.05, y: 2.55, z: -0.55 },
          { x: 1.05, y: 2.45, z: -0.85 },
          { x: -1.1, y: 0.85, z: -0.7 },
          { x: 1.1, y: 0.75, z: -1.05 },
          { x: -1.05, y: -0.85, z: -1.2 },
          { x: 1.05, y: -0.95, z: -0.95 },
          { x: -1.1, y: -2.55, z: -1.35 },
          { x: 1.1, y: -2.45, z: -1.15 },
        ]
      : [
          { x: -2.15, y: 1.2, z: -0.55 },
          { x: -0.72, y: 1.28, z: -0.95 },
          { x: 0.72, y: 1.15, z: -0.7 },
          { x: 2.15, y: 1.05, z: -1.15 },
          { x: -2.2, y: -1.05, z: -1.35 },
          { x: -0.72, y: -1.18, z: -1.0 },
          { x: 0.72, y: -1.1, z: -1.45 },
          { x: 2.2, y: -0.98, z: -1.2 },
        ]
    const rolls = [0.035, -0.03, 0.02, -0.04, 0.03, -0.025, 0.015, -0.02]
    // Portrait needs a slightly closer camera plane; scale prints a touch smaller
    const scale = portrait ? 0.82 : 1
    this.photos.forEach((pm, i) => {
      const dest = targets[i]
      const ox = pm.layout.pos[0]
      const oy = pm.layout.pos[1]
      const oz = pm.layout.pos[2]
      pm.group.position.set(
        THREE.MathUtils.lerp(ox, dest.x, ease),
        THREE.MathUtils.lerp(oy, dest.y, ease),
        THREE.MathUtils.lerp(oz, dest.z, ease),
      )
      // Face the camera squarely; stay rectangular until letter morph
      const face = new THREE.Quaternion()
      face.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rolls[i] ?? 0)
      pm.group.quaternion.slerp(face, ease * 0.92)
      pm.group.scale.setScalar(scale)
      pm.material.uniforms.uReveal.value = 1
      pm.material.uniforms.uFocus.value = 0.4
      pm.material.uniforms.uFogD.value = 0.004
    })
  }

  private updateReveals(): void {
    const k = this.state.k
    const t = this.state.t
    const ease = memoryGlideEase

    // Thread light
    if (this.threadMat) {
      let u = 0
      if (k >= 8) u = 1
      else {
        const a = k === 0 ? 0 : this.threadU[k - 1] ?? 0
        const b = this.threadU[Math.min(k, this.threadU.length - 1)] ?? 1
        u = a + (b - a) * ease(Math.min(1, t))
      }
      this.threadMat.uniforms.uLit.value = u
    }

    this.photos.forEach((pm, i) => {
      let r = 0
      if (k === this.paths.length - 1) r = 1
      else if (i < k) r = 1
      // Light the approaching print earlier so mid-flight reads as framed travel
      else if (i === k) r = gsap.utils.clamp(0, 1, (t - 0.28) / 0.55)
      else if (pm.revealed) r = 1
      pm.material.uniforms.uReveal.value = r
      pm.material.uniforms.uFocus.value = i === k && k < 8 ? r : 0
    })
  }

  /** Morph ribbon prints toward letter disc targets after pull-out */
  morphIntoLetter(
    discWorldTargets: Array<{ x: number; y: number; z: number }>,
  ): gsap.core.Timeline {
    const tl = gsap.timeline()
    this.photos.forEach((p, i) => {
      const target = discWorldTargets[i % discWorldTargets.length]
      tl.to(
        p.group.position,
        { x: target.x, y: target.y, z: target.z, duration: 1.6, ease: 'power3.inOut' },
        i * 0.03,
      )
      tl.to(p.group.scale, { x: 0.55, y: 0.55, z: 1, duration: 1.4, ease: 'power2.inOut' }, i * 0.03)
      tl.to(
        p.material.uniforms.uReveal,
        { value: 0, duration: 0.8, ease: 'power2.in' },
        0.9 + i * 0.03,
      )
    })
    return tl
  }

  shakeHint(root: THREE.Object3D): void {
    if (prefersReducedMotion()) return
    gsap.fromTo(root.rotation, { z: 0 }, { z: 0.03, yoyo: true, repeat: 3, duration: 0.05 })
  }

  update(time: number): void {
    if (this.threadMat) this.threadMat.uniforms.uTime.value = time
    this.dustMats.forEach((m) => {
      m.uniforms.uTime.value = time
    })
  }

  setPixelHeight(h: number): void {
    this.dustMats.forEach((m) => {
      m.uniforms.uPx.value = h
    })
  }

  dispose(): void {
    this.photos.forEach((p) => {
      p.mesh.geometry.dispose()
      p.material.dispose()
      p.material.uniforms.map.value?.dispose?.()
    })
  }
}
