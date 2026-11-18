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
  float t = uTime * 0.015;
  // Soft centre lift — edges on #FEF4AF floor, centre #FFFBE0/#FFFDF0 (never mustard)
  float radial = 1.0 - smoothstep(0.15, 1.05, length(uv - 0.5));
  vec3 col = mix(uColorA, uColorB, 0.55 + 0.45 * radial);
  col = mix(col, uColorC, 0.4 * radial);
  // Hard floor: never darker than #FEF4AF
  vec3 floorC = vec3(0.996, 0.957, 0.686);
  col = max(col, floorC);
  gl_FragColor = vec4(col, 1.0);
}
`

export const softParticleVertex = /* glsl */ `
attribute float aScale;
attribute float aSeed;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.4 + aSeed * 6.28) * 0.15;
  p.x += cos(uTime * 0.25 + aSeed * 4.0) * 0.08;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aScale * uSize * uPixelRatio * (1.0 / max(0.4, -mv.z));
  vAlpha = smoothstep(0.0, 1.0, aScale);
  vColor = aColor;
}
`

export const softParticleFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uColorMix;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float alpha = smoothstep(0.38, 0.0, d) * vAlpha * 0.14;
  if (alpha < 0.01) discard;
  vec3 col = mix(vColor, uColor, clamp(uColorMix, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
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
  // Grain only — no edge darkening (mustard vignette was coming from here)
  color.rgb += (grain - 0.5) * uGrain * 0.25;
  color.rgb += vec3(vig * uIntensity * 0.0);
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
uniform float uRim;
uniform float uGlow;
uniform float uWash;
varying vec2 vUv;
void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  // Tight AA disc — keep edge crisp so no navy gap between photo and cobalt halo
  float soft = max(uSoft * 0.55, 0.02);
  float edge0 = 1.0 - soft;
  float mask = 1.0 - smoothstep(edge0, 1.0, r);
  if (mask < 0.01) discard;
  vec4 tex = texture2D(uMap, vUv);
  vec3 col = tex.rgb * (1.0 + uBoost);
  // Soft cream wash for inactive portals — lighten+desaturate, never olive darken
  vec3 creamWash = vec3(1.0, 0.992, 0.941); // #FFFBE0
  float grey = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 washed = mix(vec3(grey), creamWash, 0.72);
  col = mix(col, washed, clamp(uWash, 0.0, 1.0));
  // Cobalt SDF rim — thin when inactive (low uRim), luminous when inviting
  vec3 cobaltGlow = vec3(0.239, 0.482, 0.878); // #3D7BE0
  vec3 cobalt = vec3(0.0, 0.278, 0.671); // #0047AB
  float rimBand = smoothstep(0.94, 0.97, r) * (1.0 - smoothstep(0.98, 0.998, r));
  float rimStr = uRim * (0.9 + uGlow * 0.55);
  col = mix(col, mix(cobalt, cobaltGlow, 0.45), rimBand * rimStr);
  // When inviting, seal the seam with cobalt at the edge
  col = mix(col, cobalt, smoothstep(0.9, 0.99, r) * uGlow * 0.45);
  gl_FragColor = vec4(col, mask * uOpacity);
}
`

export const photoRevealVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
