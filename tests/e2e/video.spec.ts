import {
  EDGE_CANVAS_SELECTOR,
  canvasFingerprint,
  captureAppeared,
  expect,
  openReadyDemo,
  seekVideoFrame,
  scrollElementToViewport,
  test,
  waitForCaptureIdle,
  waitForOptics
} from "./fixtures";

test("live video advances through the bottom optical edge", async ({
  page
}) => {
  await openReadyDemo(page);
  await waitForOptics(page);
  const video = page.getByLabel(
    "Moving high-contrast optical test signal"
  );
  await scrollElementToViewport(page, ".motion-frame", -500);
  await video.evaluate(async (node) => {
    node.muted = true;
    await node.play();
  });
  await expect
    .poll(() => video.evaluate((node) => node.currentTime))
    .toBeGreaterThan(0.15);
  const firstTime = await video.evaluate((node) => node.currentTime);
  await page.waitForTimeout(500);
  const secondTime = await video.evaluate((node) => node.currentTime);

  expect(secondTime).toBeGreaterThan(firstTime + 0.2);
  const bottomCanvas = page.locator(
    `${EDGE_CANVAS_SELECTOR}[data-soft-optics-edge="bottom"]`
  );
  await expect(bottomCanvas).toBeVisible();

  await seekVideoFrame(page, video, 0.5);
  const earlyFrame = await canvasFingerprint(bottomCanvas);
  await seekVideoFrame(page, video, 4.5);
  const lateFrame = await canvasFingerprint(bottomCanvas);

  expect(earlyFrame).not.toBe(-1);
  expect(lateFrame).not.toBe(earlyFrame);
});

test("excluded pause control does not trigger a static page recapture", async ({
  page
}) => {
  await openReadyDemo(page);
  await waitForOptics(page);
  await scrollElementToViewport(page, ".motion-frame", -120);
  await waitForCaptureIdle(page);

  const recapture = captureAppeared(page, 1_600);
  await page.waitForTimeout(50);
  await page.getByRole("button", { name: "Pause motion" }).click();

  expect(await recapture).toBe(false);
  await expect(
    page.getByRole("button", { name: "Play motion" })
  ).toBeVisible();
});
