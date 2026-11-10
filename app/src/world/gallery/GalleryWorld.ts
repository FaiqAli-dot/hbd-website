import * as THREE from 'three'
import gsap from 'gsap'
import {
  galleryPhotos,
  type GestureDirection,
} from '../../content/config'
import { photoPlaneFragment, photoPlaneVertex } from '../shaders'
import { prefersReducedMotion } from '../../utils/motion'
import { sound } from '../../components/sound'

interface PhotoPlane {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  index: number
  settled: boolean
}

/** Off-screen entry / collage retreat layouts per gesture */
function entryPose(dir: GestureDirection): {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
} {
  switch (dir) {
    case 'left':
      return { x: 7.5, y: 0.6, z: -1.2, rx: 0.08, ry: -0.55, rz: 0.12 }
    case 'right':
      return { x: -7.5, y: -0.3, z: -1.0, rx: -0.06, ry: 0.55, rz: -0.1 }
    case 'up':
      return { x: 0.4, y: -5.5, z: 0.8, rx: 0.7, ry: 0.08, rz: 0 }
    case 'down':
      return { x: -0.3, y: 5.8, z: 0.5, rx: -0.65, ry: -0.1, rz: 0.05 }
  }
}

function focusPose(i: number): {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  s: number
} {
  // Slight uniqueness so each settle isn't identical
  const wobble = ((i % 3) - 1) * 0.08
  return { x: wobble * 0.4, y: 0.15 + wobble * 0.2, z: 0, rx: 0, ry: wobble * 0.15, rz: wobble * 0.04, s: 1 }
}

function collagePose(slot: number): {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  s: number
} {
  const angle = slot * 0.85 + 0.4
  const radius = 2.1 + (slot % 3) * 0.45
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle * 0.9) * 1.15 + (slot % 2 === 0 ? 0.4 : -0.35),
    z: -1.6 - slot * 0.55,
    rx: -0.12 + (slot % 3) * 0.05,
    ry: Math.cos(angle) * 0.45,
    rz: Math.sin(angle) * 0.12,
    s: 0.55 - Math.min(slot, 6) * 0.025,
  }
}

function placeholderTexture(): THREE.DataTexture {
  const data = new Uint8Array([36, 28, 22, 255])
  const tex = new THREE.DataTexture(data, 1, 1)
  tex.needsUpdate = true
  return tex
}

