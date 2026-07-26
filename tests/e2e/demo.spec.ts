import {
  EDGE_CANVAS_SELECTOR,
  DIAGNOSTICS_SELECTOR,
  INTERNAL_SELECTOR,
  canvasFingerprint,
  captureAppeared,
  expect,
  openReadyDemo,
  scrollElementToViewport,
  waitForCaptureIdle,
  waitForOptics,
  test
} from "./fixtures";

test.describe.configure({ mode: "serial" });

test("starts WebGL optics within the bounded startup window", async ({
  page
}) => {
  await openReadyDemo(page);

  await waitForOptics(page);
  const diagnostics = page.locator(DIAGNOSTICS_SELECTOR);
  await expect(diagnostics).toHaveCount(1);
  await expect(page.locator("main[data-optics-mode]")).toHaveCount(0);
  await expect(diagnostics).toHaveAttribute(
    "data-soft-optics-ignore",
    ""
  );
  expect(
    await page.evaluate(() =>
      document.fonts.check('16px "Inter Variable"')
    )
  ).toBe(true);
  expect(
    await page.locator("html").evaluate(
      (node) => getComputedStyle(node).fontFamily
    )
  ).toContain("Inter Variable");
  await expect(page.locator(EDGE_CANVAS_SELECTOR)).toHaveCount(2);
  await expect(
    page.locator(`${EDGE_CANVAS_SELECTOR}[data-soft-optics-edge="top"]`)
  ).toHaveCount(1);
  await expect(
    page.locator(`${EDGE_CANVAS_SELECTOR}[data-soft-optics-edge="bottom"]`)
  ).toHaveCount(1);
  expect(await captureAppeared(page, 1_200)).toBe(false);
});

test("scroll changes real optical canvas output", async ({ page }) => {
  await openReadyDemo(page);
  await waitForOptics(page);
  const topCanvas = page.locator(
    `${EDGE_CANVAS_SELECTOR}[data-soft-optics-edge="top"]`
  );
  const before = await canvasFingerprint(topCanvas);

  await scrollElementToViewport(page, ".statement", -120);
  const after = await canvasFingerprint(topCanvas);

  expect(before).not.toBe(-1);
  expect(after).not.toBe(before);
});

test("both physical viewport rows change when comparison disables optics", async ({
  page
}) => {
  await openReadyDemo(page);
  await waitForOptics(page);
  await scrollElementToViewport(page, ".signal-field");
  await page.getByRole("button", { name: "Tune optics" }).click();
  const compare = page.getByRole("button", {
    name: "Compare without effect"
  });
  const edgeRegion = (y: number) =>
    page.screenshot({
      animations: "disabled",
      clip: { x: 0, y, width: 900, height: 48 }
    });
  const topEnabled = await edgeRegion(0);
  const bottomEnabled = await edgeRegion(852);

  await compare.hover();
  await page.mouse.down();
  await expect(page.locator(DIAGNOSTICS_SELECTOR)).toHaveAttribute(
    "data-optics-enabled",
    "false"
  );
  const topDisabled = await edgeRegion(0);
  const bottomDisabled = await edgeRegion(852);
  await page.mouse.up();

  expect(topEnabled.equals(topDisabled)).toBe(false);
  expect(bottomEnabled.equals(bottomDisabled)).toBe(false);
});

test("navigation remains above the optical layer and clickable", async ({
  page
}) => {
  await openReadyDemo(page);
  await waitForOptics(page);
  const navigation = page.getByRole("navigation");
  const navZIndex = await navigation.evaluate((node) =>
    Number(getComputedStyle(node).zIndex)
  );
  const canvasZIndex = await page
    .locator(EDGE_CANVAS_SELECTOR)
    .first()
    .evaluate((node) => Number(getComputedStyle(node).zIndex));

  expect(navZIndex).toBeGreaterThan(canvasZIndex);
  await page.getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.locator("#how-it-works")).toBeInViewport();
});

test("excluded controls avoid recapture; compare and reset remain correct", async ({
  page
}) => {
  await openReadyDemo(page);
  await waitForOptics(page);
  await waitForCaptureIdle(page);
  const controlsRecapture = captureAppeared(page, 1_600);
  await page.waitForTimeout(50);
  await page.getByRole("button", { name: "Tune optics" }).click();
  expect(await controlsRecapture).toBe(false);
  const blur = page.getByRole("slider", { name: "Maximum blur" });
  await blur.fill("37");
  await expect(
    page.getByRole("button", { name: "Custom preset" })
  ).toHaveAttribute("aria-pressed", "true");

  const compare = page.getByRole("button", {
    name: "Compare without effect"
  });
  await compare.hover();
  await page.mouse.down();
  await expect(page.locator(DIAGNOSTICS_SELECTOR)).toHaveAttribute(
    "data-optics-enabled",
    "false"
  );
  await page.mouse.up();
  await expect(page.locator(DIAGNOSTICS_SELECTOR)).toHaveAttribute(
    "data-optics-enabled",
    "true"
  );

  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect(blur).toHaveValue("20");
  await expect(
    page.getByRole("button", { name: "Default preset" })
  ).toHaveAttribute("aria-pressed", "true");
});

test("resize and relevant DOM mutation each schedule a fresh capture", async ({
  page
}) => {
  await openReadyDemo(page);
  await waitForOptics(page);
  const topCanvas = page.locator(
    `${EDGE_CANVAS_SELECTOR}[data-soft-optics-edge="top"]`
  );
  const initialWidth = await topCanvas.evaluate((canvas) => canvas.width);
  const initialOutput = await canvasFingerprint(topCanvas);
  await page.setViewportSize({ width: 1360, height: 820 });
  await expect
    .poll(() => topCanvas.evaluate((canvas) => canvas.width))
    .not.toBe(initialWidth);
  await expect
    .poll(() => canvasFingerprint(topCanvas), { timeout: 10_000 })
    .not.toBe(initialOutput);

  const mutationCapture = captureAppeared(page, 12_000);
  await page.waitForTimeout(50);
  await page.locator("main").evaluate((main) => {
    const marker = document.createElement("div");
    marker.setAttribute("data-capture-refresh-marker", "");
    Object.assign(marker.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "320px",
      height: "140px",
      background: "#8fc073"
    });
    main.prepend(marker);
  });
  expect(await mutationCapture).toBe(true);
});

test("demo navigation unmount destroys every internal node", async ({
  page
}) => {
  await openReadyDemo(page);
  await waitForOptics(page);
  await expect(page.locator(INTERNAL_SELECTOR)).not.toHaveCount(0);

  await page.evaluate(() => {
    history.pushState({}, "", "?optics=off");
    dispatchEvent(new PopStateEvent("popstate"));
  });

  await expect(page.locator(DIAGNOSTICS_SELECTOR)).toHaveAttribute(
    "data-optics-mounted",
    "false"
  );
  await expect(page.locator(INTERNAL_SELECTOR)).toHaveCount(0);
});
