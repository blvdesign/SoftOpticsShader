import { describe, expect, it } from "vitest";

import {
  calculateVideoDrawMapping,
  type Rect
} from "./videoFrameGeometry";

const elementRect: Rect = { x: 100, y: 200, width: 200, height: 100 };
const fullStrip: Rect = { x: 0, y: 0, width: 500, height: 500 };

describe("calculateVideoDrawMapping", () => {
  it("crops a cover frame around the default center position", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit: "cover",
        objectPosition: "center"
      })
    ).toEqual({
      source: { x: 0, y: 25, width: 100, height: 50 },
      destination: elementRect
    });
  });

  it("letterboxes a contain frame and honors keyword positions", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit: "contain",
        objectPosition: "right bottom"
      })
    ).toEqual({
      source: { x: 0, y: 0, width: 100, height: 100 },
      destination: { x: 200, y: 200, width: 100, height: 100 }
    });
  });

  it("stretches fill content independently on both axes", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 50,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit: "fill",
        objectPosition: "0% 0%"
      })
    ).toEqual({
      source: { x: 0, y: 0, width: 100, height: 50 },
      destination: elementRect
    });
  });

  it("renders object-fit none at intrinsic size", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 50,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit: "none",
        objectPosition: "center"
      })
    ).toEqual({
      source: { x: 0, y: 0, width: 100, height: 50 },
      destination: { x: 150, y: 225, width: 100, height: 50 }
    });
  });

  it("implements scale-down as the smaller of none and contain", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 50,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit: "scale-down",
        objectPosition: "center"
      })
    ).toEqual({
      source: { x: 0, y: 0, width: 100, height: 50 },
      destination: { x: 150, y: 225, width: 100, height: 50 }
    });
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 400,
        intrinsicHeight: 200,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit: "scale-down",
        objectPosition: "center"
      })
    ).toEqual({
      source: { x: 0, y: 0, width: 400, height: 200 },
      destination: elementRect
    });
  });

  it("honors percentage object positions when cropping", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit: "cover",
        objectPosition: "100% 0%"
      })
    ).toEqual({
      source: { x: 0, y: 0, width: 100, height: 50 },
      destination: elementRect
    });
  });

  it("supports computed pixel lengths from the top-left origin", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit: "cover",
        objectPosition: "0px 0px"
      })
    ).toEqual({
      source: { x: 0, y: 0, width: 100, height: 50 },
      destination: elementRect
    });
  });

  it("combines a pixel x offset with a percentage y position", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 50,
        elementRect: { x: 100, y: 200, width: 200, height: 200 },
        stripDocumentRect: fullStrip,
        objectFit: "contain",
        objectPosition: "12px 75%"
      })
    ).toEqual({
      source: { x: 0, y: 0, width: 94, height: 50 },
      destination: { x: 112, y: 275, width: 188, height: 100 }
    });
  });

  it("supports four-token right and bottom edge offsets", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit: "contain",
        objectPosition: "right 12px bottom 5px"
      })
    ).toEqual({
      source: { x: 0, y: 5, width: 100, height: 95 },
      destination: { x: 188, y: 200, width: 100, height: 95 }
    });
  });

  it.each(["cover", "contain"] as const)(
    "normalizes authored end-edge percentage offsets under %s",
    (objectFit) => {
      const input = {
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit
      };

      expect(
        calculateVideoDrawMapping({
          ...input,
          objectPosition: "right 10% bottom 20%"
        })
      ).toEqual(
        calculateVideoDrawMapping({
          ...input,
          objectPosition: "90% 80%"
        })
      );
    }
  );

  it.each(["cover", "contain"] as const)(
    "normalizes authored start-edge percentage offsets under %s",
    (objectFit) => {
      const input = {
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit
      };

      expect(
        calculateVideoDrawMapping({
          ...input,
          objectPosition: "left 10% top 20%"
        })
      ).toEqual(
        calculateVideoDrawMapping({
          ...input,
          objectPosition: "10% 20%"
        })
      );
    }
  );

  it("parses computed calc serialization for right and bottom offsets", () => {
    const input = {
      intrinsicWidth: 100,
      intrinsicHeight: 100,
      elementRect,
      stripDocumentRect: fullStrip,
      objectFit: "contain" as const
    };

    expect(
      calculateVideoDrawMapping({
        ...input,
        objectPosition: "calc(100% - 12px) calc(100% - 5px)"
      })
    ).toEqual(
      calculateVideoDrawMapping({
        ...input,
        objectPosition: "right 12px bottom 5px"
      })
    );
  });

  it("supports simple calc percentage plus and minus pixel offsets", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        elementRect,
        stripDocumentRect: fullStrip,
        objectFit: "contain",
        objectPosition: "calc(25% + 8px) calc(50% - 3px)"
      })
    ).toEqual({
      source: { x: 0, y: 3, width: 100, height: 97 },
      destination: { x: 133, y: 200, width: 100, height: 97 }
    });
  });

  it("falls back safely when object-position tokens are invalid", () => {
    const input = {
      intrinsicWidth: 100,
      intrinsicHeight: 100,
      elementRect,
      stripDocumentRect: fullStrip,
      objectFit: "cover" as const
    };

    expect(
      calculateVideoDrawMapping({
        ...input,
        objectPosition: "not-a-position ???"
      })
    ).toEqual(
      calculateVideoDrawMapping({ ...input, objectPosition: "center" })
    );
    expect(
      calculateVideoDrawMapping({
        ...input,
        objectPosition: "calc(100% * 12px) calc(nope)"
      })
    ).toEqual(
      calculateVideoDrawMapping({ ...input, objectPosition: "center" })
    );
  });

  it("maps only the intersection of the media, element, and strip", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 200,
        intrinsicHeight: 100,
        elementRect,
        stripDocumentRect: { x: 150, y: 225, width: 50, height: 50 },
        objectFit: "fill",
        objectPosition: "center"
      })
    ).toEqual({
      source: { x: 50, y: 25, width: 50, height: 50 },
      destination: { x: 0, y: 0, width: 50, height: 50 }
    });
  });

  it("returns null for no intersection or invalid finite dimensions", () => {
    expect(
      calculateVideoDrawMapping({
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        elementRect,
        stripDocumentRect: { x: 0, y: 0, width: 10, height: 10 },
        objectFit: "cover",
        objectPosition: "center"
      })
    ).toBeNull();

    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        calculateVideoDrawMapping({
          intrinsicWidth: invalid,
          intrinsicHeight: 100,
          elementRect,
          stripDocumentRect: fullStrip,
          objectFit: "cover",
          objectPosition: "center"
        })
      ).toBeNull();
    }
  });
});
