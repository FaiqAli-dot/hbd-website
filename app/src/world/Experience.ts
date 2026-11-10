import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Atmosphere } from './Atmosphere'
import { PostFX } from './PostFX'
import { GalleryWorld } from './gallery/GalleryWorld'
import { LetterWorld } from './letter/LetterWorld'
import { MemoriesWorld } from './memories/MemoriesWorld'
import { FinaleWorld } from './finale/FinaleWorld'
import { mountOverlays, type OverlayApi } from '../ui/overlay'
import { HandGuide } from '../components/hand'
import { Hand3D } from './Hand3D'
import { attachSwipeGestures } from '../utils/gestures'
import { prefersReducedMotion } from '../utils/motion'
import {
  detectQuality,
  maxPixelRatio,
  type QualityTier,
} from '../utils/quality'
import { AdaptiveDpr } from '../utils/adaptiveDpr'
import { galleryCopy, galleryPhotos, type GestureDirection } from '../content/config'

gsap.registerPlugin(ScrollTrigger)

export class Experience {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private atmosphere: Atmosphere
  private post: PostFX
  private gallery: GalleryWorld
  private letter: LetterWorld
  private memories: MemoriesWorld
  private finale: FinaleWorld
  private ui: OverlayApi
  private hand: HandGuide
  private hand3d: Hand3D
  private tier: QualityTier
  private clock = new THREE.Clock()
  private pointer = { x: 0, y: 0 }
  private gyro = { x: 0, y: 0 }
  private running = true
  private scrollProgress = 0
  private chapter: 'gallery' | 'letter' | 'memories' | 'finale' = 'gallery'
  private detachGestures: (() => void) | null = null
  private detachScrollLock: (() => void) | null = null
  private raf = 0
  private canvas: HTMLCanvasElement
  private extraCleanup: Array<() => void> = []
  private app: HTMLElement
  private unlocked = false
  private letterTextRevealed = false
  private transitionFlags = { toLetter: false, toMemories: false, toFinale: false }
  private lastScrollProgress = 0
  private adaptiveDpr: AdaptiveDpr
  private lastFrameMs = 16.7
  private cameraBase = { x: 0, y: 0.15, z: 5.2, lookY: 0 }
  /** GSAP-owned reveal offset — parallax is layered on top every frame */
  private revealCam = { x: 0, y: 0, z: 0 }

  constructor(app: HTMLElement) {
    this.app = app
    this.tier = detectQuality()
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'webgl-canvas'
    this.canvas.setAttribute('aria-hidden', 'true')
    app.appendChild(this.canvas)

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.tier === 'high',
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearColor('#07060a')
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02

    this.adaptiveDpr = new AdaptiveDpr(maxPixelRatio(this.tier), this.tier === 'low' ? 0.7 : 0.85)

    this.camera = new THREE.PerspectiveCamera(44, 1, 0.08, 140)
    this.camera.position.set(0, 0.15, 5.2)

    this.atmosphere = new Atmosphere(this.tier)
    this.scene.add(this.atmosphere.background)
    this.scene.add(this.atmosphere.group)

    const key = new THREE.DirectionalLight('#ffd7b0', 1.35)
    key.position.set(3, 5, 4)
    const rim = new THREE.DirectionalLight('#8aa0c8', 0.32)
    rim.position.set(-4, 1, -2)
    const amb = new THREE.AmbientLight('#1c1820', 0.55)
    this.scene.add(key, rim, amb)

    this.gallery = new GalleryWorld()
    this.letter = new LetterWorld()
    this.memories = new MemoriesWorld()
    this.finale = new FinaleWorld(this.tier)
    this.hand3d = new Hand3D()
    this.scene.add(
      this.gallery.group,
      this.letter.group,
      this.memories.group,
      this.finale.group,
      this.hand3d.group,
    )

    this.post = new PostFX(this.renderer, this.scene, this.camera, this.tier)

    this.ui = mountOverlays(app)
    this.hand = new HandGuide(this.ui.handRoot)
    this.ui.setProgress(0, galleryPhotos.length)
    this.promptGesture()

    this.ui.onUndo(() => {
      if (this.gallery.undo(this.revealCam)) {
        const p = this.gallery.getProgress()
        this.ui.setProgress(p.seen, p.total)
        if (this.unlocked) this.relockGallery()
        else this.ui.setGalleryComplete(false)
        this.promptGesture()
      }
    })

    this.gallery.onProgress(() => {
      const p = this.gallery.getProgress()
      this.ui.setProgress(p.seen, p.total)
      this.promptGesture()
    })

    this.gallery.onComplete(() => {
      this.unlockJourney()
    })

    this.ui.onContinue(() => {
      this.requestGyroPermission()
      if (!this.unlocked) this.unlockJourney()
      this.scrollIntoJourney()
    })

    this.bindInput()
    this.bindScrollCamera()
    this.bindGyro()
    this.onResize()
    window.addEventListener('resize', this.onResize)
    document.addEventListener('visibilitychange', this.onVisibility)

    this.tick()
  }

