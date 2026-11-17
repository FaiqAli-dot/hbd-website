import * as THREE from 'three'
import {
  atmosphereFragment,
  atmosphereVertex,
  softParticleFragment,
  softParticleVertex,
} from './shaders'
import type { QualityTier } from '../utils/quality'
import { particleBudget } from '../utils/quality'

const PALETTES = {
  gallery: ['#0e080d', '#1a0e17', '#2a1522'],
  letter: ['#120a12', '#1c1018', '#321820'],
  memories: ['#0c0810', '#18121c', '#2c1824'],
  finale: ['#140810', '#220e18', '#3a1524'],
} as const

export class Atmosphere {
  readonly background: THREE.Mesh
  readonly dust: THREE.Points
  readonly group = new THREE.Group()
  private bgMat: THREE.ShaderMaterial
  private dustMat: THREE.ShaderMaterial
  private colorA = new THREE.Color(PALETTES.gallery[0])
  private colorB = new THREE.Color(PALETTES.gallery[1])
  private colorC = new THREE.Color(PALETTES.gallery[2])
  private targetA = new THREE.Color(PALETTES.gallery[0])
  private targetB = new THREE.Color(PALETTES.gallery[1])
  private targetC = new THREE.Color(PALETTES.gallery[2])
  private dustSizeTarget = 36
  private dustVisibleTarget = true

  constructor(tier: QualityTier) {
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uColorA: { value: this.colorA.clone() },
        uColorB: { value: this.colorB.clone() },
        uColorC: { value: this.colorC.clone() },
      },
    })
    this.background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat)
    this.background.frustumCulled = false
    this.background.renderOrder = -10

    const budget = particleBudget(tier).dust
    const positions = new Float32Array(budget * 3)
    const scales = new Float32Array(budget)
    const seeds = new Float32Array(budget)
    for (let i = 0; i < budget; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 28
      positions[i * 3 + 1] = (Math.random() - 0.5) * 18
      positions[i * 3 + 2] = -Math.random() * 70
      scales[i] = 0.35 + Math.random() * 1.4
      seeds[i] = Math.random()
    }
    const colors = new Float32Array(budget * 3)
    for (let i = 0; i < budget; i++) {
      colors[i * 3] = 0.91
      colors[i * 3 + 1] = 0.79
      colors[i * 3 + 2] = 0.63
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))

    this.dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: softParticleVertex,
      fragmentShader: softParticleFragment,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
        uSize: { value: tier === 'low' ? 28 : 42 },
        uColor: { value: new THREE.Color('#e8c9a0') },
        uColorMix: { value: 1 },
      },
    })
    this.dust = new THREE.Points(geo, this.dustMat)
    this.group.add(this.dust)
  }

  setPalette(chapter: 'gallery' | 'letter' | 'memories' | 'finale'): void {
    const [a, b, c] = PALETTES[chapter]
    this.targetA.set(a)
    this.targetB.set(b)
    this.targetC.set(c)
    this.dustSizeTarget = chapter === 'finale' ? 12 : chapter === 'gallery' ? 36 : 42
    this.dustVisibleTarget = chapter !== 'finale'
    if (this.dustVisibleTarget) this.dust.visible = true
  }

  update(time: number, scroll: number): void {
    // Soft crossfade between chapter palettes — no hard pops / black frames
    const k = 0.045
    this.colorA.lerp(this.targetA, k)
    this.colorB.lerp(this.targetB, k)
    this.colorC.lerp(this.targetC, k)
    this.bgMat.uniforms.uColorA.value.copy(this.colorA)
    this.bgMat.uniforms.uColorB.value.copy(this.colorB)
    this.bgMat.uniforms.uColorC.value.copy(this.colorC)

    const size = this.dustMat.uniforms.uSize.value as number
    this.dustMat.uniforms.uSize.value = size + (this.dustSizeTarget - size) * 0.06
    if (!this.dustVisibleTarget && size < 14) this.dust.visible = false

    this.bgMat.uniforms.uTime.value = time
    this.bgMat.uniforms.uScroll.value = scroll
    this.dustMat.uniforms.uTime.value = time
    this.dust.rotation.y = time * 0.02
  }

  dispose(): void {
    this.background.geometry.dispose()
    this.bgMat.dispose()
    this.dust.geometry.dispose()
    this.dustMat.dispose()
  }
}
