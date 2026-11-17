import * as THREE from 'three'
import gsap from 'gsap'
import { memoryVideos } from '../../content/config'
import { circleMaskFragment, photoRevealVertex } from '../shaders'

interface Portal {
  group: THREE.Group
  mesh: THREE.Mesh
  video: HTMLVideoElement
  texture: THREE.Texture
  material: THREE.ShaderMaterial
  playing: boolean
  label: string
  rest: { x: number; y: number; z: number; s: number }
  videoBound: boolean
  /** Canvas blit target — avoids THREE.VideoTexture (crashes some WebKit/WPE builds) */
  frameCanvas: HTMLCanvasElement | null
  frameCtx: CanvasRenderingContext2D | null
  posterSrc?: string
  hasContentFrame: boolean
}

export class MemoriesWorld {
  readonly group = new THREE.Group()
  readonly portals: Portal[] = []
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private entered = false
  private loader = new THREE.TextureLoader()
  /**
   * Desktop rest layout — ~200–240px at 1280×800 under the title.
   * Mobile remaps via setAspect (pull inward, slight scale down).
   */
  private baseLayout = [
    { x: -2.4, y: 2.05, z: 0.25, s: 1.7 },
    { x: 2.4, y: 2.05, z: 0.15, s: 1.7 },
    { x: -2.4, y: -2.05, z: 0.2, s: 1.7 },
    { x: 2.4, y: -2.05, z: 0.3, s: 1.7 },
  ]
  private aspect = 1.6

  constructor() {
    // Slightly closer + lowered so the 2×2 sits centered under the title
    this.group.position.set(0, -0.55, -40)

    // Balanced 2×2 with breathing room (desktop). Mobile tightened in setAspect.
    const layout = this.baseLayout

    memoryVideos.forEach((mem, i) => {
      const place = layout[i]
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.loop = true
      video.muted = true
      video.playsInline = true
      video.preload = 'none'
      video.setAttribute('playsinline', '')
      video.setAttribute('muted', '')
      video.dataset.src = mem.src
      if (mem.poster) video.poster = mem.poster

      // Neutral navy until real poster paints — never cream/yellow gradient seed
      const placeholder = new THREE.DataTexture(
        new Uint8Array([0, 26, 64, 255]),
        1,
        1,
        THREE.RGBAFormat,
      )
      placeholder.needsUpdate = true
      placeholder.colorSpace = THREE.SRGBColorSpace
      placeholder.minFilter = THREE.LinearFilter
      placeholder.magFilter = THREE.LinearFilter

      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMap: { value: placeholder },
          uSoft: { value: 0.055 },
          uBoost: { value: 0 },
          uOpacity: { value: 0 },
          uRim: { value: 0 },
        },
        vertexShader: photoRevealVertex,
        fragmentShader: circleMaskFragment,
      })

      const mesh = new THREE.Mesh(new THREE.CircleGeometry(place.s, 96), material)
      const portalGroup = new THREE.Group()
      // Start near rest — mid handoff already reads as a spread 2×2
      portalGroup.position.set(place.x * 0.9, place.y * 0.9, place.z - 0.15)
      portalGroup.scale.setScalar(0.82)
      portalGroup.add(mesh)

