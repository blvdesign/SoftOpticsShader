import type { RefObject } from "react";
import type {
  CreateSoftOpticsOptions,
  SoftOpticsConfig,
  SoftOpticsController,
  SoftOpticsPresetName
} from "@blvdesign/soft-optics";

export type SoftOpticsOptions = Omit<
  CreateSoftOpticsOptions,
  "config"
> & {
  preset?: SoftOpticsPresetName;
  config?: Partial<SoftOpticsConfig>;
};

export type SoftOpticsProps = SoftOpticsOptions;

export type SoftOpticsControllerRef = RefObject<
  SoftOpticsController | null
>;

export type {
  SoftOpticsController,
  SoftOpticsPresetName,
  SoftOpticsStatus
} from "@blvdesign/soft-optics";
