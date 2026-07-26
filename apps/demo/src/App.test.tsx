// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

vi.mock("@blvdesign/soft-optics-react", () => ({
  SoftOptics: vi.fn(() => null)
}));

import { SoftOptics } from "@blvdesign/soft-optics-react";
import { App } from "./App";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
    () => undefined
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("editorial demo", () => {
  it("keeps fixed interface layers outside the optical capture", () => {
    const { container } = render(<App />);

    expect(
      screen.getByRole("navigation").hasAttribute(
        "data-soft-optics-ignore"
      )
    ).toBe(true);
    expect(
      container
        .querySelector(".optics-controls")
        ?.hasAttribute("data-soft-optics-ignore")
    ).toBe(true);
  });

  it("renders a real opted-in local looping video", () => {
    const { container } = render(<App />);
    const video = container.querySelector("video");

    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toContain(
      "media/optical-motion.webm"
    );
    expect(video?.hasAttribute("data-soft-optics-live")).toBe(true);
    expect(video?.hasAttribute("autoplay")).toBe(false);
    expect(video?.loop).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.playsInline).toBe(true);

    if (video) {
      fireEvent.canPlay(video);
    }
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("connects the React adapter with approved defaults and diagnostics", () => {
    const { container } = render(<App />);
    const main = screen.getByRole("main");
    const diagnostics = container.querySelector(
      "[data-optics-diagnostics]"
    );

    expect(SoftOptics).toHaveBeenCalledWith(
      expect.objectContaining({
        root: screen.getByRole("main"),
        config: expect.objectContaining({
          edgeHeight: 7,
          featherHeight: 2,
          maxBlur: 20,
          refraction: 3,
          chromaticAberration: 2
        }),
        exclude: "[data-soft-optics-ignore]",
        layer: { zIndex: 80 }
      }),
      undefined
    );
    expect(diagnostics).not.toBeNull();
    expect(diagnostics?.hasAttribute("data-soft-optics-ignore")).toBe(
      true
    );
    expect(main.contains(diagnostics)).toBe(false);
    expect(
      [...main.attributes].some(({ name }) =>
        name.startsWith("data-optics-")
      )
    ).toBe(false);
  });

  it("keeps the observed content root stable while controls change", () => {
    render(<App />);
    const main = screen.getByRole("main");

    expect(
      vi.mocked(SoftOptics).mock.calls.every(
        ([props]) => props.root === main
      )
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Tune optics" })
    );
    fireEvent.change(
      screen.getByRole("slider", { name: "Maximum blur" }),
      { target: { value: "28" } }
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Show optical boundaries"
      })
    );

    const latestProps = vi.mocked(SoftOptics).mock.lastCall?.[0];
    expect(latestProps?.root).toBe(main);
    expect(main.contains(screen.getByRole("dialog"))).toBe(false);
  });

  it("lets the viewer pause motion without autoplay restarting it", () => {
    const { container } = render(<App />);
    const video = container.querySelector("video");

    fireEvent.click(
      screen.getByRole("button", { name: "Pause motion" })
    );
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();

    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    if (video) {
      fireEvent.canPlay(video);
    }
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("keeps video paused for reduced motion and cleans up its listener", async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener,
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    );

    const { container, unmount } = render(<App />);
    const video = container.querySelector("video");

    await waitFor(() =>
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    );
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    if (video) {
      fireEvent.canPlay(video);
    }
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole("button", {
          name: "Motion paused"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    unmount();
    expect(addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      "change",
      addEventListener.mock.calls[0]?.[1]
    );
  });
});
