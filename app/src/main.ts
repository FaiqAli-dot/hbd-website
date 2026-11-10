import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { siteMeta } from './content/config'
import { mountGallery } from './chapters/gallery'
import { mountLetter } from './chapters/letter'
import { mountMemories } from './chapters/memories'
import { mountFinale } from './chapters/finale'
import { sound } from './components/sound'
import { prefersReducedMotion } from './utils/motion'
import './styles/main.css'

gsap.registerPlugin(ScrollTrigger)

function lockScrollUntilGalleryComplete(): () => void {
  const block = (e: Event) => {
    if (document.documentElement.classList.contains('gallery-complete')) return
    e.preventDefault()
  }

  const opts: AddEventListenerOptions = { passive: false }
  window.addEventListener('wheel', block, opts)
  window.addEventListener('touchmove', block, opts)

  return () => {
    window.removeEventListener('wheel', block, opts)
    window.removeEventListener('touchmove', block, opts)
  }
}

function mountChrome(app: HTMLElement): void {
  const chrome = document.createElement('div')
  chrome.className = 'site-chrome'
  chrome.innerHTML = `
    <div class="site-brand">${siteMeta.brand}</div>
    <button type="button" class="sound-toggle" data-sound aria-pressed="false" aria-label="Enable sound">
      <span class="sound-toggle__dot" aria-hidden="true"></span>
      <span data-sound-label>Sound off</span>
    </button>
  `
  app.appendChild(chrome)

  const btn = chrome.querySelector('[data-sound]') as HTMLButtonElement
  const label = chrome.querySelector('[data-sound-label]') as HTMLElement
  btn.addEventListener('click', async () => {
    const on = await sound.toggle()
    btn.setAttribute('aria-pressed', String(on))
    label.textContent = on ? 'Sound on' : 'Sound off'
    btn.setAttribute('aria-label', on ? 'Disable sound' : 'Enable sound')
  })
}

function mountApp(): void {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) return

  document.title = siteMeta.title

  const skip = document.createElement('a')
  skip.href = '#chapter-letter'
  skip.className = 'skip-link'
  skip.textContent = 'Skip to letter'
  skip.addEventListener('click', (e) => {
    if (!document.documentElement.classList.contains('gallery-complete')) {
      e.preventDefault()
    }
  })
  app.appendChild(skip)

  mountChrome(app)

  const unlock = lockScrollUntilGalleryComplete()
  const gallery = mountGallery(app)

  gallery.onComplete(() => {
    ScrollTrigger.refresh()
    // Soft cue that scrolling is available
    if (!prefersReducedMotion()) {
      gsap.fromTo(
        document.documentElement,
        {},
        {
          duration: 0.01,
          onComplete: () => {
            /* keep user in control; no forced scroll */
          },
        },
      )
    }
  })

  mountLetter(app)
  mountMemories(app)
  mountFinale(app)

  const footer = document.createElement('footer')
  footer.className = 'site-footer'
  footer.innerHTML = `<p>Made with care · Replace assets in <code>src/content/config.ts</code></p>`
  app.appendChild(footer)

  // Ensure ScrollTrigger measures after fonts load
  if (document.fonts?.ready) {
    void document.fonts.ready.then(() => ScrollTrigger.refresh())
  }

  window.addEventListener(
    'beforeunload',
    () => {
      unlock()
      gallery.destroy()
      ScrollTrigger.getAll().forEach((t) => t.kill())
    },
    { once: true },
  )
}

mountApp()
