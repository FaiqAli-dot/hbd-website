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

function sampleTextPoints(text: string, count: number): Float32Array {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 110px Syne, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const pts: number[] = []
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const a = data[(y * width + x) * 4 + 3]
      if (a > 128) {
        pts.push((x / width - 0.5) * 8.5, -(y / height - 0.5) * 2.2, 0)
      }
    }
  }

  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    if (pts.length < 3) {
      out[i * 3] = (Math.random() - 0.5) * 6
      out[i * 3 + 1] = (Math.random() - 0.5) * 2
      out[i * 3 + 2] = 0
      continue
    }
    const idx = Math.floor(Math.random() * (pts.length / 3)) * 3
    out[i * 3] = pts[idx]
    out[i * 3 + 1] = pts[idx + 1]
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.4
  }
  return out
}

export class FinaleWorld {
  readonly group = new THREE.Group()
  private points: THREE.Points
  private mat: THREE.ShaderMaterial
  private targets: Float32Array
  private origins: Float32Array
  private progress = { t: 0 }
  private played = false
  private count: number

  constructor(tier: QualityTier) {
    this.group.position.set(0, 0, -62)
    this.count = particleBudget(tier).finale
    this.targets = sampleTextPoints(finaleCopy.headline, this.count)
    this.origins = new Float32Array(this.count * 3)
    const scales = new Float32Array(this.count)
    const seeds = new Float32Array(this.count)
    for (let i = 0; i < this.count; i++) {
      this.origins[i * 3] = (Math.random() - 0.5) * 16
      this.origins[i * 3 + 1] = (Math.random() - 0.5) * 10
      this.origins[i * 3 + 2] = -4 - Math.random() * 10
      scales[i] = 0.5 + Math.random() * 1.5
      seeds[i] = Math.random()
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.origins.slice(0), 3))
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
        uSize: { value: tier === 'low' ? 22 : 34 },
        uColor: { value: new THREE.Color('#f0d7b0') },
      },
    })
    this.points = new THREE.Points(geo, this.mat)
    this.group.add(this.points)

    const coreLight = new THREE.PointLight('#ffd5a0', 0, 20)
    coreLight.position.set(0, 0, 2)
    this.group.add(coreLight)
    ;(this.group as THREE.Group & { userData: { light: THREE.PointLight } }).userData = {
      light: coreLight,
    }
  }

  play(camera: THREE.PerspectiveCamera): void {
    if (this.played) return
    this.played = true
    sound.play('finale', 0.55)
    const light = (this.group.userData as { light: THREE.PointLight }).light
    const reduced = prefersReducedMotion()

    if (reduced) {
      this.progress.t = 1
      this.applyProgress(1)
      light.intensity = 2.2
      return
    }

    gsap.to(this.progress, {
      t: 1,
      duration: 3.2,
      ease: 'power2.inOut',
      onUpdate: () => this.applyProgress(this.progress.t),
    })
    gsap.to(light, { intensity: 3.2, duration: 2.4, ease: 'power2.out' })
    gsap.fromTo(
      camera.position,
      { z: camera.position.z },
      { z: camera.position.z - 1.2, duration: 2.8, ease: 'power3.inOut' },
    )
    gsap.to(this.group.scale, {
      x: 1.08,
      y: 1.08,
      z: 1,
      duration: 1.6,
      delay: 2.2,
      ease: 'back.out(1.6)',
    })
  }

  private applyProgress(t: number): void {
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < this.count; i++) {
      const ox = this.origins[i * 3]
      const oy = this.origins[i * 3 + 1]
      const oz = this.origins[i * 3 + 2]
      const tx = this.targets[i * 3]
      const ty = this.targets[i * 3 + 1]
      const tz = this.targets[i * 3 + 2]
      const ease = t * t * (3 - 2 * t)
      pos.setXYZ(
        i,
        ox + (tx - ox) * ease,
        oy + (ty - oy) * ease,
        oz + (tz - oz) * ease,
      )
    }
    pos.needsUpdate = true
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time
  }

  setVisible(v: boolean): void {
    this.group.visible = v
  }

  dispose(): void {
    this.points.geometry.dispose()
    this.mat.dispose()
  }
}
