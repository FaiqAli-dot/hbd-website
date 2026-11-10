import * as THREE from 'three'
import { circlePhotos } from '../../content/config'
import { circleMaskFragment, photoRevealVertex } from '../shaders'

export class LetterWorld {
  readonly group = new THREE.Group()
  private discs: THREE.Mesh[] = []
  private mats: THREE.ShaderMaterial[] = []
  private loader = new THREE.TextureLoader()

  constructor() {
    this.group.position.set(0, 0, -22)

    const frame = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 3.35, 64),
      new THREE.MeshBasicMaterial({
        color: '#d4b483',
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      }),
    )
    frame.position.z = -1
    this.group.add(frame)

    const placements = [
      { x: -2.6, y: 1.4, z: 0.4, s: 0.95 },
      { x: 2.8, y: 1.1, z: -0.2, s: 1.15 },
      { x: -2.9, y: -0.6, z: 0.8, s: 0.8 },
      { x: 2.4, y: -1.0, z: 0.2, s: 1.0 },
      { x: -1.6, y: -1.6, z: -0.5, s: 0.7 },
      { x: 1.7, y: 0.2, z: 1.1, s: 0.75 },
    ]

    circlePhotos.forEach((photo, i) => {
      const place = placements[i] ?? placements[0]
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uMap: { value: null },
          uSoft: { value: 0.08 },
          uBoost: { value: 0.05 },
        },
        vertexShader: photoRevealVertex,
        fragmentShader: circleMaskFragment,
      })
      this.mats.push(mat)
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(place.s, 64), mat)
      mesh.position.set(place.x, place.y, place.z)
      this.discs.push(mesh)
      this.group.add(mesh)

      // thin luminous rim
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(place.s * 0.98, place.s * 1.05, 64),
        new THREE.MeshBasicMaterial({
          color: '#e8c9a0',
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
        }),
      )
      rim.position.copy(mesh.position)
      rim.position.z -= 0.01
      this.group.add(rim)

      this.loader.load(photo.src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        mat.uniforms.uMap.value = tex
      })
    })
  }

  update(time: number, pointer: { x: number; y: number }): void {
    this.discs.forEach((mesh, i) => {
      const seed = i * 1.7
      mesh.position.y += Math.sin(time * 0.6 + seed) * 0.0009
      mesh.rotation.z = Math.sin(time * 0.35 + seed) * 0.04
      mesh.rotation.y = pointer.x * 0.15 + Math.sin(time * 0.2 + seed) * 0.05
      mesh.rotation.x = -pointer.y * 0.1
    })
  }

  setVisible(v: boolean): void {
    this.group.visible = v
  }

  dispose(): void {
    this.discs.forEach((m) => {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    })
  }
}
