import { describe, expect, it, vi } from "vitest";

import type { EdgeStripGeometry } from "../geometry/edgeStripGeometry";
import { createOpticalRenderer } from "./createOpticalRenderer";
import type { OpticalRendererStatus } from "./types";

type EventHandler = (event: Event) => void;

function geometry(
  overrides: Partial<EdgeStripGeometry> = {}
): EdgeStripGeometry {
  return {
    edge: "top",
    cssTop: -20,
    cssWidth: 400,
    cssHeight: 100,
    visibleStart: 20,
    visibleEnd: 80,
    textureWidth: 800,
    textureHeight: 200,
    documentTop: -20,
    documentBottom: 80,
    captureTop: 0,
    captureBottom: 80,
    paddingBefore: 20,
    paddingAfter: 0,
    ...overrides
  };
}

function createFakeGl(options: {
  compile?: boolean;
  link?: boolean;
  framebufferComplete?: boolean;
  uploadThrows?: boolean;
  initialErrors?: number[];
  subUploadError?: boolean;
} = {}) {
  let nextId = 0;
  const errors = [...(options.initialErrors ?? [])];
  const resource = (kind: string) => ({ kind, id: ++nextId });
  const calls = {
    shaders: [] as object[],
    programs: [] as object[],
    textures: [] as object[],
    framebuffers: [] as object[],
    buffers: [] as object[],
    texImage2D: [] as unknown[][],
    texSubImage2D: [] as unknown[][],
    drawArrays: [] as unknown[][],
    uniform1f: [] as [string, number][],
    uniform2f: [] as [string, number, number][],
    deleteShader: [] as object[],
    deleteProgram: [] as object[],
    deleteTexture: [] as object[],
    deleteFramebuffer: [] as object[],
    deleteBuffer: [] as object[]
  };
  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLE_STRIP: 0x0005,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    COLOR_BUFFER_BIT: 0x4000,
    BLEND: 0x0be2,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    NO_ERROR: 0,
    INVALID_OPERATION: 0x0502,
    createShader: vi.fn(() => {
      const value = resource("shader");
      calls.shaders.push(value);
      return value;
    }),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => options.compile !== false),
    getShaderInfoLog: vi.fn(() => "shader failed"),
    deleteShader: vi.fn((value: object) => calls.deleteShader.push(value)),
    createProgram: vi.fn(() => {
      const value = resource("program");
      calls.programs.push(value);
      return value;
    }),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => options.link !== false),
    getProgramInfoLog: vi.fn(() => "link failed"),
    detachShader: vi.fn(),
    deleteProgram: vi.fn((value: object) => calls.deleteProgram.push(value)),
    createTexture: vi.fn(() => {
      const value = resource("texture");
      calls.textures.push(value);
      return value;
    }),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn((...args: unknown[]) => calls.texImage2D.push(args)),
    texSubImage2D: vi.fn((...args: unknown[]) => {
      if (options.uploadThrows) throw new Error("source upload failed");
      calls.texSubImage2D.push(args);
      if (options.subUploadError) errors.push(0x0502);
    }),
    getError: vi.fn(() => errors.shift() ?? 0),
    pixelStorei: vi.fn(),
    deleteTexture: vi.fn((value: object) => calls.deleteTexture.push(value)),
    createFramebuffer: vi.fn(() => {
      const value = resource("framebuffer");
      calls.framebuffers.push(value);
      return value;
    }),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() =>
      options.framebufferComplete === false ? 0 : 0x8cd5
    ),
    deleteFramebuffer: vi.fn((value: object) =>
      calls.deleteFramebuffer.push(value)
    ),
    createBuffer: vi.fn(() => {
      const value = resource("buffer");
      calls.buffers.push(value);
      return value;
    }),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    deleteBuffer: vi.fn((value: object) => calls.deleteBuffer.push(value)),
    getUniformLocation: vi.fn(
      (_program: object, name: string) => ({ name })
    ),
    useProgram: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn((location: { name: string }, value: number) =>
      calls.uniform1f.push([location.name, value])
    ),
    uniform2f: vi.fn(
      (location: { name: string }, x: number, y: number) =>
        calls.uniform2f.push([location.name, x, y])
    ),
    activeTexture: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    drawArrays: vi.fn((...args: unknown[]) => calls.drawArrays.push(args))
  };

  return { gl, calls };
}

