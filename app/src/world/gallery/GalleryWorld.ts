import * as THREE from 'three'
import gsap from 'gsap'
import {
  galleryPhotos,
  type GestureDirection,
} from '../../content/config'
import { photoRevealFragment, photoRevealVertex } from '../shaders'
import { prefersReducedMotion } from '../../utils/motion'
import { sound } from '../../components/sound'

const DIR_MAP: Record<GestureDirection, number> = {
  left: 0,
  right: 1,
  up: 2,
  down: 3,
}

interface PhotoCard {
  mesh: THREE.Mesh
  glass: THREE.Mesh
  material: THREE.ShaderMaterial
  index: number
}

function placeholderTexture(): THREE.DataTexture {
  const data = new Uint8Array([36, 28, 22, 255])
  const tex = new THREE.DataTexture(data, 1, 1)
  tex.needsUpdate = true
  return tex
}

export class GalleryWorld {
  readonly group = new THREE.Group()
  private cards: PhotoCard[] = []
  private loader = new THREE.TextureLoader()
  private index = 0
  private seen = new Set<number>()
  private history: number[] = []
  private revealing = false
  private complete = false
  private completeCb: (() => void) | null = null
  private progressCb: (() => void) | null = null
  private textures: THREE.Texture[] = []

  constructor() {
    this.group.position.set(0, 0, 0)

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({
        color: '#c9a66b',
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
      }),
    )
    glow.rotation.x = -Math.PI / 2
    glow.position.y = -2.2
    this.group.add(glow)

