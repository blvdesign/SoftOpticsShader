// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SOFT_OPTICS_CONFIG,
  type SoftOpticsConfig
} from "@blvdesign/soft-optics";

import { OpticsControls } from "./OpticsControls";

afterEach(cleanup);

function Harness({
  onCompareChange = vi.fn()
}: {
  onCompareChange?: (active: boolean) => void;
}) {
  const [config, setConfig] = useState<SoftOpticsConfig>({
    ...DEFAULT_SOFT_OPTICS_CONFIG
  });
  const [debugBoundaries, setDebugBoundaries] = useState(false);

  return (
    <OpticsControls
      config={config}
      debugBoundaries={debugBoundaries}
      onCompareChange={onCompareChange}
      onConfigChange={setConfig}
      onDebugBoundariesChange={setDebugBoundaries}
      status={{ mode: "webgl" }}
    />
  );
}

function openControls() {
  fireEvent.click(screen.getByRole("button", { name: "Tune optics" }));
}

function slider(name: string) {
  return screen.getByRole("slider", { name }) as HTMLInputElement;
}

describe("OpticsControls", () => {
  it("starts closed and opens from Tune optics", () => {
    render(<Harness />);

    const trigger = screen.getByRole("button", {
      name: "Tune optics"
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();
    openControls();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Tune optics" })).not.toBeNull();
  });

  it("focuses the dialog, closes on Escape, and restores its trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", {
      name: "Tune optics"
    });

    fireEvent.click(trigger);
    const close = screen.getByRole("button", {
      name: "Close optics controls"
    });
    await waitFor(() => expect(document.activeElement).toBe(close));

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("applies every value from the Subtle preset", () => {
    render(<Harness />);
    openControls();

    fireEvent.click(screen.getByRole("button", { name: "Subtle preset" }));

    expect(slider("Edge height").value).toBe("5");
    expect(slider("Feather").value).toBe("2");
    expect(slider("Maximum blur").value).toBe("16");
    expect(slider("Refraction").value).toBe("0.5");
    expect(slider("Color dispersion").value).toBe("0.22");
    expect(slider("Motion sensitivity").value).toBe("0.75");
    expect(slider("Peak hold").value).toBe("70");
    expect(slider("Decay").value).toBe("650");
    expect(slider("Opposite edge response").value).toBe("0.3");
  });

  it("switches to Custom when a control is edited", () => {
    render(<Harness />);
    openControls();

    fireEvent.change(slider("Maximum blur"), {
      target: { value: "28" }
    });

    expect(
      screen.getByRole("button", { name: "Custom preset" }).getAttribute(
        "aria-pressed"
      )
    ).toBe("true");
    expect(slider("Maximum blur").value).toBe("28");
  });

  it("holds comparison for pointer input and releases globally", () => {
    const onCompareChange = vi.fn();
    render(<Harness onCompareChange={onCompareChange} />);
    openControls();

    const compare = screen.getByRole("button", { name: "Compare without effect" });
    fireEvent.pointerDown(compare);
    expect(onCompareChange).toHaveBeenLastCalledWith(true);

    fireEvent.pointerUp(window);
    expect(onCompareChange).toHaveBeenLastCalledWith(false);
  });

  it("holds comparison for keyboard input and releases on keyup", () => {
    const onCompareChange = vi.fn();
    render(<Harness onCompareChange={onCompareChange} />);
    openControls();

    const compare = screen.getByRole("button", { name: "Compare without effect" });
    fireEvent.keyDown(compare, { key: " " });
    expect(onCompareChange).toHaveBeenLastCalledWith(true);

    fireEvent.keyUp(window, { key: " " });
    expect(onCompareChange).toHaveBeenLastCalledWith(false);
  });

  it("resets every control to the Default preset", () => {
    render(<Harness />);
    openControls();
    fireEvent.click(screen.getByRole("button", { name: "Subtle preset" }));

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));

    expect(slider("Edge height").value).toBe("7");
    expect(slider("Maximum blur").value).toBe("20");
    expect(slider("Refraction").value).toBe("3");
    expect(
      screen.getByRole("button", { name: "Default preset" }).getAttribute(
        "aria-pressed"
      )
    ).toBe("true");
  });

  it("keeps debug boundaries off until explicitly enabled", () => {
    render(<Harness />);
    openControls();

    const debug = screen.getByRole("checkbox", {
      name: "Show optical boundaries"
    });
    expect((debug as HTMLInputElement).checked).toBe(false);

    fireEvent.click(debug);
    expect((debug as HTMLInputElement).checked).toBe(true);
  });
});
