import type { EdgeStripGeometry } from "../geometry/edgeStripGeometry";
import {
  BLUR_FRAGMENT_SHADER,
  FULLSCREEN_VERTEX_SHADER,
  OPTICAL_FRAGMENT_SHADER
} from "./shaders";
import type {
  OpticalRenderFrame,
  OpticalRenderer,
  OpticalRendererOptions,
  OpticalRendererStatus
} from "./types";

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  stencil: false
};

type UniformMap = Record<string, WebGLUniformLocation | null>;

function uniform(
  uniforms: UniformMap,
  name: string
): WebGLUniformLocation | null {
  return uniforms[name] ?? null;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sourceDimensions(source: TexImageSource): {
  width: number;
  height: number;
} | null {
  const candidate = source as TexImageSource & {
    displayWidth?: number;
    displayHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    width?: number;
    height?: number;
  };
  let width: number | undefined;
  let height: number | undefined;

  if ("displayWidth" in candidate || "displayHeight" in candidate) {
    width = candidate.displayWidth;
    height = candidate.displayHeight;
  } else if ("videoWidth" in candidate || "videoHeight" in candidate) {
    width = candidate.videoWidth;
    height = candidate.videoHeight;
  } else if ("naturalWidth" in candidate || "naturalHeight" in candidate) {
    width = candidate.naturalWidth;
    height = candidate.naturalHeight;
  } else {
    width = candidate.width;
    height = candidate.height;
  }

  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return { width: Math.round(width), height: Math.round(height) };
}

export function createOpticalRenderer(
  canvas: HTMLCanvasElement,
  options: OpticalRendererOptions = {}
): OpticalRenderer | null {
  const notify = (status: OpticalRendererStatus) => {
    try {
      options.onStatus?.(status);
    } catch {
      // A consumer status handler must not corrupt GPU lifecycle management.
    }
  };
  let gl: WebGL2RenderingContext | null;
  try {
    gl = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    notify({
      state: "fallback",
      reason: "initialization-failed",
      detail
    });
    return null;
  }
  if (!gl) {
    notify({ state: "fallback", reason: "webgl2-unavailable" });
    return null;
  }

  let destroyed = false;
  let operational = true;
  let geometry: EdgeStripGeometry | null = null;
  let sourceWidth = 0;
  let sourceHeight = 0;
  const shaders: WebGLShader[] = [];
  const programs: WebGLProgram[] = [];
  const textures: WebGLTexture[] = [];
  const framebuffers: WebGLFramebuffer[] = [];
  const buffers: WebGLBuffer[] = [];

  const release = () => {
    if (destroyed) return;
    destroyed = true;
    operational = false;
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    for (const framebuffer of framebuffers) gl.deleteFramebuffer(framebuffer);
    for (const texture of textures) gl.deleteTexture(texture);
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    for (const program of programs) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    framebuffers.length = 0;
    textures.length = 0;
    buffers.length = 0;
    programs.length = 0;
    shaders.length = 0;
  };

  const fail = (
    reason:
      | "initialization-failed"
      | "allocation-failed"
      | "upload-failed"
      | "source-size-mismatch",
    error: unknown
  ) => {
    const detail = error instanceof Error ? error.message : String(error);
    release();
    notify({ state: "fallback", reason, detail });
  };

  function handleContextLost(event: Event) {
    event.preventDefault();
    release();
    notify({ state: "fallback", reason: "context-lost" });
  }

  canvas.addEventListener("webglcontextlost", handleContextLost);

  const compileShader = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Unable to allocate a WebGL shader.");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed.");
    }
    return shader;
  };

  const linkProgram = (
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader
  ): WebGLProgram => {
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to allocate a WebGL program.");
    programs.push(program);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Program linking failed.");
    }
    gl.detachShader(program, vertexShader);
    gl.detachShader(program, fragmentShader);
    return program;
  };

  const createTexture = (): WebGLTexture => {
    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to allocate a WebGL texture.");
    textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  };

  const createFramebuffer = (): WebGLFramebuffer => {
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      throw new Error("Unable to allocate a WebGL framebuffer.");
    }
    framebuffers.push(framebuffer);
    return framebuffer;
  };

  let blurProgram: WebGLProgram;
  let opticalProgram: WebGLProgram;
  let sourceTexture: WebGLTexture;
  let horizontalTexture: WebGLTexture;
  let verticalTexture: WebGLTexture;
  let horizontalFramebuffer: WebGLFramebuffer;
  let verticalFramebuffer: WebGLFramebuffer;
  let vertexBuffer: WebGLBuffer;
  let blurUniforms: UniformMap;
  let opticalUniforms: UniformMap;

  try {
    const vertexShader = compileShader(
      gl.VERTEX_SHADER,
      FULLSCREEN_VERTEX_SHADER
    );
    const blurShader = compileShader(gl.FRAGMENT_SHADER, BLUR_FRAGMENT_SHADER);
    const opticalShader = compileShader(
      gl.FRAGMENT_SHADER,
      OPTICAL_FRAGMENT_SHADER
    );
    blurProgram = linkProgram(vertexShader, blurShader);
    opticalProgram = linkProgram(vertexShader, opticalShader);

    for (const shader of shaders) gl.deleteShader(shader);
    shaders.length = 0;

    sourceTexture = createTexture();
    horizontalTexture = createTexture();
    verticalTexture = createTexture();
    horizontalFramebuffer = createFramebuffer();
    verticalFramebuffer = createFramebuffer();
    const allocatedBuffer = gl.createBuffer();
    if (!allocatedBuffer) throw new Error("Unable to allocate a WebGL buffer.");
    vertexBuffer = allocatedBuffer;
    buffers.push(vertexBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    blurUniforms = {
      source: gl.getUniformLocation(blurProgram, "u_source"),
      texelSize: gl.getUniformLocation(blurProgram, "u_texelSize"),
      axis: gl.getUniformLocation(blurProgram, "u_axis"),
      blurRadius: gl.getUniformLocation(blurProgram, "u_blurRadius")
    };
    opticalUniforms = {
      source: gl.getUniformLocation(opticalProgram, "u_source"),
      blurred: gl.getUniformLocation(opticalProgram, "u_blurred"),
      texelSize: gl.getUniformLocation(opticalProgram, "u_texelSize"),
      zoneFraction: gl.getUniformLocation(opticalProgram, "u_zoneFraction"),
      edgePosition: gl.getUniformLocation(opticalProgram, "u_edgePosition"),
      edgeDirection: gl.getUniformLocation(opticalProgram, "u_edgeDirection"),
      refraction: gl.getUniformLocation(opticalProgram, "u_refraction"),
      chromaticAberration: gl.getUniformLocation(
        opticalProgram,
        "u_chromaticAberration"
      ),
      impulse: gl.getUniformLocation(opticalProgram, "u_impulse")
    };
  } catch (error) {
    fail("initialization-failed", error);
    return null;
  }

  const allocateTexture = (
    texture: WebGLTexture,
    width: number,
    height: number
  ) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
  };

  const attachTarget = (
    framebuffer: WebGLFramebuffer,
    texture: WebGLTexture
  ) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("WebGL framebuffer is incomplete.");
    }
  };

  const bindSource = (unit: number, texture: WebGLTexture) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };

  const clearGlErrors = () => {
    // WebGL stores error flags globally on the context. Drain any earlier flags
    // so only errors raised by the following source upload are attributed to it.
    for (let index = 0; index < 16; index += 1) {
      if (gl.getError() === gl.NO_ERROR) return;
    }
  };

  const drawBlurPass = (
    input: WebGLTexture,
    target: WebGLFramebuffer,
    axisX: number,
    axisY: number,
    blurRadius: number
  ) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(blurProgram);
    bindSource(0, input);
    gl.uniform1i(uniform(blurUniforms, "source"), 0);
    gl.uniform2f(
      uniform(blurUniforms, "texelSize"),
      1 / Math.max(1, canvas.width),
      1 / Math.max(1, canvas.height)
    );
    gl.uniform2f(uniform(blurUniforms, "axis"), axisX, axisY);
    gl.uniform1f(uniform(blurUniforms, "blurRadius"), blurRadius);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const renderer: OpticalRenderer = {
    resize(nextGeometry) {
      if (!operational || destroyed) return;
      geometry = nextGeometry;
      const nextWidth = Math.max(1, nextGeometry.textureWidth);
      const nextHeight = Math.max(1, nextGeometry.textureHeight);
      if (
        sourceWidth === nextWidth &&
        sourceHeight === nextHeight &&
        canvas.width === nextWidth &&
        canvas.height === nextHeight
      ) {
        return;
      }
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      sourceWidth = nextWidth;
      sourceHeight = nextHeight;
      try {
        allocateTexture(sourceTexture, canvas.width, canvas.height);
        allocateTexture(horizontalTexture, canvas.width, canvas.height);
        allocateTexture(verticalTexture, canvas.width, canvas.height);
        attachTarget(horizontalFramebuffer, horizontalTexture);
        attachTarget(verticalFramebuffer, verticalTexture);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } catch (error) {
        fail("allocation-failed", error);
      }
    },

    uploadSource(source) {
      if (!operational || destroyed) return;
      try {
        const dimensions = sourceDimensions(source);
        if (
          !dimensions ||
          dimensions.width !== sourceWidth ||
          dimensions.height !== sourceHeight
        ) {
          const actual = dimensions
            ? `${dimensions.width}×${dimensions.height}`
            : "unavailable";
          fail(
            "source-size-mismatch",
            new Error(
              `Source size ${actual} does not match renderer size ${sourceWidth}×${sourceHeight}.`
            )
          );
          return;
        }
        clearGlErrors();
        gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source
        );
        const uploadError = gl.getError();
        if (uploadError !== gl.NO_ERROR) {
          throw new Error(
            `WebGL source upload failed with error 0x${uploadError.toString(16)}.`
          );
        }
      } catch (error) {
        fail("upload-failed", error);
      }
    },

    render(frame: OpticalRenderFrame) {
      if (!operational || destroyed || !geometry) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!frame.enabled) return;

      const dpr = canvas.width / Math.max(1, geometry.cssWidth);
      const blurRadius = (finiteNonNegative(frame.maxBlur) * dpr) / 4;
      drawBlurPass(
        sourceTexture,
        horizontalFramebuffer,
        1,
        0,
        blurRadius
      );
      drawBlurPass(
        horizontalTexture,
        verticalFramebuffer,
        0,
        1,
        blurRadius
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(opticalProgram);
      bindSource(0, sourceTexture);
      bindSource(1, verticalTexture);
      gl.uniform1i(uniform(opticalUniforms, "source"), 0);
      gl.uniform1i(uniform(opticalUniforms, "blurred"), 1);
      gl.uniform2f(
        uniform(opticalUniforms, "texelSize"),
        1 / Math.max(1, sourceWidth),
        1 / Math.max(1, sourceHeight)
      );
      const stripHeight = Math.max(1, geometry.cssHeight);
      const isTop = geometry.edge === "top";
      gl.uniform1f(
        uniform(opticalUniforms, "zoneFraction"),
        Math.max(0, geometry.visibleEnd - geometry.visibleStart) / stripHeight
      );
      gl.uniform1f(
        uniform(opticalUniforms, "edgePosition"),
        1 -
          (isTop ? geometry.visibleStart : geometry.visibleEnd) / stripHeight
      );
      gl.uniform1f(
        uniform(opticalUniforms, "edgeDirection"),
        isTop ? -1 : 1
      );
      gl.uniform1f(
        uniform(opticalUniforms, "refraction"),
        finiteNonNegative(frame.refraction) * dpr
      );
      gl.uniform1f(
        uniform(opticalUniforms, "chromaticAberration"),
        finiteNonNegative(frame.chromaticAberration) * dpr
      );
      gl.uniform1f(
        uniform(opticalUniforms, "impulse"),
        Math.min(1, finiteNonNegative(frame.impulse))
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },

    destroy: release
  };

  notify({ state: "ready" });
  return renderer;
}
