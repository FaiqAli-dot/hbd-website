/** Dynamic device pixel ratio from measured frame time — first-class on iPhone. */

export class AdaptiveDpr {
  private current: number
  private readonly min: number
  private readonly max: number
  private ema = 16.7
  private frames = 0

  constructor(maxCap: number, minFloor = 0.75) {
    this.max = maxCap
    this.min = minFloor
    this.current = Math.min(window.devicePixelRatio || 1, maxCap)
  }

  get value(): number {
    return this.current
  }

  /** Call once per animation frame with dt in ms */
  sample(dtMs: number): number {
    if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 100) return this.current
    this.ema = this.ema * 0.9 + dtMs * 0.1
    this.frames += 1
    // Adjust every ~20 frames to avoid thrash
    if (this.frames % 20 !== 0) return this.current

    if (this.ema > 22 && this.current > this.min) {
      this.current = Math.max(this.min, this.current - 0.1)
    } else if (this.ema < 14.5 && this.current < this.max) {
      this.current = Math.min(this.max, this.current + 0.05)
    }
    return this.current
  }
}
