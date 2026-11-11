import * as THREE from 'three'
import gsap from 'gsap'
import { memoryVideos } from '../../content/config'
import { circleMaskFragment, photoRevealVertex } from '../shaders'

interface Portal {
  group: THREE.Group
  mesh: THREE.Mesh
  video: HTMLVideoElement
  texture: THREE.VideoTexture
  material: THREE.ShaderMaterial
  playing: boolean
  label: string
  rest: { x: number; y: number; z: number; s: number }
}

export class MemoriesWorld {
  readonly group = new THREE.Group()
  readonly portals: Portal[] = []
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private entered = false

  constructor() {
    this.group.position.set(0, 0, -42)

    const layout = [
      { x: -2.4, y: 0.9, z: 0.6, s: 1.15 },
      { x: 2.2, y: 1.15, z: -0.3, s: 1.25 },
      { x: -1.7, y: -1.0, z: 0.2, s: 1.05 },
      { x: 2.0, y: -0.85, z: 0.9, s: 1.2 },
    ]

    memoryVideos.forEach((mem, i) => {
      const place = layout[i]
      const video = document.createElement('video')
      video.src = mem.src
      video.crossOrigin = 'anonymous'
      video.loop = true
      video.muted = true
      video.playsInline = true
      video.preload = i === 0 ? 'metadata' : 'none'
      video.setAttribute('playsinline', '')
      video.setAttribute('muted', '')

      const texture = new THREE.VideoTexture(video)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter

      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMap: { value: texture },
          uSoft: { value: 0.06 },
          uBoost: { value: 0 },
          uOpacity: { value: 0 },
        },
        vertexShader: photoRevealVertex,
        fragmentShader: circleMaskFragment,
      })

