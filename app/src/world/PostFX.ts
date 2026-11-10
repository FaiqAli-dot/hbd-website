import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { vignetteFragment, vignetteVertex } from './shaders'
import type { QualityTier } from '../utils/quality'

export class PostFX {
  readonly composer: EffectComposer
  private bloom: UnrealBloomPass
  private vignette: ShaderPass
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
      tier === 'high' ? 0.45 : 0.28,
      0.7,
      0.85,
    )
    this.composer.addPass(this.bloom)

    this.vignette = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.55 },
        uTime: { value: 0 },
      },
      vertexShader: vignetteVertex,
      fragmentShader: vignetteFragment,
    })
    this.composer.addPass(this.vignette)

    if (!this.enabled) {
      this.bloom.strength = 0.12
    }
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
