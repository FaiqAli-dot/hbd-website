export type QualityTier = 'high' | 'medium' | 'low'

export function detectQuality(): QualityTier {
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4
  const isMobile = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches
  if (isMobile || cores <= 4 || mem <= 2) return 'low'
  if (cores <= 6 || mem <= 4) return 'medium'
  return 'high'
}

export function maxPixelRatio(tier: QualityTier): number {
  const dpr = window.devicePixelRatio || 1
  if (tier === 'low') return Math.min(dpr, 1.15)
  if (tier === 'medium') return Math.min(dpr, 1.5)
  return Math.min(dpr, 1.75)
}

export function particleBudget(tier: QualityTier): { dust: number; finale: number } {
  if (tier === 'low') return { dust: 180, finale: 900 }
  if (tier === 'medium') return { dust: 420, finale: 1800 }
  return { dust: 700, finale: 3200 }
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    )
  } catch {
    return false
  }
}
