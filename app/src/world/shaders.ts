/** Shared GLSL snippets and shader materials for the memory chamber */

export const photoRevealVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const photoRevealFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uProgress;
uniform float uDirection; // 0 L, 1 R, 2 U, 3 D
uniform float uTime;
uniform float uGlass;
uniform vec3 uTint;
varying vec2 vUv;

float softNoise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  float n = softNoise(uv * 40.0 + uTime * 0.15) * 0.03;
  float edge;
  if (uDirection < 0.5) edge = uv.x + n;
  else if (uDirection < 1.5) edge = (1.0 - uv.x) + n;
  else if (uDirection < 2.5) edge = uv.y + n;
  else edge = (1.0 - uv.y) + n;

  float reveal = smoothstep(uProgress - 0.12, uProgress + 0.02, edge);
  float mask = 1.0 - reveal;
  vec4 tex = texture2D(uMap, uv);
  float glass = uGlass * (0.12 + 0.1 * sin(uTime + uv.y * 8.0));
  vec3 color = mix(tex.rgb, uTint, 0.08 + glass);
  float alpha = tex.a * mask;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(color, alpha);
}
`

export const atmosphereVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

export const atmosphereFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uScroll;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.04;
  float wash = smoothstep(0.0, 1.0, uv.y + sin(uv.x * 3.0 + t) * 0.08);
  vec3 col = mix(uColorA, uColorB, wash);
  col = mix(col, uColorC, 0.25 + 0.25 * sin(t + uv.x * 2.0 + uScroll));
  float vignette = smoothstep(1.2, 0.35, length(uv - 0.5));
  col *= vignette;
  gl_FragColor = vec4(col, 1.0);
}
`

export const softParticleVertex = /* glsl */ `
attribute float aScale;
attribute float aSeed;
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.4 + aSeed * 6.28) * 0.15;
  p.x += cos(uTime * 0.25 + aSeed * 4.0) * 0.08;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aScale * uSize * uPixelRatio * (1.0 / -mv.z);
  vAlpha = smoothstep(0.0, 1.0, aScale);
}
`

export const softParticleFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float alpha = smoothstep(0.5, 0.0, d) * vAlpha * 0.55;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`

export const vignetteFragment = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  float dist = distance(vUv, vec2(0.5));
  float vig = smoothstep(0.95, 0.35, dist);
  float grain = fract(sin(dot(vUv * (uTime + 20.0), vec2(12.9898, 78.233))) * 43758.5453);
  color.rgb *= mix(1.0 - uIntensity, 1.0, vig);
  color.rgb += (grain - 0.5) * 0.035;
  gl_FragColor = color;
}
`

export const vignetteVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const circleMaskFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uSoft;
uniform float uBoost;
varying vec2 vUv;
void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float mask = 1.0 - smoothstep(1.0 - uSoft, 1.0, r);
  if (mask < 0.01) discard;
  vec4 tex = texture2D(uMap, vUv);
  gl_FragColor = vec4(tex.rgb * (1.0 + uBoost), mask);
}
`
