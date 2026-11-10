import * as THREE from 'three'
import {
  atmosphereFragment,
  atmosphereVertex,
  softParticleFragment,
  softParticleVertex,
} from './shaders'
import type { QualityTier } from '../utils/quality'
import { particleBudget } from '../utils/quality'

export class Atmosphere {
  readonly background: THREE.Mesh
  readonly dust: THREE.Points
  readonly group = new THREE.Group()
  private bgMat: THREE.ShaderMaterial
  private dustMat: THREE.ShaderMaterial

  constructor(tier: QualityTier) {
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uColorA: { value: new THREE.Color('#07060a') },
        uColorB: { value: new THREE.Color('#1a1218') },
        uColorC: { value: new THREE.Color('#3a2418') },
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
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSize: { value: tier === 'low' ? 28 : 42 },
        uColor: { value: new THREE.Color('#e8c9a0') },
        uColorMix: { value: 1 },
      },
    })
    this.dust = new THREE.Points(geo, this.dustMat)
    this.group.add(this.dust)
  }

  setPalette(chapter: 'gallery' | 'letter' | 'memories' | 'finale'): void {
    const palettes = {
      gallery: ['#07060a', '#1a1218', '#3a2418'],
      letter: ['#08070c', '#16141f', '#2a3340'],
      memories: ['#050508', '#1a1510', '#4a3020'],
      finale: ['#030208', '#120c18', '#5a3a20'],
    } as const
    const [a, b, c] = palettes[chapter]
    this.bgMat.uniforms.uColorA.value.set(a)
    this.bgMat.uniforms.uColorB.value.set(b)
    this.bgMat.uniforms.uColorC.value.set(c)
  }

  update(time: number, scroll: number): void {
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