      // Soft cobalt halo only (cream rim is SDF inside the portal shader)
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(place.s * 1.18, 64),
        new THREE.MeshBasicMaterial({
          color: '#0047ab',
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      )
      halo.position.z = -0.04
      portalGroup.add(halo)

      this.group.add(portalGroup)
      this.portals.push({
        group: portalGroup,
        mesh,
        video,
        texture: placeholder,
        material,
        playing: false,
        label: mem.label,
        rest: place,
        videoBound: false,
        frameCanvas: null,
        frameCtx: null,
        posterSrc: mem.poster,
        hasContentFrame: false,
      })
    })
  }

  private isFragileWebKit(): boolean {
    // Playwright WPE (and a few embedded WebKits) hard-crash on media decode.
    // Real iOS Safari has "Mobile/" in the UA and is fine with video.
    const ua = navigator.userAgent
    const webkit = /AppleWebKit/i.test(ua) && !/Chrome|Chromium|Edg|Android/i.test(ua)
    const mobileSafari = /Mobile\//i.test(ua)
    return webkit && !mobileSafari
  }

  private paintImageToCanvas(p: Portal, img: CanvasImageSource): void {
    if (!p.frameCtx || !p.frameCanvas) return
    const w = p.frameCanvas.width
    const h = p.frameCanvas.height
    p.frameCtx.fillStyle = '#001a40'
    p.frameCtx.fillRect(0, 0, w, h)
    // Cover-fit into the square so faces aren't letterboxed
    const iw = 'videoWidth' in img && (img as HTMLVideoElement).videoWidth
      ? (img as HTMLVideoElement).videoWidth
      : 'naturalWidth' in img
        ? (img as HTMLImageElement).naturalWidth || w
        : w
    const ih = 'videoHeight' in img && (img as HTMLVideoElement).videoHeight
      ? (img as HTMLVideoElement).videoHeight
      : 'naturalHeight' in img
        ? (img as HTMLImageElement).naturalHeight || h
        : h
    const scale = Math.max(w / Math.max(1, iw), h / Math.max(1, ih))
    const dw = iw * scale
    const dh = ih * scale
    p.frameCtx.drawImage(img as CanvasImageSource, (w - dw) / 2, (h - dh) / 2, dw, dh)
    p.texture.needsUpdate = true
    p.hasContentFrame = true
  }

  private loadPoster(p: Portal): void {
    if (!p.posterSrc || !p.frameCtx) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // Don't overwrite a live video frame with the static poster
      if (p.playing && p.video.readyState >= 2) return
      this.paintImageToCanvas(p, img)
    }
    img.src = p.posterSrc
  }

  /**
   * Bind video via CanvasTexture (drawImage blit). Avoids THREE.VideoTexture,
   * which hard-crashes Playwright WPE / some WebKit GPU paths.
   * Always starts from a real poster frame — never a gradient/dot seed.
   */
  private bindVideoTexture(p: Portal): void {
    if (p.videoBound) return
    p.videoBound = true
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d', { alpha: false })
    p.frameCanvas = canvas
    p.frameCtx = ctx
    if (ctx) {
      ctx.fillStyle = '#001a40'
      ctx.fillRect(0, 0, 512, 512)
    }
    const ct = new THREE.CanvasTexture(canvas)
    ct.colorSpace = THREE.SRGBColorSpace
    ct.minFilter = THREE.LinearFilter
    ct.magFilter = THREE.LinearFilter
    p.texture.dispose()
    p.texture = ct
    p.material.uniforms.uMap.value = ct

    this.loadPoster(p)

    if (this.isFragileWebKit()) return
    const src = p.video.dataset.src
    if (src) {
      p.video.src = src
      p.video.preload = 'auto'
      const onReady = () => {
        this.paintImageToCanvas(p, p.video)
      }
      p.video.addEventListener('loadeddata', onReady, { once: true })
      p.video.addEventListener('seeked', onReady)
      try {
        p.video.load()
        // Nudge first decode so poster→video swap happens before stills
        p.video.currentTime = 0.05
      } catch {
        /* ignore */
      }
    }
  }

  private blitVideoFrame(p: Portal): void {
    if (!p.frameCtx || !p.frameCanvas || p.video.readyState < 2) return
    try {
      this.paintImageToCanvas(p, p.video)
    } catch {
      /* decode / CORS */
    }
  }

  /** Remap portal rest poses for narrow viewports — one tight group, not edge-pinned columns */
  setAspect(aspect: number): void {
    this.aspect = aspect
    const narrow = aspect < 0.75
    // 390px: pull columns inward, keep enough vertical gap so circles don't overlap
    // (~140–150px), one centered cluster under the title
    const sx = narrow ? 0.7 : 1
    const sy = narrow ? 0.96 : 1
    const portalScale = narrow ? 0.68 : 1
    this.group.position.y = narrow ? -0.15 : -0.55
    this.portals.forEach((p, i) => {
      const base = this.baseLayout[i]
      p.rest.x = base.x * sx
      p.rest.y = base.y * sy
      p.rest.z = base.z
      p.rest.s = base.s
      if (this.entered) {
        gsap.killTweensOf(p.group.position)
        gsap.killTweensOf(p.group.scale)
        p.group.position.set(p.rest.x, p.rest.y, p.rest.z)
        p.group.scale.setScalar(portalScale)
      } else {
        p.group.position.set(p.rest.x * 0.92, p.rest.y * 0.92, p.rest.z - 0.12)
        p.group.scale.setScalar(portalScale * 0.85)
      }
    })
  }

  layoutTargets(): Array<{ x: number; y: number; z: number; s: number }> {
    return this.portals.map((p) => ({
      ...p.rest,
      x: p.rest.x + this.group.position.x,
      y: p.rest.y + this.group.position.y,
      z: p.rest.z + this.group.position.z,
    }))
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
        const src: CanvasImageSource | null =
          p.video.readyState >= 2
            ? p.video
            : p.frameCanvas && p.hasContentFrame
              ? p.frameCanvas
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
          if (r + g + b < 0.12) continue
          const max = Math.max(r, g, b)
          const boost = max > 0.01 ? Math.min(1.35, 0.55 / max + 0.65) : 1
          out[wrote * 3] = Math.min(1, r * boost)
          out[wrote * 3 + 1] = Math.min(1, g * boost)
          out[wrote * 3 + 2] = Math.min(1, b * boost)
          wrote++
        }
      } catch {
        /* CORS / decode */
      }
      return out
    })
  }

  playEntrance(): void {
    if (this.entered) return
    this.entered = true
    const fragile = this.isFragileWebKit()
    this.portals.forEach((p) => {
      this.bindVideoTexture(p)
      if (fragile) return
      p.video.preload = 'auto'
      try {
        p.video.load()
      } catch {
        /* ignore */
      }
    })
    this.portals.forEach((p, i) => {
      const halo = p.group.children.find(
        (c) => c instanceof THREE.Mesh && c !== p.mesh,
      ) as THREE.Mesh | undefined
      gsap.to(p.group.position, {
        x: p.rest.x,
        y: p.rest.y,
        z: p.rest.z,
        duration: 1.2,
        delay: i * 0.07,
        ease: 'power3.out',
      })
      const settle = this.aspect < 0.75 ? 0.68 : 1
      gsap.to(p.group.scale, {
        x: settle,
        y: settle,
        z: settle,
        duration: 1.1,
        delay: i * 0.07,
        ease: 'power2.out',
      })
      gsap.to(p.material.uniforms.uOpacity, { value: 1, duration: 0.75, delay: i * 0.07 })
      gsap.to(p.material.uniforms.uRim, { value: 1, duration: 0.7, delay: i * 0.07 + 0.05 })
      if (halo) {
        // Keep halo nearly invisible — cream SDF rim should dominate, not a blue glow
        gsap.to(halo.material as THREE.MeshBasicMaterial, {
          opacity: 0.03,
          duration: 0.85,
          delay: i * 0.07 + 0.08,
        })
      }
      // Autoplay muted so portals show real footage without requiring hover
      window.setTimeout(() => this.play(p), fragile ? 0 : 180 + i * 90)
    })
  }

  /**
   * Portals surge, then shatter while flying toward finale depth so their
   * pixels (FinaleWorld particles) can be seen leaving the circles.
   */
  dissolve(): gsap.core.Timeline {
    const tl = gsap.timeline()
    this.portals.forEach((p, i) => {
      tl.to(p.material.uniforms.uBoost, { value: 0.7, duration: 0.25 }, i * 0.04)
      tl.to(
        p.group.scale,
        { x: 1.15, y: 1.15, z: 1.15, duration: 0.35, ease: 'power2.out' },
        i * 0.04,
      )
      tl.to(
        p.group.position,
        {
          z: p.rest.z - 8,
          x: p.rest.x * 0.12,
          y: p.rest.y * 0.12,
          duration: 1.85,
          ease: 'power2.in',
        },
        0.05 + i * 0.04,
      )
      tl.to(
        p.group.scale,
        { x: 0.12, y: 0.12, z: 0.12, duration: 2.0, ease: 'power3.in' },
        0.7 + i * 0.04,
      )
      tl.to(
        p.material.uniforms.uOpacity,
        { value: 0, duration: 1.6, ease: 'power2.in' },
        1.0 + i * 0.04,
      )
      tl.to(p.material.uniforms.uRim, { value: 0, duration: 0.6, ease: 'power2.in' }, 0.85 + i * 0.04)
      p.group.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child !== p.mesh) {
          const mat = child.material as THREE.MeshBasicMaterial
          if (mat?.opacity != null) {
            tl.to(mat, { opacity: 0, duration: 0.7, ease: 'power2.in' }, 0.85 + i * 0.05)
          }
        }
      })
      tl.add(() => {
        this.pause(p)
        p.group.visible = false
      }, 2.1 + i * 0.05)
    })
    tl.add(() => {
      this.group.visible = false
    }, 2.5)
    return tl
  }

  private play(p: Portal): void {
    if (this.isFragileWebKit() || !p.video.src) {
      // Poster already painted — treat as content-ready
      p.playing = true
      p.material.uniforms.uBoost.value = 0.08
      return
    }
    if (p.video.preload === 'none') {
      p.video.preload = 'auto'
      p.video.load()
    }
    void p.video.play().then(() => {
      p.playing = true
      p.material.uniforms.uBoost.value = 0.1
      this.blitVideoFrame(p)
    }).catch(() => {
      // Autoplay blocked — still keep poster frame visible
      this.blitVideoFrame(p)
    })
  }

  private pause(p: Portal): void {
    if (p.video.src) p.video.pause()
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
      // Keep ambient autoplay going — leave only clears hover boost
      this.portals.forEach((p) => {
        p.material.uniforms.uBoost.value = p.playing ? 0.1 : 0
      })
      return null
    }

    if (mode === 'tap') {
      this.portals.forEach((p) => {
        if (p.mesh === hit) {
          if (p.playing) this.pause(p)
          else this.play(p)
        }
      })
      const active = this.portals.find((p) => p.mesh === hit)
      return active?.label ?? null
    }

    const canHover = window.matchMedia('(hover: hover)').matches
    if (!canHover) return null
    this.portals.forEach((p) => {
      if (p.mesh === hit) {
        if (!p.playing) this.play(p)
        p.material.uniforms.uBoost.value = 0.18
      } else if (p.playing) {
        p.material.uniforms.uBoost.value = 0.1
      }
    })
    return this.portals.find((p) => p.mesh === hit)?.label ?? null
  }

  update(time: number): void {
    this.portals.forEach((p, i) => {
      // Blit whenever the decoder has frames — not only while "playing"
      if (p.videoBound && p.video.readyState >= 2 && !p.video.paused) {
        this.blitVideoFrame(p)
      } else if (p.videoBound && p.video.readyState >= 2 && !p.hasContentFrame) {
        this.blitVideoFrame(p)
      }
      if (!this.entered) return
      p.group.position.y += Math.sin(time * 0.5 + i) * 0.00055
      const baseScale = this.aspect < 0.75 ? 0.68 : 1
      const targetScale =
        p.playing && p.material.uniforms.uBoost.value > 0.14 ? baseScale * 1.04 : baseScale
      const s = p.group.scale
      s.x += (targetScale - s.x) * 0.08
      s.y += (targetScale - s.y) * 0.08
      s.z += (targetScale - s.z) * 0.08
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
    void this.loader
  }
}