      const mesh = new THREE.Mesh(new THREE.CircleGeometry(place.s, 64), material)
      const portalGroup = new THREE.Group()
      portalGroup.position.set(place.x * 0.2, place.y * 0.2, place.z - 2)
      portalGroup.scale.setScalar(0.15)
      portalGroup.add(mesh)

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(place.s * 1.02, place.s * 1.12, 64),
        new THREE.MeshBasicMaterial({
          color: '#d4b483',
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
        }),
      )
      portalGroup.add(ring)

      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(place.s * 1.35, 64),
        new THREE.MeshBasicMaterial({
          color: '#c9a66b',
          transparent: true,
          opacity: 0.05,
          depthWrite: false,
        }),
      )
      halo.position.z = -0.05
      portalGroup.add(halo)

      this.group.add(portalGroup)
      this.portals.push({
        group: portalGroup,
        mesh,
        video,
        texture,
        material,
        playing: false,
        label: mem.label,
        rest: place,
      })
    })
  }

  layoutTargets(): Array<{ x: number; y: number; z: number; s: number }> {
    return this.portals.map((p) => ({ ...p.rest, z: p.rest.z - 42 }))
  }

  getWorldPositions(): THREE.Vector3[] {
    return this.portals.map((p) => {
      const v = new THREE.Vector3()
      p.group.getWorldPosition(v)
      return v
    })
  }

  /**
   * Sample RGB colors from each portal's video/texture frame so finale
   * particles are visibly built from memory pixels.
   */
  samplePortalColors(perPortal = 96): Float32Array[] {
    const canvas = document.createElement('canvas')
    canvas.width = 48
    canvas.height = 48
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    return this.portals.map((p, portalIdx) => {
      const out = new Float32Array(perPortal * 3)
      // Distinct saturated fallbacks per portal if decode isn't ready
      const fallbacks = [
        [0.95, 0.45, 0.25],
        [0.35, 0.65, 0.95],
        [0.9, 0.35, 0.55],
        [0.45, 0.85, 0.55],
      ]
      const fb = fallbacks[portalIdx % fallbacks.length]
      for (let i = 0; i < perPortal; i++) {
        out[i * 3] = fb[0]
        out[i * 3 + 1] = fb[1]
        out[i * 3 + 2] = fb[2]
      }
      if (!ctx) return out
      try {
        if (p.video.readyState < 2) {
          p.video.preload = 'auto'
          p.video.load()
          // Kick a frame if possible
          void p.video.play().then(() => p.video.pause()).catch(() => undefined)
        }
        const src: CanvasImageSource | null =
          p.video.readyState >= 2
            ? p.video
            : (p.texture.image as CanvasImageSource | undefined) ?? null
        if (!src) return out
        ctx.clearRect(0, 0, 48, 48)
        ctx.drawImage(src as CanvasImageSource, 0, 0, 48, 48)
        const data = ctx.getImageData(0, 0, 48, 48).data
        let wrote = 0
        for (let i = 0; i < perPortal; i++) {
          const angle = (i / perPortal) * Math.PI * 2
          const rad = 6 + (i % 9) * 1.7
          const x = Math.min(47, Math.max(0, Math.round(24 + Math.cos(angle) * rad)))
          const y = Math.min(47, Math.max(0, Math.round(24 + Math.sin(angle) * rad)))
          const idx = (y * 48 + x) * 4
          const r = data[idx] / 255
          const g = data[idx + 1] / 255
          const b = data[idx + 2] / 255
          // Skip near-black samples (empty portal / underexposed)
          if (r + g + b < 0.12) continue
          // Slight saturation boost so colors survive particle blending
          const max = Math.max(r, g, b)
          const boost = max > 0.01 ? Math.min(1.35, 0.55 / max + 0.65) : 1
          out[wrote * 3] = Math.min(1, r * boost)
          out[wrote * 3 + 1] = Math.min(1, g * boost)
          out[wrote * 3 + 2] = Math.min(1, b * boost)
          wrote++
        }
      } catch {
        // CORS / decode — keep saturated fallbacks
      }
      return out
    })
  }

  playEntrance(): void {
    if (this.entered) return
    this.entered = true
    // Warm video decode so portal color sampling has real frames
    this.portals.forEach((p) => {
      if (p.video.preload === 'none') {
        p.video.preload = 'auto'
        p.video.load()
      }
    })
    this.portals.forEach((p, i) => {
      gsap.to(p.group.position, {
        x: p.rest.x,
        y: p.rest.y,
        z: p.rest.z,
        duration: 1.25,
        delay: i * 0.1,
        ease: 'back.out(1.5)',
      })
      gsap.to(p.group.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 1.15,
        delay: i * 0.1,
        ease: 'power3.out',
      })
      gsap.to(p.material.uniforms.uOpacity, { value: 1, duration: 0.7, delay: i * 0.1 })
    })
  }

  /**
   * Portals surge, then shatter while flying toward finale depth so their
   * pixels (FinaleWorld particles) can be seen leaving the circles.
   */
  dissolve(): gsap.core.Timeline {
    const tl = gsap.timeline()
    this.portals.forEach((p, i) => {
      tl.to(p.material.uniforms.uBoost, { value: 0.55, duration: 0.2 }, i * 0.05)
      tl.to(
        p.group.scale,
        { x: 1.15, y: 1.15, z: 1.15, duration: 0.28, ease: 'power2.out' },
        i * 0.05,
      )
      // Drift toward finale while shattering into particles
      tl.to(
        p.group.position,
        {
          z: p.rest.z - 14,
          x: p.rest.x * 0.35,
          y: p.rest.y * 0.35,
          duration: 1.35,
          ease: 'power2.in',
        },
        0.12 + i * 0.05,
      )
      tl.to(
        p.group.scale,
        { x: 0.02, y: 0.02, z: 0.02, duration: 1.25, ease: 'power3.in' },
        0.2 + i * 0.05,
      )
      tl.to(
        p.material.uniforms.uOpacity,
        { value: 0, duration: 0.95, ease: 'power2.in' },
        0.45 + i * 0.05,
      )
      // Fade every child (rings/halos) so nothing remains on the finale
      p.group.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child !== p.mesh) {
          const mat = child.material as THREE.MeshBasicMaterial
          if (mat?.opacity != null) {
            tl.to(mat, { opacity: 0, duration: 0.4, ease: 'power2.in' }, 0.2 + i * 0.05)
          }
        }
      })
      tl.add(() => {
        this.pause(p)
        p.group.visible = false
      }, 1.2 + i * 0.05)
    })
    tl.add(() => {
      this.group.visible = false
    }, 1.6)
    return tl
  }

  private play(p: Portal): void {
    if (p.video.preload === 'none') {
      p.video.preload = 'auto'
      p.video.load()
    }
    void p.video.play().then(() => {
      p.playing = true
      p.material.uniforms.uBoost.value = 0.18
    }).catch(() => undefined)
  }

  private pause(p: Portal): void {
    p.video.pause()
    p.playing = false
    p.material.uniforms.uBoost.value = 0
  }

  handlePointer(
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
    mode: 'move' | 'leave' | 'tap',
  ): string | null {
    this.pointer.set(ndcX, ndcY)
    this.raycaster.setFromCamera(this.pointer, camera)
    const meshes = this.portals.map((p) => p.mesh)
    const hits = this.raycaster.intersectObjects(meshes, false)
    const hit = hits[0]?.object

    if (mode === 'leave') {
      this.portals.forEach((p) => this.pause(p))
      return null
    }

    if (mode === 'tap') {
      this.portals.forEach((p) => {
        if (p.mesh === hit) {
          if (p.playing) this.pause(p)
          else this.play(p)
        } else {
          this.pause(p)
        }
      })
      const active = this.portals.find((p) => p.mesh === hit)
      return active?.label ?? null
    }

    // hover move (desktop)
    const canHover = window.matchMedia('(hover: hover)').matches
    if (!canHover) return null
    this.portals.forEach((p) => {
      if (p.mesh === hit) this.play(p)
      else this.pause(p)
    })
    return this.portals.find((p) => p.mesh === hit)?.label ?? null
  }

  update(time: number): void {
    this.portals.forEach((p, i) => {
      p.texture.needsUpdate = p.playing
      if (!this.entered) return
      p.group.position.y += Math.sin(time * 0.5 + i) * 0.0006
      const targetScale = p.playing ? 1.08 : 1
      p.group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08)
    })
  }

  setVisible(v: boolean): void {
    this.group.visible = v
  }

  dispose(): void {
    this.portals.forEach((p) => {
      p.video.pause()
      p.video.src = ''
      p.texture.dispose()
      p.mesh.geometry.dispose()
      p.material.dispose()
    })
  }
}
