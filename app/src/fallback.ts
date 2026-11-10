import {
  circlePhotos,
  finaleCopy,
  galleryPhotos,
  letterCopy,
  memoryVideos,
  siteMeta,
} from './content/config'
import { sound } from './components/sound'

/** Non-WebGL graceful experience — preserves content, not the cinematic world */
export function mountFallback(app: HTMLElement): void {
  document.documentElement.classList.add('gallery-complete', 'is-fallback')
  document.body.classList.add('gallery-complete', 'is-fallback')

  app.innerHTML = `
    <div class="fallback">
      <header class="fallback__header">
        <strong>${siteMeta.brand}</strong>
        <button type="button" class="sound-toggle" data-sound aria-pressed="false">Sound off</button>
      </header>
      <p class="fallback__note">Your browser can’t run the WebGL experience. Here’s a readable version of the letter.</p>
      <section>
        <h1>${finaleCopy.headline}</h1>
        <div class="fallback__gallery">
          ${galleryPhotos.map((p) => `<figure><img src="${p.src}" alt="${p.alt}" loading="lazy"/><figcaption>${p.caption}</figcaption></figure>`).join('')}
        </div>
      </section>
      <article>
        <p class="letter__eyebrow">${letterCopy.eyebrow}</p>
        ${letterCopy.paragraphs.map((p) => `<p>${p}</p>`).join('')}
        <p><em>${letterCopy.signoff}</em> ${letterCopy.signature}</p>
        <div class="fallback__circles">
          ${circlePhotos.map((c) => `<img src="${c.src}" alt="${c.alt}" loading="lazy"/>`).join('')}
        </div>
      </article>
      <section>
        <h2>Memories</h2>
        <div class="fallback__videos">
          ${memoryVideos.map((m) => `<figure><video src="${m.src}" muted playsinline controls loop></video><figcaption>${m.label} — ${m.caption}</figcaption></figure>`).join('')}
        </div>
      </section>
      <p>${finaleCopy.subline}<br/>${finaleCopy.closing}</p>
    </div>
  `

  const btn = app.querySelector('[data-sound]') as HTMLButtonElement
  btn?.addEventListener('click', async () => {
    const on = await sound.toggle()
    btn.setAttribute('aria-pressed', String(on))
    btn.textContent = on ? 'Sound on' : 'Sound off'
  })
}