  private unlockJourney(): void {
    if (this.unlocked) {
      this.ui.setGalleryComplete(true)
      return
    }
    this.unlocked = true

    document.documentElement.classList.add('gallery-complete')
    document.body.classList.add('gallery-complete')
    document.documentElement.style.overflowY = 'auto'
    document.documentElement.style.height = 'auto'
    document.documentElement.style.touchAction = 'pan-y'
    document.body.style.overflowY = 'auto'
    document.body.style.height = 'auto'
    document.body.style.touchAction = 'pan-y'

    this.canvas.style.touchAction = 'pan-y'
    this.detachScrollLock?.()
    this.detachScrollLock = null

    this.ui.setGalleryComplete(true)
    this.hand.demonstrate('scroll-up')
    this.hand3d.demonstrate('scroll-up')
    this.ui.setHint(galleryCopy.scrollHint, '')

    void document.body.offsetHeight
    requestAnimationFrame(() => {
      ScrollTrigger.refresh()
    })
  }

  private scrollIntoJourney(): void {
    const letter = document.getElementById('chapter-letter')
    if (!letter) {
      window.scrollTo({ top: Math.round(window.innerHeight * 0.85), behavior: 'smooth' })
      return
    }
    const top = letter.getBoundingClientRect().top + window.scrollY + Math.round(window.innerHeight * 0.15)
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  private relockGallery(): void {
    this.unlocked = false
    this.chapter = 'gallery'
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.documentElement.classList.remove('gallery-complete')
    document.body.classList.remove('gallery-complete')
    document.documentElement.style.overflowY = ''
    document.documentElement.style.height = ''
    document.documentElement.style.touchAction = ''
    document.body.style.overflowY = ''
    document.body.style.height = ''
    document.body.style.touchAction = ''
    this.canvas.style.touchAction = 'none'
    this.ui.setGalleryComplete(false)
    this.ui.setChapter('gallery')
    if (!this.detachScrollLock) this.attachScrollLock()
    ScrollTrigger.refresh()
  }

  private promptGesture(): void {
    const g = this.gallery.expectedGesture()
    if (g === 'scroll-up') {
      this.hand.demonstrate('scroll-up')
      this.hand3d.demonstrate('scroll-up')
      this.ui.setHint(galleryCopy.scrollHint, '')
      return
    }
    const labels: Record<GestureDirection, string> = {
      left: 'Swipe left',
      right: 'Swipe right',
      up: 'Swipe up',
      down: 'Swipe down',
    }
    this.hand.demonstrate(g)
    this.hand3d.demonstrate(g)
    this.ui.setHint(galleryCopy.introHint, labels[g])
  }

  private requestGyroPermission(): void {
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>
    }
    if (typeof DOE.requestPermission === 'function') {
      void DOE.requestPermission().catch(() => undefined)
    }
  }