/**
 * Chapter 1 — photographs as physical planes that fly in from outside the frustum.
 * No permanent picture frame. Settled photos remain as a spatial collage.
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

  constructor() {
    this.group.position.set(0, 0, 0)

    // Soft ground haze only — not a frame
    const haze = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.MeshBasicMaterial({
        color: '#c9a66b',
        transparent: true,
        opacity: 0.035,
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
          tex.minFilter = THREE.LinearFilter
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
    const h = 2.55
    const w = h * 0.72
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
    // Park far off-screen until revealed
    mesh.position.set(12, 8, -8)
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

  /** Exposed for chapter transitions — settled photo meshes */
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
    const start = entryPose(direction)
    const focus = focusPose(i)
    const reduced = prefersReducedMotion()

    plane.mesh.visible = true
    plane.mesh.position.set(start.x, start.y, start.z)
    plane.mesh.rotation.set(start.rx, start.ry, start.rz)
    plane.mesh.scale.setScalar(0.82)
    plane.material.uniforms.uOpacity.value = 0
    plane.material.uniforms.uDistort.value = 1
    plane.material.uniforms.uRgbSplit.value = 1

    sound.play('reveal', 0.42)

    // Retreat previous focal into collage
    if (this.focalIndex >= 0) {
      const prev = this.planes[this.focalIndex]
      if (prev) {
        const slot = this.seen.size
        const c = collagePose(slot)
        const opposite =
          direction === 'left'
            ? { x: -3.2, y: 0.4 }
            : direction === 'right'
              ? { x: 3.2, y: -0.2 }
              : direction === 'up'
                ? { x: 1.2, y: 2.4 }
                : { x: -1.0, y: -2.2 }
        if (reduced) {
          prev.mesh.position.set(c.x, c.y, c.z)
          prev.mesh.rotation.set(c.rx, c.ry, c.rz)
          prev.mesh.scale.setScalar(c.s)
          prev.material.uniforms.uOpacity.value = 0.78
        } else {
          gsap.to(prev.mesh.position, {
            x: opposite.x,
            y: opposite.y,
            z: c.z * 0.5,
            duration: 0.55,
            ease: 'power2.in',
          })
          gsap.to(prev.mesh.position, {
            x: c.x,
            y: c.y,
            z: c.z,
            duration: 0.85,
            delay: 0.35,
            ease: 'power3.out',
          })
          gsap.to(prev.mesh.rotation, {
            x: c.rx,
            y: c.ry,
            z: c.rz,
            duration: 1.1,
            ease: 'power2.out',
          })
          gsap.to(prev.mesh.scale, { x: c.s, y: c.s, z: c.s, duration: 1.0, ease: 'power2.out' })
          gsap.to(prev.material.uniforms.uOpacity, { value: 0.72, duration: 0.8 })
          gsap.to(prev.material.uniforms.uRgbSplit, { value: 0, duration: 0.5 })
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

    // Camera reacts slightly with the incoming plane
    const camOrigin = camera.position.clone()
    const camNudge = {
      x: direction === 'left' ? 0.35 : direction === 'right' ? -0.35 : camOrigin.x * 0.1,
      y: direction === 'up' ? 0.25 : direction === 'down' ? -0.2 : 0.05,
    }

    const tl = gsap.timeline()

    // Fast in
    tl.to(
      plane.mesh.position,
      {
        x: focus.x * 0.3 + start.x * 0.15,
        y: focus.y * 0.3 + start.y * 0.15,
        z: -0.35,
        duration: 0.4,
        ease: 'power3.in',
      },
      0,
    )
    tl.to(plane.material.uniforms.uOpacity, { value: 1, duration: 0.3, ease: 'power2.out' }, 0)
    tl.to(plane.material.uniforms.uDistort, { value: 0.55, duration: 0.35 }, 0)
    tl.to(camera.position, { x: camOrigin.x + camNudge.x, y: camOrigin.y + camNudge.y, duration: 0.45, ease: 'power2.out' }, 0)

    // Decelerate + overshoot past focus then settle
    tl.to(
      plane.mesh.position,
      {
        x: focus.x * 1.08,
        y: focus.y * 1.06,
        z: 0.18,
        duration: 0.5,
        ease: 'power2.out',
      },
      0.35,
    )
    tl.to(
      plane.mesh.rotation,
      {
        x: focus.rx + start.rx * 0.15,
        y: focus.ry + start.ry * 0.2,
        z: focus.rz,
        duration: 0.65,
        ease: 'power2.out',
      },
      0.3,
    )
    tl.to(plane.mesh.scale, { x: 1.06, y: 1.06, z: 1, duration: 0.45, ease: 'power2.out' }, 0.35)

    // Settle with slight overshoot recovery — mark progress when settled
    tl.to(
      plane.mesh.position,
      { x: focus.x, y: focus.y, z: focus.z, duration: 0.5, ease: 'back.out(1.7)' },
      0.75,
    )
    tl.to(
      plane.mesh.rotation,
      { x: focus.rx, y: focus.ry, z: focus.rz, duration: 0.55, ease: 'power3.out' },
      0.75,
    )
    tl.to(plane.mesh.scale, { x: focus.s, y: focus.s, z: 1, duration: 0.5, ease: 'back.out(1.4)' }, 0.75)
    tl.to(plane.material.uniforms.uDistort, { value: 0, duration: 0.5, ease: 'power2.out' }, 0.65)
    tl.to(plane.material.uniforms.uRgbSplit, { value: 0, duration: 0.45 }, 0.7)
    tl.to(camera.position, { x: 0, y: 0.15, z: 5.2, duration: 0.6, ease: 'power3.out' }, 0.75)
    tl.add(finish, 1.15)

    // Secondary idle drift after progress unlocks
    tl.to(
      plane.mesh.rotation,
      { y: focus.ry + 0.03, duration: 1.0, ease: 'sine.inOut', yoyo: true, repeat: 1 },
      1.2,
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
      // Fly back out roughly opposite of its gesture
      const dir = galleryPhotos[last].gesture
      const out = entryPose(dir)
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
        gsap.to(focal.mesh.position, { x: focus.x, y: focus.y, z: focus.z, duration: 0.45, ease: 'power2.out' })
        gsap.to(focal.mesh.scale, { x: 1, y: 1, z: 1, duration: 0.45 })
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

  /** Transition helper: gather collage toward letter scene */
  gatherForLetter(): gsap.core.Timeline {
    const tl = gsap.timeline()
    this.planes.forEach((p, i) => {
      if (!p?.settled) return
      tl.to(
        p.mesh.position,
        {
          x: ((i % 4) - 1.5) * 1.4,
          y: (Math.floor(i / 4) - 0.5) * 1.2,
          z: -18 - (i % 3) * 0.3,
          duration: 1.4,
          ease: 'power3.inOut',
        },
        0,
      )
      tl.to(p.mesh.scale, { x: 0.35, y: 0.35, z: 1, duration: 1.2, ease: 'power2.inOut' }, 0)
      tl.to(p.material.uniforms.uOpacity, { value: 0.15, duration: 1.0 }, 0.2)
    })
    return tl
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
