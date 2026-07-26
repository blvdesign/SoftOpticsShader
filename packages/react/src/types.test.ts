import { expectTypeOf, it } from "vitest";

import type {
  SoftOpticsOptions,
  SoftOpticsPresetName,
  SoftOpticsProps
} from "./index";

it("exports public preset typings for component and hook options", () => {
  expectTypeOf<SoftOpticsPresetName>().toEqualTypeOf<
    "default" | "subtle"
  >();
  expectTypeOf<SoftOpticsOptions>().toMatchTypeOf<{
    preset?: SoftOpticsPresetName;
  }>();
  expectTypeOf<SoftOpticsProps>().toMatchTypeOf<
    SoftOpticsOptions
  >();
});
