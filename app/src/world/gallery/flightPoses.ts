import type { GestureDirection } from '../../content/config'

export interface Pose {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  s: number
}

/** Deterministic hash so each photo gets a stable unique path */
export function seed(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Deep-space entry — originate near the vanishing center at far Z so travel
 * reads as a rush out of the void (not a lateral edge-slide that scales up).
 * Direction still biases the approach path.
 */
export function entryPose(dir: GestureDirection, i: number): Pose {
  const r = seed(i)
  const r2 = seed(i + 17)
  const depth = -28 - r * 14
  const scale = 0.06 + r2 * 0.08
  // Small lateral bias so paths differ, but stay near center of deep space
  const biasX =
    dir === 'left' ? 1.8 + r * 1.4 : dir === 'right' ? -1.8 - r * 1.4 : (r - 0.5) * 2.2
  const biasY =
    dir === 'up' ? -2.2 - r2 * 1.2 : dir === 'down' ? 2.2 + r2 * 1.2 : (r2 - 0.5) * 1.8
  switch (dir) {
    case 'left':
      return {
        x: biasX,
        y: biasY,
        z: depth,
        rx: 0.65 + r * 0.45,
        ry: -1.35 - r2 * 0.45,
        rz: 0.55 - r * 0.35,
        s: scale,
      }
    case 'right':
      return {
        x: biasX,
        y: biasY,
        z: depth,
        rx: -0.6 - r * 0.4,
        ry: 1.3 + r2 * 0.5,
        rz: -0.5 + r * 0.3,
        s: scale,
      }
    case 'up':
      return {
        x: biasX,
        y: biasY,
        z: depth,
        rx: 1.45 + r * 0.35,
        ry: -0.4 + r2 * 0.8,
        rz: 0.4 - r * 0.45,
        s: scale,
      }
    case 'down':
      return {
        x: biasX,
        y: biasY,
        z: depth,
        rx: -1.4 - r * 0.3,
        ry: 0.4 - r2 * 0.7,
        rz: -0.35 + r * 0.35,
        s: scale,
      }
  }
}

/** Mid-arc: still deep, growing out of the vanishing point with foreshortening */
export function approachPose(dir: GestureDirection, i: number): Pose {
  const r = seed(i + 5)
  const r2 = seed(i + 13)
  const base: Record<GestureDirection, Pose> = {
    left: {
      x: 2.2 + r * 1.2,
      y: -0.8 + r2 * 1.6,
      z: -12 - r * 4,
      rx: 0.7,
      ry: -1.05,
      rz: 0.4,
      s: 0.28 + r * 0.15,
    },
    right: {
      x: -2.4 - r * 1.1,
      y: 0.5 - r2 * 1.5,
      z: -11.5 - r * 4.2,
      rx: -0.65,
      ry: 1.0,
      rz: -0.38,
      s: 0.26 + r * 0.16,
    },
    up: {
      x: -0.9 + r * 2.0,
      y: -2.6 - r2 * 1.0,
      z: -11 - r * 3.8,
      rx: 1.15,
      ry: 0.3 - r2 * 0.45,
      rz: 0.3,
      s: 0.3 + r * 0.14,
    },
    down: {
      x: 0.9 - r * 1.9,
      y: 2.7 + r2 * 0.9,
      z: -11.2 - r * 3.6,
      rx: -1.1,
      ry: -0.25 + r2 * 0.4,
      rz: -0.28,
      s: 0.28 + r * 0.15,
    },
  }
  return base[dir]
}

/**
 * Close pass — rush past / toward the camera (cam ≈ z 5.2).
 * Plane at z≈3.6–4.4 fills the frame with extreme foreshortening.
 */
export function closePassPose(dir: GestureDirection, i: number): Pose {
  const r = seed(i + 3)
  const r2 = seed(i + 11)
  const base: Record<GestureDirection, Pose> = {
    left: {
      x: 0.6 + r * 0.7,
      y: -0.2 + r2 * 0.5,
      z: 3.7 + r * 0.55,
      rx: 0.55 + r * 0.25,
      ry: -1.15 - r2 * 0.3,
      rz: 0.45,
      s: 1.55 + r * 0.35,
    },
    right: {
      x: -0.7 - r * 0.65,
      y: 0.15 - r2 * 0.45,
      z: 3.85 + r * 0.5,
      rx: -0.5 - r * 0.2,
      ry: 1.1 + r2 * 0.35,
      rz: -0.4,
      s: 1.5 + r * 0.38,
    },
    up: {
      x: -0.35 + r * 0.9,
      y: -0.55 - r2 * 0.3,
      z: 4.0 + r * 0.45,
      rx: 1.05 + r * 0.25,
      ry: 0.4 - r2 * 0.45,
      rz: 0.3,
      s: 1.65 + r * 0.3,
    },
    down: {
      x: 0.4 - r * 0.85,
      y: 0.6 + r2 * 0.3,
      z: 3.9 + r * 0.5,
      rx: -1.0 - r * 0.2,
      ry: -0.35 + r2 * 0.4,
      rz: -0.28,
      s: 1.6 + r * 0.32,
    },
  }
  return base[dir]
}

/** Unique final focal placement — never a shared center landing */
export function focusPose(i: number): Pose {
  const r = seed(i)
  const r2 = seed(i + 29)
  const r3 = seed(i + 41)
  const slot = i % 8
  const arc = ((slot / 7) - 0.5) * 2.4
  return {
    x: arc + (r - 0.5) * 0.55,
    y: -0.35 + r2 * 0.9 + (slot % 2 === 0 ? 0.15 : -0.1),
    z: -0.35 + r3 * 0.85 - (slot % 3) * 0.12,
    rx: (r - 0.5) * 0.22,
    ry: (r2 - 0.5) * 0.35,
    rz: (r3 - 0.5) * 0.12,
    s: 0.88 + r * 0.28,
  }
}

export function collagePose(slot: number): Pose {
  const r = seed(slot + 7)
  const r2 = seed(slot + 19)
  const angle = slot * 0.92 + r * 0.6
  const radius = 1.7 + (slot % 4) * 0.55 + r2 * 0.4
  return {
    x: Math.cos(angle) * radius + (r - 0.5) * 0.4,
    y: Math.sin(angle * 0.85) * (1.0 + r * 0.6) + (slot % 2 === 0 ? 0.55 : -0.45),
    z: -1.2 - slot * 0.48 - r2 * 0.7,
    rx: -0.18 + r * 0.25,
    ry: Math.cos(angle) * (0.35 + r * 0.3),
    rz: Math.sin(angle) * 0.18 + (r2 - 0.5) * 0.1,
    s: 0.42 + (1 - Math.min(slot, 7) / 7) * 0.22 + r * 0.08,
  }
}
