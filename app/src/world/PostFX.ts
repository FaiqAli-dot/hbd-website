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

/** Restrained cinematic post — premium, not gaming VFX. */
export class PostFX {
  readonly composer: EffectComposer
  private bloom: UnrealBloomPass
  private vignette: ShaderPass
  private chroma: ShaderPass
  private readonly baseChroma: number
  private useComposer: boolean

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    tier: QualityTier,
  ) {
    // Mobile/low: skip bloom+chroma composers; vignette-only or direct render
    this.useComposer = tier !== 'low'
    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, camera))

    const bloomStrength = tier === 'high' ? 0.18 : 0.1
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      bloomStrength,
      0.55,
      0.9,
    )
    this.composer.addPass(this.bloom)

    this.baseChroma = tier === 'high' ? 0.00055 : 0.0003
    this.chroma = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uAmount: { value: this.baseChroma },
      },
      vertexShader: vignetteVertex,
      fragmentShader: chromaticFragment,
    })
    this.composer.addPass(this.chroma)

    this.vignette = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.42 },
        uTime: { value: 0 },
        uGrain: { value: tier === 'high' ? 0.018 : 0.012 },
      },
      vertexShader: vignetteVertex,
      fragmentShader: vignetteGrainFragment,
    })
    this.composer.addPass(this.vignette)

    if (!this.useComposer) {
      this.bloom.strength = 0.06
      this.chroma.uniforms.uAmount.value = 0.00015
      this.vignette.uniforms.uGrain.value = 0.008
    }
  }

  setMotionAmount(amount: number): void {
    // Very subtle motion pulse only
    this.chroma.uniforms.uAmount.value = this.baseChroma + Math.min(1, amount) * 0.00045
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h)
    this.bloom.setSize(w, h)
  }

  setPixelRatio(ratio: number): void {
    this.composer.setPixelRatio(ratio)
  }

  render(time: number, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.useComposer) {
      renderer.render(scene, camera)
      return
    }
    this.vignette.uniforms.uTime.value = time
    this.composer.render()
  }

  dispose(): void {
    this.composer.dispose()
  }
}
