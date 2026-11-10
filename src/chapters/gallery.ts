import gsap from 'gsap'
import {
  galleryCopy,
  galleryPhotos,
  type GestureDirection,
} from '../content/config'
import { createHandMarkup, HandGuide } from '../components/hand'
import { sound } from '../components/sound'
import { attachSwipeGestures } from '../utils/gestures'
import { prefersReducedMotion } from '../utils/motion'

export interface GalleryController {
  el: HTMLElement
  isComplete: () => boolean
  destroy: () => void
  onComplete: (cb: () => void) => void
}

const REVEAL_EASES = [
  'power3.out',
  'expo.out',
  'back.out(1.4)',
  'power4.out',
] as const

export function mountGallery(parent: HTMLElement): GalleryController {
  const total = galleryPhotos.length
  const seen = new Set<number>()
  let index = 0
  let revealing = false
  let complete = false
  let completeCb: (() => void) | null = null
  const history: number[] = []

  const el = document.createElement('section')
  el.className = 'chapter chapter--gallery'
  el.id = 'chapter-gallery'
  el.setAttribute('aria-label', 'Interactive photo gallery')
  el.innerHTML = `
    <div class="gallery__atmosphere" aria-hidden="true"></div>
    <div class="gallery__grain" aria-hidden="true"></div>
    <div class="gallery__stage">
      <div class="gallery__frame">
        <div class="gallery__photo-stack" data-stack></div>
        <div class="gallery__veil" data-veil></div>
      </div>
      <div class="gallery__guide">
        ${createHandMarkup()}
        <p class="gallery__hint" data-hint>${galleryCopy.introHint}</p>
        <p class="gallery__gesture-label" data-gesture-label></p>
      </div>
    </div>
    <div class="gallery__chrome">
      <button type="button" class="gallery__undo" data-undo data-no-gesture disabled>${galleryCopy.undoLabel}</button>
      <div class="gallery__progress" aria-live="polite">
        <span data-progress-current>00</span>
        <span class="gallery__progress-sep">/</span>
        <span data-progress-total>${String(total).padStart(2, '0')}</span>
      </div>
    </div>
  `
  parent.appendChild(el)

  const stack = el.querySelector('[data-stack]') as HTMLElement
  const hint = el.querySelector('[data-hint]') as HTMLElement
  const gestureLabel = el.querySelector('[data-gesture-label]') as HTMLElement
  const undoBtn = el.querySelector('[data-undo]') as HTMLButtonElement
  const progressCurrent = el.querySelector('[data-progress-current]') as HTMLElement
  const handRoot = el.querySelector('.hand') as HTMLElement
  const hand = new HandGuide(handRoot)

  // Preload next images
  galleryPhotos.forEach((photo, i) => {
    if (i < 2) {
      const img = new Image()
      img.src = photo.src
    }
  })

  const preloadAround = (i: number) => {
    ;[i, i + 1, i + 2].forEach((n) => {
      const photo = galleryPhotos[n]
      if (!photo) return
      const img = new Image()
      img.src = photo.src
    })
  }

  const updateProgress = () => {
    progressCurrent.textContent = String(seen.size).padStart(2, '0')
  }

  const gestureWord = (d: GestureDirection) =>
    ({ left: 'Swipe left', right: 'Swipe right', up: 'Swipe up', down: 'Swipe down' })[d]

  const showPrompt = () => {
    if (complete) return
    const photo = galleryPhotos[index]
    if (!photo) return
    gestureLabel.textContent = gestureWord(photo.gesture)
    hand.demonstrate(photo.gesture)
    hint.textContent = galleryCopy.introHint
  }

  const unlockScroll = () => {
    complete = true
    document.documentElement.classList.add('gallery-complete')
    document.body.classList.add('gallery-complete')
    hint.textContent = galleryCopy.scrollHint
    gestureLabel.textContent = ''
    hand.demonstrate('scroll-up')
    sound.play('transition', 0.35)
    completeCb?.()
  }

  const revealAt = (photoIndex: number, direction: GestureDirection) => {
    const photo = galleryPhotos[photoIndex]
    if (!photo) return

    const card = document.createElement('figure')
    card.className = 'gallery__card'
    card.dataset.direction = direction
    card.innerHTML = `
      <img src="${photo.src}" alt="${photo.alt}" draggable="false" />
      <figcaption>${photo.caption}</figcaption>
    `
    stack.appendChild(card)

    const img = card.querySelector('img')
    if (img) {
      img.onerror = () => {
        card.classList.add('is-fallback')
      }
    }

    const reduced = prefersReducedMotion()
    const ease = REVEAL_EASES[photoIndex % REVEAL_EASES.length]

    if (reduced) {
      gsap.set(card, { opacity: 1, clearProps: 'clipPath,transform' })
    } else {
      const from: gsap.TweenVars = {
        opacity: 0,
        duration: 0.95,
        ease,
      }
      switch (direction) {
        case 'left':
          from.x = 80
          from.rotateY = -28
          from.clipPath = 'inset(0 0 0 100%)'
          break
        case 'right':
          from.x = -80
          from.rotateY = 28
          from.clipPath = 'inset(0 100% 0 0)'
          break
        case 'up':
          from.y = 90
          from.scale = 1.08
          from.clipPath = 'inset(100% 0 0 0)'
          break
        case 'down':
          from.y = -90
          from.scale = 0.92
          from.clipPath = 'inset(0 0 100% 0)'
          break
      }
      gsap.fromTo(
        card,
        from,
        {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          rotateY: 0,
          clipPath: 'inset(0 0 0 0)',
          duration: 0.95,
          ease,
        },
      )
      gsap.fromTo(
        card.querySelector('figcaption'),
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.6, delay: 0.35, ease: 'power2.out' },
      )
    }

    sound.play('reveal', 0.4)
    hand.celebrate()
  }

  const onGesture = (direction: GestureDirection) => {
    if (revealing || complete) return
    const expected = galleryPhotos[index]
    if (!expected || expected.gesture !== direction) {
      // Soft shake on wrong direction
      if (!prefersReducedMotion()) {
        gsap.fromTo(
          handRoot,
          { x: 0 },
          { x: 8, duration: 0.08, yoyo: true, repeat: 3, ease: 'power1.inOut' },
        )
      }
      return
    }

    revealing = true
    revealAt(index, direction)
    seen.add(index)
    history.push(index)
    updateProgress()
    undoBtn.disabled = history.length === 0
    preloadAround(index + 1)

    window.setTimeout(() => {
      index += 1
      revealing = false
      if (seen.size >= total) {
        unlockScroll()
      } else {
        showPrompt()
      }
    }, prefersReducedMotion() ? 120 : 700)
  }

  const undoLast = () => {
    if (history.length === 0) return
    // Allow undo even mid-reveal timeout
    revealing = false
    const last = history.pop()
    if (last === undefined) return

    const cards = stack.querySelectorAll('.gallery__card')
    const card = cards[cards.length - 1] as HTMLElement | undefined
    if (card) {
      gsap.killTweensOf(card)
      if (prefersReducedMotion()) {
        card.remove()
      } else {
        gsap.to(card, {
          opacity: 0,
          scale: 0.94,
          duration: 0.35,
          ease: 'power2.in',
          onComplete: () => card.remove(),
        })
      }
    }

    // Reverse last reveal so the visitor can redo that gesture
    seen.delete(last)
    index = last
    complete = false
    document.documentElement.classList.remove('gallery-complete')
    document.body.classList.remove('gallery-complete')
    updateProgress()
    undoBtn.disabled = history.length === 0
    showPrompt()
    sound.play('transition', 0.25)
  }

  undoBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    undoLast()
  })
  undoBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
  })

  const detachGestures = attachSwipeGestures(el, {
    threshold: 48,
    onGesture,
    enabled: () => !complete && !revealing,
  })

  // Also allow keyboard arrows for accessibility
  const onKey = (e: KeyboardEvent) => {
    if (complete || revealing) return
    const map: Record<string, GestureDirection> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    }
    const dir = map[e.key]
    if (dir) {
      e.preventDefault()
      onGesture(dir)
    }
  }
  window.addEventListener('keydown', onKey)

  updateProgress()
  showPrompt()

  // Ambient drift on atmosphere
  if (!prefersReducedMotion()) {
    gsap.to(el.querySelector('.gallery__atmosphere'), {
      backgroundPosition: '60% 40%',
      duration: 18,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    })
  }

  return {
    el,
    isComplete: () => complete,
    onComplete: (cb) => {
      completeCb = cb
    },
    destroy: () => {
      detachGestures()
      window.removeEventListener('keydown', onKey)
      hand.destroy()
    },
  }
}
