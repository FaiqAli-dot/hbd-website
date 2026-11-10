import * as THREE from 'three'
import gsap from 'gsap'
import {
  galleryPhotos,
  type GestureDirection,
} from '../../content/config'
import { photoPlaneFragment, photoPlaneVertex } from '../shaders'
import { prefersReducedMotion } from '../../utils/motion'
import { sound } from '../../components/sound'
import { detectQuality, textureMaxSize } from '../../utils/quality'

interface PhotoPlane {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  index: number
  settled: boolean
}

interface Pose {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  s: number
}

/** Deterministic hash so each photo gets a stable unique path */
function seed(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Far off-frustum start — varies by photo, not only by gesture */
function entryPose(dir: GestureDirection, i: number): Pose {
  const r = seed(i)
  const r2 = seed(i + 17)
  const depth = -2.8 - r * 4.5
  const scale = 0.55 + r2 * 0.55
  switch (dir) {
    case 'left':
      return {
        x: 7.2 + r * 2.2,
        y: -1.6 + r2 * 3.2,
        z: depth + 1.2,
        rx: 0.15 + r * 0.4,
        ry: -0.75 - r2 * 0.4,
        rz: 0.2 - r * 0.35,
        s: Math.max(0.75, scale),
      }
    case 'right':
      return {
        x: -9.5 - r * 3.2,
        y: -1.8 + r2 * 4.0,
        z: depth + 0.4,
        rx: -0.2 - r * 0.3,
        ry: 0.85 + r2 * 0.55,
        rz: -0.18 + r * 0.3,
        s: scale,
      }
    case 'up':
      return {
        x: -3.5 + r * 7,
        y: -7.5 - r2 * 2.5,
        z: depth + 1.2,
        rx: 1.1 + r * 0.35,
        ry: -0.35 + r2 * 0.7,
        rz: 0.15 - r * 0.4,
        s: scale,
      }
    case 'down':
      return {
        x: -3.2 + r * 6.5,
        y: 7.8 + r2 * 2.2,
        z: depth + 0.8,
        rx: -1.05 - r * 0.3,
        ry: 0.3 - r2 * 0.6,
        rz: -0.12 + r * 0.35,
        s: scale,
      }
  }
}

/** Mid-flight waypoint clearly inside the camera frustum (large + near) */
function midPose(dir: GestureDirection, i: number): Pose {
  const r = seed(i + 3)
  const r2 = seed(i + 11)
  const base: Record<GestureDirection, Pose> = {
    left: {
      x: 2.6 + r * 1.1,
      y: -0.6 + r2 * 1.3,
      z: 0.35 - r * 0.6,
      rx: 0.28,
      ry: -0.62,
      rz: 0.22,
      s: 0.95 + r * 0.2,
    },
    right: {
      x: -2.8 - r * 1.0,
      y: 0.45 - r2 * 1.2,
      z: 0.4 - r * 0.7,
      rx: -0.22,
      ry: 0.58,
      rz: -0.18,
      s: 0.92 + r * 0.25,
    },
    up: {
      x: -1.2 + r * 2.6,
      y: -1.9 - r2 * 0.55,
      z: 0.55 - r * 0.5,
      rx: 0.62,
      ry: 0.18 - r2 * 0.35,
      rz: 0.12,
      s: 1.0 + r * 0.15,
    },
    down: {
      x: 1.1 - r * 2.3,
      y: 2.0 + r2 * 0.55,
      z: 0.45 - r * 0.55,
      rx: -0.55,
      ry: -0.12 + r2 * 0.3,
      rz: -0.1,
      s: 0.98 + r * 0.18,
    },
  }
  return base[dir]
}

/** Unique final focal placement — never a shared center landing */
function focusPose(i: number): Pose {
  const r = seed(i)
  const r2 = seed(i + 29)
  const r3 = seed(i + 41)
  // Spread landings across a shallow arc in front of camera
  const slot = i % 8
  const arc = ((slot / 7) - 0.5) * 2.4
  return {
    x: arc + (r - 0.5) * 0.55,
    y: -0.35 + r2 * 0.9 + (slot % 2 === 0 ? 0.15 : -0.1),
    z: -0.35 + r3 * 0.85 - (slot % 3) * 0.12,
    rx: (r - 0.5) * 0.22,
    ry: (r2 - 0.5) * 0.35,
    rz: (r3 - 0.5) * 0.12,
    s: 0.88 + r * 0.28,
  }
}

function collagePose(slot: number): Pose {
  const r = seed(slot + 7)
  const r2 = seed(slot + 19)
  const angle = slot * 0.92 + r * 0.6
  const radius = 1.7 + (slot % 4) * 0.55 + r2 * 0.4
  return {
    x: Math.cos(angle) * radius + (r - 0.5) * 0.4,
    y: Math.sin(angle * 0.85) * (1.0 + r * 0.6) + (slot % 2 === 0 ? 0.55 : -0.45),
    z: -1.2 - slot * 0.48 - r2 * 0.7,
    rx: -0.18 + r * 0.25,
    ry: Math.cos(angle) * (0.35 + r * 0.3),
    rz: Math.sin(angle) * 0.18 + (r2 - 0.5) * 0.1,
    s: 0.42 + (1 - Math.min(slot, 7) / 7) * 0.22 + r * 0.08,
  }
}

function placeholderTexture(): THREE.DataTexture {
  const data = new Uint8Array([36, 28, 22, 255])
  const tex = new THREE.DataTexture(data, 1, 1)
  tex.needsUpdate = true
  return tex
}

function fitTexture(tex: THREE.Texture, maxEdge: number): void {
  const img = tex.image as HTMLImageElement | ImageBitmap | undefined
  if (!img || !('width' in img)) return
  const w = img.width
  const h = img.height
  if (!w || !h) return
  const longest = Math.max(w, h)
  if (longest <= maxEdge) return
  // Let GPU downsample via minFilter; mark anisotropy lightly
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.anisotropy = 1
}

/**
 * Chapter 1 — photographs as physical planes that fly through real 3D space.
 * Each photo has a unique trajectory, scale, depth, rotation, and landing.
 */
export class GalleryWorld {
  readonly group = new THREE.Group()
  private planes: PhotoPlane[] = []
  private loader = new THREE.TextureLoader()
  private index = 0
  private seen = new Set<number>()
  private history: number[] = []
  private revealing = false
  private complete = false
  private completeCb: (() => void) | null = null
  private progressCb: (() => void) | null = null
  private textures: THREE.Texture[] = []
  private focalIndex = -1
  private maxTex: number

  constructor() {
    this.group.position.set(0, 0, 0)
    this.maxTex = textureMaxSize(detectQuality())

    const haze = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.MeshBasicMaterial({
        color: '#c9a66b',
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
      }),
    )
    haze.rotation.x = -Math.PI / 2
    haze.position.y = -2.6
    this.group.add(haze)

    galleryPhotos.forEach((photo, i) => {
      this.textures[i] = placeholderTexture()
      this.createPlane(i)
      this.loader.load(
        photo.src,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          fitTexture(tex, this.maxTex)
          this.textures[i].dispose()
          this.textures[i] = tex
          const plane = this.planes[i]
          if (plane) plane.material.uniforms.uMap.value = tex
        },
        undefined,
        () => undefined,
      )
    })
  }

  private createPlane(i: number): PhotoPlane {
    if (this.planes[i]) return this.planes[i]
    const tex = this.textures[i] ?? placeholderTexture()
    const r = seed(i)
    const h = 2.2 + r * 0.7
    const w = h * (0.65 + seed(i + 5) * 0.15)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: tex },
        uOpacity: { value: 0 },
        uRgbSplit: { value: 0 },
        uSoftEdge: { value: 0.04 },
        uDistort: { value: 0 },
        uTime: { value: 0 },
        uTint: { value: new THREE.Color('#f2e6d4') },
      },
      vertexShader: photoPlaneVertex,
      fragmentShader: photoPlaneFragment,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 16, 24), mat)
    mesh.position.set(14, 10, -10)
    mesh.scale.setScalar(0.85)
    mesh.visible = false
    this.group.add(mesh)
    const plane: PhotoPlane = { mesh, material: mat, index: i, settled: false }
    this.planes[i] = plane
    return plane
  }

  getProgress(): { seen: number; total: number; index: number; complete: boolean } {
    return {
      seen: this.seen.size,
      total: galleryPhotos.length,
      index: this.index,
      complete: this.complete,
    }
  }

  expectedGesture(): GestureDirection | 'scroll-up' {
    if (this.complete) return 'scroll-up'
    return galleryPhotos[this.index]?.gesture ?? 'scroll-up'
  }

  onComplete(cb: () => void): void {
    this.completeCb = cb
  }

  onProgress(cb: () => void): void {
    this.progressCb = cb
  }

  getSettledMeshes(): THREE.Mesh[] {
    return this.planes.filter((p) => p?.settled).map((p) => p.mesh)
  }

  tryGesture(direction: GestureDirection, camera: THREE.PerspectiveCamera): boolean {
    if (this.revealing || this.complete) return false
    const photo = galleryPhotos[this.index]
    if (!photo || photo.gesture !== direction) return false

    this.revealing = true
    const i = this.index
    const plane = this.createPlane(i)
    const start = entryPose(direction, i)
    const mid = midPose(direction, i)
    const focus = focusPose(i)
    const reduced = prefersReducedMotion()

    plane.mesh.visible = true
    plane.mesh.position.set(start.x, start.y, start.z)
    plane.mesh.rotation.set(start.rx, start.ry, start.rz)
    plane.mesh.scale.setScalar(start.s)
    plane.material.uniforms.uOpacity.value = 0
    plane.material.uniforms.uDistort.value = 1
    plane.material.uniforms.uRgbSplit.value = 0.55

    sound.play('reveal', 0.42)

    if (this.focalIndex >= 0) {
      const prev = this.planes[this.focalIndex]
      if (prev) {
        const slot = this.seen.size
        const c = collagePose(slot)
        if (reduced) {
          prev.mesh.position.set(c.x, c.y, c.z)
          prev.mesh.rotation.set(c.rx, c.ry, c.rz)
          prev.mesh.scale.setScalar(c.s)
          prev.material.uniforms.uOpacity.value = 0.78
        } else {
          const retreat = {
            x: start.x * -0.25,
            y: start.y * -0.2,
            z: c.z * 0.4,
          }
          gsap.to(prev.mesh.position, {
            x: retreat.x,
            y: retreat.y,
            z: retreat.z,
            duration: 0.5,
            ease: 'power2.in',
          })
          gsap.to(prev.mesh.position, {
            x: c.x,
            y: c.y,
            z: c.z,
            duration: 0.95,
            delay: 0.35,
            ease: 'power3.out',
          })
          gsap.to(prev.mesh.rotation, {
            x: c.rx,
            y: c.ry,
            z: c.rz,
            duration: 1.15,
            ease: 'power2.out',
          })
          gsap.to(prev.mesh.scale, { x: c.s, y: c.s, z: c.s, duration: 1.05, ease: 'power2.out' })
          gsap.to(prev.material.uniforms.uOpacity, { value: 0.7, duration: 0.85 })
          gsap.to(prev.material.uniforms.uRgbSplit, { value: 0, duration: 0.45 })
        }
      }
    }

    const finish = () => {
      plane.settled = true
      this.focalIndex = i
      this.seen.add(i)
      this.history.push(i)
      this.index = i + 1
      this.revealing = false
      this.progressCb?.()
      if (this.seen.size >= galleryPhotos.length) {
        this.complete = true
        sound.play('transition', 0.35)
        this.completeCb?.()
      }
    }

    if (reduced) {
      plane.mesh.position.set(focus.x, focus.y, focus.z)
      plane.mesh.rotation.set(focus.rx, focus.ry, focus.rz)
      plane.mesh.scale.setScalar(focus.s)
      plane.material.uniforms.uOpacity.value = 1
      plane.material.uniforms.uDistort.value = 0
      plane.material.uniforms.uRgbSplit.value = 0
      finish()
      return true
    }

    const camOrigin = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    }
    // Camera participates — nudge opposite the incoming flight + slight dolly
    const camNudge = {
      x: direction === 'left' ? 0.42 : direction === 'right' ? -0.42 : (seed(i) - 0.5) * 0.3,
      y: direction === 'up' ? 0.32 : direction === 'down' ? -0.28 : 0.06 + seed(i + 2) * 0.1,
      z: camOrigin.z - 0.25 - seed(i) * 0.35,
    }

    const tl = gsap.timeline()

    // Phase 1: enter frustum — mid-flight (visible travel through space)
    tl.to(
      plane.mesh.position,
      {
        x: mid.x,
        y: mid.y,
        z: mid.z,
        duration: 0.55,
        ease: 'power3.in',
      },
      0,
    )
    tl.to(
      plane.mesh.rotation,
      { x: mid.rx, y: mid.ry, z: mid.rz, duration: 0.55, ease: 'power2.in' },
      0,
    )
    tl.to(plane.mesh.scale, { x: mid.s, y: mid.s, z: mid.s, duration: 0.5, ease: 'power2.out' }, 0)
    // Opacity early so mid-flight frames clearly show the traveling plane
    tl.to(plane.material.uniforms.uOpacity, { value: 1, duration: 0.16, ease: 'power2.out' }, 0)
    tl.to(plane.material.uniforms.uDistort, { value: 0.4, duration: 0.4 }, 0)
    tl.to(
      camera.position,
      {
        x: camOrigin.x + camNudge.x,
        y: camOrigin.y + camNudge.y,
        z: camNudge.z,
        duration: 0.55,
        ease: 'power2.out',
      },
      0,
    )

    // Phase 2: sweep past mid toward overshoot near focus
    tl.to(
      plane.mesh.position,
      {
        x: focus.x * 1.12 + mid.x * 0.08,
        y: focus.y * 1.1 + mid.y * 0.05,
        z: focus.z + 0.35,
        duration: 0.55,
        ease: 'power2.out',
      },
      0.5,
    )
    tl.to(
      plane.mesh.rotation,
      {
        x: focus.rx + mid.rx * 0.2,
        y: focus.ry + mid.ry * 0.25,
        z: focus.rz,
        duration: 0.6,
        ease: 'power2.out',
      },
      0.5,
    )
    tl.to(
      plane.mesh.scale,
      { x: focus.s * 1.08, y: focus.s * 1.08, z: 1, duration: 0.5, ease: 'power2.out' },
      0.5,
    )

    // Phase 3: settle into unique landing
    tl.to(
      plane.mesh.position,
      { x: focus.x, y: focus.y, z: focus.z, duration: 0.55, ease: 'back.out(1.6)' },
      0.95,
    )
    tl.to(
      plane.mesh.rotation,
      { x: focus.rx, y: focus.ry, z: focus.rz, duration: 0.55, ease: 'power3.out' },
      0.95,
    )
    tl.to(
      plane.mesh.scale,
      { x: focus.s, y: focus.s, z: 1, duration: 0.5, ease: 'back.out(1.35)' },
      0.95,
    )
    tl.to(plane.material.uniforms.uDistort, { value: 0, duration: 0.5, ease: 'power2.out' }, 0.85)
    tl.to(plane.material.uniforms.uRgbSplit, { value: 0, duration: 0.4 }, 0.9)
    tl.to(
      camera.position,
      { x: 0, y: 0.15, z: 5.2, duration: 0.7, ease: 'power3.out' },
      0.95,
    )
    // Unlock progress once the plane has clearly travelled through mid-space
    tl.add(finish, 1.2)

    tl.to(
      plane.mesh.rotation,
      { y: focus.ry + 0.04, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: 1 },
      1.25,
    )

    return true
  }

  undo(camera: THREE.PerspectiveCamera): boolean {
    if (this.history.length === 0) return false
    this.revealing = false
    gsap.killTweensOf(camera.position)
    const last = this.history.pop()
    if (last === undefined) return false
    this.seen.delete(last)
    this.index = last
    this.complete = false

    const plane = this.planes[last]
    if (plane) {
      gsap.killTweensOf(plane.mesh.position)
      gsap.killTweensOf(plane.mesh.rotation)
      gsap.killTweensOf(plane.mesh.scale)
      gsap.to(plane.material.uniforms.uOpacity, {
        value: 0,
        duration: prefersReducedMotion() ? 0.01 : 0.35,
        onComplete: () => {
          plane.mesh.visible = false
          plane.settled = false
        },
      })
      const dir = galleryPhotos[last].gesture
      const out = entryPose(dir, last)
      gsap.to(plane.mesh.position, {
        x: out.x,
        y: out.y,
        z: out.z,
        duration: 0.4,
        ease: 'power2.in',
      })
    }

    this.focalIndex = this.history.length ? this.history[this.history.length - 1] : -1
    if (this.focalIndex >= 0) {
      const focal = this.planes[this.focalIndex]
      const focus = focusPose(this.focalIndex)
      if (focal) {
        gsap.to(focal.mesh.position, {
          x: focus.x,
          y: focus.y,
          z: focus.z,
          duration: 0.45,
          ease: 'power2.out',
        })
        gsap.to(focal.mesh.scale, { x: focus.s, y: focus.s, z: 1, duration: 0.45 })
        gsap.to(focal.material.uniforms.uOpacity, { value: 1, duration: 0.3 })
      }
    }

    gsap.to(camera.position, { x: 0, y: 0.15, z: 5.2, duration: 0.4, ease: 'power2.out' })
    sound.play('transition', 0.25)
    return true
  }

  shakeHint(root: THREE.Object3D): void {
    if (prefersReducedMotion()) return
    gsap.fromTo(root.rotation, { z: 0 }, { z: 0.04, yoyo: true, repeat: 3, duration: 0.06 })
  }

  /**
   * Continuous morph into chapter 2: planes fly toward letter-space disc targets
   * and dissolve as circular photo discs take over.
   */
  morphIntoLetter(
    discWorldTargets: Array<{ x: number; y: number; z: number }>,
  ): gsap.core.Timeline {
    const tl = gsap.timeline()
    const settled = this.planes.filter((p) => p?.settled)
    settled.forEach((p, i) => {
      const target = discWorldTargets[i % discWorldTargets.length]
      // Convert world target into gallery-local space (gallery at origin)
      tl.to(
        p.mesh.position,
        {
          x: target.x,
          y: target.y,
          z: target.z,
          duration: 1.45,
          ease: 'power3.inOut',
        },
        i * 0.04,
      )
      tl.to(
        p.mesh.scale,
        { x: 0.28, y: 0.28, z: 1, duration: 1.25, ease: 'power2.inOut' },
        i * 0.04,
      )
      tl.to(
        p.mesh.rotation,
        { x: 0, y: 0, z: (seed(i) - 0.5) * 0.4, duration: 1.2, ease: 'power2.inOut' },
        i * 0.04,
      )
      tl.to(p.material.uniforms.uOpacity, { value: 0, duration: 0.85, ease: 'power2.in' }, 0.55 + i * 0.04)
    })
    return tl
  }

  /** @deprecated prefer morphIntoLetter — kept for call-site safety */
  gatherForLetter(): gsap.core.Timeline {
    return this.morphIntoLetter(
      Array.from({ length: 6 }, (_, i) => ({
        x: ((i % 3) - 1) * 2.4,
        y: (Math.floor(i / 3) - 0.5) * 2.2,
        z: -20 - (i % 2) * 0.4,
      })),
    )
  }

  update(time: number): void {
    this.planes.forEach((p, i) => {
      if (!p) return
      p.material.uniforms.uTime.value = time
      if (p.settled && i !== this.focalIndex && !this.revealing) {
        p.mesh.position.y += Math.sin(time * 0.35 + i) * 0.00045
        p.mesh.rotation.z += Math.sin(time * 0.2 + i) * 0.00015
      }
    })
  }

  dispose(): void {
    this.planes.forEach((p) => {
      if (!p) return
      p.mesh.geometry.dispose()
      p.material.dispose()
    })
    this.textures.forEach((t) => t.dispose())
  }
}
