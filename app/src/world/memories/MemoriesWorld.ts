import * as THREE from 'three'
import { memoryVideos } from '../../content/config'
import { circleMaskFragment, photoRevealVertex } from '../shaders'

interface Portal {
  group: THREE.Group
  mesh: THREE.Mesh
  video: HTMLVideoElement
  texture: THREE.VideoTexture
  material: THREE.ShaderMaterial
  playing: boolean
  label: string
}

export class MemoriesWorld {
  readonly group = new THREE.Group()
  readonly portals: Portal[] = []
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()

  constructor() {
    this.group.position.set(0, 0, -42)

    const layout = [
      { x: -2.4, y: 0.9, z: 0.6, s: 1.15 },
      { x: 2.2, y: 1.15, z: -0.3, s: 1.25 },
      { x: -1.7, y: -1.0, z: 0.2, s: 1.05 },
      { x: 2.0, y: -0.85, z: 0.9, s: 1.2 },
    ]

    memoryVideos.forEach((mem, i) => {
      const place = layout[i]
      const video = document.createElement('video')
      video.src = mem.src
      video.crossOrigin = 'anonymous'
      video.loop = true
      video.muted = true
      video.playsInline = true
      video.preload = i === 0 ? 'metadata' : 'none'
      video.setAttribute('playsinline', '')
      video.setAttribute('muted', '')

      const texture = new THREE.VideoTexture(video)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter

      const material = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uMap: { value: texture },
          uSoft: { value: 0.06 },
          uBoost: { value: 0 },
        },
        vertexShader: photoRevealVertex,
        fragmentShader: circleMaskFragment,
      })

      const mesh = new THREE.Mesh(new THREE.CircleGeometry(place.s, 64), material)
      const portalGroup = new THREE.Group()
      portalGroup.position.set(place.x, place.y, place.z)
      portalGroup.add(mesh)

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(place.s * 1.02, place.s * 1.12, 64),
        new THREE.MeshBasicMaterial({
          color: '#d4b483',
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
        }),
      )
      portalGroup.add(ring)

      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(place.s * 1.35, 64),
        new THREE.MeshBasicMaterial({
          color: '#c9a66b',
          transparent: true,
          opacity: 0.05,
          depthWrite: false,
        }),
      )
      halo.position.z = -0.05
      portalGroup.add(halo)

      this.group.add(portalGroup)
      this.portals.push({
        group: portalGroup,
        mesh,
        video,
        texture,
        material,
        playing: false,
        label: mem.label,
      })
    })
  }

  private play(p: Portal): void {
    if (p.video.preload === 'none') {
      p.video.preload = 'auto'
      p.video.load()
    }
    void p.video.play().then(() => {
      p.playing = true
      p.material.uniforms.uBoost.value = 0.18
    }).catch(() => undefined)
  }

  private pause(p: Portal): void {
    p.video.pause()
    p.playing = false
    p.material.uniforms.uBoost.value = 0
  }

  handlePointer(
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
    mode: 'move' | 'leave' | 'tap',
  ): string | null {
    this.pointer.set(ndcX, ndcY)
    this.raycaster.setFromCamera(this.pointer, camera)
    const meshes = this.portals.map((p) => p.mesh)
    const hits = this.raycaster.intersectObjects(meshes, false)
    const hit = hits[0]?.object

    if (mode === 'leave') {
      this.portals.forEach((p) => this.pause(p))
      return null
    }

    if (mode === 'tap') {
      this.portals.forEach((p) => {
        if (p.mesh === hit) {
          if (p.playing) this.pause(p)
          else this.play(p)
        } else {
          this.pause(p)
        }
      })
      const active = this.portals.find((p) => p.mesh === hit)
      return active?.label ?? null
    }

    // hover move (desktop)
    const canHover = window.matchMedia('(hover: hover)').matches
    if (!canHover) return null
    this.portals.forEach((p) => {
      if (p.mesh === hit) this.play(p)
      else this.pause(p)
    })
    return this.portals.find((p) => p.mesh === hit)?.label ?? null
  }

  update(time: number): void {
    this.portals.forEach((p, i) => {
      p.texture.needsUpdate = p.playing
      p.group.position.y += Math.sin(time * 0.5 + i) * 0.0006
      const targetScale = p.playing ? 1.08 : 1
      p.group.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.08,
      )
    })
  }

  setVisible(v: boolean): void {
    this.group.visible = v
  }

  dispose(): void {
    this.portals.forEach((p) => {
      p.video.pause()
      p.video.src = ''
      p.texture.dispose()
      p.mesh.geometry.dispose()
      p.material.dispose()
    })
  }
}
