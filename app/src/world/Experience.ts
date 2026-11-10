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

  constructor(app: HTMLElement) {
    this.app = app
    this.tier = detectQuality()
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'webgl-canvas'
    this.canvas.setAttribute('aria-hidden', 'true')
    app.appendChild(this.canvas)

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.tier !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearColor('#07060a')
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120)
    this.camera.position.set(0, 0.15, 5.2)

    this.atmosphere = new Atmosphere(this.tier)
    this.scene.add(this.atmosphere.background)
    this.scene.add(this.atmosphere.group)

    const key = new THREE.DirectionalLight('#ffd7b0', 1.4)
    key.position.set(3, 5, 4)
    const rim = new THREE.DirectionalLight('#8aa0c8', 0.35)
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
      if (this.gallery.undo(this.camera)) {
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
      if (!this.unlocked) this.unlockJourney()
      this.scrollIntoJourney()
    })

    this.bindInput()
    this.bindScrollCamera()
    this.onResize()
    window.addEventListener('resize', this.onResize)
    document.addEventListener('visibilitychange', this.onVisibility)

    this.tick()
  }

  /** Release iOS/Android scroll lock and enable the rest of the journey. */
  private unlockJourney(): void {
    if (this.unlocked) {
      this.ui.setGalleryComplete(true)
      return
    }
    this.unlocked = true

    document.documentElement.classList.add('gallery-complete')
    document.body.classList.add('gallery-complete')
    // Explicit styles help iOS Safari drop the prior height:100% / overflow:hidden lock.
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

    // Force layout, then refresh ScrollTrigger so scrubbing matches new document height.
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

  private bindInput(): void {
    this.detachGestures = attachSwipeGestures(this.app, {
      threshold: 48,
      enabled: () => !this.unlocked && this.chapter === 'gallery',
      onGesture: (dir) => {
        if (this.unlocked) return
        const ok = this.gallery.tryGesture(dir, this.camera)
        if (!ok) this.gallery.shakeHint(this.gallery.group)
      },
    })

    // After unlock, a deliberate swipe-up on the canvas also advances into the letter
    // (belt-and-suspenders for devices that still struggle with native scroll).
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
      if (this.unlocked) {
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
          // allow native scroll
        }
        return
      }
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
      this.gallery.tryGesture(dir, this.camera)
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

    const cameraState = {
      x: 0,
      y: 0.15,
      z: 5.2,
      lookY: 0,
    }

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
          cameraState.z = THREE.MathUtils.lerp(5.2, -18, t)
          cameraState.y = THREE.MathUtils.lerp(0.15, 0.2, t)
          cameraState.x = Math.sin(t * Math.PI) * 0.35
          this.setChapter('letter')
        } else if (p < 0.66) {
          const t = (p - 0.33) / 0.33
          cameraState.z = THREE.MathUtils.lerp(-18, -38, t)
          cameraState.y = THREE.MathUtils.lerp(0.2, 0.1, t)
          cameraState.x = Math.cos(t * Math.PI) * 0.45
          this.setChapter('memories')
        } else {
          const t = (p - 0.66) / 0.34
          cameraState.z = THREE.MathUtils.lerp(-38, -56, t)
          cameraState.y = THREE.MathUtils.lerp(0.1, 0.0, t)
          cameraState.x = 0
          this.setChapter('finale')
          if (t > 0.25) this.finale.play(this.camera)
        }
        this.camera.position.set(cameraState.x, cameraState.y, cameraState.z)
        this.camera.lookAt(0, cameraState.lookY, cameraState.z - 6)
      },
    })
  }

  private setChapter(chapter: typeof this.chapter): void {
    if (this.chapter === chapter) return
    const prev = this.chapter
    this.chapter = chapter
    this.atmosphere.setPalette(chapter)
    this.ui.setChapter(chapter)

    if (chapter !== 'gallery') this.hand3d.setVisible(false)
    else this.hand3d.setVisible(true)

    if (chapter === 'letter' && !this.transitionFlags.toLetter) {
      this.transitionFlags.toLetter = true
      if (!prefersReducedMotion()) this.gallery.gatherForLetter()
      this.letter.playEntrance()
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
      this.finale.absorbFromPortals(worldPos)
      if (!prefersReducedMotion()) this.memories.dissolve()
      this.finale.play(this.camera)
    }

    void prev
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

  private onResize = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    const pr = maxPixelRatio(this.tier)
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(w, h, false)
    this.post.setPixelRatio(pr)
    this.post.setSize(w, h)
  }

  private onVisibility = (): void => {
    this.running = document.visibilityState === 'visible'
    if (this.running) this.tick()
  }

  private tick = (): void => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.tick)
    const t = this.clock.getElapsedTime()
    this.atmosphere.update(t, this.scrollProgress)
    this.gallery.update(t)
    this.letter.update(t, this.pointer)
    this.memories.update(t)
    this.finale.update(t)

    // Subtle idle drift in gallery (before the journey unlocks)
    if (!this.unlocked && this.chapter === 'gallery' && !prefersReducedMotion()) {
      this.camera.position.x += (this.pointer.x * 0.12 - this.camera.position.x) * 0.02
      this.camera.position.y += (0.15 + this.pointer.y * 0.08 - this.camera.position.y) * 0.02
      this.camera.lookAt(0, 0.1, 0)
    }

    // Motion-linked chromatic aberration
    const scrollDelta = Math.abs(this.scrollProgress - this.lastScrollProgress)
    this.lastScrollProgress = this.scrollProgress
    const speed = !this.unlocked
      ? Math.min(1, Math.hypot(this.pointer.x, this.pointer.y) * 0.35)
      : Math.min(1, scrollDelta * 10)
    this.post.setMotionAmount(speed)

    this.renderer.autoClear = true
    this.post.render(t)
  }

  destroy(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.detachGestures?.()
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.extraCleanup.forEach((fn) => fn())
    ScrollTrigger.getAll().forEach((t) => t.kill())
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
