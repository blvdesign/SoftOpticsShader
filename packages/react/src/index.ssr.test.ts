// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

describe("@blvdesign/soft-optics-react SSR entrypoint", () => {
  it("imports without reading browser globals", async () => {
    vi.resetModules();
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("window", undefined);

    const entrypoint = await import("./index");

    expect(entrypoint.SoftOptics).toBeTypeOf("function");
    expect(entrypoint.useSoftOptics).toBeTypeOf("function");
    vi.unstubAllGlobals();
  });
});
