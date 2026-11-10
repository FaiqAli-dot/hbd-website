import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { finaleCopy } from '../content/config'
import { sound } from '../components/sound'
import { prefersReducedMotion } from '../utils/motion'

gsap.registerPlugin(ScrollTrigger)

/** SVG stroke-draw "HAPPY BIRTHDAY" using text as paths via stroke on outlined text */
export function mountFinale(parent: HTMLElement): HTMLElement {
  const el = document.createElement('section')
  el.className = 'chapter chapter--finale'
  el.id = 'chapter-finale'
  el.setAttribute('aria-label', 'Birthday finale')

  const letters = finaleCopy.headline.split('').map((ch, i) => {
    if (ch === ' ') return `<span class="finale__space" aria-hidden="true">&nbsp;</span>`
    return `<span class="finale__letter" data-letter style="--i:${i}">${ch}</span>`
  }).join('')

  el.innerHTML = `
    <div class="finale__atmosphere" aria-hidden="true"></div>
    <div class="finale__particles" data-particles aria-hidden="true"></div>
    <div class="finale__stage">
      <svg class="finale__svg" viewBox="0 0 1000 220" role="img" aria-label="${finaleCopy.headline}">
        <defs>
          <linearGradient id="finaleStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f0e6d3"/>
            <stop offset="55%" stop-color="#d4b483"/>
            <stop offset="100%" stop-color="#c4a494"/>
          </linearGradient>
        </defs>
        <text
          class="finale__draw-text"
          x="50%"
          y="58%"
          text-anchor="middle"
          dominant-baseline="middle"
        >${finaleCopy.headline}</text>
      </svg>
      <h2 class="finale__fallback" aria-hidden="true">${letters}</h2>
      <p class="finale__subline">${finaleCopy.subline}</p>
      <p class="finale__closing">${finaleCopy.closing}</p>
    </div>
  `
  parent.appendChild(el)

  // Particles
  const particles = el.querySelector('[data-particles]') as HTMLElement
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('span')
    p.className = 'finale__spark'
    p.style.left = `${Math.random() * 100}%`
    p.style.top = `${30 + Math.random() * 40}%`
    p.style.setProperty('--delay', `${Math.random() * 2}s`)
    p.style.setProperty('--drift', `${-40 + Math.random() * 80}px`)
    particles.appendChild(p)
  }

  const reduced = prefersReducedMotion()
  const drawText = el.querySelector('.finale__draw-text') as SVGTextElement
  const fallbackLetters = el.querySelectorAll('[data-letter]')
  const subline = el.querySelector('.finale__subline') as HTMLElement
  const closing = el.querySelector('.finale__closing') as HTMLElement

  // Prepare stroke draw on SVG text
  // Approximate path length via getComputedTextLength * factor
  const prepareStroke = () => {
    const len = Math.max(1200, drawText.getComputedTextLength() * 2.2)
    drawText.style.strokeDasharray = `${len}`
    drawText.style.strokeDashoffset = `${len}`
  }

  // Wait a frame for fonts
  requestAnimationFrame(() => {
    try {
      prepareStroke()
    } catch {
      /* ignore */
    }
  })

  const tl = gsap.timeline({
    paused: true,
    defaults: { ease: 'power3.out' },
  })

  if (reduced) {
    tl.set(drawText, { strokeDashoffset: 0, fillOpacity: 1, strokeOpacity: 0.35 })
    tl.set(fallbackLetters, { opacity: 1, y: 0, scale: 1 })
    tl.set([subline, closing], { opacity: 1, y: 0 })
  } else {
    tl.fromTo(
      drawText,
      { strokeDashoffset: 1800, fillOpacity: 0, strokeOpacity: 1 },
      {
        strokeDashoffset: 0,
        duration: 2.4,
        ease: 'power2.inOut',
        onStart: () => sound.play('finale', 0.5),
      },
    )
      .to(
        drawText,
        {
          fillOpacity: 1,
          strokeOpacity: 0.45,
          duration: 0.8,
          ease: 'power2.out',
        },
        '-=0.45',
      )
      .fromTo(
        fallbackLetters,
        { opacity: 0, y: 40, scale: 0.7, rotateX: 50 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          rotateX: 0,
          duration: 0.7,
          stagger: 0.035,
          ease: 'back.out(1.8)',
        },
        '-=1.4',
      )
      .fromTo(
        el.querySelectorAll('.finale__spark'),
        { opacity: 0, scale: 0 },
        {
          opacity: 0.85,
          scale: 1,
          duration: 0.6,
          stagger: 0.03,
          ease: 'power2.out',
        },
        '-=0.8',
      )
      .fromTo(
        subline,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' },
        '-=0.2',
      )
      .fromTo(
        closing,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' },
        '-=0.45',
      )
      .to(
        el.querySelector('.finale__stage'),
        {
          scale: 1.02,
          duration: 1.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: 1,
        },
        '-=0.4',
      )
  }

  ScrollTrigger.create({
    trigger: el,
    start: 'top 55%',
    once: true,
    onEnter: () => {
      prepareStroke()
      tl.play(0)
    },
  })

  return el
}