function createCanvas(gl: object | null) {
  const handlers = new Map<string, Set<EventHandler>>();
  const contextRequests: Array<[string, WebGLContextAttributes | undefined]> =
    [];
  const canvas = {
    width: 0,
    height: 0,
    getContext(type: string, attributes?: WebGLContextAttributes) {
      contextRequests.push([type, attributes]);
      return gl;
    },
    addEventListener(type: string, handler: EventHandler) {
      const set = handlers.get(type) ?? new Set<EventHandler>();
      set.add(handler);
      handlers.set(type, set);
    },
    removeEventListener(type: string, handler: EventHandler) {
      handlers.get(type)?.delete(handler);
    },
    emit(type: string, event: Event) {
      handlers.get(type)?.forEach((handler) => handler(event));
    },
    listenerCount(type: string) {
      return handlers.get(type)?.size ?? 0;
    }
  };

  return { canvas, contextRequests };
}

describe("createOpticalRenderer", () => {
  it("requests predictable WebGL2 alpha semantics and reports ready", () => {
    const { gl, calls } = createFakeGl();
    const { canvas, contextRequests } = createCanvas(gl);
    const statuses: OpticalRendererStatus[] = [];

    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement,
      { onStatus: (status) => statuses.push(status) }
    );

    expect(renderer).not.toBeNull();
    expect(contextRequests).toEqual([
      [
        "webgl2",
        {
          alpha: true,
          antialias: false,
          depth: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false,
          stencil: false
        }
      ]
    ]);
    expect(calls.programs).toHaveLength(2);
    expect(calls.deleteShader).toHaveLength(3);
    expect(statuses).toEqual([{ state: "ready" }]);
  });

  it("returns null with a practical fallback reason when WebGL2 is unavailable", () => {
    const { canvas } = createCanvas(null);
    const statuses: OpticalRendererStatus[] = [];

    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement,
      { onStatus: (status) => statuses.push(status) }
    );

    expect(renderer).toBeNull();
    expect(statuses).toEqual([
      { state: "fallback", reason: "webgl2-unavailable" }
    ]);
  });

  it("returns an initialization fallback when requesting WebGL2 throws", () => {
    const statuses: OpticalRendererStatus[] = [];
    const canvas = {
      getContext() {
        throw new DOMException("Canvas already has another context.", "InvalidStateError");
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    expect(() =>
      createOpticalRenderer(canvas as unknown as HTMLCanvasElement, {
        onStatus: (status) => statuses.push(status)
      })
    ).not.toThrow();

    expect(statuses).toEqual([
      {
        state: "fallback",
        reason: "initialization-failed",
        detail: "Canvas already has another context."
      }
    ]);
    expect(canvas.addEventListener).not.toHaveBeenCalled();
  });

  it("allocates exactly three sized textures and two complete ping-pong targets", () => {
    const { gl, calls } = createFakeGl();
    const { canvas } = createCanvas(gl);
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement
    )!;

    renderer.resize(geometry());

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(200);
    expect(calls.textures).toHaveLength(3);
    expect(calls.framebuffers).toHaveLength(2);
    expect(calls.texImage2D).toHaveLength(3);
    for (const allocation of calls.texImage2D) {
      expect(allocation).toEqual(
        expect.arrayContaining([800, 200])
      );
    }
  });

  it("updates same-size geometry without reallocating GPU attachments", () => {
    const { gl, calls } = createFakeGl();
    const { canvas } = createCanvas(gl);
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement
    )!;
    renderer.resize(geometry());
    const allocations = calls.texImage2D.length;
    const attachments = gl.framebufferTexture2D.mock.calls.length;

    renderer.resize(geometry({
      edge: "bottom",
      cssTop: 600,
      visibleStart: 10,
      visibleEnd: 50,
      documentTop: 600,
      documentBottom: 700
    }));
    renderer.render({
      enabled: true,
      maxBlur: 20,
      refraction: 3,
      chromaticAberration: 2,
      impulse: 0
    });

    expect(calls.texImage2D).toHaveLength(allocations);
    expect(gl.framebufferTexture2D).toHaveBeenCalledTimes(attachments);
    expect(calls.uniform1f).toEqual(
      expect.arrayContaining([
        ["u_zoneFraction", 0.4],
        ["u_edgePosition", 0.5],
        ["u_edgeDirection", 1]
      ])
    );
  });

  it("reuses the source texture for matching uploads", () => {
    const { gl, calls } = createFakeGl();
    const { canvas } = createCanvas(gl);
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement
    )!;
    renderer.resize(geometry());
    const allocationsAfterResize = calls.texImage2D.length;

    renderer.uploadSource({ width: 800, height: 200 } as ImageBitmap);
    expect(calls.texSubImage2D).toHaveLength(1);
    expect(calls.texImage2D).toHaveLength(allocationsAfterResize);
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      true
    );
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, true);

  });

  it("rejects a differently sized source and prevents later rendering", () => {
    const { gl, calls } = createFakeGl();
    const { canvas } = createCanvas(gl);
    const statuses: OpticalRendererStatus[] = [];
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement,
      { onStatus: (status) => statuses.push(status) }
    )!;
    renderer.resize(geometry());

    renderer.uploadSource({ width: 1024, height: 256 } as ImageBitmap);
    renderer.render({
      enabled: true,
      maxBlur: 20,
      refraction: 3,
      chromaticAberration: 2,
      impulse: 0
    });

    expect(statuses.at(-1)).toMatchObject({
      state: "fallback",
      reason: "source-size-mismatch"
    });
    expect(calls.texSubImage2D).toHaveLength(0);
    expect(calls.drawArrays).toHaveLength(0);
    expect(calls.deleteTexture).toHaveLength(3);
  });

  it("renders horizontal blur, vertical blur, then the optical composite", () => {
    const { gl, calls } = createFakeGl();
    const { canvas } = createCanvas(gl);
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement
    )!;
    renderer.resize(geometry());

    renderer.render({
      enabled: true,
      maxBlur: 20,
      refraction: 3,
      chromaticAberration: 2,
      impulse: 0.5
    });

    expect(calls.drawArrays).toHaveLength(3);
    expect(calls.uniform2f).toEqual(
      expect.arrayContaining([
        ["u_axis", 1, 0],
        ["u_axis", 0, 1]
      ])
    );
    expect(calls.uniform1f).toEqual(
      expect.arrayContaining([
        ["u_blurRadius", 10],
        ["u_refraction", 6],
        ["u_chromaticAberration", 4],
        ["u_impulse", 0.5]
      ])
    );
    expect(
      calls.uniform1f.find(([name]) => name === "u_edgePosition")?.[1]
    ).toBeCloseTo(0.8);
    expect(calls.uniform1f).toContainEqual(["u_edgeDirection", -1]);
  });

  it("maps a bottom CSS edge into upward-facing WebGL texture coordinates", () => {
    const { gl, calls } = createFakeGl();
    const { canvas } = createCanvas(gl);
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement
    )!;
    renderer.resize(geometry({ edge: "bottom" }));

    renderer.render({
      enabled: true,
      maxBlur: 20,
      refraction: 3,
      chromaticAberration: 2,
      impulse: 0
    });

    expect(
      calls.uniform1f.find(([name]) => name === "u_edgePosition")?.[1]
    ).toBeCloseTo(0.2);
    expect(calls.uniform1f).toContainEqual(["u_edgeDirection", 1]);
  });

  it("clears without optical draws when a frame is disabled", () => {
    const { gl, calls } = createFakeGl();
    const { canvas } = createCanvas(gl);
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement
    )!;
    renderer.resize(geometry());

    renderer.render({
      enabled: false,
      maxBlur: 20,
      refraction: 3,
      chromaticAberration: 2,
      impulse: 0
    });

    expect(calls.drawArrays).toHaveLength(0);
    expect(gl.clear).toHaveBeenCalled();
  });

  it("reports fallback when the WebGL context is lost", () => {
    const { gl, calls } = createFakeGl();
    const { canvas } = createCanvas(gl);
    const statuses: OpticalRendererStatus[] = [];
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement,
      {
        onStatus: (status) => statuses.push(status)
      }
    )!;
    const preventDefault = vi.fn();

    canvas.emit(
      "webglcontextlost",
      { preventDefault } as unknown as Event
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(statuses.at(-1)).toEqual({
      state: "fallback",
      reason: "context-lost"
    });
    expect(canvas.listenerCount("webglcontextlost")).toBe(0);
    expect(calls.deleteTexture).toHaveLength(3);
    expect(calls.deleteFramebuffer).toHaveLength(2);
    expect(calls.deleteProgram).toHaveLength(2);
    expect(calls.deleteBuffer).toHaveLength(1);

    renderer.destroy();
    expect(calls.deleteTexture).toHaveLength(3);
  });

  it("releases every resource and listener exactly once", () => {
    const { gl, calls } = createFakeGl();
    const { canvas } = createCanvas(gl);
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement
    )!;
    renderer.resize(geometry());

    renderer.destroy();
    renderer.destroy();

    expect(canvas.listenerCount("webglcontextlost")).toBe(0);
    expect(calls.deleteProgram).toHaveLength(2);
    expect(calls.deleteTexture).toHaveLength(3);
    expect(calls.deleteFramebuffer).toHaveLength(2);
    expect(calls.deleteBuffer).toHaveLength(1);
  });

  it("cleans partial allocations and reports fallback on initialization failure", () => {
    const { gl, calls } = createFakeGl({ link: false });
    const { canvas } = createCanvas(gl);
    const statuses: OpticalRendererStatus[] = [];

    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement,
      { onStatus: (status) => statuses.push(status) }
    );

    expect(renderer).toBeNull();
    expect(calls.deleteShader.length).toBeGreaterThan(0);
    expect(calls.deleteProgram.length).toBeGreaterThan(0);
    expect(canvas.listenerCount("webglcontextlost")).toBe(0);
    expect(statuses.at(-1)).toMatchObject({
      state: "fallback",
      reason: "initialization-failed"
    });
  });

  it("turns an incomplete framebuffer into fallback without leaking targets", () => {
    const { gl, calls } = createFakeGl({ framebufferComplete: false });
    const { canvas } = createCanvas(gl);
    const statuses: OpticalRendererStatus[] = [];
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement,
      { onStatus: (status) => statuses.push(status) }
    )!;

    renderer.resize(geometry());

    expect(statuses.at(-1)).toMatchObject({
      state: "fallback",
      reason: "allocation-failed"
    });
    expect(calls.deleteTexture).toHaveLength(3);
    expect(calls.deleteFramebuffer).toHaveLength(2);
    expect(calls.deleteProgram).toHaveLength(2);
    expect(calls.deleteBuffer).toHaveLength(1);
  });

  it("turns an invalid source upload into fallback and releases resources", () => {
    const { gl, calls } = createFakeGl({ uploadThrows: true });
    const { canvas } = createCanvas(gl);
    const statuses: OpticalRendererStatus[] = [];
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement,
      { onStatus: (status) => statuses.push(status) }
    )!;
    renderer.resize(geometry());

    expect(() =>
      renderer.uploadSource({ width: 800, height: 200 } as ImageBitmap)
    ).not.toThrow();

    expect(statuses.at(-1)).toMatchObject({
      state: "fallback",
      reason: "upload-failed"
    });
    expect(canvas.listenerCount("webglcontextlost")).toBe(0);
    expect(calls.deleteTexture).toHaveLength(3);
    expect(calls.deleteFramebuffer).toHaveLength(2);
    expect(calls.deleteProgram).toHaveLength(2);
    expect(calls.deleteBuffer).toHaveLength(1);
  });

  it.each([
    ["reused", { subUploadError: true }, { width: 800, height: 200 }]
  ] as const)(
    "turns a WebGL error from a %s source upload into fallback",
    (_kind, fakeOptions, source) => {
      const { gl, calls } = createFakeGl(fakeOptions);
      const { canvas } = createCanvas(gl);
      const statuses: OpticalRendererStatus[] = [];
      const renderer = createOpticalRenderer(
        canvas as unknown as HTMLCanvasElement,
        { onStatus: (status) => statuses.push(status) }
      )!;
      renderer.resize(geometry());

      renderer.uploadSource(source as ImageBitmap);

      expect(statuses.at(-1)).toMatchObject({
        state: "fallback",
        reason: "upload-failed"
      });
      expect(calls.deleteTexture).toHaveLength(3);
      expect(canvas.listenerCount("webglcontextlost")).toBe(0);
    }
  );

  it("drains an earlier WebGL error before attributing errors to an upload", () => {
    const { gl, calls } = createFakeGl({ initialErrors: [0x0502] });
    const { canvas } = createCanvas(gl);
    const statuses: OpticalRendererStatus[] = [];
    const renderer = createOpticalRenderer(
      canvas as unknown as HTMLCanvasElement,
      { onStatus: (status) => statuses.push(status) }
    )!;
    renderer.resize(geometry());

    renderer.uploadSource({ width: 800, height: 200 } as ImageBitmap);

    expect(statuses.at(-1)).toEqual({ state: "ready" });
    expect(calls.deleteTexture).toHaveLength(0);
  });
});
