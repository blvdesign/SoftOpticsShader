import {
  createSoftOptics,
  type SoftOpticsStatus
} from "@blvdesign/soft-optics";

import "./styles.css";

const content = document.querySelector<HTMLElement>("#content");

if (!content) {
  throw new Error("Example content root was not found.");
}

content.innerHTML = Array.from(
  { length: 8 },
  (_, index) => `
    <article>
      <p class="eyebrow">Section ${String(index + 1).padStart(2, "0")}</p>
      <h1>${index === 0 ? "A soft optical boundary for the viewport" : "Scroll through contrast, type, and color"}</h1>
      <p>
        Fine typography and a restrained green field make progressive blur,
        refraction, and color dispersion visible at the physical screen edges.
      </p>
      <div class="field" aria-hidden="true"></div>
    </article>
  `
).join("");

const reportStatus = (status: SoftOpticsStatus) => {
  document.documentElement.dataset.opticsMode = status.mode;
};

const optics = createSoftOptics({
  exclude: "[data-soft-optics-ignore]",
  layer: { zIndex: 40 },
  onStatusChange: reportStatus
});

await optics.mount();

if (import.meta.hot) {
  import.meta.hot.dispose(() => optics.destroy());
}
