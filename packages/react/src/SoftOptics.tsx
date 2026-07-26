import type { ReactElement } from "react";

import type { SoftOpticsProps } from "./types";
import { useSoftOptics } from "./useSoftOptics";

export function SoftOptics(
  props: SoftOpticsProps
): ReactElement | null {
  useSoftOptics(props);
  return null;
}
