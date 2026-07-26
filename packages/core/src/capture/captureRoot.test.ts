// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CAPTURE_LIMITS,
  captureRoot,
  rebaseCssUrls
} from "./captureRoot";

function defineSize(element: HTMLElement, width: number, height: number) {
  Object.defineProperties(element, {
    scrollWidth: { configurable: true, value: width },
    scrollHeight: { configurable: true, value: height }
  });
}

function expectDisconnected(element: HTMLElement | null) {
  expect(element).not.toBeNull();
  expect(element?.isConnected).toBe(false);
}

function createDrawableCanvas() {
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue(
    { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
  );
  return canvas;
}

function canvasForCapture(options: {
  width?: number;
  height?: number;
  scale?: number;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((options.width ?? 1) * (options.scale ?? 1));
  canvas.height = Math.round((options.height ?? 1) * (options.scale ?? 1));
  vi.spyOn(canvas, "getContext").mockReturnValue({
    getImageData: () => ({
      data: new Uint8ClampedArray([0, 0, 0, 255])
    })
  } as unknown as CanvasRenderingContext2D);
  return canvas;
}

function makeCaptureReadable(
  canvas: HTMLCanvasElement
): HTMLCanvasElement {
  vi.spyOn(canvas, "getContext").mockReturnValue({
    getImageData: () => ({
      data: new Uint8ClampedArray([0, 0, 0, 255])
    })
  } as unknown as CanvasRenderingContext2D);
  return canvas;
}

afterEach(() => {
  defineSize(document.body, 0, 0);
  defineSize(document.documentElement, 0, 0);
  Object.defineProperties(window, {
    scrollX: { configurable: true, value: 0 },
    scrollY: { configurable: true, value: 0 }
  });
});

describe("rebaseCssUrls", () => {
  it("rebases relative CSS assets and preserves absolute, root, data, and fragment URLs", () => {
    const css = [
      "a{background:url(../img/a.png)}",
      "b{background:url('/img/b.png')}",
      "c{background:url(data:image/png;base64,abc)}",
      "d{filter:url(#blur)}"
    ].join("");

    expect(rebaseCssUrls(css, "https://example.test/css/main.css")).toContain(
      "url(https://example.test/img/a.png)"
    );
    expect(rebaseCssUrls(css, "https://example.test/css/main.css")).toContain(
      "url('/img/b.png')"
    );
    expect(rebaseCssUrls(css, "https://example.test/css/main.css")).toContain(
      "url(data:image/png;base64,abc)"
    );
    expect(rebaseCssUrls(css, "https://example.test/css/main.css")).toContain(
      "url(#blur)"
    );
  });
});

describe("captureRoot", () => {
  it.each([30_000, 40_000])(
    "rejects a %ipx page before capture or canvas allocation",
    async (height) => {
      defineSize(document.body, 1_000, height);
      const capture = vi.fn();
      const createCanvas = vi.fn();

      expect(await captureRoot({
        root: document.body,
        capture,
        createCanvas
      })).toMatchObject({
        status: "fallback",
        reason: "capture-too-large"
      });
      expect(DEFAULT_CAPTURE_LIMITS.maxDimension).toBeLessThan(height);
      expect(capture).not.toHaveBeenCalled();
      expect(createCanvas).not.toHaveBeenCalled();
    }
  );

  it("rejects zero, mismatched, and transparently blank capture output", async () => {
    defineSize(document.body, 100, 80);
    const zero = document.createElement("canvas");
    zero.width = 0;
    zero.height = 0;
    expect(await captureRoot({
      root: document.body,
      capture: async () => zero
    })).toMatchObject({ status: "fallback", reason: "capture-invalid" });

    const mismatch = document.createElement("canvas");
    mismatch.width = 198;
    mismatch.height = 160;
    expect(await captureRoot({
      root: document.body,
      pixelRatio: 2,
      capture: async () => mismatch
    })).toMatchObject({ status: "fallback", reason: "capture-invalid" });

    const blank = document.createElement("canvas");
    blank.width = 100;
    blank.height = 80;
    vi.spyOn(blank, "getContext").mockReturnValue({
      getImageData: () => ({ data: new Uint8ClampedArray(4) })
    } as unknown as CanvasRenderingContext2D);
    expect(await captureRoot({
      root: document.body,
      capture: async () => blank
    })).toMatchObject({ status: "fallback", reason: "capture-invalid" });
  });

  it("returns security-error when capture readback is origin-unclean", async () => {
    defineSize(document.body, 100, 80);
    const tainted = document.createElement("canvas");
    tainted.width = 100;
    tainted.height = 80;
    vi.spyOn(tainted, "getContext").mockReturnValue({
      getImageData: () => {
        throw new DOMException("Canvas is tainted", "SecurityError");
      }
    } as unknown as CanvasRenderingContext2D);

    expect(await captureRoot({
      root: document.body,
      capture: async () => tainted
    })).toMatchObject({ status: "fallback", reason: "security-error" });

    const unreadable = document.createElement("canvas");
    unreadable.width = 100;
    unreadable.height = 80;
    vi.spyOn(unreadable, "getContext").mockReturnValue({
      getImageData: () => {
        throw new Error("Readback failed");
      }
    } as unknown as CanvasRenderingContext2D);
    expect(await captureRoot({
      root: document.body,
      capture: async () => unreadable
    })).toMatchObject({ status: "fallback", reason: "capture-invalid" });
  });

  it("reports the exact pixel ratio used for the captured document texture", async () => {
    const root = document.createElement("main");
    defineSize(root, 120, 80);
    document.body.append(root);
    expect(await captureRoot({
      root,
      pixelRatio: 2,
      capture: async (_mirror, options) => canvasForCapture(options),
      createCanvas: createDrawableCanvas
    })).toMatchObject({
      status: "ready",
      pixelRatio: 2,
      origin: { x: 0, y: 0 }
    });
    root.remove();
  });

  it("stabilizes an offset non-body capture into full document coordinates", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 50);
    defineSize(document.documentElement, 1_200, 2_000);
    defineSize(document.body, 1_200, 2_000);
    Object.defineProperties(window, {
      scrollX: { configurable: true, value: 10 },
      scrollY: { configurable: true, value: 20 }
    });
    root.getBoundingClientRect = () => ({
      x: 30,
      y: 400,
      left: 30,
      top: 400,
      right: 130,
      bottom: 450,
      width: 100,
      height: 50,
      toJSON: () => ({})
    });
    document.body.append(root);
    const localCanvas = document.createElement("canvas");
    localCanvas.width = 2_400;
    localCanvas.height = 4_000;
    makeCaptureReadable(localCanvas);
    const context = { drawImage: vi.fn() };
    const stableCanvas = document.createElement("canvas");
    vi.spyOn(stableCanvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );

    const result = await captureRoot({
      root,
      pixelRatio: 2,
      capture: async () => localCanvas,
      createCanvas: () => stableCanvas
    });

    expect(result).toEqual({
      status: "ready",
      canvas: stableCanvas,
      pixelRatio: 2,
      origin: { x: 0, y: 0 },
      fontsPending: false,
      refreshRecommended: false
    });
    expect(stableCanvas).toMatchObject({ width: 2_400, height: 4_000 });
    expect(context.drawImage).toHaveBeenCalledWith(
      localCanvas,
      80,
      840,
      200,
      100,
      80,
      840,
      200,
      100
    );
    root.remove();
    Object.defineProperties(window, {
      scrollX: { configurable: true, value: 0 },
      scrollY: { configurable: true, value: 0 }
    });
  });

  it("omits scripts, noscript, videos, internal nodes, and user-excluded nodes", async () => {
    const root = document.createElement("main");
    root.innerHTML = `
      <p id="keep">Keep</p>
      <script id="script"></script>
      <noscript id="noscript"></noscript>
      <video id="video" class="media" style="width: 240px; height: 135px" poster="/poster.jpg"></video>
      <div id="internal" data-soft-optics-internal></div>
      <div id="exclude" class="omit"></div>
      <div id="predicate"></div>
    `;
    document.body.append(root);
    defineSize(root, 300, 500);
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(mirror.querySelector("#keep")).not.toBeNull();
      for (const id of ["script", "noscript", "internal", "exclude"]) {
        expect(mirror.querySelector(`#${id}`)).toBeNull();
      }
      expect(mirror.querySelector("video")).toBeNull();
      const poster = mirror.querySelector(
        "img[data-soft-optics-video-poster]"
      ) as HTMLImageElement | null;
      expect(poster).not.toBeNull();
      expect(poster?.className).toBe("media");
      expect(poster?.style.width).toBe("240px");
      expect(poster?.style.height).toBe("135px");
      expect(poster?.src).toBe("http://localhost:3000/poster.jpg");
      return canvasForCapture(options);
    });

    expect(await captureRoot({
      root,
      exclude: ".omit",
      capture,
      createCanvas: createDrawableCanvas
    })).toMatchObject({
      status: "ready"
    });
    expect(capture).toHaveBeenCalledOnce();

    const predicateCapture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(mirror.querySelector("#predicate")).toBeNull();
      return canvasForCapture(options);
    });
    await captureRoot({
      root,
      exclude: (node) =>
        node.nodeType === 1 && (node as Element).id === "predicate",
      capture: predicateCapture,
      createCanvas: createDrawableCanvas
    });
    root.remove();
  });

  it("keeps an element when the exclusion predicate throws for that element", async () => {
    const root = document.createElement("main");
    root.innerHTML = '<span id="predicate-element">Keep element</span>';
    defineSize(root, 300, 200);
    document.body.append(root);
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(mirror.querySelector("#predicate-element")).not.toBeNull();
      return canvasForCapture(options);
    });

    const result = await captureRoot({
      root,
      exclude: (node) => {
        if (
          node.nodeType === 1 &&
          (node as Element).id === "predicate-element"
        ) {
          throw new Error("consumer predicate failed");
        }
        return false;
      },
      capture,
      createCanvas: createDrawableCanvas
    });

    expect(result).toMatchObject({ status: "ready" });
    expect(capture).toHaveBeenCalledOnce();
    root.remove();
  });

  it("keeps a non-element node when the exclusion predicate throws for it", async () => {
    const root = document.createElement("main");
    root.append(document.createTextNode("Keep text"));
    defineSize(root, 300, 200);
    document.body.append(root);
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(mirror.textContent).toContain("Keep text");
      return canvasForCapture(options);
    });

    const result = await captureRoot({
      root,
      exclude: (node) => {
        if (
          node.nodeType === Node.TEXT_NODE &&
          node.textContent === "Keep text"
        ) {
          throw new Error("consumer predicate failed");
        }
        return false;
      },
      capture,
      createCanvas: createDrawableCanvas
    });

    expect(result).toMatchObject({ status: "ready" });
    expect(capture).toHaveBeenCalledOnce();
    root.remove();
  });

  it("keeps an inert embed placeholder when the exclusion predicate throws for the embed", async () => {
    const root = document.createElement("main");
    root.innerHTML =
      '<iframe id="predicate-frame" src="https://example.test"></iframe>';
    defineSize(root, 300, 200);
    document.body.append(root);
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(
        mirror.querySelector(
          '[data-soft-optics-embed-placeholder="predicate-frame"]'
        )
      ).not.toBeNull();
      return canvasForCapture(options);
    });

    const result = await captureRoot({
      root,
      exclude: (node) => {
        if (
          node.nodeType === 1 &&
          (node as Element).id === "predicate-frame"
        ) {
          throw new Error("consumer predicate failed");
        }
        return false;
      },
      capture,
      createCanvas: createDrawableCanvas
    });

    expect(result).toMatchObject({ status: "ready" });
    expect(capture).toHaveBeenCalledOnce();
    root.remove();
  });

  it("leaves a faithful inert placeholder when a video has no poster", async () => {
    const root = document.createElement("main");
    const video = document.createElement("video");
    video.className = "hero-video";
    video.style.cssText = "width: 320px; height: 180px";
    root.append(video);
    defineSize(root, 320, 180);
    document.body.append(root);
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(mirror.querySelector("video")).toBeNull();
      const placeholder = mirror.querySelector(
        "[data-soft-optics-video-placeholder]"
      ) as HTMLElement | null;
      expect(placeholder?.className).toBe("hero-video");
      expect(placeholder?.style.width).toBe("320px");
      expect(placeholder?.style.height).toBe("180px");
      return canvasForCapture(options);
    });

    expect(await captureRoot({
      root,
      capture,
      createCanvas: createDrawableCanvas
    })).toMatchObject({ status: "ready" });
    root.remove();
  });

  it("strips event handlers and replaces active embeds with inert layout placeholders", async () => {
    const root = document.createElement("main");
    root.innerHTML = `
      <img id="image" class="media" onload="window.__softOpticsRan = true">
      <iframe id="frame" class="embed" style="width: 300px; height: 180px" src="https://example.test/frame"></iframe>
      <object id="object" class="embed" style="width: 200px; height: 100px" data="https://example.test/object"></object>
      <embed id="embed" class="embed" style="width: 120px; height: 80px" src="https://example.test/embed">
    `;
    defineSize(root, 400, 500);
    document.body.setAttribute("onload", "window.__softOpticsBodyRan = true");
    document.body.append(root);
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(mirror.hasAttribute("onload")).toBe(false);
      expect(mirror.querySelector("#image")?.hasAttribute("onload")).toBe(false);
      expect(mirror.querySelector("iframe, object, embed")).toBeNull();
      for (const id of ["frame", "object", "embed"]) {
        const placeholder = mirror.querySelector(
          `[data-soft-optics-embed-placeholder="${id}"]`
        ) as HTMLElement | null;
        expect(placeholder?.className).toBe("embed");
        expect(placeholder?.style.width).not.toBe("");
        expect(placeholder?.style.height).not.toBe("");
      }
      return canvasForCapture(options);
    });

    expect(await captureRoot({
      root,
      capture,
      createCanvas: createDrawableCanvas
    })).toMatchObject({ status: "ready" });
    expect(
      (window as Window & { __softOpticsRan?: boolean }).__softOpticsRan
    ).not.toBe(true);
    root.remove();
    document.body.removeAttribute("onload");
  });

  it("preserves target attributes in the full body mirror", async () => {
    const root = document.createElement("section");
    root.className = "article";
    root.dataset.kind = "feature";
    root.style.color = "rgb(1, 2, 3)";
    defineSize(root, 640, 900);
    document.body.append(root);
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      const target = mirror.querySelector("section.article") as HTMLElement;
      expect(mirror.tagName).toBe("BODY");
      expect(target.dataset.kind).toBe("feature");
      expect(target.style.color).toBe("rgb(1, 2, 3)");
      expect(options).toMatchObject({ scale: 1 });
      return canvasForCapture(options);
    });

    await captureRoot({ root, capture, createCanvas: createDrawableCanvas });
    root.remove();
  });

  it("recreates the full body layout and inherited attributes", async () => {
    const originalClass = document.body.className;
    const originalStyle = document.body.getAttribute("style");
    document.body.className = "light";
    document.body.style.setProperty("--page-tone", "milk");
    const layout = document.createElement("div");
    layout.className = "layout";
    layout.style.setProperty("--content-tone", "green");
    const root = document.createElement("main");
    root.className = "article";
    defineSize(root, 300, 500);
    layout.append(root);
    const unrelated = document.createElement("aside");
    unrelated.id = "unrelated";
    document.body.append(layout, unrelated);
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      const target = mirror.querySelector(".layout > main");
      expect(mirror.matches("body.light")).toBe(true);
      expect(target).not.toBeNull();
      expect(mirror.ownerDocument.body.style.getPropertyValue("--page-tone"))
        .toBe("milk");
      expect(target?.parentElement?.style.getPropertyValue("--content-tone"))
        .toBe("green");
      expect(mirror.querySelector("#unrelated")).not.toBeNull();
      return canvasForCapture(options);
    });

    expect(await captureRoot({
      root,
      capture,
      createCanvas: createDrawableCanvas
    })).toMatchObject({ status: "ready" });
    expect(capture).toHaveBeenCalledOnce();
    layout.remove();
    unrelated.remove();
    document.body.className = originalClass;
    if (originalStyle === null) document.body.removeAttribute("style");
    else document.body.setAttribute("style", originalStyle);
  });

  it("captures body content with body dimensions and attributes", async () => {
    const originalClass = document.body.className;
    document.body.className = "page-shell";
    defineSize(document.body, 800, 1_200);
    const content = document.createElement("article");
    content.id = "body-content";
    document.body.append(content);
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(mirror.tagName).toBe("BODY");
      expect(mirror.className).toBe("page-shell");
      expect(mirror.querySelector("#body-content")).not.toBeNull();
      expect(options).toMatchObject({ width: 800, height: 1_200 });
      return canvasForCapture(options);
    });

    expect(await captureRoot({ root: document.body, capture })).toMatchObject({
      status: "ready"
    });
    content.remove();
    document.body.className = originalClass;
  });

  it("rebases readable stylesheet rules against their stylesheet URL", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    const styleSheet = {
      href: "https://cdn.example.test/css/main.css",
      cssRules: [{ cssText: ".hero{background:url(../hero.png)}" }],
      ownerNode: null
    } as unknown as CSSStyleSheet;
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(mirror.ownerDocument.head.textContent).toContain(
        "url(https://cdn.example.test/hero.png)"
      );
      return canvasForCapture(options);
    });

    await captureRoot({
      root,
      capture,
      styleSheets: [styleSheet],
      createCanvas: createDrawableCanvas
    });
    expect(capture).toHaveBeenCalledOnce();
    root.remove();
  });

  it("waits for source and mirror fonts before capture", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    const order: string[] = [];
    let resolveSource!: () => void;
    const fontsReady = new Promise<void>((resolve) => {
      resolveSource = () => {
        order.push("source");
        resolve();
      };
    });
    const capture = vi.fn(async (_mirror, options) => {
      expect(order).toEqual(["source", "mirror"]);
      return canvasForCapture(options);
    });
    const promise = captureRoot({
      root,
      fontsReady,
      mirrorFontsReady: async () => {
        order.push("mirror");
      },
      capture,
      createCanvas: createDrawableCanvas
    });
    expect(capture).not.toHaveBeenCalled();
    resolveSource();
    await promise;
    root.remove();
  });

  it.each(["source", "mirror"] as const)(
    "bounds a never-resolving %s font wait and recommends refresh",
    async (pendingStage) => {
      defineSize(document.body, 100, 80);
      const never = new Promise<void>(() => {});
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 80;
      makeCaptureReadable(canvas);
      const capture = vi.fn(async () => canvas);

      const resultPromise = captureRoot({
        root: document.body,
        fontsReady:
          pendingStage === "source" ? never : Promise.resolve(),
        mirrorFontsReady: async () =>
          pendingStage === "mirror" ? never : Promise.resolve(),
        fontTimeoutMs: 20,
        capture
      });
      await Promise.resolve();
      expect(capture).not.toHaveBeenCalled();
      expect(await resultPromise).toMatchObject({
        status: "ready",
        fontsPending: true,
        refreshRecommended: true
      });
      expect(capture).toHaveBeenCalledOnce();
    }
  );

  it("always disposes its hidden mirror on success and failure", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    let frame: HTMLElement | null = null;
    const result = await captureRoot({
      root,
      capture: async (mirror) => {
        frame = mirror.ownerDocument.defaultView?.frameElement as HTMLElement;
        expect(frame?.isConnected).toBe(true);
        throw new Error("capture failed");
      }
    });
    expect(result).toMatchObject({ status: "fallback", reason: "capture-error" });
    expectDisconnected(frame);

    let successFrame: HTMLElement | null = null;
    const ready = await captureRoot({
      root,
      capture: async (mirror, captureOptions) => {
        successFrame = mirror.ownerDocument.defaultView?.frameElement as HTMLElement;
        return canvasForCapture(captureOptions);
      },
      createCanvas: createDrawableCanvas
    });
    expect(ready.status).toBe("ready");
    expectDisconnected(successFrame);
    root.remove();
  });

  it("returns typed security, capture, and canvas fallbacks", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);

    expect(await captureRoot({
      root,
      capture: async () => {
        throw new DOMException("Blocked", "SecurityError");
      }
    })).toMatchObject({ status: "fallback", reason: "security-error" });
    expect(await captureRoot({
      root,
      capture: async () => {
        throw new Error("Failed");
      }
    })).toMatchObject({ status: "fallback", reason: "capture-error" });

    const foreign = document.implementation.createHTMLDocument("foreign");
    const foreignCanvas = foreign.createElement("canvas");
    expect(await captureRoot({
      root,
      capture: async (_mirror, captureOptions) => {
        foreignCanvas.width = Math.round(
          (captureOptions.width ?? 1) * (captureOptions.scale ?? 1)
        );
        foreignCanvas.height = Math.round(
          (captureOptions.height ?? 1) * (captureOptions.scale ?? 1)
        );
        makeCaptureReadable(foreignCanvas);
        return foreignCanvas;
      },
      createCanvas: () => {
        const canvas = document.createElement("canvas");
        vi.spyOn(canvas, "getContext").mockReturnValue(null);
        return canvas;
      }
    })).toMatchObject({ status: "fallback", reason: "canvas-unavailable" });
    root.remove();
  });

  it("copies a foreign-realm canvas into the root owner document", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    const foreign = document.implementation.createHTMLDocument("foreign");
    const foreignCanvas = foreign.createElement("canvas");
    let expectedWidth = 0;
    let expectedHeight = 0;
    const context = { drawImage: vi.fn() };
    const result = await captureRoot({
      root,
      capture: async (_mirror, captureOptions) => {
        expectedWidth = Math.round(
          (captureOptions.width ?? 1) * (captureOptions.scale ?? 1)
        );
        expectedHeight = Math.round(
          (captureOptions.height ?? 1) * (captureOptions.scale ?? 1)
        );
        foreignCanvas.width = expectedWidth;
        foreignCanvas.height = expectedHeight;
        makeCaptureReadable(foreignCanvas);
        return foreignCanvas;
      },
      createCanvas: () => {
        const canvas = document.createElement("canvas");
        vi.spyOn(canvas, "getContext").mockReturnValue(
          context as unknown as CanvasRenderingContext2D
        );
        return canvas;
      }
    });

    expect(result).toMatchObject({ status: "ready" });
    if (result.status === "ready") {
      expect(result.canvas.ownerDocument).toBe(root.ownerDocument);
      expect(result.canvas).toMatchObject({
        width: expectedWidth,
        height: expectedHeight
      });
    }
    expect(context.drawImage).toHaveBeenCalledWith(
      foreignCanvas,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
    root.remove();
  });

  it("clones inaccessible stylesheets or skips them without crashing", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.example.test/main.css";
    document.head.append(link);
    const styleSheet = {
      href: link.href,
      ownerNode: link,
      get cssRules(): never {
        throw new DOMException("Blocked", "SecurityError");
      }
    } as unknown as CSSStyleSheet;
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(
        mirror.ownerDocument.head.querySelector(
          'link[href="https://cdn.example.test/main.css"]'
        )
      ).not.toBeNull();
      return canvasForCapture(options);
    });

    await captureRoot({
      root,
      capture,
      styleSheets: [styleSheet],
      waitForStylesheet: async () => {},
      createCanvas: createDrawableCanvas
    });
    expect(capture).toHaveBeenCalledOnce();
    link.remove();
    root.remove();
  });

  it("clones stylesheet owner nodes with media, alternate, and disabled semantics", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    const link = document.createElement("link");
    link.rel = "alternate stylesheet";
    link.title = "Print theme";
    link.media = "print";
    link.href = "https://cdn.example.test/theme.css";
    link.setAttribute("onload", "window.__duplicatedStylesheetRan = true");
    const styleSheet = {
      href: link.href,
      ownerNode: link,
      cssRules: [{ cssText: ".x{color:red}" }],
      disabled: true,
      media: { mediaText: "print" }
    } as unknown as CSSStyleSheet;
    const waitForStylesheet = vi.fn(async () => {});
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      const clone = mirror.ownerDocument.head.querySelector(
        'link[href="https://cdn.example.test/theme.css"]'
      ) as HTMLLinkElement | null;
      expect(clone?.rel).toBe("alternate stylesheet");
      expect(clone?.title).toBe("Print theme");
      expect(clone?.media).toBe("print");
      expect(clone?.disabled).toBe(true);
      expect(clone?.hasAttribute("onload")).toBe(false);
      expect(
        Array.from(mirror.ownerDocument.head.querySelectorAll("style"))
          .map((style) => style.textContent ?? "")
          .join("")
      ).not.toContain(".x{color:red}");
      return canvasForCapture(options);
    });

    const result = await captureRoot({
      root,
      capture,
      styleSheets: [styleSheet],
      waitForStylesheet,
      createCanvas: createDrawableCanvas
    });
    if (result.status === "fallback") throw result.detail;
    expect(result).toMatchObject({ status: "ready" });
    expect(waitForStylesheet).toHaveBeenCalledOnce();
    root.remove();
  });

  it("flattens ownerless sheets while preserving media and disabled state", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    const styleSheet = {
      href: "https://cdn.example.test/adopted.css",
      ownerNode: null,
      cssRules: [{ cssText: ".x{background:url(../x.png)}" }],
      disabled: true,
      media: { mediaText: "screen and (min-width: 10px)" }
    } as unknown as CSSStyleSheet;
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      const style = mirror.ownerDocument.head.querySelector("style");
      expect(style?.media).toBe("screen and (min-width: 10px)");
      expect(style?.textContent).toContain(
        "url(https://cdn.example.test/x.png)"
      );
      expect(style?.sheet?.disabled).toBe(true);
      return canvasForCapture(options);
    });

    expect(await captureRoot({
      root,
      capture,
      styleSheets: [styleSheet],
      createCanvas: createDrawableCanvas
    })).toMatchObject({ status: "ready" });
    root.remove();
  });

  it("captures the full sibling layout and masks only the target document rect", async () => {
    const before = document.createElement("aside");
    before.className = "before";
    const layout = document.createElement("div");
    layout.className = "layout";
    const lead = document.createElement("span");
    lead.className = "lead";
    const root = document.createElement("main");
    root.className = "target";
    layout.append(lead, root);
    const after = document.createElement("footer");
    after.className = "after";
    document.body.append(before, layout, after);
    defineSize(root, 100, 50);
    defineSize(document.documentElement, 1_200, 2_000);
    defineSize(document.body, 1_200, 2_000);
    root.getBoundingClientRect = () => ({
      x: 40,
      y: 420,
      left: 40,
      top: 420,
      right: 140,
      bottom: 470,
      width: 100,
      height: 50,
      toJSON: () => ({})
    });
    const fullCapture = document.createElement("canvas");
    fullCapture.width = 2_400;
    fullCapture.height = 4_000;
    makeCaptureReadable(fullCapture);
    const context = { drawImage: vi.fn() };
    const stableCanvas = document.createElement("canvas");
    vi.spyOn(stableCanvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    const capture = vi.fn(async (mirror: HTMLElement, options) => {
      expect(mirror.tagName).toBe("BODY");
      expect(mirror.querySelector(".before + .layout .target")).not.toBeNull();
      expect(mirror.querySelector(".lead + main:nth-child(2)")).not.toBeNull();
      expect(mirror.querySelector(".after")).not.toBeNull();
      expect(options).toMatchObject({
        width: 1_200,
        height: 2_000,
        scale: 2
      });
      return fullCapture;
    });

    expect(await captureRoot({
      root,
      pixelRatio: 2,
      capture,
      createCanvas: () => stableCanvas
    })).toMatchObject({ status: "ready", canvas: stableCanvas });
    expect(context.drawImage).toHaveBeenCalledWith(
      fullCapture,
      80,
      840,
      200,
      100,
      80,
      840,
      200,
      100
    );
    before.remove();
    layout.remove();
    after.remove();
  });

  it("waits for a cloned cross-origin stylesheet before capture", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.example.test/wait.css";
    const styleSheet = {
      href: link.href,
      ownerNode: link,
      get cssRules(): never {
        throw new DOMException("Blocked", "SecurityError");
      }
    } as unknown as CSSStyleSheet;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waitForStylesheet = vi.fn(() => ready);
    const capture = vi.fn(async (_mirror, options) =>
      canvasForCapture(options)
    );

    const resultPromise = captureRoot({
      root,
      capture,
      styleSheets: [styleSheet],
      waitForStylesheet,
      stylesheetTimeoutMs: 1_000,
      createCanvas: createDrawableCanvas
    });
    await vi.waitFor(() => expect(waitForStylesheet).toHaveBeenCalledOnce());
    expect(capture).not.toHaveBeenCalled();
    release();
    expect(await resultPromise).toMatchObject({ status: "ready" });
    expect(capture).toHaveBeenCalledOnce();
    root.remove();
  });

  it("continues capture when a cloned stylesheet dispatches an error", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.example.test/error.css";
    const styleSheet = {
      href: link.href,
      ownerNode: link,
      get cssRules(): never {
        throw new DOMException("Blocked", "SecurityError");
      }
    } as unknown as CSSStyleSheet;
    const capture = vi.fn(async (_mirror, options) =>
      canvasForCapture(options)
    );

    const resultPromise = captureRoot({
      root,
      capture,
      styleSheets: [styleSheet],
      stylesheetTimeoutMs: 1_000,
      createCanvas: createDrawableCanvas
    });
    let mirrorLink: HTMLLinkElement | null = null;
    await vi.waitFor(() => {
      const frame = document.querySelector(
        "iframe[data-soft-optics-internal]"
      ) as HTMLIFrameElement | null;
      mirrorLink = frame?.contentDocument?.querySelector(
        'link[href="https://cdn.example.test/error.css"]'
      ) ?? null;
      expect(mirrorLink).not.toBeNull();
    });
    expect(capture).not.toHaveBeenCalled();
    (mirrorLink as HTMLLinkElement | null)?.dispatchEvent(
      new Event("error")
    );
    expect(await resultPromise).toMatchObject({ status: "ready" });
    expect(capture).toHaveBeenCalledOnce();
    root.remove();
  });

  it("bounds stylesheet readiness waits and captures after timeout", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.example.test/timeout.css";
    const styleSheet = {
      href: link.href,
      ownerNode: link,
      get cssRules(): never {
        throw new DOMException("Blocked", "SecurityError");
      }
    } as unknown as CSSStyleSheet;
    const capture = vi.fn(async (_mirror, options) =>
      canvasForCapture(options)
    );
    const neverReady = vi.fn(() => new Promise<void>(() => {}));

    const resultPromise = captureRoot({
      root,
      capture,
      styleSheets: [styleSheet],
      waitForStylesheet: neverReady,
      stylesheetTimeoutMs: 100,
      createCanvas: createDrawableCanvas
    });
    await vi.waitFor(() => expect(neverReady).toHaveBeenCalledOnce());
    expect(capture).not.toHaveBeenCalled();
    expect(await resultPromise).toMatchObject({ status: "ready" });
    expect(capture).toHaveBeenCalledOnce();
    root.remove();
  });

  it("removes an active capture mirror immediately when aborted", async () => {
    const root = document.createElement("main");
    defineSize(root, 100, 100);
    document.body.append(root);
    const controller = new AbortController();

    const capturePromise = captureRoot({
      root,
      signal: controller.signal,
      capture: () => new Promise<HTMLCanvasElement>(() => {})
    });
    await vi.waitFor(() =>
      expect(
        document.querySelector("iframe[data-soft-optics-internal]")
      ).not.toBeNull()
    );

    controller.abort();

    expect(
      document.querySelector("iframe[data-soft-optics-internal]")
    ).toBeNull();
    await expect(capturePromise).resolves.toMatchObject({
      status: "fallback",
      reason: "capture-error",
      detail: expect.objectContaining({ name: "AbortError" })
    });
    root.remove();
  });
});
