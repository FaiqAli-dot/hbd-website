export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const motionFactor = (): number => (prefersReducedMotion() ? 0.01 : 1)
