import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import {
  chromaticFragment,
  vignetteGrainFragment,
  vignetteVertex,
} from './shaders'
import type { QualityTier } from '../utils/quality'

export class PostFX {
  readonly composer: EffectComposer
  private bloom: UnrealBloomPass
  private vignette: ShaderPass
  private chroma: ShaderPass
  private enabled: boolean

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    tier: QualityTier,
  ) {
    this.enabled = tier !== 'low'
    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, camera))

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      tier === 'high' ? 0.55 : tier === 'medium' ? 0.35 : 0.18,
      0.75,
      0.82,
    )
    this.composer.addPass(this.bloom)

    this.chroma = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uAmount: { value: tier === 'high' ? 0.0018 : tier === 'medium' ? 0.0012 : 0.0006 },
      },
      vertexShader: vignetteVertex,
      fragmentShader: chromaticFragment,
    })
    this.composer.addPass(this.chroma)

    this.vignette = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.58 },
        uTime: { value: 0 },
        uGrain: { value: tier === 'low' ? 0.02 : 0.038 },
      },
      vertexShader: vignetteVertex,
      fragmentShader: vignetteGrainFragment,
    })
    this.composer.addPass(this.vignette)

    // Lightweight "DOF feel": stronger vignette + bloom when low tier skips heavy BokehPass
    if (!this.enabled) {
      this.bloom.strength = 0.12
      this.chroma.uniforms.uAmount.value = 0.0004
    }
  }

  /** Pulse chromatic aberration during fast motion */
  setMotionAmount(amount: number): void {
    const base = this.enabled ? 0.0014 : 0.0005
    this.chroma.uniforms.uAmount.value = base + amount * 0.004
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h)
    this.bloom.setSize(w, h)
  }

  setPixelRatio(ratio: number): void {
    this.composer.setPixelRatio(ratio)
  }

  render(time: number): void {
    this.vignette.uniforms.uTime.value = time
    this.composer.render()
  }

  dispose(): void {
    this.composer.dispose()
  }
}
