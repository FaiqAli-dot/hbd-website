import { siteMeta } from './content/config'
import { supportsWebGL } from './utils/quality'
import { mountFallback } from './fallback'
import './styles/main.css'

async function mountApp(): Promise<void> {
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

  if (!supportsWebGL()) {
    mountFallback(app)
    return
  }

  const { Experience } = await import('./world/Experience')
  const experience = new Experience(app)
  // Test/debug hook for drag-scrub verifies (no public API surface otherwise)
  ;(window as unknown as { __hbd?: { getDragState: () => unknown } }).__hbd = {
    getDragState: () => experience.getDragState(),
  }

  const footer = document.createElement('footer')
  footer.className = 'site-footer'
  footer.innerHTML =
    '<p>Made with care · Replace assets in <code>app/src/content/config.ts</code></p>'
  app.appendChild(footer)

  window.addEventListener(
    'beforeunload',
    () => {
      experience.destroy()
    },
    { once: true },
  )
}

void mountApp()
