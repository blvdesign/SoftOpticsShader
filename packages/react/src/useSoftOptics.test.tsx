// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import {
  createSoftOptics,
  SOFT_OPTICS_PRESETS,
  type SoftOpticsController,
  type SoftOpticsPresetName
} from "@blvdesign/soft-optics";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi
} from "vitest";

import { useSoftOptics } from "./useSoftOptics";

vi.mock("@blvdesign/soft-optics", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@blvdesign/soft-optics")>();

  return {
    ...original,
    createSoftOptics: vi.fn()
  };
});

const createSoftOpticsMock = vi.mocked(createSoftOptics);
let controller: SoftOpticsController;
let update: Mock<SoftOpticsController["update"]>;
let destroy: Mock<SoftOpticsController["destroy"]>;

beforeEach(() => {
  update = vi.fn<SoftOpticsController["update"]>();
  destroy = vi.fn<SoftOpticsController["destroy"]>();
  controller = {
    mount: vi.fn(() => Promise.resolve()),
    update,
    refresh: vi.fn(() => Promise.resolve()),
    setEnabled: vi.fn(),
    getStatus: vi.fn<SoftOpticsController["getStatus"]>(() => ({
      mode: "disabled",
      reason: "unmounted"
    })),
    destroy
  };
  createSoftOpticsMock.mockReturnValue(controller);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useSoftOptics", () => {
  it("updates the active controller when config props change", () => {
    const initialConfig = { maxBlur: 20 };
    const nextConfig = { maxBlur: 28, refraction: 4 };
    const view = renderHook(
      ({ config }) => useSoftOptics({ config }),
      { initialProps: { config: initialConfig } }
    );

    expect(update).not.toHaveBeenCalled();
    view.rerender({ config: nextConfig });

    expect(createSoftOpticsMock).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      ...SOFT_OPTICS_PRESETS.default,
      ...nextConfig
    });
  });

  it("updates the active controller when the preset changes", () => {
    const view = renderHook(
      ({ preset }) => useSoftOptics({ preset }),
      {
        initialProps: {
          preset: "default" as SoftOpticsPresetName
        }
      }
    );

    view.rerender({ preset: "subtle" });

    expect(createSoftOpticsMock).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      ...SOFT_OPTICS_PRESETS.subtle
    });
  });

  it("returns a stable ref containing the mounted controller", () => {
    const view = renderHook(() => useSoftOptics());
    const firstRef = view.result.current;

    view.rerender();

    expect(view.result.current).toBe(firstRef);
    expect(view.result.current.current).toBe(controller);
  });

  it("keeps only the Strict Mode controller in its returned ref", () => {
    const created: SoftOpticsController[] = [];
    createSoftOpticsMock.mockImplementation(() => {
      const current = {
        ...controller,
        destroy: vi.fn()
      };
      created.push(current);
      return current;
    });
    const view = renderHook(() => useSoftOptics(), {
      reactStrictMode: true
    });

    expect(created).toHaveLength(2);
    expect(created[0]?.destroy).toHaveBeenCalledOnce();
    expect(created[1]?.destroy).not.toHaveBeenCalled();
    expect(view.result.current.current).toBe(created[1]);
  });
});
