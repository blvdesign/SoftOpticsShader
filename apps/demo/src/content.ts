export const principles = [
  {
    number: "01",
    title: "Continuous, not layered",
    body:
      "The optical field changes smoothly across each edge. Blur, displacement, and color separation share the same feather, so there are no stacked filter bands."
  },
  {
    number: "02",
    title: "Responsive to motion",
    body:
      "Scroll velocity briefly strengthens the leading edge. Peak hold and a slow decay preserve a physical sense of momentum after the gesture ends."
  },
  {
    number: "03",
    title: "Media stays alive",
    body:
      "Opted-in video frames are composited into the edge source while the original element keeps playing. The page never swaps moving media for a poster."
  }
] as const;

export const vanillaCode = `import { createSoftOptics } from "@blvdesign/soft-optics";

const optics = createSoftOptics({
  exclude: "[data-soft-optics-ignore]"
});

await optics.mount();`;

export const reactCode = `import { SoftOptics } from "@blvdesign/soft-optics-react";

export function App() {
  return (
    <>
      <nav data-soft-optics-ignore>Navigation</nav>
      <main>Your content</main>
      <SoftOptics preset="default" />
    </>
  );
}`;

export const technicalNotes = [
  "Two overscanned WebGL canvases process only the viewport edges.",
  "A three-pass renderer separates blur from the optical composite.",
  "CSS backdrop filtering provides a continuous progressive fallback.",
  "Reduced-motion preferences keep the page calm and fully usable."
] as const;
