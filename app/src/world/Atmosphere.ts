import * as THREE from 'three'
import {
  atmosphereFragment,
  atmosphereVertex,
  softParticleFragment,
  softParticleVertex,
} from './shaders'
import type { QualityTier } from '../utils/quality'
import { particleBudget } from '../utils/quality'

/** Butter cream grounds + cobalt dust — shared across chapter crossfades (no navy flashes) */
const PALETTES = {
  gallery: ['#f7e98c', '#fef4af', '#fffbe0'],
  letter: ['#f7e98c', '#fef4af', '#fffbe0'],
  memories: ['#f7e98c', '#fef4af', '#fffbe0'],
  finale: ['#f7e98c', '#fef4af', '#fffbe0'],
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
    // Soft cobalt dust motes on cream (#0047AB → #3D7BE0)
    for (let i = 0; i < budget; i++) {
      const t = Math.random()
      colors[i * 3] = 0.0 + t * 0.239
      colors[i * 3 + 1] = 0.278 + t * 0.204
      colors[i * 3 + 2] = 0.671 + t * 0.207
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))

    this.dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // Normal blend keeps cobalt dust blue on cream (additive washed to white)
      blending: THREE.NormalBlending,
      vertexShader: softParticleVertex,
      fragmentShader: softParticleFragment,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
        uSize: { value: tier === 'low' ? 28 : 42 },
        uColor: { value: new THREE.Color('#0047ab') },
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
    // Snap chapter grounds so mid-frames never flash dark leftovers
    if (chapter === 'letter' || chapter === 'memories' || chapter === 'finale') {
      this.colorA.copy(this.targetA)
      this.colorB.copy(this.targetB)
      this.colorC.copy(this.targetC)
      this.bgMat.uniforms.uColorA.value.copy(this.colorA)
      this.bgMat.uniforms.uColorB.value.copy(this.colorB)
      this.bgMat.uniforms.uColorC.value.copy(this.colorC)
    }
    this.dustSizeTarget =
      chapter === 'finale' ? 10 : chapter === 'letter' ? 0 : chapter === 'gallery' ? 36 : 28
    this.dustVisibleTarget = chapter !== 'finale' && chapter !== 'letter'
    if (this.dustVisibleTarget) this.dust.visible = true
    else this.dust.visible = false
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
    if (!this.dustVisibleTarget) this.dust.visible = false

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
