import * as THREE from 'three'
import gsap from 'gsap'
import type { GestureDirection } from '../content/config'
import { prefersReducedMotion } from '../utils/motion'

/** Stylized low-poly hand mesh used as an in-scene tutorial guide */
export class Hand3D {
  readonly group = new THREE.Group()
  private tween: gsap.core.Timeline | null = null
  private mat: THREE.MeshStandardMaterial

  constructor() {
    this.mat = new THREE.MeshStandardMaterial({
      color: '#e2c7a4',
      roughness: 0.55,
      metalness: 0.08,
      emissive: '#3a2818',
      emissiveIntensity: 0.15,
    })

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.16), this.mat)
    palm.position.set(0, 0, 0)
    this.group.add(palm)

    // Fingers
    const fingerGeo = new THREE.BoxGeometry(0.09, 0.38, 0.09)
    const offsets = [-0.15, -0.05, 0.05, 0.15]
    offsets.forEach((x, i) => {
      const f = new THREE.Mesh(fingerGeo, this.mat)
      f.position.set(x, 0.42, 0)
      f.rotation.x = -0.15 - i * 0.02
      this.group.add(f)
    })

    // Thumb
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), this.mat)
    thumb.position.set(-0.28, 0.05, 0.05)
    thumb.rotation.z = 0.7
    thumb.rotation.y = 0.35
    this.group.add(thumb)

    // Camera-local placement: hand rides with the lens so it stays tasteful
    // in frame while the ribbon camera travels. No glow disc — it read as a
    // stray gold ring in the pull-out collage.
    this.group.position.set(0.55, -0.42, -1.55)
    this.group.scale.setScalar(0.28)
  }

  /** Attach to the active camera so the guide stays in view during travel */
  attachToCamera(camera: THREE.Object3D): void {
    camera.add(this.group)
  }

  demonstrate(direction: GestureDirection | 'scroll-up'): void {
    this.tween?.kill()
    const reduced = prefersReducedMotion()
    const map: Record<string, { x: number; y: number; rz: number }> = {
      left: { x: -0.18, y: 0, rz: 0.25 },
      right: { x: 0.18, y: 0, rz: -0.25 },
      up: { x: 0, y: 0.18, rz: 0 },
      down: { x: 0, y: -0.18, rz: 0 },
      'scroll-up': { x: 0, y: 0.22, rz: 0 },
    }
    const pose = map[direction]
    const base = {
      x: 0.55,
      y: direction === 'scroll-up' ? -0.28 : -0.42,
      z: -1.55,
    }

    this.group.position.set(base.x, base.y, base.z)
    this.group.rotation.set(0.12, -0.2, 0)
    this.group.visible = true

    if (reduced) return

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.45 })
    this.tween = tl
    tl.to(this.group.position, {
      x: base.x + pose.x,
      y: base.y + pose.y,
      duration: 0.85,
      ease: 'power2.inOut',
    })
      .to(this.group.rotation, { z: pose.rz, duration: 0.85, ease: 'power2.inOut' }, 0)
      .to(this.group.position, {
        x: base.x,
        y: base.y,
        duration: 0.55,
        ease: 'power3.out',
      })
      .to(this.group.rotation, { z: 0, duration: 0.45, ease: 'power2.out' }, '<')
  }

  setVisible(v: boolean): void {
    this.group.visible = v
    if (!v) this.tween?.pause()
    else this.tween?.play()
  }

  destroy(): void {
    this.tween?.kill()
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
        else (obj.material as THREE.Material).dispose()
      }
    })
  }
}
