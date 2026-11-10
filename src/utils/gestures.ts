import type { GestureDirection } from '../content/config'

export interface GestureOptions {
  threshold?: number
  onGesture: (direction: GestureDirection) => void
  enabled?: () => boolean
}

export function attachSwipeGestures(
  el: HTMLElement,
  options: GestureOptions,
): () => void {
  const threshold = options.threshold ?? 56
  let startX = 0
  let startY = 0
  let tracking = false
  let pointerId: number | null = null

  const onPointerDown = (e: PointerEvent) => {
    if (options.enabled && !options.enabled()) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const target = e.target as HTMLElement | null
    if (target?.closest('button, a, input, textarea, [data-no-gesture]')) return
    tracking = true
    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    el.setPointerCapture?.(e.pointerId)
  }

  const onPointerUp = (e: PointerEvent) => {
    if (!tracking || (pointerId !== null && e.pointerId !== pointerId)) return
    tracking = false
    pointerId = null
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    if (Math.max(absX, absY) < threshold) return

    let direction: GestureDirection
    if (absX > absY) {
      direction = dx < 0 ? 'left' : 'right'
    } else {
      direction = dy < 0 ? 'up' : 'down'
    }
    options.onGesture(direction)
  }

  const onPointerCancel = () => {
    tracking = false
    pointerId = null
  }

  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerCancel)

  return () => {
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointerup', onPointerUp)
    el.removeEventListener('pointercancel', onPointerCancel)
  }
}
