// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { resolveConfig } from "../config";
import { createFallback } from "./createFallback";

describe("createFallback", () => {
  it("creates one continuous, inert layer for each enabled edge", () => {
    const parent = document.createElement("div");
    document.body.append(parent);

    const fallback = createFallback({
      parent,
      config: resolveConfig(),
      zIndex: 27,
      supportsBackdropFilter: () => true
    });
    const layers = parent.querySelectorAll("[data-soft-optics-fallback]");

    expect(fallback.supported).toBe(true);
    expect(layers).toHaveLength(2);
    for (const layer of layers) {
      expect(layer.hasAttribute("data-soft-optics-internal")).toBe(true);
      expect(layer.getAttribute("aria-hidden")).toBe("true");
      expect((layer as HTMLElement).style.pointerEvents).toBe("none");
      expect((layer as HTMLElement).style.zIndex).toBe("27");
      expect(
        (layer as HTMLElement).style.getPropertyValue("backdrop-filter")
      ).toBe("blur(20px)");
    }

    const top = parent.querySelector<HTMLElement>(
      '[data-soft-optics-edge="top"]'
    );
    const bottom = parent.querySelector<HTMLElement>(
      '[data-soft-optics-edge="bottom"]'
    );
    expect(top?.style.top).toBe("0px");
    expect(top?.style.bottom).toBe("");
    expect(bottom?.style.bottom).toBe("0px");
    expect(bottom?.style.top).toBe("");
    expect(top?.style.maskImage).toContain("black 0%");
    expect(top?.style.maskImage).toContain("transparent 100%");
    expect(bottom?.style.maskImage).toContain("black 0%");
    expect(bottom?.style.maskImage).toContain("transparent 100%");
  });

  it("updates blur, geometry, topology, parent, and stacking without bands", () => {
    const firstParent = document.createElement("div");
    const nextParent = document.createElement("div");
    document.body.append(firstParent, nextParent);
    const fallback = createFallback({
      parent: firstParent,
      config: resolveConfig(),
      supportsBackdropFilter: () => true
    });

    fallback.update(
      resolveConfig({
        edges: ["bottom"],
        edgeHeight: 9,
        featherHeight: 3,
        maxBlur: 24
      }),
      { parent: nextParent, zIndex: 81 }
    );

    expect(
      firstParent.querySelectorAll("[data-soft-optics-fallback]")
    ).toHaveLength(0);
    const layers = nextParent.querySelectorAll<HTMLElement>(
      "[data-soft-optics-fallback]"
    );
    expect(layers).toHaveLength(1);
    expect(layers[0]?.dataset.softOpticsEdge).toBe("bottom");
    expect(layers[0]?.style.height).toBe("12vh");
    expect(layers[0]?.style.zIndex).toBe("81");
    expect(
      layers[0]?.style.getPropertyValue("backdrop-filter")
    ).toBe("blur(24px)");
  });

  it("can disable and re-enable existing output", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const fallback = createFallback({
      parent,
      config: resolveConfig(),
      supportsBackdropFilter: () => true
    });
    const layers = [...parent.querySelectorAll<HTMLElement>(
      "[data-soft-optics-fallback]"
    )];

    fallback.setEnabled(false);
    expect(layers.every((layer) => layer.hidden)).toBe(true);

    fallback.setEnabled(true);
    expect(layers.every((layer) => !layer.hidden)).toBe(true);
    expect(
      parent.querySelectorAll("[data-soft-optics-fallback]")
    ).toHaveLength(2);
  });

  it("destroys every layer idempotently", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const fallback = createFallback({
      parent,
      config: resolveConfig(),
      supportsBackdropFilter: () => true
    });

    fallback.destroy();
    fallback.destroy();
    fallback.setEnabled(true);
    fallback.update(resolveConfig({ edges: ["top"] }));

    expect(
      parent.querySelectorAll("[data-soft-optics-fallback]")
    ).toHaveLength(0);
  });

  it("is a capability-based no-op when backdrop filtering is unavailable", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const fallback = createFallback({
      parent,
      config: resolveConfig(),
      supportsBackdropFilter: () => false
    });

    fallback.setEnabled(true);
    fallback.update(resolveConfig({ maxBlur: 64 }));
    fallback.destroy();

    expect(fallback.supported).toBe(false);
    expect(
      parent.querySelectorAll("[data-soft-optics-fallback]")
    ).toHaveLength(0);
  });
});
