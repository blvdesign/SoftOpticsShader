import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import {
  SOFT_OPTICS_PRESETS,
  type SoftOpticsConfig,
  type SoftOpticsStatus
} from "@blvdesign/soft-optics";

type DemoPreset = "default" | "subtle" | "custom";

type NumericConfigKey =
  | "edgeHeight"
  | "featherHeight"
  | "maxBlur"
  | "refraction"
  | "chromaticAberration"
  | "velocitySensitivity"
  | "peakHoldMs"
  | "decayMs"
  | "oppositeEdgeResponse";

type SliderDefinition = {
  key: NumericConfigKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
};

const sliders: readonly SliderDefinition[] = [
  {
    key: "edgeHeight",
    label: "Edge height",
    min: 2,
    max: 14,
    step: 0.5,
    unit: "vh"
  },
  {
    key: "featherHeight",
    label: "Feather",
    min: 0,
    max: 8,
    step: 0.5,
    unit: "vh"
  },
  {
    key: "maxBlur",
    label: "Maximum blur",
    min: 0,
    max: 48,
    step: 1,
    unit: "px"
  },
  {
    key: "refraction",
    label: "Refraction",
    min: 0,
    max: 6,
    step: 0.25,
    unit: "px"
  },
  {
    key: "chromaticAberration",
    label: "Color dispersion",
    min: 0,
    max: 4,
    step: 0.1,
    unit: "px"
  },
  {
    key: "velocitySensitivity",
    label: "Motion sensitivity",
    min: 0.1,
    max: 3,
    step: 0.05,
    unit: "×"
  },
  {
    key: "peakHoldMs",
    label: "Peak hold",
    min: 0,
    max: 400,
    step: 10,
    unit: "ms"
  },
  {
    key: "decayMs",
    label: "Decay",
    min: 100,
    max: 1800,
    step: 50,
    unit: "ms"
  },
  {
    key: "oppositeEdgeResponse",
    label: "Opposite edge response",
    min: 0,
    max: 1,
    step: 0.05,
    unit: ""
  }
];

export type OpticsControlsProps = {
  config: SoftOpticsConfig;
  status: SoftOpticsStatus;
  debugBoundaries: boolean;
  onConfigChange: (config: SoftOpticsConfig) => void;
  onCompareChange: (active: boolean) => void;
  onDebugBoundariesChange: (active: boolean) => void;
};

function cloneConfig(
  config: Readonly<SoftOpticsConfig>
): SoftOpticsConfig {
  return { ...config, edges: [...config.edges] };
}

function statusLabel(status: SoftOpticsStatus): string {
  switch (status.mode) {
    case "loading":
      return "Preparing optics";
    case "webgl":
      return "WebGL optics";
    case "fallback":
      return "Soft fallback";
    case "disabled":
      return "Effect paused";
  }
}

