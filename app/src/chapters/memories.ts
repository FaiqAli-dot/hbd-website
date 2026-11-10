import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { memoryVideos } from '../content/config'
import { prefersReducedMotion } from '../utils/motion'

gsap.registerPlugin(ScrollTrigger)

export function mountMemories(parent: HTMLElement): HTMLElement {
  const el = document.createElement('section')
  el.className = 'chapter chapter--memories'
  el.id = 'chapter-memories'
  el.setAttribute('aria-label', 'Four cinematic memories')

  const frames = memoryVideos
    .map(
      (m, i) => `
      <figure class="memory" data-memory="${m.id}" data-index="${i}" tabindex="0" role="button" aria-label="Play memory: ${m.label}">
        <div class="memory__ring" aria-hidden="true"></div>
        <div class="memory__media">
          <video
            src="${m.src}"
            muted
            playsinline
            loop
            preload="${i === 0 ? 'metadata' : 'none'}"
            data-video
          ></video>
        </div>
        <figcaption>
          <span class="memory__label">${m.label}</span>
          <span class="memory__caption">${m.caption}</span>
        </figcaption>
      </figure>
    `,
    )
    .join('')

  el.innerHTML = `
    <div class="memories__intro">
      <p class="memories__eyebrow">Four windows</p>
      <h2 class="memories__title">Memories, still moving</h2>
    </div>
    <div class="memories__constellation">${frames}</div>
  `
  parent.appendChild(el)

  const reduced = prefersReducedMotion()
  const memories = Array.from(el.querySelectorAll('.memory')) as HTMLElement[]

  gsap.from(el.querySelectorAll('.memories__eyebrow, .memories__title'), {
    opacity: 0,
    y: reduced ? 0 : 24,
    duration: reduced ? 0.01 : 0.8,
    stagger: 0.1,
    ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 75%', once: true },
  })

  memories.forEach((node, i) => {
    gsap.from(node, {
      opacity: 0,
      scale: reduced ? 1 : 0.78,
      y: reduced ? 0 : 40,
      duration: reduced ? 0.01 : 1,
      delay: reduced ? 0 : i * 0.1,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 65%', once: true },
      onComplete: () => {
        // Lazy attach src load for non-first after entrance
        const video = node.querySelector('video') as HTMLVideoElement
        if (video && video.preload === 'none') {
          video.preload = 'metadata'
          video.load()
        }
      },
    })

    const video = node.querySelector('video') as HTMLVideoElement
    let playing = false

    const play = () => {
      void video.play().then(() => {
        playing = true
        node.classList.add('is-playing')
      }).catch(() => undefined)
    }
    const pause = () => {
      video.pause()
      playing = false
      node.classList.remove('is-playing')
    }

    node.addEventListener('pointerenter', () => {
      if (window.matchMedia('(hover: hover)').matches) play()
    })
    node.addEventListener('pointerleave', () => {
      if (window.matchMedia('(hover: hover)').matches) pause()
    })
    node.addEventListener('click', () => {
      if (window.matchMedia('(hover: hover)').matches) return
      if (playing) pause()
      else play()
    })
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (playing) pause()
        else play()
      }
    })
  })

  return el
}
