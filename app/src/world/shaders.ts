/** Shared GLSL for the cinematic memory chamber */

export const photoPlaneVertex = /* glsl */ `
varying vec2 vUv;
varying float vDistortion;
uniform float uDistort;
uniform float uTime;
void main() {
  vUv = uv;
  vec3 p = position;
  float wiggle = uDistort * 0.08 * sin(uTime * 6.0 + uv.y * 10.0);
  p.x += wiggle * (uv.y - 0.5);
  p.z += uDistort * 0.05 * cos(uTime * 4.0 + uv.x * 8.0);
  vDistortion = uDistort;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

export const photoPlaneFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uRgbSplit;
uniform float uSoftEdge;
uniform float uTime;
uniform vec3 uTint;
varying vec2 vUv;
varying float vDistortion;

void main() {
  vec2 uv = vUv;
  float split = uRgbSplit * (0.004 + vDistortion * 0.012);
  float r = texture2D(uMap, uv + vec2(split, 0.0)).r;
  float g = texture2D(uMap, uv).g;
  float b = texture2D(uMap, uv - vec2(split, 0.0)).b;
  vec3 color = mix(vec3(r, g, b), uTint, 0.06);

  // Soft organic edge falloff (no hard picture frame)
  float edge = smoothstep(0.0, uSoftEdge, uv.x)
    * smoothstep(0.0, uSoftEdge, uv.y)
    * smoothstep(0.0, uSoftEdge, 1.0 - uv.x)
    * smoothstep(0.0, uSoftEdge, 1.0 - uv.y);

  float grain = fract(sin(dot(uv * (uTime + 12.0), vec2(12.9898, 78.233))) * 43758.5453);
  color += (grain - 0.5) * 0.04 * (0.4 + vDistortion);

  float alpha = uOpacity * edge;
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
  float t = uTime * 0.035;
  float wash = smoothstep(0.0, 1.0, uv.y + sin(uv.x * 2.5 + t) * 0.1);
  vec3 col = mix(uColorA, uColorB, wash);
  col = mix(col, uColorC, 0.2 + 0.2 * sin(t + uv.x * 1.8 + uScroll));
  float vignette = smoothstep(1.15, 0.3, length(uv - 0.5));
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
  gl_PointSize = aScale * uSize * uPixelRatio * (1.0 / max(0.4, -mv.z));
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

export const vignetteGrainFragment = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uIntensity;
uniform float uTime;
uniform float uGrain;
varying vec2 vUv;
void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  float dist = distance(vUv, vec2(0.5));
  float vig = smoothstep(0.95, 0.32, dist);
  float grain = fract(sin(dot(vUv * (uTime + 20.0), vec2(12.9898, 78.233))) * 43758.5453);
  color.rgb *= mix(1.0 - uIntensity, 1.0, vig);
  color.rgb += (grain - 0.5) * uGrain;
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

export const chromaticFragment = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uAmount;
varying vec2 vUv;
void main() {
  vec2 dir = (vUv - 0.5);
  float r = texture2D(tDiffuse, vUv + dir * uAmount).r;
  float g = texture2D(tDiffuse, vUv).g;
  float b = texture2D(tDiffuse, vUv - dir * uAmount).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`

export const circleMaskFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uSoft;
uniform float uBoost;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float mask = 1.0 - smoothstep(1.0 - uSoft, 1.0, r);
  if (mask < 0.01) discard;
  vec4 tex = texture2D(uMap, vUv);
  gl_FragColor = vec4(tex.rgb * (1.0 + uBoost), mask * uOpacity);
}
`

export const photoRevealVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
