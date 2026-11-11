import {
  finaleCopy,
  galleryCopy,
  letterCopy,
  siteMeta,
} from '../content/config'
import { sound } from '../components/sound'
import { createHandMarkup } from '../components/hand'

export interface OverlayApi {
  root: HTMLElement
  setProgress: (seen: number, total: number) => void
  setHint: (text: string, gestureLabel: string) => void
  setCaption: (text: string | null) => void
  setGalleryComplete: (complete: boolean) => void
  setHintsSoftened: (soft: boolean) => void
  setChapter: (chapter: 'gallery' | 'letter' | 'memories' | 'finale') => void
  setMemoryLabel: (label: string | null) => void
  onUndo: (cb: () => void) => void
  onContinue: (cb: () => void) => void
  handRoot: HTMLElement
  destroy: () => void
}

export function mountOverlays(app: HTMLElement): OverlayApi {
  const root = document.createElement('div')
  root.className = 'experience-ui'
  root.innerHTML = `
    <div class="site-chrome">
      <div class="site-brand">${siteMeta.brand}</div>
      <button type="button" class="sound-toggle" data-sound aria-pressed="false" aria-label="Enable sound">
        <span class="sound-toggle__dot" aria-hidden="true"></span>
        <span data-sound-label>Sound off</span>
      </button>
    </div>

    <div class="gallery-hud" data-gallery-hud>
      <button type="button" class="gallery-hud__guide" data-continue data-no-gesture aria-label="${galleryCopy.scrollHint}">
        ${createHandMarkup()}
        <p class="gallery-hud__hint" data-hint>${galleryCopy.introHint}</p>
        <p class="gallery-hud__gesture" data-gesture-label hidden></p>
        <span class="gallery-hud__continue" data-continue-label hidden>${galleryCopy.continueLabel}</span>
      </button>
      <p class="gallery-hud__caption" data-caption aria-live="polite"></p>
      <div class="gallery-hud__chrome">
        <button type="button" class="gallery__undo" data-undo data-no-gesture disabled>${galleryCopy.undoLabel}</button>
        <div class="gallery__progress" aria-live="polite">
          <span data-progress-current>00</span>
          <span class="gallery__progress-sep">/</span>
          <span data-progress-total>08</span>
        </div>
      </div>
    </div>

    <section class="letter-overlay" data-letter-overlay aria-hidden="true">
      <p class="letter__eyebrow letter-reveal" data-reveal-group="0">${letterCopy.eyebrow}</p>
      <div class="letter__body">
        ${letterCopy.paragraphs
          .map(
            (p, i) =>
              `<p class="letter__p letter-reveal" data-reveal-group="${i + 1}">${p}</p>`,
          )
          .join('')}
      </div>
      <footer class="letter__signoff letter-reveal" data-reveal-group="${letterCopy.paragraphs.length + 1}">
        <span>${letterCopy.signoff}</span>
        <strong>${letterCopy.signature}</strong>
      </footer>
    </section>

    <div class="memories-overlay" data-memories-overlay aria-hidden="true">
      <p class="memories__eyebrow">Four windows</p>
      <h2 class="memories__title">Memories, still moving</h2>
      <p class="memories__active" data-memory-label></p>
    </div>

    <div class="finale-overlay" data-finale-overlay aria-hidden="true">
      <div class="finale-write" data-finale-stage>
        <svg class="finale-write__svg" id="finale-write-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>
        <div class="finale-write__msg" data-finale-msg>
          <div class="finale-write__rule" data-finale-rule></div>
          <p class="finale-write__sub" data-finale-sub></p>
          <p class="finale-write__closing" data-finale-closing></p>
          <p class="finale-write__sig" data-finale-sig></p>
        </div>
      </div>
      <!-- Legacy text kept for reduced-motion / accessibility fallbacks -->
      <p class="finale__subline" hidden>${finaleCopy.subline}</p>
      <p class="finale__closing" hidden>${finaleCopy.closing}</p>
    </div>

    <div class="scroll-space" data-scroll-space aria-hidden="true">
      <div class="scroll-space__panel" id="chapter-letter" data-panel="letter"></div>
      <div class="scroll-space__panel" id="chapter-memories" data-panel="memories"></div>
      <div class="scroll-space__panel" id="chapter-finale" data-panel="finale"></div>
    </div>
  `
  app.appendChild(root)

  const soundBtn = root.querySelector('[data-sound]') as HTMLButtonElement
  const soundLabel = root.querySelector('[data-sound-label]') as HTMLElement
  soundBtn.addEventListener('click', async () => {
    const on = await sound.toggle()
    soundBtn.setAttribute('aria-pressed', String(on))
    soundLabel.textContent = on ? 'Sound on' : 'Sound off'
    soundBtn.setAttribute('aria-label', on ? 'Disable sound' : 'Enable sound')
  })

  const undoBtn = root.querySelector('[data-undo]') as HTMLButtonElement
  let undoCb: (() => void) | null = null
  undoBtn.addEventListener('pointerdown', (e) => e.stopPropagation())
  undoBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    undoCb?.()
  })

  const progressCurrent = root.querySelector('[data-progress-current]') as HTMLElement
  const progressTotal = root.querySelector('[data-progress-total]') as HTMLElement
  const hint = root.querySelector('[data-hint]') as HTMLElement
  const gestureLabel = root.querySelector('[data-gesture-label]') as HTMLElement
  const captionEl = root.querySelector('[data-caption]') as HTMLElement
  const handRoot = root.querySelector('.hand') as HTMLElement
  const galleryHud = root.querySelector('[data-gallery-hud]') as HTMLElement
  const letterOverlay = root.querySelector('[data-letter-overlay]') as HTMLElement
  const memoriesOverlay = root.querySelector('[data-memories-overlay]') as HTMLElement
  const finaleOverlay = root.querySelector('[data-finale-overlay]') as HTMLElement
  const memoryLabel = root.querySelector('[data-memory-label]') as HTMLElement

  const continueBtn = root.querySelector('[data-continue]') as HTMLButtonElement
  const continueLabel = root.querySelector('[data-continue-label]') as HTMLElement
  let continueCb: (() => void) | null = null
  // During gallery, the guide is visual-only (not a button target for gestures).
  continueBtn.disabled = true
  continueBtn.addEventListener('pointerdown', (e) => {
    // Enabled once 08/08 is reached (HUD is-complete), even before the
    // pull-out unlocks page scroll — Continue triggers the dolly-zoom.
    if (!galleryHud.classList.contains('is-complete')) {
      e.preventDefault()
      return
    }
    e.stopPropagation()
  })
  continueBtn.addEventListener('click', (e) => {
    if (!galleryHud.classList.contains('is-complete')) {
      e.preventDefault()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    continueCb?.()
  })

  return {
    root,
    handRoot,
    setProgress: (seen, total) => {
      progressCurrent.textContent = String(seen).padStart(2, '0')
      progressTotal.textContent = String(total).padStart(2, '0')
      undoBtn.disabled = seen === 0
    },
    setHint: (text, _gesture) => {
      hint.textContent = text
      // Keep the loud secondary gesture line empty — one quiet hint only
      gestureLabel.textContent = ''
      void _gesture
    },
    setCaption: (text) => {
      if (!text) {
        captionEl.textContent = ''
        captionEl.classList.remove('is-shown')
        return
      }
      captionEl.textContent = text
      captionEl.classList.add('is-shown')
    },
    setHintsSoftened: (soft) => {
      galleryHud.classList.toggle('is-hints-soft', soft)
    },
    setGalleryComplete: (complete) => {
      galleryHud.classList.toggle('is-complete', complete)
      continueBtn.disabled = !complete
      continueBtn.classList.toggle('is-tappable', complete)
      continueLabel.hidden = !complete
      if (complete) {
        hint.textContent = galleryCopy.scrollHint
        gestureLabel.textContent = ''
        continueBtn.setAttribute('aria-label', `${galleryCopy.scrollHint} ${galleryCopy.continueLabel}`)
      } else {
        continueBtn.setAttribute('aria-label', galleryCopy.introHint)
      }
    },
    setChapter: (chapter) => {
      letterOverlay.setAttribute('aria-hidden', String(chapter !== 'letter'))
      memoriesOverlay.setAttribute('aria-hidden', String(chapter !== 'memories'))
      finaleOverlay.setAttribute('aria-hidden', String(chapter !== 'finale'))
      letterOverlay.classList.toggle('is-active', chapter === 'letter')
      memoriesOverlay.classList.toggle('is-active', chapter === 'memories')
      finaleOverlay.classList.toggle('is-active', chapter === 'finale')
      galleryHud.classList.toggle('is-dim', chapter !== 'gallery')
    },
    setMemoryLabel: (label) => {
      memoryLabel.textContent = label ?? ''
    },
    onUndo: (cb) => {
      undoCb = cb
    },
    onContinue: (cb) => {
      continueCb = cb
    },
    destroy: () => root.remove(),
  }
}
