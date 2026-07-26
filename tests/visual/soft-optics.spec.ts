import { expect, test } from "@playwright/test";

import {
  openReadyDemo,
  seekVideoFrame,
  scrollElementToViewport,
  waitForOptics
} from "../e2e/fixtures";

// GPU compositing varies slightly across Chrome/OS combinations. The project
// threshold (3.5% changed pixels, 0.25 per-channel) tolerates edge antialiasing
// while still failing when a full optical field disappears or gains a band.
test("approved WebGL presentation states", async ({ page }) => {
  await openReadyDemo(page);
  await waitForOptics(page);
  await expect(page).toHaveScreenshot("desktop-rest.png", {
    fullPage: false
  });

  await scrollElementToViewport(page, ".signal-field", 160);
  await page.evaluate(() => window.scrollBy({ top: 420, behavior: "instant" }));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      )
  );
  await expect(page).toHaveScreenshot("desktop-fast-scroll.png", {
    fullPage: false
  });

  await scrollElementToViewport(page, ".motion-frame", -520);
  await seekVideoFrame(
    page,
    page.getByLabel("Moving high-contrast optical test signal"),
    0.4
  );
  await expect(page).toHaveScreenshot("desktop-video-bottom.png", {
    fullPage: false
  });

  await page.getByRole("button", { name: "Tune optics" }).click();
  await expect(page).toHaveScreenshot("desktop-controls-open.png", {
    fullPage: false
  });
  await page.getByRole("button", { name: "Close optics controls" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(1_000);
  await expect(page).toHaveScreenshot("mobile-rest.png", {
    fullPage: false
  });

  await scrollElementToViewport(page, ".detail-study", -80);
  await expect(page).toHaveScreenshot("mobile-scroll.png", {
    fullPage: false
  });
});

test("fallback presentation has continuous unbanded edges", async ({
  page
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      contextId: string,
      ...args: unknown[]
    ) {
      if (contextId === "webgl2") return null;
      return Reflect.apply(original, this, [contextId, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await openReadyDemo(page);
  await waitForOptics(page, "fallback");
  await scrollElementToViewport(page, ".signal-field", 160);

  await expect(page).toHaveScreenshot("fallback.png", {
    fullPage: false
  });
});
