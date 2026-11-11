import gsap from 'gsap'
import type { GestureDirection } from '../content/config'
import { prefersReducedMotion } from '../utils/motion'

/** Illustrated hand SVG used to demonstrate swipe directions */
export function createHandMarkup(): string {
  return `
    <div class="hand" aria-hidden="true">
      <svg class="hand__svg" viewBox="0 0 120 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g class="hand__group">
          <path class="hand__palm" d="M38 70c-2 18 4 42 22 52 14 8 30 6 40-4 8-8 12-22 10-36l-4-28c-1-8-8-12-14-10-4 1-7 5-7 10v18l-1-30c0-8-6-13-12-12-5 1-9 6-9 12v28l-3-22c-1-8-7-12-12-11s-9 6-9 13v36z" fill="currentColor" opacity="0.92"/>
          <path class="hand__thumb" d="M30 78c-10 2-18 12-16 22 2 8 10 12 18 10l12-4" stroke="currentColor" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.85"/>
          <circle class="hand__glow" cx="60" cy="88" r="34" fill="currentColor" opacity="0.08"/>
        </g>
        <g class="hand__trail" opacity="0">
          <path d="M20 80h20" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.35"/>
          <path d="M80 80h20" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.35"/>
        </g>
      </svg>
      <div class="hand__arrow" data-arrow></div>
    </div>
  `
}

export class HandGuide {
  private root: HTMLElement
  private group: HTMLElement
  private arrow: HTMLElement
  private tween: gsap.core.Timeline | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.group = root.querySelector('.hand__group') as HTMLElement
    this.arrow = root.querySelector('[data-arrow]') as HTMLElement
  }

  fadeOut(): void {
    this.tween?.kill()
    this.tween = null
    gsap.to(this.root, { opacity: 0, duration: 0.55, ease: 'power2.out', overwrite: true })
  }

  fadeIn(): void {
    gsap.to(this.root, { opacity: 0.42, duration: 0.65, ease: 'power2.out', overwrite: true })
  }

  demonstrate(direction: GestureDirection | 'scroll-up'): void {
    this.tween?.kill()
    gsap.set(this.root, { opacity: 0.42 })
    if (prefersReducedMotion()) {
      this.setStaticPose(direction)
      return
    }

    // Brief looping demo — quiet travel distance
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.1 })
    this.tween = tl
    gsap.set(this.group, { x: 0, y: 0, rotate: 0, transformOrigin: '50% 60%' })
    gsap.set(this.arrow, { opacity: 0, clearProps: 'transform' })

    const travel = 22
    const map: Record<string, { x: number; y: number; label: string }> = {
      left: { x: -travel, y: 0, label: '←' },
      right: { x: travel, y: 0, label: '→' },
      up: { x: 0, y: -travel, label: '↑' },
      down: { x: 0, y: travel, label: '↓' },
      'scroll-up': { x: 0, y: -travel, label: '↑' },
    }
    const pose = map[direction]
    this.arrow.textContent = pose.label

    tl.to(this.group, {
      x: pose.x,
      y: pose.y,
      duration: 0.9,
      ease: 'power2.inOut',
    })
      .to(
        this.arrow,
        {
          opacity: 0.55,
          x: pose.x * 0.35,
          y: pose.y * 0.35,
          duration: 0.45,
          ease: 'power2.out',
        },
        0.15,
      )
      .to(this.group, {
        x: 0,
        y: 0,
        duration: 0.55,
        ease: 'power3.out',
      })
      .to(this.arrow, { opacity: 0, duration: 0.3 }, '<')
  }

  private setStaticPose(direction: GestureDirection | 'scroll-up'): void {
    const labels: Record<string, string> = {
      left: '←',
      right: '→',
      up: '↑',
      down: '↓',
      'scroll-up': '↑',
    }
    this.arrow.textContent = labels[direction]
    gsap.set(this.arrow, { opacity: 0.8 })
  }

  celebrate(): void {
    this.tween?.kill()
    if (prefersReducedMotion()) return
    this.tween = gsap.timeline()
    this.tween
      .to(this.group, { scale: 1.08, duration: 0.35, ease: 'back.out(2)' })
      .to(this.group, { scale: 1, duration: 0.4, ease: 'power2.out' })
  }

  destroy(): void {
    this.tween?.kill()
    this.tween = null
  }
}
