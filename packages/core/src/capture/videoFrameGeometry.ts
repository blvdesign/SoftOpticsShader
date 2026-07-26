export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VideoObjectFit =
  | "cover"
  | "contain"
  | "fill"
  | "none"
  | "scale-down";

export type VideoDrawMapping = {
  source: Rect;
  destination: Rect;
};

export type VideoDrawMappingInput = {
  intrinsicWidth: number;
  intrinsicHeight: number;
  elementRect: Rect;
  stripDocumentRect: Rect;
  objectFit: VideoObjectFit;
  objectPosition: string;
};

function isFiniteRect(rect: Rect): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

type AxisPosition = {
  fraction: number;
  pixelOffset: number;
  boxOffsetFraction: number;
};

const CENTER_POSITION: AxisPosition = {
  fraction: 0.5,
  pixelOffset: 0,
  boxOffsetFraction: 0
};

function numericPosition(token: string | undefined):
  | { kind: "percentage"; value: number }
  | { kind: "length"; value: number }
  | { kind: "calc"; percentage: number; pixels: number }
  | null {
  if (token === undefined) return null;
  const calcMatch = token.match(
    /^calc\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))%\s*([+-])\s*(\d+(?:\.\d*)?|\.\d+)px\s*\)$/
  );
  if (calcMatch) {
    const percentage = Number.parseFloat(calcMatch[1] ?? "");
    const pixels = Number.parseFloat(calcMatch[3] ?? "");
    if (Number.isFinite(percentage) && Number.isFinite(pixels)) {
      return {
        kind: "calc",
        percentage: percentage / 100,
        pixels: calcMatch[2] === "-" ? -pixels : pixels
      };
    }
  }
  const match = token.match(
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|%)$/
  );
  if (!match) return token === "0"
    ? { kind: "length", value: 0 }
    : null;
  const value = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(value)) return null;
  return match[2] === "%"
    ? { kind: "percentage", value: value / 100 }
    : { kind: "length", value };
}

function edgeAxis(token: string): "x" | "y" | null {
  if (token === "left" || token === "right") return "x";
  if (token === "top" || token === "bottom") return "y";
  return null;
}

function edgePosition(
  edge: string,
  offset?: ReturnType<typeof numericPosition>
): AxisPosition {
  const endEdge = edge === "right" || edge === "bottom";
  const direction = endEdge ? -1 : 1;
  const percentageOffset =
    offset?.kind === "percentage"
      ? offset.value
      : offset?.kind === "calc"
        ? offset.percentage
        : 0;
  return {
    fraction: endEdge
      ? 1 - percentageOffset
      : percentageOffset,
    pixelOffset:
      offset?.kind === "length"
        ? offset.value * direction
        : offset?.kind === "calc"
          ? offset.pixels * direction
          : 0,
    boxOffsetFraction: 0
  };
}

function standalonePosition(
  value: NonNullable<ReturnType<typeof numericPosition>>
): AxisPosition {
  if (value.kind === "calc") {
    return {
      fraction: value.percentage,
      pixelOffset: value.pixels,
      boxOffsetFraction: 0
    };
  }
  return value.kind === "percentage"
    ? {
        fraction: value.value,
        pixelOffset: 0,
        boxOffsetFraction: 0
      }
    : {
        fraction: 0,
        pixelOffset: value.value,
        boxOffsetFraction: 0
      };
}

function parseObjectPosition(value: string): {
  x: AxisPosition;
  y: AxisPosition;
} {
  const tokens =
    value
      .trim()
      .toLowerCase()
      .match(/calc\([^)]*\)|[^\s]+/g) ?? [];
  let x: AxisPosition | undefined;
  let y: AxisPosition | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    const axis = edgeAxis(token);
    if (axis) {
      const offset = numericPosition(tokens[index + 1] ?? "");
      const position = edgePosition(token, offset);
      if (axis === "x" && !x) x = position;
      if (axis === "y" && !y) y = position;
      if (offset) index += 1;
      continue;
    }
    if (token === "center") {
      if (!x) x = CENTER_POSITION;
      else if (!y) y = CENTER_POSITION;
      continue;
    }
    const numeric = numericPosition(token);
    if (numeric) {
      if (!x) x = standalonePosition(numeric);
      else if (!y) y = standalonePosition(numeric);
    }
  }

  return {
    x: x ?? CENTER_POSITION,
    y: y ?? CENTER_POSITION
  };
}

function positionedStart(
  elementStart: number,
  elementSize: number,
  renderedSize: number,
  position: AxisPosition
): number {
  return (
    elementStart +
    (elementSize - renderedSize) * position.fraction +
    position.pixelOffset +
    elementSize * position.boxOffsetFraction
  );
}

function intersect(...rects: Rect[]): Rect | null {
  const left = Math.max(...rects.map((rect) => rect.x));
  const top = Math.max(...rects.map((rect) => rect.y));
  const right = Math.min(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.min(...rects.map((rect) => rect.y + rect.height));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function calculateVideoDrawMapping({
  intrinsicWidth,
  intrinsicHeight,
  elementRect,
  stripDocumentRect,
  objectFit,
  objectPosition
}: VideoDrawMappingInput): VideoDrawMapping | null {
  if (
    !Number.isFinite(intrinsicWidth) ||
    !Number.isFinite(intrinsicHeight) ||
    intrinsicWidth <= 0 ||
    intrinsicHeight <= 0 ||
    !isFiniteRect(elementRect) ||
    !isFiniteRect(stripDocumentRect)
  ) {
    return null;
  }

  let scaleX = elementRect.width / intrinsicWidth;
  let scaleY = elementRect.height / intrinsicHeight;
  if (objectFit !== "fill") {
    const containScale = Math.min(scaleX, scaleY);
    const scale =
      objectFit === "none"
        ? 1
        : objectFit === "scale-down"
          ? Math.min(1, containScale)
          : objectFit === "contain"
            ? containScale
            : Math.max(scaleX, scaleY);
    scaleX = scale;
    scaleY = scale;
  }

  const renderedWidth = intrinsicWidth * scaleX;
  const renderedHeight = intrinsicHeight * scaleY;
  const position = parseObjectPosition(objectPosition);
  const contentRect: Rect = {
    x: positionedStart(
      elementRect.x,
      elementRect.width,
      renderedWidth,
      position.x
    ),
    y: positionedStart(
      elementRect.y,
      elementRect.height,
      renderedHeight,
      position.y
    ),
    width: renderedWidth,
    height: renderedHeight
  };
  const visible = intersect(contentRect, elementRect, stripDocumentRect);
  if (!visible) return null;

  return {
    source: {
      x: (visible.x - contentRect.x) / scaleX,
      y: (visible.y - contentRect.y) / scaleY,
      width: visible.width / scaleX,
      height: visible.height / scaleY
    },
    destination: {
      x: visible.x - stripDocumentRect.x,
      y: visible.y - stripDocumentRect.y,
      width: visible.width,
      height: visible.height
    }
  };
}
