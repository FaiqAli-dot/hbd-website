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
  /** After pull-out, camera rides this base through letter → memories → finale */
  private cameraBase = { x: 0.6, y: 1.4, z: 40, lookY: 0.2 }
  private awaitingPullOut = false

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
    this.renderer.setClearColor('#0b080c')
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0

    this.adaptiveDpr = new AdaptiveDpr(maxPixelRatio(this.tier), this.tier === 'low' ? 0.7 : 0.85)

    this.camera = new THREE.PerspectiveCamera(44, 1, 0.15, 220)
    this.camera.position.set(0, 0.35, 11.5)

    this.atmosphere = new Atmosphere(this.tier)
    this.scene.add(this.atmosphere.background)
    this.scene.add(this.atmosphere.group)

    const key = new THREE.DirectionalLight('#ffd7b0', 0.55)
    key.position.set(3, 5, 4)
    const rim = new THREE.DirectionalLight('#8aa0c8', 0.18)
    rim.position.set(-4, 1, -2)
    const amb = new THREE.AmbientLight('#1c1820', 0.35)
    this.scene.add(key, rim, amb)

    this.gallery = new GalleryWorld()
    this.letter = new LetterWorld()
    this.memories = new MemoriesWorld()
    this.finale = new FinaleWorld(this.tier)
    this.hand3d = new Hand3D()
    // Keep later chapters fully hidden so their discs/rings never leak into Ch1 collage
    this.letter.group.visible = false
    this.memories.group.visible = false
    this.finale.group.visible = false
    this.scene.add(
      this.gallery.group,
      this.letter.group,
      this.memories.group,
      this.finale.group,
    )
    // Hand rides with the camera so the guide stays framed during ribbon travel
    this.hand3d.attachToCamera(this.camera)

    this.post = new PostFX(this.renderer, this.scene, this.camera, this.tier)

    this.ui = mountOverlays(app)
    this.hand = new HandGuide(this.ui.handRoot)
    this.ui.setProgress(0, galleryPhotos.length)
    this.promptGesture()

    this.gallery.onCaption((text) => this.ui.setCaption(text))

    this.ui.onUndo(() => {
      if (this.awaitingPullOut || this.gallery.hasStartedPullOut()) return
      if (this.gallery.undo()) {
        const p = this.gallery.getProgress()
        this.ui.setProgress(p.seen, p.total)
        if (this.unlocked) this.relockGallery()
        else this.ui.setGalleryComplete(false)
        this.awaitingPullOut = false
        this.promptGesture()
      }
    })

    this.gallery.onProgress(() => {
      const p = this.gallery.getProgress()
      this.ui.setProgress(p.seen, p.total)
      this.promptGesture()
    })

    this.gallery.onComplete(() => {
      this.awaitingPullOut = true
      this.ui.setGalleryComplete(true)
      this.hand.demonstrate('scroll-up')
      this.hand3d.demonstrate('scroll-up')
      this.ui.setHint(galleryCopy.scrollHint, '')
      this.ui.setCaption(null)
    })

    this.ui.onContinue(() => {
      this.requestGyroPermission()
      this.beginPullOutAndUnlock()
    })

    this.bindInput()
    this.bindScrollCamera()
    this.bindGyro()
    this.onResize()
    window.addEventListener('resize', this.onResize)
    document.addEventListener('visibilitychange', this.onVisibility)

    this.tick()
  }

  private beginPullOutAndUnlock(): void {
    if (this.unlocked) {
      this.scrollIntoJourney()
      return
    }
    if (!this.awaitingPullOut && !this.gallery.getProgress().complete) {
      // Allow Continue only after 08/08
      return
    }
    if (this.gallery.isPullOutDone()) {
      this.unlockJourney()
      this.scrollIntoJourney()
      return
    }
    if (this.gallery.hasStartedPullOut()) return

    this.hand3d.setVisible(false)
    const ok = this.gallery.pullOut(() => {
      this.unlockJourney()
      // Hold the lit collage briefly so the dolly-zoom read lands, then ease into Ch2
      window.setTimeout(() => this.scrollIntoJourney(), prefersReducedMotion() ? 0 : 1800)
    })
    if (!ok && this.gallery.getProgress().complete) {
      // Reduced-motion / already settled fallback
      this.unlockJourney()
      this.scrollIntoJourney()
    }
  }

  private unlockJourney(): void {
    if (this.unlocked) {
      this.ui.setGalleryComplete(true)
      return
    }
    this.unlocked = true
    this.awaitingPullOut = false

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

    // Seed scroll camera at the near-field collage framing and hold FOV
    const collage = this.gallery.getCollageCamera()
    this.cameraBase = { x: collage.x, y: collage.y, z: collage.z, lookY: collage.lookY }
    this.camera.fov = collage.fov
    this.camera.updateProjectionMatrix()
    this.gallery.finalizeCollage()

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
    this.awaitingPullOut = false
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
    this.ui.setCaption(null)
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
      this.gyro.x = THREE.MathUtils.clamp(e.gamma / 45, -1, 1)
      this.gyro.y = THREE.MathUtils.clamp((e.beta - 45) / 45, -1, 1)
    }
    window.addEventListener('deviceorientation', onOrient)
    this.extraCleanup.push(() => window.removeEventListener('deviceorientation', onOrient))

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
        // After 08/08, swipe-up triggers the dolly-zoom pull-out
        if (this.awaitingPullOut && dir === 'up') {
          this.beginPullOutAndUnlock()
          return
        }
        if (this.awaitingPullOut) return
        const ok = this.gallery.tryGesture(dir)
        if (!ok) this.gallery.shakeHint(this.gallery.group)
      },
    })

    let swipeStartY = 0
    let swipeTracking = false
    const onUnlockSwipeStart = (e: TouchEvent) => {
      if (!this.awaitingPullOut && !this.unlocked) return
      if (this.chapter !== 'gallery' && !this.awaitingPullOut) return
      if (e.touches.length !== 1) return
      swipeTracking = true
      swipeStartY = e.touches[0].clientY
    }
    const onUnlockSwipeEnd = (e: TouchEvent) => {
      if (!swipeTracking) return
      swipeTracking = false
      const endY = e.changedTouches[0]?.clientY ?? swipeStartY
      const dy = swipeStartY - endY
      if (dy > 64) {
        if (this.awaitingPullOut && !this.unlocked) this.beginPullOutAndUnlock()
        else if (this.unlocked && this.chapter === 'gallery') this.scrollIntoJourney()
      }
    }
    this.canvas.addEventListener('touchstart', onUnlockSwipeStart, { passive: true })
    this.canvas.addEventListener('touchend', onUnlockSwipeEnd, { passive: true })

    const onKey = (e: KeyboardEvent) => {
      if (this.unlocked) return
      if (this.chapter !== 'gallery') return
      if (this.awaitingPullOut && (e.key === 'ArrowUp' || e.key === ' ')) {
        e.preventDefault()
        this.beginPullOutAndUnlock()
        return
      }
      const map: Record<string, GestureDirection> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      }
      const dir = map[e.key]
      if (!dir) return
      e.preventDefault()
      this.gallery.tryGesture(dir)
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
      // Allow wheel-up after 08/08 to start the pull-out
      if (this.awaitingPullOut && e instanceof WheelEvent && e.deltaY > 8) {
        e.preventDefault()
        this.beginPullOutAndUnlock()
        return
      }
      e.preventDefault()
    }
    window.addEventListener('wheel', lock, { passive: false })
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
          // From near collage (z≈5.2) into the letter field (z≈-18)
          this.cameraBase.z = THREE.MathUtils.lerp(6.8, -18, t)
          this.cameraBase.y = THREE.MathUtils.lerp(0.25, 0.2, t)
          this.cameraBase.x = THREE.MathUtils.lerp(0.1, Math.sin(t * Math.PI) * 0.45, t)
          this.cameraBase.lookY = 0.05
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

    // Clamp bloom hard on the handwritten finale — no blown-out white disc
    this.post.setBloomMul(chapter === 'finale' ? 0 : chapter === 'gallery' ? 0.75 : 0.9)
    this.renderer.toneMappingExposure = chapter === 'finale' ? 0.88 : 1.0

    if (chapter === 'letter' && !this.transitionFlags.toLetter) {
      this.transitionFlags.toLetter = true
      this.letter.group.visible = true
      const targets = this.letter.getDiscWorldTargets()
      const handoff = this.gallery.getSettledHandoff()
      // Square → disc morph happens together AFTER the pull-out collage has settled
      this.letter.playContinuousFromPhotos(handoff)
      if (!prefersReducedMotion()) {
        this.gallery.morphIntoLetter(targets)
      }
      this.revealLetterText()
    }

    if (chapter === 'memories' && !this.transitionFlags.toMemories) {
      this.transitionFlags.toMemories = true
      this.memories.group.visible = true
      if (!prefersReducedMotion()) {
        this.letter.expandTowardPortals(this.memories.layoutTargets())
      }
      this.memories.playEntrance()
    }

    if (chapter === 'finale' && !this.transitionFlags.toFinale) {
      this.transitionFlags.toFinale = true
      this.finale.group.visible = true
      const worldPos = this.memories.getWorldPositions()
      const colors = this.memories.samplePortalColors(128)
      // Portal particles gather into the nib, then dissolve completely before writing
      this.finale.playFromPortals(worldPos, colors)
      this.memories.dissolve()
      this.letter.dissolveForFinale()
      // Hard-hide leftovers so no gold rings / portal discs remain behind the ink
      window.setTimeout(() => {
        this.letter.group.visible = false
        this.memories.group.visible = false
        this.gallery.group.visible = false
      }, 1400)
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
    this.gallery.setAspect(w / h)
    this.gallery.setPixelHeight(h * this.adaptiveDpr.value)
    this.applyPixelRatio(this.adaptiveDpr.value)
    this.renderer.setSize(w, h, false)
    this.post.setSize(w, h)
    this.finale.onResize(w, h)
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

    const nextPr = this.adaptiveDpr.sample(dtMs)
    if (Math.abs(nextPr - this.renderer.getPixelRatio()) > 0.04) {
      this.applyPixelRatio(nextPr)
    }

    this.atmosphere.update(t, this.scrollProgress)
    this.gallery.update(t)
    this.letter.update(t, this.pointer)
    this.memories.update(t)
    this.finale.update(t, dtMs / 1000)

    const reduced = prefersReducedMotion()
    const parallaxX = reduced ? 0 : this.pointer.x * 0.18 + this.gyro.x * 0.22
    const parallaxY = reduced ? 0 : this.pointer.y * 0.12 + this.gyro.y * 0.16

    if (!this.unlocked) {
      // Camera-led ribbon: GalleryWorld owns position/quaternion/FOV
      this.gallery.applyCamera(this.camera, t, { x: parallaxX, y: parallaxY })
    } else {
      const breathX = reduced ? 0 : Math.sin(t * 0.45) * 0.08
      const breathY = reduced ? 0 : Math.cos(t * 0.32) * 0.05
      const breathZ = reduced ? 0 : Math.sin(t * 0.28) * 0.12
      const tx = this.cameraBase.x + parallaxX * 0.35 + breathX
      const ty = this.cameraBase.y + parallaxY * 0.25 + breathY
      const tz = this.cameraBase.z + breathZ
      this.camera.position.x += (tx - this.camera.position.x) * 0.1
      this.camera.position.y += (ty - this.camera.position.y) * 0.1
      this.camera.position.z += (tz - this.camera.position.z) * 0.12
      // Hold the collage FOV while still on gallery; only widen after Ch2+
      const targetFov =
        this.chapter === 'finale' ? 42 : this.chapter === 'gallery' ? 28 : 44
      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov += (targetFov - this.camera.fov) * 0.06
        this.camera.updateProjectionMatrix()
      }
      const lookZ =
        this.chapter === 'gallery' ? this.camera.position.z - 6.7 : this.camera.position.z - 8
      this.camera.lookAt(
        parallaxX * 0.4,
        this.cameraBase.lookY + parallaxY * 0.15,
        lookZ,
      )
    }

    const scrollDelta = Math.abs(this.scrollProgress - this.lastScrollProgress)
    this.lastScrollProgress = this.scrollProgress
    const speed = !this.unlocked
      ? this.gallery.isMoving()
        ? 0.55
        : Math.min(1, Math.hypot(this.pointer.x, this.pointer.y) * 0.2)
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
