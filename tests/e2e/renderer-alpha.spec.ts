import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const coreModuleSource = await readFile(
  new URL("../../packages/core/dist/index.js", import.meta.url),
  "utf8"
);
const coreModuleUrl = `data:text/javascript;base64,${Buffer.from(
  coreModuleSource
).toString("base64")}`;

async function renderScenarios(page: Page) {
  const result = await page.evaluate(async (moduleUrl) => {
    type Edge = "top" | "bottom";
    type Renderer = {
      resize(geometry: Record<string, number | string>): void;
      uploadSource(source: HTMLCanvasElement): void;
      render(frame: {
        enabled: boolean;
        maxBlur: number;
        refraction: number;
        chromaticAberration: number;
        impulse: number;
      }): void;
      destroy(): void;
    };
    type CoreModule = {
      createOpticalRenderer(
        canvas: HTMLCanvasElement,
        options: {
          onStatus(status: {
            state: string;
            reason?: string;
            detail?: string;
          }): void;
        }
      ): Renderer | null;
    };

    const { createOpticalRenderer } = (await import(
      moduleUrl
    )) as CoreModule;

    const geometry = (
      edge: Edge,
      width: number,
      height: number,
      visibleStart: number,
      visibleEnd: number
    ) => ({
      edge,
      cssTop: 0,
      cssWidth: width,
      cssHeight: height,
      visibleStart,
      visibleEnd,
      textureWidth: width,
      textureHeight: height,
      documentTop: 0,
      documentBottom: height,
      captureTop: 0,
      captureBottom: height,
      paddingBefore: 0,
      paddingAfter: 0
    });
    const frame = (chromaticAberration = 0) => ({
      enabled: true,
      maxBlur: 0,
      refraction: 0,
      chromaticAberration,
      impulse: 0
    });
    const pixel = (
      gl: WebGL2RenderingContext,
      x: number,
      y: number
    ) => {
      const value = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
      return Array.from(value);
    };
    const renderOpaqueEdge = (edge: Edge) => {
      const output = document.createElement("canvas");
      const statuses: Array<{
        state: string;
        reason?: string;
        detail?: string;
      }> = [];
      const renderer = createOpticalRenderer(output, {
        onStatus: (status) => statuses.push(status)
      });
      if (!renderer) {
        throw new Error(`Renderer unavailable: ${JSON.stringify(statuses)}`);
      }
      renderer.resize(geometry(edge, 5, 5, 0, 5));
      const source = document.createElement("canvas");
      source.width = 5;
      source.height = 5;
      const context = source.getContext("2d");
      if (!context) throw new Error("2D source context unavailable.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 5, 5);
      renderer.uploadSource(source);
      renderer.render(frame());
      const gl = output.getContext("webgl2");
      if (!gl) throw new Error("Rendered WebGL2 context unavailable.");
      const pixels = {
        bottom: pixel(gl, 2, 0),
        top: pixel(gl, 2, 4)
      };
      renderer.destroy();
      return pixels;
    };
    const renderDispersedTransparency = () => {
      const output = document.createElement("canvas");
      const statuses: Array<{
        state: string;
        reason?: string;
        detail?: string;
      }> = [];
      const renderer = createOpticalRenderer(output, {
        onStatus: (status) => statuses.push(status)
      });
      if (!renderer) {
        throw new Error(`Renderer unavailable: ${JSON.stringify(statuses)}`);
      }
      renderer.resize(geometry("top", 5, 1, 0.5, 1));
      const source = document.createElement("canvas");
      source.width = 5;
      source.height = 1;
      const context = source.getContext("2d");
      if (!context) throw new Error("2D source context unavailable.");
      const sourcePixels = context.createImageData(5, 1);
      sourcePixels.data[3 * 4] = 255;
      sourcePixels.data[3 * 4 + 3] = 255;
      context.putImageData(sourcePixels, 0, 0);
      renderer.uploadSource(source);
      renderer.render(frame(1));
      const gl = output.getContext("webgl2");
      if (!gl) throw new Error("Rendered WebGL2 context unavailable.");
      const value = pixel(gl, 2, 0);
      renderer.destroy();
      return value;
    };
    const renderRefractedMarker = (edge: Edge) => {
      const output = document.createElement("canvas");
      const statuses: Array<{
        state: string;
        reason?: string;
        detail?: string;
      }> = [];
      const renderer = createOpticalRenderer(output, {
        onStatus: (status) => statuses.push(status)
      });
      if (!renderer) {
        throw new Error(`Renderer unavailable: ${JSON.stringify(statuses)}`);
      }
      renderer.resize(geometry(edge, 3, 7, 0, 7));
      const source = document.createElement("canvas");
      source.width = 3;
      source.height = 7;
      const context = source.getContext("2d");
      if (!context) throw new Error("2D source context unavailable.");
      context.fillStyle = "#000000";
      context.fillRect(0, 0, 3, 7);
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 3, 1);
      context.fillStyle = "#0000ff";
      context.fillRect(0, 6, 3, 1);
      renderer.uploadSource(source);
      renderer.render({
        ...frame(),
        refraction: 1.5
      });
      const gl = output.getContext("webgl2");
      if (!gl) throw new Error("Rendered WebGL2 context unavailable.");
      const value = pixel(gl, 1, edge === "top" ? 5 : 1);
      renderer.destroy();
      return value;
    };

    return {
      bottom: renderOpaqueEdge("bottom"),
      bottomRefraction: renderRefractedMarker("bottom"),
      dispersed: renderDispersedTransparency(),
      top: renderOpaqueEdge("top"),
      topRefraction: renderRefractedMarker("top")
    };
  }, coreModuleUrl);

  return result;
}

test("built renderer covers the physical top and bottom edges", async ({
  page
}) => {
  const result = await renderScenarios(page);
  const topAtTopEdge = result.top.top[3] ?? 0;
  const topAtInnerEdge = result.top.bottom[3] ?? 0;
  expect(topAtTopEdge).toBeGreaterThan(220);
  expect(topAtTopEdge).toBeGreaterThan(topAtInnerEdge * 4);

  const bottomAtBottomEdge = result.bottom.bottom[3] ?? 0;
  const bottomAtInnerEdge = result.bottom.top[3] ?? 0;
  expect(bottomAtBottomEdge).toBeGreaterThan(220);
  expect(bottomAtBottomEdge).toBeGreaterThan(bottomAtInnerEdge * 4);
});

test("built renderer refracts top and bottom markers outward", async ({
  page
}) => {
  const result = await renderScenarios(page);
  const [topRed = 0, , topBlue = 0, topAlpha = 0] =
    result.topRefraction;
  expect(topAlpha).toBeGreaterThan(180);
  expect(topRed).toBeGreaterThan(topBlue + 120);

  const [bottomRed = 0, , bottomBlue = 0, bottomAlpha = 0] =
    result.bottomRefraction;
  expect(bottomAlpha).toBeGreaterThan(180);
  expect(bottomBlue).toBeGreaterThan(bottomRed + 120);
});

test("built renderer keeps dispersed transparency premultiplied", async ({
  page
}) => {
  const result = await renderScenarios(page);
  const [red = 0, green = 0, blue = 0, alpha = 0] = result.dispersed;
  expect(red).toBeGreaterThan(0);
  expect(alpha).toBeGreaterThan(0);
  expect(Math.max(red, green, blue)).toBeLessThanOrEqual(alpha + 2);
});
