import { describe, expect, it } from "vitest";
import { APP_BREAKPOINTS } from "./breakpoints";
import { density, resolveDensity } from "./density";

describe("compact and wide control density", () => {
  it.each([
    [599, 44],
    [600, 28],
    [698, 28],
    [719, 28],
    [720, 28],
  ])("keeps style and prop sizing aligned at %i dp", (width, expectedSize) => {
    const breakpoint = Object.entries(APP_BREAKPOINTS).findLast(([, min]) => width >= min)?.[0];
    const styleSize = Object.entries(density.iconButton).findLast(
      ([key]) => width >= APP_BREAKPOINTS[key as keyof typeof APP_BREAKPOINTS],
    )?.[1];
    expect(styleSize).toBe(expectedSize);
    expect(resolveDensity({ breakpoint }, density.iconButton)).toBe(expectedSize);
  });

  it("fits all five footer controls in the 200 dp sidebar at the wide boundary", () => {
    expect(5 * density.iconButton.medium + 16).toBeLessThanOrEqual(200);
  });
});