    galleryPhotos.forEach((photo, i) => {
      this.textures[i] = placeholderTexture()
      this.ensureCard(i)
      this.loader.load(
        photo.src,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.minFilter = THREE.LinearFilter
          this.textures[i].dispose()
          this.textures[i] = tex
          const card = this.cards[i]
          if (card) card.material.uniforms.uMap.value = tex
        },
        undefined,
        () => {
          /* keep placeholder */
        },
      )
    })
  }

  private ensureCard(i: number): PhotoCard {
    if (this.cards[i]) return this.cards[i]
    const tex = this.textures[i] ?? placeholderTexture()
    const aspect = 0.72
    const h = 2.6
    const w = h * aspect
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uMap: { value: tex },
        uProgress: { value: 0 },
        uDirection: { value: 0 },
        uTime: { value: 0 },
        uGlass: { value: 0.35 },
        uTint: { value: new THREE.Color('#f0e0c8') },
      },
      vertexShader: photoRevealVertex,
      fragmentShader: photoRevealFragment,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    mesh.position.set(0, 0.2, -i * 0.04)

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.12, h + 0.12),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
    )
    glass.position.copy(mesh.position)
    glass.position.z -= 0.01

    const card: PhotoCard = { mesh, glass, material: mat, index: i }
    this.cards[i] = card
    this.group.add(glass, mesh)
    return card
  }

  getProgress(): { seen: number; total: number; index: number; complete: boolean } {
    return {
      seen: this.seen.size,
      total: galleryPhotos.length,
      index: this.index,
      complete: this.complete,
    }
  }

  expectedGesture(): GestureDirection | 'scroll-up' {
    if (this.complete) return 'scroll-up'
    return galleryPhotos[this.index]?.gesture ?? 'scroll-up'
  }

  onComplete(cb: () => void): void {
    this.completeCb = cb
  }

  onProgress(cb: () => void): void {
    this.progressCb = cb
  }

  tryGesture(direction: GestureDirection, camera: THREE.PerspectiveCamera): boolean {
    if (this.revealing || this.complete) return false
    const photo = galleryPhotos[this.index]
    if (!photo || photo.gesture !== direction) return false

    this.revealing = true
    const i = this.index
    const card = this.ensureCard(i)
    card.material.uniforms.uDirection.value = DIR_MAP[direction]
    sound.play('reveal', 0.4)

    const reduced = prefersReducedMotion()
    const camTarget = camera.position.clone()
    const lookShift = { x: 0, y: 0 }
    if (direction === 'left') {
      camTarget.x -= 0.55
      lookShift.x = -0.35
    } else if (direction === 'right') {
      camTarget.x += 0.55
      lookShift.x = 0.35
    } else if (direction === 'up') {
      camTarget.y += 0.45
      lookShift.y = 0.3
    } else {
      camTarget.y -= 0.45
      lookShift.y = -0.3
    }

    const finish = () => {
      this.seen.add(i)
      this.history.push(i)
      this.index = i + 1
      this.revealing = false
      this.progressCb?.()
      if (this.seen.size >= galleryPhotos.length) {
        this.complete = true
        sound.play('transition', 0.35)
        this.completeCb?.()
      }
    }

    if (reduced) {
      card.material.uniforms.uProgress.value = 1.2
      camera.position.set(0, 0.15, 5.2)
      finish()
      return true
    }

    const tl = gsap.timeline({ onComplete: finish })
    tl.to(card.material.uniforms.uProgress, { value: 1.25, duration: 0.85, ease: 'power3.inOut' }, 0)
    tl.to(
      camera.position,
      { x: camTarget.x, y: camTarget.y, z: 4.6, duration: 0.75, ease: 'power2.inOut' },
      0,
    )
    tl.to(camera.position, { x: 0, y: 0.15, z: 5.2, duration: 0.55, ease: 'power3.out' }, 0.7)
    tl.fromTo(
      card.mesh.rotation,
      { y: lookShift.x * 0.4, x: -lookShift.y * 0.25 },
      { y: 0, x: 0, duration: 1.0, ease: 'power3.out' },
      0,
    )
    this.cards.forEach((c, idx) => {
      if (!c || idx >= i) return
      tl.to(c.mesh.position, { z: -0.6 - (i - idx) * 0.35, duration: 0.7, ease: 'power2.out' }, 0)
      tl.to(c.mesh.scale, { x: 0.92, y: 0.92, z: 1, duration: 0.7, ease: 'power2.out' }, 0)
    })

    return true
  }

  undo(camera: THREE.PerspectiveCamera): boolean {
    if (this.history.length === 0) return false
    this.revealing = false
    gsap.killTweensOf(camera.position)
    const last = this.history.pop()
    if (last === undefined) return false
    this.seen.delete(last)
    this.index = last
    this.complete = false
    document.documentElement.classList.remove('gallery-complete')
    document.body.classList.remove('gallery-complete')

    const card = this.cards[last]
    if (card) {
      gsap.killTweensOf(card.material.uniforms.uProgress)
      gsap.to(card.material.uniforms.uProgress, {
        value: 0,
        duration: prefersReducedMotion() ? 0.01 : 0.35,
        ease: 'power2.in',
      })
      gsap.to(card.mesh.position, { z: -last * 0.04, duration: 0.35 })
      gsap.to(card.mesh.scale, { x: 1, y: 1, duration: 0.35 })
    }
    gsap.to(camera.position, { x: 0, y: 0.15, z: 5.2, duration: 0.4, ease: 'power2.out' })
    sound.play('transition', 0.25)
    return true
  }

  shakeHint(root: THREE.Object3D): void {
    if (prefersReducedMotion()) return
    gsap.fromTo(root.rotation, { z: 0 }, { z: 0.04, yoyo: true, repeat: 3, duration: 0.06 })
  }

  update(time: number): void {
    this.cards.forEach((c) => {
      if (!c) return
      c.material.uniforms.uTime.value = time
      c.glass.position.x = c.mesh.position.x
      c.glass.position.y = c.mesh.position.y
      c.glass.rotation.copy(c.mesh.rotation)
    })
  }

  setVisible(v: boolean): void {
    this.group.visible = v
  }

  dispose(): void {
    this.cards.forEach((c) => {
      if (!c) return
      c.mesh.geometry.dispose()
      c.material.dispose()
      c.glass.geometry.dispose()
      ;(c.glass.material as THREE.Material).dispose()
    })
    this.textures.forEach((t) => t.dispose())
  }
}
