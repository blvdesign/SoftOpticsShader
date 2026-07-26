// @vitest-environment jsdom

import {
  StrictMode,
  Suspense,
  startTransition,
  useState
} from "react";
import {
  act,
  cleanup,
  render
} from "@testing-library/react";
import {
  createSoftOptics,
  SOFT_OPTICS_PRESETS,
  type CreateSoftOpticsOptions,
  type SoftOpticsController
} from "@blvdesign/soft-optics";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { SoftOptics } from "./SoftOptics";

vi.mock("@blvdesign/soft-optics", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@blvdesign/soft-optics")>();

  return {
    ...original,
    createSoftOptics: vi.fn()
  };
});

type ControllerMock = {
  controller: SoftOpticsController;
  destroy: ReturnType<typeof vi.fn>;
  mount: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const createSoftOpticsMock = vi.mocked(createSoftOptics);
let controllers: ControllerMock[];

function createControllerMock(): ControllerMock {
  const mount = vi.fn<SoftOpticsController["mount"]>(
    () => Promise.resolve()
  );
  const update = vi.fn<SoftOpticsController["update"]>();
  const destroy = vi.fn<SoftOpticsController["destroy"]>();
  const controller: SoftOpticsController = {
    mount,
    update,
    refresh: vi.fn(() => Promise.resolve()),
    setEnabled: vi.fn(),
    getStatus: vi.fn<SoftOpticsController["getStatus"]>(() => ({
      mode: "disabled",
      reason: "unmounted"
    })),
    destroy
  };

  return { controller, destroy, mount, update };
}

beforeEach(() => {
  controllers = [];
  createSoftOpticsMock.mockImplementation(() => {
    const controller = createControllerMock();
    controllers.push(controller);
    return controller.controller;
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SoftOptics", () => {
  it("leaves one live controller after React Strict Mode settles", () => {
    const { container } = render(
      <StrictMode>
        <SoftOptics />
      </StrictMode>
    );

    expect(createSoftOpticsMock).toHaveBeenCalledTimes(2);
    expect(controllers[0]?.mount).toHaveBeenCalledOnce();
    expect(controllers[0]?.destroy).toHaveBeenCalledOnce();
    expect(controllers[1]?.mount).toHaveBeenCalledOnce();
    expect(controllers[1]?.destroy).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("destroys the active controller on unmount", () => {
    const view = render(<SoftOptics />);

    view.unmount();

    expect(controllers).toHaveLength(1);
    expect(controllers[0]?.destroy).toHaveBeenCalledOnce();
  });

  it("passes root, layer, exclusion, and live-video options to core", () => {
    const root = document.createElement("main");
    const parent = document.createElement("div");
    const exclude = (node: Node) => node === root;
    const allowLiveVideo = (video: HTMLVideoElement) =>
      video.dataset["demo"] === "true";

    render(
      <SoftOptics
        root={root}
        layer={{ parent, zIndex: 72 }}
        exclude={exclude}
        allowLiveVideo={allowLiveVideo}
      />
    );

    expect(createSoftOpticsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        root,
        layer: { parent, zIndex: 72 },
        exclude,
        allowLiveVideo
      })
    );
  });

  it.each(["default", "subtle"] as const)(
    "passes the %s preset to core as effective config",
    (preset) => {
      render(<SoftOptics preset={preset} />);

      expect(createSoftOpticsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            ...SOFT_OPTICS_PRESETS[preset]
          }
        })
      );
    }
  );

  it("lets explicit config fields override the selected preset", () => {
    render(
      <SoftOptics
        preset="subtle"
        config={{ maxBlur: 31, refraction: 5 }}
      />
    );

    expect(createSoftOpticsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {
          ...SOFT_OPTICS_PRESETS.subtle,
          maxBlur: 31,
          refraction: 5
        }
      })
    );
  });

  it("forwards statuses to the latest callback without recreating core", () => {
    const firstStatus = vi.fn();
    const nextStatus = vi.fn();
    const view = render(<SoftOptics onStatusChange={firstStatus} />);
    const options = createSoftOpticsMock.mock.calls[0]?.[0] as
      | CreateSoftOpticsOptions
      | undefined;

    view.rerender(<SoftOptics onStatusChange={nextStatus} />);
    options?.onStatusChange?.({ mode: "webgl" });

    expect(createSoftOpticsMock).toHaveBeenCalledOnce();
    expect(firstStatus).not.toHaveBeenCalled();
    expect(nextStatus).toHaveBeenCalledWith({ mode: "webgl" });
  });

  it("does not expose a callback from an aborted Suspense render", async () => {
    const firstStatus = vi.fn();
    const nextStatus = vi.fn();
    const suspended = new Promise<never>(() => undefined);
    let setState:
      | ((
          state: Readonly<{
            callback: typeof firstStatus;
            suspend: boolean;
          }>
        ) => void)
      | undefined;

    function SuspendAfterOptics({
      active
    }: Readonly<{ active: boolean }>) {
      if (active) throw suspended;
      return null;
    }

    function Harness() {
      const [state, updateState] = useState({
        callback: firstStatus,
        suspend: false
      });
      setState = updateState;
      return (
        <Suspense fallback={null}>
          <SoftOptics onStatusChange={state.callback} />
          <SuspendAfterOptics active={state.suspend} />
        </Suspense>
      );
    }

    render(<Harness />);
    const options = createSoftOpticsMock.mock.calls[0]?.[0] as
      | CreateSoftOpticsOptions
      | undefined;

    await act(async () => {
      startTransition(() => {
        setState?.({ callback: nextStatus, suspend: true });
      });
    });
    options?.onStatusChange?.({ mode: "webgl" });

    expect(firstStatus).toHaveBeenCalledWith({ mode: "webgl" });
    expect(nextStatus).not.toHaveBeenCalled();

    act(() => {
      setState?.({ callback: nextStatus, suspend: false });
    });
    options?.onStatusChange?.({ mode: "loading" });

    expect(nextStatus).toHaveBeenCalledWith({ mode: "loading" });
  });

  it("keeps destroy status with the old callback during structural recreation", () => {
    const firstStatus = vi.fn();
    const nextStatus = vi.fn();
    const firstRoot = document.createElement("main");
    const nextRoot = document.createElement("section");

    createSoftOpticsMock.mockImplementation((options) => {
      const current = createControllerMock();
      current.destroy.mockImplementation(() => {
        options?.onStatusChange?.({
          mode: "disabled",
          reason: "destroyed"
        });
      });
      controllers.push(current);
      return current.controller;
    });

    const view = render(
      <SoftOptics
        root={firstRoot}
        onStatusChange={firstStatus}
      />
    );
    view.rerender(
      <SoftOptics
        root={nextRoot}
        onStatusChange={nextStatus}
      />
    );

    expect(firstStatus).toHaveBeenCalledWith({
      mode: "disabled",
      reason: "destroyed"
    });
    expect(nextStatus).not.toHaveBeenCalled();

    const nextOptions = createSoftOpticsMock.mock.calls[1]?.[0];
    nextOptions?.onStatusChange?.({ mode: "webgl" });

    expect(nextStatus).toHaveBeenCalledWith({ mode: "webgl" });
  });
});
