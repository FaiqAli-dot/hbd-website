import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { circlePhotos, letterCopy } from '../content/config'
import { prefersReducedMotion } from '../utils/motion'

gsap.registerPlugin(ScrollTrigger)

export function mountLetter(parent: HTMLElement): HTMLElement {
  const el = document.createElement('section')
  el.className = 'chapter chapter--letter'
  el.id = 'chapter-letter'
  el.setAttribute('aria-label', 'Personal birthday letter')

  const circles = circlePhotos
    .map(
      (c) => `
      <figure class="letter__circle" style="${styleFromPos(c.position)}" data-circle="${c.id}">
        <img src="${c.src}" alt="${c.alt}" loading="lazy" decoding="async" />
      </figure>
    `,
    )
    .join('')

  const paragraphs = letterCopy.paragraphs
    .map((p) => `<p class="letter__p">${p}</p>`)
    .join('')

  el.innerHTML = `
    <div class="letter__atmosphere" aria-hidden="true"></div>
    <div class="letter__collage" aria-hidden="true">${circles}</div>
    <article class="letter__article">
      <p class="letter__eyebrow">${letterCopy.eyebrow}</p>
      <div class="letter__body">${paragraphs}</div>
      <footer class="letter__signoff">
        <span>${letterCopy.signoff}</span>
        <strong>${letterCopy.signature}</strong>
      </footer>
    </article>
  `
  parent.appendChild(el)

  const reduced = prefersReducedMotion()
  const article = el.querySelector('.letter__article') as HTMLElement
  const circleNodes = Array.from(el.querySelectorAll('.letter__circle'))

  gsap.from(article.querySelectorAll('.letter__eyebrow, .letter__p, .letter__signoff'), {
    opacity: 0,
    y: reduced ? 0 : 28,
    duration: reduced ? 0.01 : 0.9,
    stagger: reduced ? 0 : 0.12,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: el,
      start: 'top 70%',
      once: true,
    },
  })

  circleNodes.forEach((node, i) => {
    gsap.from(node, {
      opacity: 0,
      scale: reduced ? 1 : 0.7,
      duration: reduced ? 0.01 : 1,
      delay: reduced ? 0 : i * 0.06,
      ease: 'back.out(1.6)',
      scrollTrigger: {
        trigger: el,
        start: 'top 75%',
        once: true,
      },
    })

    if (!reduced) {
      gsap.to(node, {
        y: i % 2 === 0 ? -18 : 16,
        rotate: i % 2 === 0 ? -4 : 5,
        duration: 3.5 + i * 0.35,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })

      gsap.to(node, {
        yPercent: i % 2 === 0 ? -8 : 6,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      })
    }
  })

  return el
}

function styleFromPos(pos: {
  top?: string
  left?: string
  right?: string
  bottom?: string
  size: string
}): string {
  const parts = [`--circle-size:${pos.size}`]
  if (pos.top) parts.push(`top:${pos.top}`)
  if (pos.left) parts.push(`left:${pos.left}`)
  if (pos.right) parts.push(`right:${pos.right}`)
  if (pos.bottom) parts.push(`bottom:${pos.bottom}`)
  return parts.join(';')
}
