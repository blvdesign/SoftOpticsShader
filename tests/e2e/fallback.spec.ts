import {
  DIAGNOSTICS_SELECTOR,
  EDGE_CANVAS_SELECTOR,
  expect,
  openReadyDemo,
  scrollElementToViewport,
  test,
  waitForOptics
} from "./fixtures";

function disableWebGL2() {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    contextId: string,
    ...args: unknown[]
  ) {
    if (contextId === "webgl2") return null;
    return Reflect.apply(original, this, [contextId, ...args]);
  } as typeof HTMLCanvasElement.prototype.getContext;
}

test("WebGL2-unavailable mode uses two continuous fallback layers", async ({
  page
}) => {
  await page.addInitScript(disableWebGL2);
  await openReadyDemo(page);
  await waitForOptics(page, "fallback");

  await expect(page.locator(EDGE_CANVAS_SELECTOR)).toHaveCount(0);
  const layers = page.locator("[data-soft-optics-fallback]");
  await expect(layers).toHaveCount(2);
  await expect(page.locator(DIAGNOSTICS_SELECTOR)).toHaveAttribute(
    "data-optics-reason",
    "webgl2-unavailable"
  );

  const geometry = await layers.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        childCount: node.childElementCount,
        edge: node.getAttribute("data-soft-optics-edge"),
        mask: style.maskImage,
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: innerHeight
      };
    })
  );
  expect(geometry).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        childCount: 0,
        edge: "top",
        top: 0
      }),
      expect.objectContaining({
        childCount: 0,
        edge: "bottom",
        bottom: geometry[0]?.viewportHeight
      })
    ])
  );
  expect(
    geometry.every(({ mask }) => mask.startsWith("linear-gradient("))
  ).toBe(true);

  const video = page.getByLabel(
    "Moving high-contrast optical test signal"
  );
  await scrollElementToViewport(page, ".motion-frame", -300);
  await expect(video).toHaveAttribute(
    "data-soft-optics-live",
    /^(?:|true)$/
  );
  await expect(video).toHaveAttribute(
    "src",
    /media\/optical-test-signal\.webm$/
  );
  await expect
    .poll(() => video.evaluate((node) => node.currentTime))
    .toBeGreaterThan(0.1);
  const firstTime = await video.evaluate((node) => node.currentTime);
  expect(await video.evaluate((node) => node.paused)).toBe(false);
  await page.waitForTimeout(500);
  expect(
    await video.evaluate((node) => node.currentTime)
  ).toBeGreaterThan(firstTime + 0.2);

  await page.getByRole("link", { name: "How it works" }).click();
  await expect(page.locator("#how-it-works")).toBeInViewport();
});

test("reduced motion selects fallback and leaves controls usable", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openReadyDemo(page);
  await waitForOptics(page, "fallback");

  await expect(page.locator(DIAGNOSTICS_SELECTOR)).toHaveAttribute(
    "data-optics-reason",
    "reduced-motion"
  );
  await page.getByRole("button", { name: "Tune optics" }).click();
  await expect(
    page.getByRole("dialog", { name: "Tune optics" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Motion paused" })
  ).toBeDisabled();
});
