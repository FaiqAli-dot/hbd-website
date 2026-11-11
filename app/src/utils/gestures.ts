import type { GestureDirection } from '../content/config'

export interface GestureOptions {
  /** Legacy fire-on-release threshold (keyboard path unused for drag) */
  threshold?: number
  onGesture: (direction: GestureDirection) => void
  enabled?: () => boolean
  /** Direct-manipulation drag scrub (pointer/touch). */
  onDragStart?: (info: { x: number; y: number }) => void
  onDragMove?: (info: {
    x: number
    y: number
    dx: number
    dy: number
    axis: 'x' | 'y' | null
  }) => void
  onDragEnd?: (info: {
    x: number
    y: number
    dx: number
    dy: number
    axis: 'x' | 'y' | null
    vx: number
    vy: number
  }) => void
}

/**
 * Pointer/touch gestures with optional 1:1 drag scrub.
 * Uses non-passive touch listeners + touch-action:none on the stage (set by caller).
 */
export function attachSwipeGestures(
  el: HTMLElement,
  options: GestureOptions,
): () => void {
  const threshold = options.threshold ?? 56
  let startX = 0
  let startY = 0
  let tracking = false
  let pointerId: number | null = null
  let axis: 'x' | 'y' | null = null
  let lastX = 0
  let lastY = 0
  let lastT = 0
  let vx = 0
  let vy = 0
  const AXIS_LOCK_PX = 10

  const onPointerDown = (e: PointerEvent) => {
    if (options.enabled && !options.enabled()) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const target = e.target as HTMLElement | null
    if (target?.closest('button, a, input, textarea, [data-no-gesture]')) return
    tracking = true
    pointerId = e.pointerId
    startX = lastX = e.clientX
    startY = lastY = e.clientY
    lastT = performance.now()
    vx = vy = 0
    axis = null
    el.setPointerCapture?.(e.pointerId)
    options.onDragStart?.({ x: e.clientX, y: e.clientY })
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!tracking || (pointerId !== null && e.pointerId !== pointerId)) return
    const now = performance.now()
    const dt = Math.max(1, now - lastT)
    const dxStep = e.clientX - lastX
    const dyStep = e.clientY - lastY
    // EMA velocity in px/ms → scale to px/s
    const rawVx = (dxStep / dt) * 1000
    const rawVy = (dyStep / dt) * 1000
    vx = vx * 0.7 + rawVx * 0.3
    vy = vy * 0.7 + rawVy * 0.3
    lastX = e.clientX
    lastY = e.clientY
    lastT = now

    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!axis) {
      const absX = Math.abs(dx)
      const absY = Math.abs(dy)
      if (Math.max(absX, absY) >= AXIS_LOCK_PX) {
        axis = absX >= absY ? 'x' : 'y'
      }
    }
    options.onDragMove?.({ x: e.clientX, y: e.clientY, dx, dy, axis })
  }

  const finish = (e: PointerEvent) => {
    if (!tracking || (pointerId !== null && e.pointerId !== pointerId)) return
    tracking = false
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    options.onDragEnd?.({
      x: e.clientX,
      y: e.clientY,
      dx,
      dy,
      axis,
      vx,
      vy,
    })
    // Legacy fire-on-release only when no drag scrub handler is wired
    if (!options.onDragEnd && Math.max(absX, absY) >= threshold) {
      let direction: GestureDirection
      if (absX > absY) direction = dx < 0 ? 'left' : 'right'
      else direction = dy < 0 ? 'up' : 'down'
      options.onGesture(direction)
    }
    pointerId = null
    axis = null
  }

  const onPointerCancel = () => {
    if (!tracking) return
    tracking = false
    options.onDragEnd?.({
      x: lastX,
      y: lastY,
      dx: lastX - startX,
      dy: lastY - startY,
      axis,
      vx: 0,
      vy: 0,
    })
    pointerId = null
    axis = null
  }

  // Non-passive touch blockers so iOS cannot scroll the stage during gallery drag
  const preventTouch = (e: TouchEvent) => {
    if (options.enabled && !options.enabled()) return
    if ((e.target as HTMLElement | null)?.closest?.('button, a, input, textarea, [data-no-gesture]'))
      return
    e.preventDefault()
  }

  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', finish)
  el.addEventListener('pointercancel', onPointerCancel)
  el.addEventListener('touchstart', preventTouch, { passive: false })
  el.addEventListener('touchmove', preventTouch, { passive: false })

  return () => {
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', finish)
    el.removeEventListener('pointercancel', onPointerCancel)
    el.removeEventListener('touchstart', preventTouch)
    el.removeEventListener('touchmove', preventTouch)
  }
}
