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
import {
  approachPose,
  closePassPose,
  collagePose,
  entryPose,
  focusPose,
  seed,
} from './flightPoses'

interface PhotoPlane {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  index: number
  settled: boolean
}

export type RevealCam = { x: number; y: number; z: number }

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
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.anisotropy = 1
}

/**
 * Chapter 1 — photographs rush through deep 3D space.
 * GSAP owns `revealCam` offsets only; Experience layers parallax on top.
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
    mesh.position.set(14, 10, -24)
    mesh.scale.setScalar(0.2)
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

  /** Settled planes with live textures — for continuous Ch1→Ch2 morph */
  getSettledHandoff(): Array<{
    worldPos: THREE.Vector3
    texture: THREE.Texture
    scale: number
    rotation: THREE.Euler
  }> {
    return this.planes
      .filter((p) => p?.settled)
      .map((p) => {
        const worldPos = new THREE.Vector3()
        p.mesh.getWorldPosition(worldPos)
        return {
          worldPos,
          texture: (p.material.uniforms.uMap.value as THREE.Texture) ?? this.textures[p.index],
          scale: p.mesh.scale.x,
          rotation: p.mesh.rotation.clone(),
        }
      })
  }

  isRevealing(): boolean {
    return this.revealing
  }

  /**
   * @param revealCam — GSAP-owned camera offset; Experience adds parallax on top.
   */
  tryGesture(direction: GestureDirection, revealCam: RevealCam): boolean {
    if (this.revealing || this.complete) return false
    const photo = galleryPhotos[this.index]
    if (!photo || photo.gesture !== direction) return false

    this.revealing = true
    const i = this.index
    const plane = this.createPlane(i)
    const start = entryPose(direction, i)
    const approach = approachPose(direction, i)
    const close = closePassPose(direction, i)
    const focus = focusPose(i)
    const reduced = prefersReducedMotion()

    plane.mesh.visible = true
    plane.mesh.position.set(start.x, start.y, start.z)
    plane.mesh.rotation.set(start.rx, start.ry, start.rz)
    plane.mesh.scale.setScalar(start.s)
    plane.material.uniforms.uOpacity.value = 0
    plane.material.uniforms.uDistort.value = 1
    plane.material.uniforms.uRgbSplit.value = 0.65

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
          gsap.to(prev.mesh.position, {
            x: c.x * 0.4,
            y: c.y * 0.4,
            z: -4,
            duration: 0.55,
            ease: 'power2.in',
          })
          gsap.to(prev.mesh.position, {
            x: c.x,
            y: c.y,
            z: c.z,
            duration: 1.05,
            delay: 0.4,
            ease: 'power3.out',
          })
          gsap.to(prev.mesh.rotation, {
            x: c.rx,
            y: c.ry,
            z: c.rz,
            duration: 1.3,
            ease: 'power2.out',
          })
          gsap.to(prev.mesh.scale, { x: c.s, y: c.s, z: c.s, duration: 1.15, ease: 'power2.out' })
          gsap.to(prev.material.uniforms.uOpacity, { value: 0.68, duration: 0.9 })
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

    // Camera offset opposite the rush + dolly as the plane passes close
    const camNudge = {
      x: direction === 'left' ? 0.72 : direction === 'right' ? -0.72 : (seed(i) - 0.5) * 0.5,
      y: direction === 'up' ? 0.55 : direction === 'down' ? -0.48 : 0.1 + seed(i + 2) * 0.14,
      z: -1.15 - seed(i) * 0.55,
    }

    const tl = gsap.timeline()

    // Phase 1 (0–0.7s): deep → approach — long visible arc from far Z
    tl.to(
      plane.mesh.position,
      { x: approach.x, y: approach.y, z: approach.z, duration: 0.7, ease: 'power2.in' },
      0,
    )
    tl.to(
      plane.mesh.rotation,
      { x: approach.rx, y: approach.ry, z: approach.rz, duration: 0.7, ease: 'power2.in' },
      0,
    )
    tl.to(
      plane.mesh.scale,
      { x: approach.s, y: approach.s, z: approach.s, duration: 0.65, ease: 'power2.out' },
      0,
    )
    tl.to(plane.material.uniforms.uOpacity, { value: 1, duration: 0.22, ease: 'power2.out' }, 0.05)
    tl.to(plane.material.uniforms.uDistort, { value: 0.55, duration: 0.5 }, 0)
    tl.to(
      revealCam,
      { x: camNudge.x * 0.55, y: camNudge.y * 0.55, z: camNudge.z * 0.4, duration: 0.7, ease: 'power2.out' },
      0,
    )

    // Phase 2 (0.65–1.35s): rush into close pass and HOLD — fills frame
    tl.to(
      plane.mesh.position,
      { x: close.x, y: close.y, z: close.z, duration: 0.55, ease: 'power3.in' },
      0.65,
    )
    tl.to(
      plane.mesh.rotation,
      { x: close.rx, y: close.ry, z: close.rz, duration: 0.55, ease: 'power2.in' },
      0.65,
    )
    tl.to(
      plane.mesh.scale,
      { x: close.s, y: close.s, z: close.s, duration: 0.5, ease: 'power2.out' },
      0.65,
    )
    tl.to(
      revealCam,
      { x: camNudge.x, y: camNudge.y, z: camNudge.z, duration: 0.5, ease: 'power2.in' },
      0.65,
    )
    tl.to(plane.material.uniforms.uRgbSplit, { value: 0.4, duration: 0.3 }, 0.7)
    // Brief hold so mid-flight evidence / perception catch the rush
    tl.to(plane.mesh.position, { z: close.z + 0.12, duration: 0.28, ease: 'sine.inOut' }, 1.15)

    // Phase 3 (1.4–2.15s): overshoot past camera then settle into unique landing
    tl.to(
      plane.mesh.position,
      {
        x: focus.x * 1.15,
        y: focus.y * 1.1,
        z: focus.z + 0.55,
        duration: 0.55,
        ease: 'power2.out',
      },
      1.4,
    )
    tl.to(
      plane.mesh.rotation,
      {
        x: focus.rx + close.rx * 0.15,
        y: focus.ry + close.ry * 0.2,
        z: focus.rz,
        duration: 0.55,
        ease: 'power2.out',
      },
      1.4,
    )
    tl.to(
      plane.mesh.scale,
      { x: focus.s * 1.1, y: focus.s * 1.1, z: 1, duration: 0.5, ease: 'power2.out' },
      1.4,
    )

    tl.to(
      plane.mesh.position,
      { x: focus.x, y: focus.y, z: focus.z, duration: 0.55, ease: 'back.out(1.55)' },
      1.85,
    )
    tl.to(
      plane.mesh.rotation,
      { x: focus.rx, y: focus.ry, z: focus.rz, duration: 0.55, ease: 'power3.out' },
      1.85,
    )
    tl.to(
      plane.mesh.scale,
      { x: focus.s, y: focus.s, z: 1, duration: 0.5, ease: 'back.out(1.3)' },
      1.85,
    )
    tl.to(plane.material.uniforms.uDistort, { value: 0, duration: 0.55, ease: 'power2.out' }, 1.7)
    tl.to(plane.material.uniforms.uRgbSplit, { value: 0, duration: 0.45 }, 1.75)
    tl.to(
      revealCam,
      { x: camNudge.x * 0.12, y: camNudge.y * 0.12, z: 0, duration: 0.8, ease: 'power3.out' },
      1.8,
    )
    // Progress unlocks after the close-pass has been visible
    tl.add(finish, 2.05)

    tl.to(
      plane.mesh.rotation,
      { y: focus.ry + 0.04, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: 1 },
      1.9,
    )

    return true
  }

  undo(revealCam: RevealCam): boolean {
    if (this.history.length === 0) return false
    this.revealing = false
    gsap.killTweensOf(revealCam)
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
        duration: 0.45,
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

    gsap.to(revealCam, { x: 0, y: 0, z: 0, duration: 0.4, ease: 'power2.out' })
    sound.play('transition', 0.25)
    return true
  }

  shakeHint(root: THREE.Object3D): void {
    if (prefersReducedMotion()) return
    gsap.fromTo(root.rotation, { z: 0 }, { z: 0.04, yoyo: true, repeat: 3, duration: 0.06 })
  }

  /**
   * Continuous morph into chapter 2: planes fly to disc targets while
   * circularizing (soft edge ↑, scale → disc), then dissolve as discs take over.
   */
  morphIntoLetter(
    discWorldTargets: Array<{ x: number; y: number; z: number }>,
  ): gsap.core.Timeline {
    const tl = gsap.timeline()
    const settled = this.planes.filter((p) => p?.settled)
    settled.forEach((p, i) => {
      const target = discWorldTargets[i % discWorldTargets.length]
      tl.to(
        p.mesh.position,
        {
          x: target.x,
          y: target.y,
          z: target.z,
          duration: 1.65,
          ease: 'power3.inOut',
        },
        i * 0.035,
      )
      // Circularize: shrink rectangular silhouette toward disc scale
      tl.to(
        p.mesh.scale,
        { x: 0.55, y: 0.55, z: 1, duration: 1.4, ease: 'power2.inOut' },
        i * 0.035,
      )
      tl.to(
        p.mesh.rotation,
        { x: 0, y: 0, z: (seed(i) - 0.5) * 0.25, duration: 1.35, ease: 'power2.inOut' },
        i * 0.035,
      )
      tl.to(p.material.uniforms.uSoftEdge, { value: 0.48, duration: 1.1, ease: 'power2.in' }, 0.2 + i * 0.035)
      // Hand off — fade only after discs have taken opacity
      tl.to(
        p.material.uniforms.uOpacity,
        { value: 0, duration: 0.7, ease: 'power2.in' },
        0.95 + i * 0.035,
      )
    })
    return tl
  }

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
