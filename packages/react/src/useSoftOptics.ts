import { useEffect, useMemo, useRef } from "react";
import {
  createSoftOptics,
  SOFT_OPTICS_PRESETS,
  type CreateSoftOpticsOptions
} from "@blvdesign/soft-optics";

import type {
  SoftOpticsControllerRef,
  SoftOpticsOptions
} from "./types";

export function useSoftOptics(
  options: SoftOpticsOptions = {}
): SoftOpticsControllerRef {
  const controllerRef = useRef<
    SoftOpticsControllerRef["current"]
  >(null);
  const statusCallbackRef = useRef(options.onStatusChange);

  useEffect(() => {
    statusCallbackRef.current = options.onStatusChange;
  }, [options.onStatusChange]);

  const effectiveConfig = useMemo(
    () => ({
      ...SOFT_OPTICS_PRESETS[options.preset ?? "default"],
      ...options.config
    }),
    [options.config, options.preset]
  );
  const committedConfigRef = useRef(effectiveConfig);
  const mountedConfigRef = useRef(effectiveConfig);

  useEffect(() => {
    committedConfigRef.current = effectiveConfig;
  }, [effectiveConfig]);

  const root = options.root;
  const exclude = options.exclude;
  const layerParent = options.layer?.parent;
  const layerZIndex = options.layer?.zIndex;
  const allowLiveVideo = options.allowLiveVideo;

  useEffect(() => {
    const coreOptions: CreateSoftOpticsOptions = {
      onStatusChange: (status) => {
        statusCallbackRef.current?.(status);
      },
      ...(root !== undefined ? { root } : {}),
      ...(exclude !== undefined ? { exclude } : {}),
      ...(layerParent !== undefined || layerZIndex !== undefined
        ? {
            layer: {
              ...(layerParent !== undefined
                ? { parent: layerParent }
                : {}),
              ...(layerZIndex !== undefined
                ? { zIndex: layerZIndex }
                : {})
            }
          }
        : {}),
      ...(allowLiveVideo !== undefined
        ? { allowLiveVideo }
        : {}),
      config: committedConfigRef.current
    };
    const controller = createSoftOptics(coreOptions);

    controllerRef.current = controller;
    mountedConfigRef.current = committedConfigRef.current;
    void controller.mount();

    return () => {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      controller.destroy();
    };
  }, [
    allowLiveVideo,
    exclude,
    layerParent,
    layerZIndex,
    root
  ]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (
      controller === null ||
      mountedConfigRef.current === effectiveConfig
    ) {
      return;
    }

    controller.update(effectiveConfig);
    mountedConfigRef.current = effectiveConfig;
  }, [effectiveConfig]);

  return controllerRef;
}
