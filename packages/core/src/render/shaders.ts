export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform vec2 u_axis;
uniform float u_blurRadius;

in vec2 v_uv;
out vec4 outColor;

vec2 safeUv(vec2 uv) {
  vec2 inset = u_texelSize * 0.5;
  return clamp(uv, inset, vec2(1.0) - inset);
}

void main() {
  vec2 offset = u_axis * u_texelSize * max(u_blurRadius, 0.0);
  vec4 color = texture(u_source, safeUv(v_uv)) * 0.227027;
  color += texture(u_source, safeUv(v_uv + offset * 1.384615)) * 0.316216;
  color += texture(u_source, safeUv(v_uv - offset * 1.384615)) * 0.316216;
  color += texture(u_source, safeUv(v_uv + offset * 3.230769)) * 0.070270;
  color += texture(u_source, safeUv(v_uv - offset * 3.230769)) * 0.070270;
  outColor = color;
}
`;

export const OPTICAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_source;
uniform sampler2D u_blurred;
uniform vec2 u_texelSize;
uniform float u_zoneFraction;
uniform float u_edgePosition;
uniform float u_edgeDirection;
uniform float u_refraction;
uniform float u_chromaticAberration;
uniform float u_impulse;

in vec2 v_uv;
out vec4 outColor;

vec2 safeUv(vec2 uv) {
  vec2 inset = u_texelSize * 0.5;
  return clamp(uv, inset, vec2(1.0) - inset);
}

float edgeField() {
  float distanceFromEdge = (v_uv.y - u_edgePosition) * u_edgeDirection;
  float entrance = smoothstep(-u_texelSize.y, 0.0, distanceFromEdge);
  float falloff = 1.0 - smoothstep(0.0, max(u_zoneFraction, u_texelSize.y), distanceFromEdge);
  return clamp(entrance * falloff, 0.0, 1.0);
}

void main() {
  float field = edgeField();
  float opticalBoost = 1.0 + clamp(u_impulse, 0.0, 1.0) * 0.22;
  float curve = field * field * (3.0 - 2.0 * field);
  float bend = u_refraction * opticalBoost * curve;
  vec2 refractedUv = safeUv(v_uv + vec2(0.0, -u_edgeDirection * bend * u_texelSize.y));
  vec2 dispersion = vec2(u_chromaticAberration * opticalBoost * curve, 0.0) * u_texelSize;

  vec4 sharp = texture(u_source, refractedUv);
  vec4 blurred = texture(u_blurred, refractedUv);
  vec4 redSample = texture(u_blurred, safeUv(refractedUv + dispersion));
  vec4 greenSample = texture(u_blurred, refractedUv);
  vec4 blueSample = texture(u_blurred, safeUv(refractedUv - dispersion));
  vec3 dispersed = vec3(redSample.r, greenSample.g, blueSample.b);
  float dispersedAlpha = max(redSample.a, max(greenSample.a, blueSample.a));
  float dispersionMix = clamp(curve * 0.72, 0.0, 1.0);
  vec3 optical = mix(blurred.rgb, dispersed, dispersionMix);
  float opticalAlpha = mix(blurred.a, dispersedAlpha, dispersionMix);
  vec3 rgb = mix(sharp.rgb, optical, curve);
  float alpha = mix(sharp.a, opticalAlpha, curve) * field;

  outColor = vec4(rgb * field, alpha);
}
`;
