import { describe, expect, it } from "vitest";

import {
  BLUR_FRAGMENT_SHADER,
  FULLSCREEN_VERTEX_SHADER,
  OPTICAL_FRAGMENT_SHADER
} from "./shaders";

describe("WebGL shader contracts", () => {
  it("targets GLSL ES 3.00 with explicit source and texel uniforms", () => {
    for (const source of [
      FULLSCREEN_VERTEX_SHADER,
      BLUR_FRAGMENT_SHADER,
      OPTICAL_FRAGMENT_SHADER
    ]) {
      expect(source).toContain("#version 300 es");
    }

    expect(BLUR_FRAGMENT_SHADER).toContain("uniform sampler2D u_source");
    expect(BLUR_FRAGMENT_SHADER).toContain("uniform vec2 u_texelSize");
    expect(OPTICAL_FRAGMENT_SHADER).toContain("uniform sampler2D u_source");
    expect(OPTICAL_FRAGMENT_SHADER).toContain("uniform vec2 u_texelSize");
  });

  it("uses one blur shader with a selectable horizontal or vertical axis", () => {
    expect(BLUR_FRAGMENT_SHADER).toContain("uniform vec2 u_axis");
    expect(BLUR_FRAGMENT_SHADER).toMatch(
      /u_axis\s*\*\s*u_texelSize/
    );
    expect(BLUR_FRAGMENT_SHADER.match(/texture\s*\(/g)?.length).toBeGreaterThan(
      4
    );
  });

  it("computes a continuous physical-edge field instead of discrete bands", () => {
    expect(OPTICAL_FRAGMENT_SHADER).toContain("uniform float u_zoneFraction");
    expect(OPTICAL_FRAGMENT_SHADER).toContain("uniform float u_edgeDirection");
    expect(OPTICAL_FRAGMENT_SHADER).toMatch(/smoothstep\s*\(/);
    expect(OPTICAL_FRAGMENT_SHADER).not.toMatch(/\bfloor\s*\(/);
    expect(OPTICAL_FRAGMENT_SHADER).not.toMatch(/\bstep\s*\(/);
  });

  it("refracts in image space and samples restrained RGB dispersion separately", () => {
    expect(OPTICAL_FRAGMENT_SHADER).toContain("uniform float u_refraction");
    expect(OPTICAL_FRAGMENT_SHADER).toContain(
      "uniform float u_chromaticAberration"
    );
    expect(OPTICAL_FRAGMENT_SHADER).toMatch(/\.r\b/);
    expect(OPTICAL_FRAGMENT_SHADER).toMatch(/\.g\b/);
    expect(OPTICAL_FRAGMENT_SHADER).toMatch(/\.b\b/);
    expect(OPTICAL_FRAGMENT_SHADER.match(/texture\s*\(/g)?.length).toBeGreaterThan(
      3
    );
  });

  it("outputs premultiplied color with alpha driven by the edge field", () => {
    expect(OPTICAL_FRAGMENT_SHADER).toContain("out vec4 outColor");
    expect(OPTICAL_FRAGMENT_SHADER).toContain("float dispersedAlpha");
    expect(OPTICAL_FRAGMENT_SHADER).toMatch(
      /max\s*\(\s*redSample\.a\s*,\s*max\s*\(\s*greenSample\.a\s*,\s*blueSample\.a\s*\)\s*\)/
    );
    expect(OPTICAL_FRAGMENT_SHADER).toMatch(
      /float opticalAlpha\s*=\s*mix\s*\(\s*blurred\.a\s*,\s*dispersedAlpha\s*,\s*dispersionMix\s*\)/
    );
    expect(OPTICAL_FRAGMENT_SHADER).toMatch(
      /float alpha\s*=\s*mix\s*\(\s*sharp\.a\s*,\s*opticalAlpha\s*,\s*curve\s*\)\s*\*\s*field/
    );
    expect(OPTICAL_FRAGMENT_SHADER).toMatch(/rgb\s*\*\s*field/);
    expect(OPTICAL_FRAGMENT_SHADER).toMatch(
      /outColor\s*=\s*vec4\s*\(\s*[^,]+,\s*alpha\s*\)/
    );
  });
});