  private bindGyro(): void {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return
      // Normalize roughly to -1..1
      this.gyro.x = THREE.MathUtils.clamp(e.gamma / 45, -1, 1)
      this.gyro.y = THREE.MathUtils.clamp((e.beta - 45) / 45, -1, 1)
    }
    window.addEventListener('deviceorientation', onOrient)
    this.extraCleanup.push(() => window.removeEventListener('deviceorientation', onOrient))

    // Also try on first pointer down after unlock (iOS gesture requirement)
    const onFirst = () => {
      if (!this.unlocked) return
      this.requestGyroPermission()
      window.removeEventListener('pointerdown', onFirst)
    }
    window.addEventListener('pointerdown', onFirst)
    this.extraCleanup.push(() => window.removeEventListener('pointerdown', onFirst))
  }

  private bindInput(): void {
    this.detachGestures = attachSwipeGestures(this.app, {
      threshold: 48,
      enabled: () => !this.unlocked && this.chapter === 'gallery',
      onGesture: (dir) => {
        if (this.unlocked) return
        const ok = this.gallery.tryGesture(dir, this.revealCam)
        if (!ok) this.gallery.shakeHint(this.gallery.group)
      },
    })

    let swipeStartY = 0
    let swipeTracking = false
    const onUnlockSwipeStart = (e: TouchEvent) => {
      if (!this.unlocked || this.chapter !== 'gallery') return
      if (e.touches.length !== 1) return
      swipeTracking = true
      swipeStartY = e.touches[0].clientY
    }
    const onUnlockSwipeEnd = (e: TouchEvent) => {
      if (!swipeTracking || !this.unlocked || this.chapter !== 'gallery') return
      swipeTracking = false
      const endY = e.changedTouches[0]?.clientY ?? swipeStartY
      const dy = swipeStartY - endY
      if (dy > 64) this.scrollIntoJourney()
    }
    this.canvas.addEventListener('touchstart', onUnlockSwipeStart, { passive: true })
    this.canvas.addEventListener('touchend', onUnlockSwipeEnd, { passive: true })

    const onKey = (e: KeyboardEvent) => {
      if (this.unlocked) return
      if (this.chapter !== 'gallery') return
      const map: Record<string, GestureDirection> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      }
      const dir = map[e.key]
      if (!dir) return
      e.preventDefault()
      this.gallery.tryGesture(dir, this.revealCam)
    }
    window.addEventListener('keydown', onKey)

    const onPointerMove = (e: PointerEvent) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
      if (this.chapter === 'memories') {
        const label = this.memories.handlePointer(
          this.pointer.x,
          this.pointer.y,
          this.camera,
          'move',
        )
        this.ui.setMemoryLabel(label)
      }
    }
    const onPointerLeave = () => {
      if (this.chapter === 'memories') {
        this.memories.handlePointer(0, 0, this.camera, 'leave')
        this.ui.setMemoryLabel(null)
      }
    }
    const onClick = (e: PointerEvent) => {
      if (this.chapter !== 'memories') return
      if (window.matchMedia('(hover: hover)').matches) return
      const x = (e.clientX / window.innerWidth) * 2 - 1
      const y = -(e.clientY / window.innerHeight) * 2 + 1
      const label = this.memories.handlePointer(x, y, this.camera, 'tap')
      this.ui.setMemoryLabel(label)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('click', onClick)

    this.extraCleanup.push(
      () => window.removeEventListener('keydown', onKey),
      () => window.removeEventListener('pointermove', onPointerMove),
      () => window.removeEventListener('pointerleave', onPointerLeave),
      () => window.removeEventListener('click', onClick),
      () => this.canvas.removeEventListener('touchstart', onUnlockSwipeStart),
      () => this.canvas.removeEventListener('touchend', onUnlockSwipeEnd),
    )
  }

  private attachScrollLock(): void {
    const lock = (e: Event) => {
      if (this.unlocked) return
      e.preventDefault()
    }
    window.addEventListener('wheel', lock, { passive: false })
    // Only preventDefault on touchmove while gallery is locked — detach after unlock
    // so iOS pull-to-refresh / overscroll are not fighting the page.
    window.addEventListener('touchmove', lock, { passive: false })
    this.detachScrollLock = () => {
      window.removeEventListener('wheel', lock)
      window.removeEventListener('touchmove', lock)
      this.detachScrollLock = null
    }
  }

  private bindScrollCamera(): void {
    this.attachScrollLock()
    this.extraCleanup.push(() => this.detachScrollLock?.())

    ScrollTrigger.create({
      trigger: '[data-scroll-space]',
      start: 'top top',
      end: 'bottom bottom',
      scrub: prefersReducedMotion() ? false : 1.1,
      onUpdate: (self) => {
        if (!this.unlocked) return
        this.scrollProgress = self.progress
        const p = self.progress
        if (p < 0.33) {
          const t = p / 0.33
          this.cameraBase.z = THREE.MathUtils.lerp(5.2, -18, t)
          this.cameraBase.y = THREE.MathUtils.lerp(0.15, 0.2, t)
          this.cameraBase.x = Math.sin(t * Math.PI) * 0.45
          this.cameraBase.lookY = THREE.MathUtils.lerp(0, 0.05, t)
          this.setChapter('letter')
        } else if (p < 0.66) {
          const t = (p - 0.33) / 0.33
          this.cameraBase.z = THREE.MathUtils.lerp(-18, -38, t)
          this.cameraBase.y = THREE.MathUtils.lerp(0.2, 0.1, t)
          this.cameraBase.x = Math.cos(t * Math.PI) * 0.55
          this.cameraBase.lookY = 0.02
          this.setChapter('memories')
        } else {
          const t = (p - 0.66) / 0.34
          this.cameraBase.z = THREE.MathUtils.lerp(-38, -56, t)
          this.cameraBase.y = THREE.MathUtils.lerp(0.1, 0.0, t)
          this.cameraBase.x = Math.sin(t * Math.PI * 0.5) * 0.15
          this.cameraBase.lookY = 0
          this.setChapter('finale')
        }
      },
    })
  }

  private setChapter(chapter: typeof this.chapter): void {
    if (this.chapter === chapter) return
    this.chapter = chapter
    this.atmosphere.setPalette(chapter)
    this.ui.setChapter(chapter)

    if (chapter !== 'gallery') this.hand3d.setVisible(false)
    else this.hand3d.setVisible(true)

    if (chapter === 'letter' && !this.transitionFlags.toLetter) {
      this.transitionFlags.toLetter = true
      const targets = this.letter.getDiscWorldTargets()
      const handoff = this.gallery.getSettledHandoff()
      // Discs inherit photo textures/poses first, then planes morph into them
      this.letter.playContinuousFromPhotos(handoff)
      if (!prefersReducedMotion()) {
        this.gallery.morphIntoLetter(targets)
      }
      this.revealLetterText()
    }

    if (chapter === 'memories' && !this.transitionFlags.toMemories) {
      this.transitionFlags.toMemories = true
      if (!prefersReducedMotion()) {
        this.letter.expandTowardPortals(this.memories.layoutTargets())
      }
      this.memories.playEntrance()
    }

    if (chapter === 'finale' && !this.transitionFlags.toFinale) {
      this.transitionFlags.toFinale = true
      const worldPos = this.memories.getWorldPositions()
      const colors = this.memories.samplePortalColors(128)
      // Particles carry sampled portal pixels → morph into letters
      this.finale.playFromPortals(worldPos, colors)
      this.memories.dissolve()
      this.letter.dissolveForFinale()
    }
  }

  private revealLetterText(): void {
    if (this.letterTextRevealed) return
    this.letterTextRevealed = true
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.letter-reveal'))
    nodes.forEach((el, i) => {
      window.setTimeout(
        () => el.classList.add('is-shown'),
        prefersReducedMotion() ? 0 : 180 + i * 220,
      )
    })
  }

  private applyPixelRatio(pr: number): void {
    this.renderer.setPixelRatio(pr)
    this.post.setPixelRatio(pr)
  }

  private onResize = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.applyPixelRatio(this.adaptiveDpr.value)
    this.renderer.setSize(w, h, false)
    this.post.setSize(w, h)
  }

  private onVisibility = (): void => {
    this.running = document.visibilityState === 'visible'
    if (this.running) this.tick()
  }

  private tick = (): void => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.tick)
    const dtMs = Math.min(64, this.clock.getDelta() * 1000) || 16.7
    this.lastFrameMs = dtMs
    const t = this.clock.elapsedTime

    // Adaptive render resolution from measured frame time
    const nextPr = this.adaptiveDpr.sample(dtMs)
    if (Math.abs(nextPr - this.renderer.getPixelRatio()) > 0.04) {
      this.applyPixelRatio(nextPr)
    }

    this.atmosphere.update(t, this.scrollProgress)
    this.gallery.update(t)
    this.letter.update(t, this.pointer)
    this.memories.update(t)
    this.finale.update(t)

    // Camera: home + GSAP reveal offset + pointer/gyro/idle — always additive
    const reduced = prefersReducedMotion()
    const parallaxX = reduced ? 0 : this.pointer.x * 0.22 + this.gyro.x * 0.28
    const parallaxY = reduced ? 0 : this.pointer.y * 0.14 + this.gyro.y * 0.2
    const breathX = reduced ? 0 : Math.sin(t * 0.45) * 0.1
    const breathY = reduced ? 0 : Math.cos(t * 0.32) * 0.07
    const breathZ = reduced ? 0 : Math.sin(t * 0.28) * 0.18

    if (!this.unlocked && this.chapter === 'gallery') {
      const tx = 0 + this.revealCam.x + parallaxX * 1.1 + breathX
      const ty = 0.15 + this.revealCam.y + parallaxY * 0.75 + breathY
      const tz = 5.2 + this.revealCam.z + breathZ + parallaxY * 0.1
      this.camera.position.x = tx
      this.camera.position.y = ty
      this.camera.position.z = tz
      this.camera.lookAt(
        parallaxX * 0.75 + this.revealCam.x * 0.3,
        0.12 + parallaxY * 0.4 + this.revealCam.y * 0.25,
        -0.5 + this.revealCam.z * 0.4,
      )
    } else if (this.unlocked) {
      const tx = this.cameraBase.x + parallaxX * 0.4 + breathX * 0.35
      const ty = this.cameraBase.y + parallaxY * 0.3 + breathY * 0.35
      const tz = this.cameraBase.z + breathZ * 0.25
      this.camera.position.x += (tx - this.camera.position.x) * 0.1
      this.camera.position.y += (ty - this.camera.position.y) * 0.1
      this.camera.position.z += (tz - this.camera.position.z) * 0.12
      this.camera.lookAt(
        parallaxX * 0.45,
        this.cameraBase.lookY + parallaxY * 0.18,
        this.camera.position.z - 6,
      )
    }

    const scrollDelta = Math.abs(this.scrollProgress - this.lastScrollProgress)
    this.lastScrollProgress = this.scrollProgress
    const speed = !this.unlocked
      ? Math.min(1, Math.hypot(this.pointer.x, this.pointer.y) * 0.25)
      : Math.min(1, scrollDelta * 8)
    this.post.setMotionAmount(speed)

    this.renderer.autoClear = true
    this.post.render(t, this.renderer, this.scene, this.camera)

    void this.lastFrameMs
  }

  destroy(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.detachGestures?.()
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.extraCleanup.forEach((fn) => fn())
    ScrollTrigger.getAll().forEach((st) => st.kill())
    this.gallery.dispose()
    this.letter.dispose()
    this.memories.dispose()
    this.finale.dispose()
    this.hand3d.destroy()
    this.atmosphere.dispose()
    this.post.dispose()
    this.renderer.dispose()
    this.ui.destroy()
    this.hand.destroy()
    this.canvas.remove()
  }
}
