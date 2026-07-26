import {
  expect,
  test as base,
  type Locator,
  type Page
} from "@playwright/test";

export const INTERNAL_SELECTOR = "[data-soft-optics-internal]";
export const EDGE_CANVAS_SELECTOR =
  'canvas[data-soft-optics-internal="canvas"]';
export const DIAGNOSTICS_SELECTOR = "[data-optics-diagnostics]";

async function waitForMedia(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const images = [...document.images];
    return images
      .filter((image) => image.loading !== "lazy")
      .every((image) => image.complete);
  });
}

export async function openReadyDemo(
  page: Page,
  path = "/"
): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts?.ready);
  await waitForMedia(page);
}

export async function waitForOptics(
  page: Page,
  mode: "webgl" | "fallback" = "webgl"
): Promise<void> {
  await expect(page.locator(DIAGNOSTICS_SELECTOR)).toHaveAttribute(
    "data-optics-mode",
    mode,
    { timeout: 20_000 }
  );
  await waitForCaptureIdle(page);
}

export async function waitForCaptureIdle(
  page: Page,
  quietMs = 500,
  timeoutMs = 10_000
): Promise<void> {
  const idle = await page.evaluate(
    ({ selector, quiet, timeout }) =>
      new Promise<boolean>((resolve) => {
        const started = performance.now();
        let lastActivity = started;
        let settled = false;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          resolve(value);
        };
        const containsCapture = (node: Node) =>
          node instanceof Element &&
          (node.matches(selector) ||
            node.querySelector(selector) !== null);
        const observer = new MutationObserver((records) => {
          if (
            records.some((record) =>
              [...record.addedNodes, ...record.removedNodes].some(
                containsCapture
              )
            )
          ) {
            lastActivity = performance.now();
          }
        });
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true
        });
        const poll = () => {
          const now = performance.now();
          const active = document.querySelector(selector) !== null;
          if (active) lastActivity = now;
          if (!active && now - lastActivity >= quiet) {
            finish(true);
            return;
          }
          if (now - started >= timeout) {
            finish(false);
            return;
          }
          window.setTimeout(poll, 25);
        };
        poll();
      }),
    {
      selector: 'iframe[data-soft-optics-internal]',
      quiet: quietMs,
      timeout: timeoutMs
    }
  );
  expect(idle).toBe(true);
}

export async function scrollElementToViewport(
  page: Page,
  selector: string,
  offset = 0
): Promise<void> {
  await page.locator(selector).evaluate(
    (element, topOffset) => {
      const top =
        element.getBoundingClientRect().top +
        window.scrollY +
        Number(topOffset);
      window.scrollTo({ top, behavior: "instant" });
    },
    offset
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve())
        )
      )
  );
}

export function captureAppeared(page: Page, timeoutMs = 5_000) {
  return page.evaluate(
    ({ selector, timeout }) =>
      new Promise<boolean>((resolve) => {
        if (document.querySelector(selector)) {
          resolve(true);
          return;
        }
        let settled = false;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          resolve(value);
        };
        const observer = new MutationObserver((records) => {
          const found = records.some((record) =>
            [...record.addedNodes].some(
              (node) =>
                node instanceof Element &&
                (node.matches(selector) ||
                  node.querySelector(selector) !== null)
            )
          );
          if (found) finish(true);
        });
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true
        });
        window.setTimeout(() => finish(false), timeout);
      }),
    {
      selector: 'iframe[data-soft-optics-internal]',
      timeout: timeoutMs
    }
  );
}

export async function canvasFingerprint(
  canvas: Locator
): Promise<number> {
  return canvas.evaluate(
    (node) =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const gl = node.getContext("webgl2");
          if (!gl) {
            resolve(-1);
            return;
          }
          const pixels = new Uint8Array(node.width * node.height * 4);
          gl.readPixels(
            0,
            0,
            node.width,
            node.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels
          );
          let hash = 2_166_136_261;
          for (let index = 0; index < pixels.length; index += 17) {
            hash ^= pixels[index] ?? 0;
            hash = Math.imul(hash, 16_777_619);
          }
          resolve(hash >>> 0);
        });
      })
  );
}

export async function seekVideoFrame(
  page: Page,
  video: Locator,
  time: number
): Promise<void> {
  await video.evaluate(
    async (node, targetTime) => {
      node.pause();
      if (node.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve) =>
          node.addEventListener("loadedmetadata", () => resolve(), {
            once: true
          })
        );
      }
      const seeked = new Promise<void>((resolve) =>
        node.addEventListener("seeked", () => resolve(), {
          once: true
        })
      );
      node.currentTime = Math.min(
        Math.max(0, Number(targetTime)),
        Math.max(0, node.duration - 0.1)
      );
      await seeked;
      if ("requestVideoFrameCallback" in node) {
        await Promise.race([
          new Promise<void>((resolve) =>
            node.requestVideoFrameCallback(() => resolve())
          ),
          new Promise<void>((resolve) =>
            window.setTimeout(resolve, 500)
          )
        ]);
      }
    },
    time
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve())
          )
        )
      )
  );
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await use(page);
  }
});

export { expect };
