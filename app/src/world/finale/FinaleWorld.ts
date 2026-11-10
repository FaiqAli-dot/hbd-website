import * as THREE from 'three'
import gsap from 'gsap'
import { finaleCopy } from '../../content/config'
import {
  softParticleFragment,
  softParticleVertex,
} from '../shaders'
import { particleBudget, type QualityTier } from '../../utils/quality'
import { prefersReducedMotion } from '../../utils/motion'
import { sound } from '../../components/sound'

function makeLetterTexture(ch: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 256, 256)
  ctx.fillStyle = '#f3e6d2'
  ctx.font = 'bold 180px Syne, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ch, 128, 140)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

interface LetterPiece {
  mesh: THREE.Mesh
  from: THREE.Vector3
}

export class FinaleWorld {
  readonly group = new THREE.Group()
  private letters: LetterPiece[] = []
  private points: THREE.Points
  private mat: THREE.ShaderMaterial
  private played = false
  private count: number
  private light: THREE.PointLight

  constructor(tier: QualityTier) {
    this.group.position.set(0, 0, -62)

    const chars = finaleCopy.headline.replace(/\s/g, '').split('')
    const spacing = 0.72
    const totalW = (chars.length - 1) * spacing
    const dirs = [
      new THREE.Vector3(-8, 2, -4),
      new THREE.Vector3(8, -1, -3),
      new THREE.Vector3(0, 6, -5),
      new THREE.Vector3(-5, -5, -2),
      new THREE.Vector3(6, 4, -6),
      new THREE.Vector3(-7, 0, 2),
      new THREE.Vector3(4, -6, -1),
      new THREE.Vector3(0, 5, 3),
      new THREE.Vector3(-3, 3, -7),
      new THREE.Vector3(5, 1, 4),
      new THREE.Vector3(-2, -4, 3),
      new THREE.Vector3(3, 5, -2),
      new THREE.Vector3(-6, 2, 1),
    ]

    chars.forEach((ch, i) => {
      const tex = makeLetterTexture(ch)
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        roughness: 0.35,
        metalness: 0.25,
        emissive: new THREE.Color('#d4b483'),
        emissiveIntensity: 0.35,
        emissiveMap: tex,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), mat)
      const targetX = -totalW / 2 + i * spacing
      // Space between HAPPY / BIRTHDAY
      const gap = i >= 5 ? 0.35 : 0
      mesh.position.set(targetX + (i >= 5 ? gap : 0), i >= 5 ? -0.55 : 0.45, 0)
      const from = dirs[i % dirs.length].clone()
      mesh.position.copy(from)
      mesh.scale.setScalar(0.2)
      this.group.add(mesh)
      this.letters.push({ mesh, from })
      // store target on userData
      mesh.userData.target = new THREE.Vector3(
        -totalW / 2 + i * spacing + (i >= 5 ? 0.25 : 0),
        i >= 5 ? -0.55 : 0.45,
        0,
      )
    })

    this.count = particleBudget(tier).finale
    const positions = new Float32Array(this.count * 3)
    const scales = new Float32Array(this.count)
    const seeds = new Float32Array(this.count)
    for (let i = 0; i < this.count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6
      scales[i] = 0.4 + Math.random()
      seeds[i] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: softParticleVertex,
      fragmentShader: softParticleFragment,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSize: { value: tier === 'low' ? 18 : 28 },
        uColor: { value: new THREE.Color('#f0d7b0') },
      },
    })
    this.points = new THREE.Points(geo, this.mat)
    this.group.add(this.points)

    this.light = new THREE.PointLight('#ffd5a0', 0, 24)
    this.light.position.set(0, 0, 2)
    this.group.add(this.light)
  }

  play(camera: THREE.PerspectiveCamera): void {
    if (this.played) return
    this.played = true
    sound.play('finale', 0.55)
    const reduced = prefersReducedMotion()

    if (reduced) {
      this.letters.forEach((l) => {
        l.mesh.position.copy(l.mesh.userData.target as THREE.Vector3)
        l.mesh.scale.setScalar(1)
        ;(l.mesh.material as THREE.MeshStandardMaterial).opacity = 1
      })
      this.light.intensity = 2.4
      return
    }

    const tl = gsap.timeline()
    this.letters.forEach((l, i) => {
      const target = l.mesh.userData.target as THREE.Vector3
      const mat = l.mesh.material as THREE.MeshStandardMaterial
      tl.to(
        l.mesh.position,
        {
          x: target.x,
          y: target.y,
          z: target.z,
          duration: 1.15,
          ease: 'back.out(1.6)',
        },
        0.08 * i,
      )
      tl.to(l.mesh.scale, { x: 1.08, y: 1.08, z: 1, duration: 0.9, ease: 'power3.out' }, 0.08 * i)
      tl.to(l.mesh.scale, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'power2.inOut' }, 0.08 * i + 0.85)
      tl.to(mat, { opacity: 1, duration: 0.4 }, 0.08 * i)
    })
    tl.to(this.light, { intensity: 3.4, duration: 1.6, ease: 'power2.out' }, 0.2)
    tl.to(camera.position, { z: camera.position.z - 1.1, duration: 2.2, ease: 'power3.inOut' }, 0)
    tl.fromTo(
      this.mat.uniforms.uSize,
      { value: 10 },
      { value: 30, duration: 1.4, ease: 'power2.out' },
      0.5,
    )
  }

  /** Called when portals dissolve into this scene */
  absorbFromPortals(portalPositions: THREE.Vector3[]): void {
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    portalPositions.forEach((p, i) => {
      const idx = i % this.count
      pos.setXYZ(idx, p.x - this.group.position.x, p.y - this.group.position.y, p.z - this.group.position.z)
    })
    pos.needsUpdate = true
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time
    if (this.played && !prefersReducedMotion()) {
      this.letters.forEach((l, i) => {
        l.mesh.position.y += Math.sin(time * 0.8 + i) * 0.00035
      })
    }
  }

  dispose(): void {
    this.letters.forEach((l) => {
      l.mesh.geometry.dispose()
      const m = l.mesh.material as THREE.MeshStandardMaterial
      m.map?.dispose()
      m.emissiveMap?.dispose()
      m.dispose()
    })
    this.points.geometry.dispose()
    this.mat.dispose()
  }
}