export function OpticsControls({
  config,
  status,
  debugBoundaries,
  onConfigChange,
  onCompareChange,
  onDebugBoundariesChange
}: OpticsControlsProps) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<DemoPreset>("default");
  const [comparing, setComparing] = useState(false);
  const titleId = useId();
  const panelId = useId();
  const comparingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const hasOpenedRef = useRef(false);

  const finishCompare = useCallback(() => {
    if (!comparingRef.current) {
      return;
    }
    comparingRef.current = false;
    setComparing(false);
    onCompareChange(false);
  }, [onCompareChange]);

  const closePanel = useCallback(() => {
    finishCompare();
    setOpen(false);
  }, [finishCompare]);

  useEffect(() => {
    if (!comparing) {
      return;
    }

    const finishPointer = () => finishCompare();
    const finishKeyboard = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter") {
        finishCompare();
      }
    };

    window.addEventListener("pointerup", finishPointer);
    window.addEventListener("pointercancel", finishPointer);
    window.addEventListener("keyup", finishKeyboard);
    window.addEventListener("blur", finishPointer);

    return () => {
      window.removeEventListener("pointerup", finishPointer);
      window.removeEventListener("pointercancel", finishPointer);
      window.removeEventListener("keyup", finishKeyboard);
      window.removeEventListener("blur", finishPointer);
    };
  }, [comparing, finishCompare]);

  useEffect(() => finishCompare, [finishCompare]);

  useEffect(() => {
    if (open) {
      hasOpenedRef.current = true;
      closeRef.current?.focus();
      return;
    }

    if (hasOpenedRef.current) {
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () =>
      window.removeEventListener("keydown", closeOnEscape);
  }, [closePanel, open]);

  const startCompare = () => {
    if (comparingRef.current) {
      return;
    }
    comparingRef.current = true;
    setComparing(true);
    onCompareChange(true);
  };

  const applyPreset = (nextPreset: Exclude<DemoPreset, "custom">) => {
    setPreset(nextPreset);
    onConfigChange(cloneConfig(SOFT_OPTICS_PRESETS[nextPreset]));
  };

  const updateNumeric = (
    key: NumericConfigKey,
    value: number
  ) => {
    setPreset("custom");
    onConfigChange({ ...config, [key]: value });
  };

  return (
    <aside
      className="optics-controls"
      data-soft-optics-ignore
      data-optics-controls={open ? "open" : "closed"}
    >
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="optics-controls__trigger"
        hidden={open}
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <span className="optics-controls__trigger-mark" aria-hidden="true" />
        Tune optics
      </button>
      {open ? (
        <div
          aria-labelledby={titleId}
          aria-modal="false"
          className="optics-panel"
          id={panelId}
          role="dialog"
        >
          <header className="optics-panel__header">
            <div>
              <p className="eyebrow">Live shader lab</p>
              <h2 id={titleId}>Tune optics</h2>
            </div>
            <button
              aria-label="Close optics controls"
              className="icon-button"
              onClick={closePanel}
              ref={closeRef}
              type="button"
            >
              ×
            </button>
          </header>

          <div className="effect-toggle">
            <label htmlFor="effect-enabled">Effect enabled</label>
            <input
              checked={config.enabled}
              id="effect-enabled"
              onChange={(event) => {
                setPreset("custom");
                onConfigChange({
                  ...config,
                  enabled: event.currentTarget.checked
                });
              }}
              type="checkbox"
            />
          </div>

          <div aria-label="Optics presets" className="preset-switcher">
            {(["default", "subtle", "custom"] as const).map(
              (presetName) => (
                <button
                  aria-label={`${presetName[0]?.toUpperCase()}${presetName.slice(1)} preset`}
                  aria-pressed={preset === presetName}
                  disabled={presetName === "custom"}
                  key={presetName}
                  onClick={() => {
                    if (presetName !== "custom") {
                      applyPreset(presetName);
                    }
                  }}
                  type="button"
                >
                  {presetName}
                </button>
              )
            )}
          </div>

          <div className="slider-list">
            {sliders.map((slider) => (
              <label className="slider-control" key={slider.key}>
                <span>
                  <span>{slider.label}</span>
                  <output>
                    {config[slider.key]}
                    {slider.unit}
                  </output>
                </span>
                <input
                  aria-label={slider.label}
                  max={slider.max}
                  min={slider.min}
                  onChange={(event) =>
                    updateNumeric(
                      slider.key,
                      Number(event.currentTarget.value)
                    )
                  }
                  step={slider.step}
                  type="range"
                  value={config[slider.key]}
                />
              </label>
            ))}
          </div>

          <label className="debug-toggle">
            <span>Show optical boundaries</span>
            <input
              aria-label="Show optical boundaries"
              checked={debugBoundaries}
              onChange={(event) =>
                onDebugBoundariesChange(
                  event.currentTarget.checked
                )
              }
              type="checkbox"
            />
          </label>

          <footer className="optics-panel__footer">
            <div className="status-indicator" data-optics-status={status.mode}>
              <span aria-hidden="true" />
              {statusLabel(status)}
            </div>
            <div className="optics-panel__actions">
              <button
                aria-label="Compare without effect"
                aria-pressed={comparing}
                className="compare-button"
                onBlur={finishCompare}
                onKeyDown={(event) => {
                  if (
                    (event.key === " " || event.key === "Enter") &&
                    !event.repeat
                  ) {
                    event.preventDefault();
                    startCompare();
                  }
                }}
                onPointerCancel={finishCompare}
                onPointerDown={(event) => {
                  event.preventDefault();
                  startCompare();
                }}
                onPointerUp={finishCompare}
                type="button"
              >
                Hold to compare
              </button>
              <button
                aria-label="Reset to default"
                onClick={() => applyPreset("default")}
                type="button"
              >
                Reset
              </button>
            </div>
          </footer>
        </div>
      ) : null}
    </aside>
  );
}
