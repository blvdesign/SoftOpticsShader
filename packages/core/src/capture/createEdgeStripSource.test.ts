// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { EdgeStripGeometry } from "../geometry/edgeStripGeometry";
import type { CaptureRootReadyResult } from "./captureRoot";
import { createEdgeStripSource } from "./createEdgeStripSource";

function geometry(overrides: Partial<EdgeStripGeometry> = {}): EdgeStripGeometry {
  return {
    edge: "top",
    cssTop: -10,
    cssWidth: 100,
    cssHeight: 50,
    visibleStart: 10,
    visibleEnd: 40,
    textureWidth: 200,
    textureHeight: 100,
    documentTop: -10,
    documentBottom: 40,
    captureTop: 0,
    captureBottom: 40,
    paddingBefore: 10,
    paddingAfter: 0,
    ...overrides
  };
}

function createContext() {
  return {
    resetTransform: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    globalAlpha: 1
  } as unknown as CanvasRenderingContext2D;
}

function capturedTexture(
  canvas: HTMLCanvasElement,
  pixelRatio = 1
): CaptureRootReadyResult {
  return {
    status: "ready",
    canvas,
    pixelRatio,
    origin: { x: 0, y: 0 },
    fontsPending: false,
    refreshRecommended: false
  };
}

describe("createEdgeStripSource", () => {
  it("creates its canvas lazily in a browser document", () => {
    const source = createEdgeStripSource({ context: createContext() });

    expect(source.canvas.ownerDocument).toBe(document);
  });

  it("resizes to texture geometry, resets state, and scales by DPR", () => {
    const canvas = { width: 1, height: 1 } as HTMLCanvasElement;
    const context = createContext();
    const source = createEdgeStripSource({ canvas, context });

    source.update({
      documentTexture: capturedTexture(
        { width: 100, height: 1000 } as HTMLCanvasElement
      ),
      geometry: geometry(),
      videoFrames: []
    });

    expect(canvas).toMatchObject({ width: 200, height: 100 });
    expect(context.resetTransform).toHaveBeenCalled();
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("draws the captured document slice at its padded offset", () => {
    const context = createContext();
    const texture = { width: 100, height: 1000 } as HTMLCanvasElement;
    const source = createEdgeStripSource({
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
      context
    });

    source.update({
      documentTexture: capturedTexture(texture),
      geometry: geometry(),
      videoFrames: []
    });

    expect(context.drawImage).toHaveBeenCalledWith(
      texture,
      0, 0, 100, 40,
      0, 10, 100, 40
    );
  });

  it("samples document source rectangles and boundary rows at capture pixel ratio", () => {
    const context = createContext();
    const canvas = { width: 200, height: 2000 } as HTMLCanvasElement;
    const source = createEdgeStripSource({
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
      context
    });

    source.update({
      documentTexture: capturedTexture(canvas, 2),
      geometry: geometry({
        documentTop: -10,
        documentBottom: 1010,
        cssHeight: 1020,
        textureHeight: 2040,
        captureTop: 0,
        captureBottom: 1000,
        paddingBefore: 10,
        paddingAfter: 10
      }),
      videoFrames: []
    });

    expect(context.drawImage).toHaveBeenCalledWith(
      canvas, 0, 0, 200, 2000, 0, 10, 100, 1000
    );
    expect(context.drawImage).toHaveBeenCalledWith(
      canvas, 0, 0, 200, 2, 0, 0, 100, 10
    );
    expect(context.drawImage).toHaveBeenCalledWith(
      canvas, 0, 1998, 200, 2, 0, 1010, 100, 10
    );
  });

  it("samples an offset root from its stabilized document position", () => {
    const context = createContext();
    const canvas = { width: 2_000, height: 4_000 } as HTMLCanvasElement;
    const source = createEdgeStripSource({
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
      context
    });

    source.update({
      documentTexture: capturedTexture(canvas, 2),
      geometry: geometry({
        documentTop: 420,
        documentBottom: 470,
        captureTop: 420,
        captureBottom: 470,
        paddingBefore: 0,
        paddingAfter: 0
      }),
      videoFrames: []
    });

    expect(context.drawImage).toHaveBeenCalledWith(
      canvas, 0, 840, 200, 100, 0, 0, 100, 50
    );
  });

  it("duplicates the first and last captured rows into boundary padding", () => {
    const context = createContext();
    const texture = { width: 100, height: 1000 } as HTMLCanvasElement;
    const source = createEdgeStripSource({
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
      context
    });

    source.update({
      documentTexture: capturedTexture(texture),
      geometry: geometry({
        documentTop: -10,
        documentBottom: 1010,
        cssHeight: 1020,
        textureHeight: 2040,
        captureTop: 0,
        captureBottom: 1000,
        paddingBefore: 10,
        paddingAfter: 10
      }),
      videoFrames: []
    });

    expect(context.drawImage).toHaveBeenCalledWith(
      texture, 0, 0, 100, 1, 0, 0, 100, 10
    );
    expect(context.drawImage).toHaveBeenCalledWith(
      texture, 0, 999, 100, 1, 0, 1010, 100, 10
    );
  });

  it("composites intersecting video with opacity and rounded clipping", () => {
    const context = createContext();
    const scratchCanvas = { width: 1, height: 1 } as HTMLCanvasElement;
    const scratchContext = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([1, 1, 1, 255]) }))
    } as unknown as CanvasRenderingContext2D;
    const video = {
      readyState: 2,
      videoWidth: 200,
      videoHeight: 100
    } as HTMLVideoElement;
    const source = createEdgeStripSource({
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
      context,
      createScratchSurface: () => ({
        canvas: scratchCanvas,
        context: scratchContext
      })
    });

    expect(source.update({
      documentTexture: capturedTexture(
        { width: 100, height: 1000 } as HTMLCanvasElement
      ),
      geometry: geometry({ documentTop: 100, documentBottom: 150 }),
      videoFrames: [{
        video,
        rect: { x: 10, y: 110, width: 80, height: 40 },
        objectFit: "fill",
        objectPosition: "center",
        opacity: 0.5,
        dynamic: true,
        compositeSafe: true,
        clip: { x: 5, y: 105, width: 90, height: 50, radius: 8 }
      }]
    })).toEqual({ drewVideoFrame: true });

    expect(context.save).toHaveBeenCalled();
    expect(context.roundRect).toHaveBeenCalledWith(5, 5, 90, 50, 8);
    expect(context.clip).toHaveBeenCalled();
    expect(scratchContext.drawImage).toHaveBeenCalledWith(
      video, 0, 0, 200, 100, 0, 0, 160, 80
    );
    expect(context.drawImage).toHaveBeenCalledWith(
      scratchCanvas, 0, 0, 160, 80, 10, 10, 80, 40
    );
    expect(context.restore).toHaveBeenCalled();
    expect(context.globalAlpha).toBe(1);
  });

  it("keeps static capture and restores state when a video draw is blocked", () => {
    const context = createContext();
    vi.mocked(context.drawImage).mockImplementation((source) => {
      if ("videoWidth" in source) {
        throw new DOMException("Tainted", "SecurityError");
      }
    });
    const source = createEdgeStripSource({
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
      context
    });

    expect(source.update({
      documentTexture: capturedTexture(
        { width: 100, height: 1000 } as HTMLCanvasElement
      ),
      geometry: geometry({ documentTop: 100, documentBottom: 150 }),
      videoFrames: [{
        video: {
          readyState: 2,
          videoWidth: 100,
          videoHeight: 100
        } as HTMLVideoElement,
        rect: { x: 0, y: 100, width: 100, height: 50 },
        objectFit: "cover",
        objectPosition: "center",
        opacity: 0.7,
        dynamic: true,
        compositeSafe: true
      }]
    })).toEqual({ drewVideoFrame: false });
    expect(context.restore).not.toHaveBeenCalled();
    expect(context.globalAlpha).toBe(1);
  });

  it("isolates successful video drawing and rejects a readback security error", () => {
    const mainCanvas = { width: 1, height: 1 } as HTMLCanvasElement;
    const context = createContext();
    const mainReadback = vi.fn(() => ({
      data: new Uint8ClampedArray([1, 1, 1, 255])
    }));
    Object.assign(context, { getImageData: mainReadback });
    const scratchCanvas = { width: 1, height: 1 } as HTMLCanvasElement;
    const scratchContext = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        throw new DOMException("Tainted", "SecurityError");
      })
    } as unknown as CanvasRenderingContext2D;
    const source = createEdgeStripSource({
      canvas: mainCanvas,
      context,
      createScratchSurface: () => ({
        canvas: scratchCanvas,
        context: scratchContext
      })
    });
    const documentCanvas = {
      width: 100,
      height: 1_000
    } as HTMLCanvasElement;

    expect(source.update({
      documentTexture: capturedTexture(documentCanvas),
      geometry: geometry({ documentTop: 100, documentBottom: 150 }),
      videoFrames: [{
        video: {
          readyState: 2,
          videoWidth: 100,
          videoHeight: 100
        } as HTMLVideoElement,
        rect: { x: 0, y: 100, width: 100, height: 50 },
        objectFit: "cover",
        objectPosition: "center",
        opacity: 1,
        dynamic: true,
        compositeSafe: true
      }]
    })).toEqual({ drewVideoFrame: false });
    expect(scratchContext.drawImage).toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledWith(
      documentCanvas,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(context.drawImage).not.toHaveBeenCalledWith(
      scratchCanvas,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(() => context.getImageData(0, 0, 1, 1)).not.toThrow();
    expect(mainReadback).toHaveBeenCalledOnce();
  });

  it("rejects an injected context that belongs to another canvas", () => {
    const canvas = { width: 1, height: 1 } as HTMLCanvasElement;
    const otherCanvas = { width: 1, height: 1 } as HTMLCanvasElement;
    const context = Object.assign(createContext(), {
      canvas: otherCanvas
    });

    expect(() => createEdgeStripSource({ canvas, context })).toThrow(
      /different canvas/i
    );
  });

  it("retains the captured poster when a frame is not composite-safe", () => {
    const context = createContext();
    const scratch = vi.fn();
    const source = createEdgeStripSource({
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
      context,
      createScratchSurface: scratch
    });

    expect(source.update({
      documentTexture: capturedTexture(
        { width: 100, height: 1_000 } as HTMLCanvasElement
      ),
      geometry: geometry({ documentTop: 100, documentBottom: 150 }),
      videoFrames: [{
        video: {
          readyState: 2,
          videoWidth: 100,
          videoHeight: 100
        } as HTMLVideoElement,
        rect: { x: 0, y: 100, width: 100, height: 50 },
        objectFit: "cover",
        objectPosition: "center",
        opacity: 1,
        dynamic: true,
        compositeSafe: false
      }]
    })).toEqual({ drewVideoFrame: false });
    expect(scratch).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalledWith(
      expect.objectContaining({ videoWidth: expect.any(Number) }),
      expect.anything()
    );
  });

  it("retains the poster when a runtime frame omits compositeSafe", () => {
    const context = createContext();
    const createScratchSurface = vi.fn();
    const source = createEdgeStripSource({
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
      context,
      createScratchSurface
    });

    expect(source.update({
      documentTexture: capturedTexture(
        { width: 100, height: 1_000 } as HTMLCanvasElement
      ),
      geometry: geometry({ documentTop: 100, documentBottom: 150 }),
      videoFrames: [{
        video: {
          readyState: 2,
          videoWidth: 100,
          videoHeight: 100
        } as HTMLVideoElement,
        rect: { x: 0, y: 100, width: 100, height: 50 },
        objectFit: "cover",
        objectPosition: "center",
        opacity: 1,
        dynamic: true
      } as never]
    })).toEqual({ drewVideoFrame: false });
    expect(createScratchSurface).not.toHaveBeenCalled();
  });

  it("reuses and resets one scratch surface across updates", () => {
    const context = createContext();
    let widthAssignments = 0;
    let width = 1;
    const scratchCanvas = {
      get width() {
        return width;
      },
      set width(value: number) {
        width = value;
        widthAssignments += 1;
      },
      height: 1
    } as HTMLCanvasElement;
    const scratchContext = {
      drawImage: vi.fn(),
      getImageData: vi.fn()
        .mockImplementationOnce(() => {
          throw new DOMException("Tainted", "SecurityError");
        })
        .mockImplementation(() => ({
          data: new Uint8ClampedArray([1, 1, 1, 255])
        }))
    } as unknown as CanvasRenderingContext2D;
    const createScratchSurface = vi.fn(() => ({
      canvas: scratchCanvas,
      context: scratchContext
    }));
    const source = createEdgeStripSource({
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
      context,
      createScratchSurface
    });
    const input = {
      documentTexture: capturedTexture(
        { width: 100, height: 1_000 } as HTMLCanvasElement
      ),
      geometry: geometry({ documentTop: 100, documentBottom: 150 }),
      videoFrames: [{
        video: {
          readyState: 2,
          videoWidth: 100,
          videoHeight: 100
        } as HTMLVideoElement,
        rect: { x: 0, y: 100, width: 100, height: 50 },
        objectFit: "cover" as const,
        objectPosition: "center",
        opacity: 1,
        dynamic: true,
        compositeSafe: true
      }]
    };

    expect(source.update(input)).toEqual({ drewVideoFrame: false });
    expect(source.update(input)).toEqual({ drewVideoFrame: true });

    expect(createScratchSurface).toHaveBeenCalledOnce();
    expect(widthAssignments).toBe(2);
    expect(scratchContext.drawImage).toHaveBeenCalledTimes(2);
  });
});
