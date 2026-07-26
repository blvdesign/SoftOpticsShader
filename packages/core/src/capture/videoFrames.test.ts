// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  collectVideoFrameSnapshots,
  frameIntersectsStrip,
  SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE
} from "./videoFrames";
import { calculateVideoDrawMapping } from "./videoFrameGeometry";

function setMediaState(
  video: HTMLVideoElement,
  state: {
    readyState?: number;
    videoWidth?: number;
    videoHeight?: number;
    paused?: boolean;
    ended?: boolean;
  } = {}
) {
  for (const [key, value] of Object.entries({
    readyState: 2,
    videoWidth: 1920,
    videoHeight: 1080,
    paused: false,
    ended: false,
    ...state
  })) {
    Object.defineProperty(video, key, { configurable: true, value });
  }
}

function rect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({})
  };
}

describe("collectVideoFrameSnapshots", () => {
  it("collects document coordinates, visual state, and dynamic state", () => {
    const video = document.createElement("video");
    setMediaState(video);
    video.getBoundingClientRect = () => rect(20, 30, 320, 180);
    const readStyle = vi.fn(() => ({
      display: "block",
      visibility: "visible",
      opacity: "0.6",
      objectFit: "contain",
      objectPosition: "25% 75%"
    }) as CSSStyleDeclaration);

    expect(
      collectVideoFrameSnapshots([video], {
        scrollX: 7,
        scrollY: 11,
        readStyle,
        hitTest: () => video
      })
    ).toEqual([{
      video,
      rect: { x: 27, y: 41, width: 320, height: 180 },
      objectFit: "contain",
      objectPosition: "25% 75%",
      opacity: 0.6,
      dynamic: true,
      compositeSafe: false
    }]);
  });

  it("skips hidden, zero-sized, transparent, and unready media", () => {
    const cases: Array<{
      state: Parameters<typeof setMediaState>[1];
      style: Partial<CSSStyleDeclaration>;
      size?: readonly [number, number];
    }> = [
      { state: { readyState: 1 }, style: {} },
      { state: {}, style: { display: "none" } },
      { state: {}, style: { visibility: "hidden" } },
      { state: {}, style: { opacity: "0" } },
      { state: {}, style: {}, size: [0, 100] }
    ];

    for (const item of cases) {
      const video = document.createElement("video");
      setMediaState(video, item.state);
      const [width, height] = item.size ?? [100, 100];
      video.getBoundingClientRect = () => rect(0, 0, width, height);

      expect(
        collectVideoFrameSnapshots([video], {
          readStyle: () => ({
            display: "block",
            visibility: "visible",
            opacity: "1",
            objectFit: "cover",
            objectPosition: "center",
            ...item.style
          }) as CSSStyleDeclaration
        })
      ).toEqual([]);
    }
  });

  it("uses the injected owner realm and captures the nearest clipping ancestor", () => {
    const clip = document.createElement("div");
    const video = document.createElement("video");
    clip.append(video);
    document.body.append(clip);
    setMediaState(video);
    video.getBoundingClientRect = () => rect(10, 20, 100, 50);
    clip.getBoundingClientRect = () => rect(5, 15, 120, 70);
    const readStyle = (element: Element) => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      objectFit: "cover",
      objectPosition: "center",
      overflow: element === clip ? "hidden" : "visible",
      overflowX: "visible",
      overflowY: "visible",
      borderTopLeftRadius: element === video ? "0px" : "12px",
      borderTopRightRadius: element === video ? "0px" : "8px",
      borderBottomRightRadius: element === video ? "0px" : "4px",
      borderBottomLeftRadius: "0px"
    }) as CSSStyleDeclaration;
    const ownerWindow = {
      scrollX: 3,
      scrollY: 4,
      getComputedStyle: readStyle
    } as unknown as Window;

    expect(
      collectVideoFrameSnapshots([video], { ownerWindow })
    ).toEqual([expect.objectContaining({
      rect: { x: 13, y: 24, width: 100, height: 50 },
      clip: { x: 8, y: 19, width: 120, height: 70, radius: 12 }
    })]);
    clip.remove();
  });

  it("preserves video radius and every clipping ancestor", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    const video = document.createElement("video");
    outer.append(inner);
    inner.append(video);
    document.body.append(outer);
    setMediaState(video);
    video.getBoundingClientRect = () => rect(20, 30, 100, 50);
    inner.getBoundingClientRect = () => rect(15, 25, 110, 60);
    outer.getBoundingClientRect = () => rect(10, 20, 120, 70);
    const readStyle = (element: Element) => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      objectFit: "cover",
      objectPosition: "center",
      overflow: element === video ? "visible" : "hidden",
      overflowX: "visible",
      overflowY: "visible",
      borderTopLeftRadius:
        element === video ? "9px" : element === inner ? "7px" : "5px",
      borderTopRightRadius: "0px",
      borderBottomRightRadius: "0px",
      borderBottomLeftRadius: "0px"
    }) as CSSStyleDeclaration;

    expect(
      collectVideoFrameSnapshots([video], { readStyle })[0]?.clips
    ).toEqual([
      { x: 20, y: 30, width: 100, height: 50, radius: 9 },
      { x: 15, y: 25, width: 110, height: 60, radius: 7 },
      { x: 10, y: 20, width: 120, height: 70, radius: 5 }
    ]);
    outer.remove();
  });

  it("marks a frame unsafe when hit testing finds an overlay", () => {
    const video = document.createElement("video");
    const overlay = document.createElement("div");
    document.body.append(video, overlay);
    video.setAttribute(SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE, "");
    setMediaState(video);
    video.getBoundingClientRect = () => rect(20, 30, 100, 50);

    expect(collectVideoFrameSnapshots([video], {
      readStyle: () => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
        objectFit: "cover",
        objectPosition: "center",
        overflow: "visible",
        overflowX: "visible",
        overflowY: "visible",
        borderTopLeftRadius: "0px",
        borderTopRightRadius: "0px",
        borderBottomRightRadius: "0px",
        borderBottomLeftRadius: "0px"
      }) as CSSStyleDeclaration,
      hitTest: () => overlay
    })[0]?.compositeSafe).toBe(false);
    video.remove();
    overlay.remove();
  });

  it("samples the visible intersection when the raw center is outside the viewport", () => {
    const video = document.createElement("video");
    const overlay = document.createElement("div");
    setMediaState(video);
    video.setAttribute(SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE, "");
    video.getBoundingClientRect = () => rect(-180, 20, 200, 100);
    const sampled: Array<[number, number]> = [];

    const [snapshot] = collectVideoFrameSnapshots([video], {
      ownerWindow: {
        innerWidth: 100,
        innerHeight: 100,
        scrollX: 0,
        scrollY: 0,
        getComputedStyle: () => ({
          display: "block",
          visibility: "visible",
          opacity: "1",
          objectFit: "cover",
          objectPosition: "center",
          overflow: "visible",
          overflowX: "visible",
          overflowY: "visible",
          filter: "none",
          backdropFilter: "none",
          maskImage: "none",
          clipPath: "none",
          mixBlendMode: "normal"
        }) as CSSStyleDeclaration
      } as unknown as Window,
      hitTest: (x, y) => {
        sampled.push([x, y]);
        return x > 15 ? overlay : video;
      }
    });

    expect(sampled.length).toBeGreaterThan(1);
    expect(sampled.every(([x, y]) =>
      x >= 0 && x <= 20 && y >= 20 && y <= 100
    )).toBe(true);
    expect(snapshot?.compositeSafe).toBe(false);
  });

  it("treats a null or unavailable hit-test result as unsafe", () => {
    const video = document.createElement("video");
    setMediaState(video);
    video.setAttribute(SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE, "");
    video.getBoundingClientRect = () => rect(20, 30, 100, 50);
    const style = () => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      objectFit: "cover",
      objectPosition: "center",
      overflow: "visible",
      overflowX: "visible",
      overflowY: "visible",
      filter: "none",
      backdropFilter: "none",
      maskImage: "none",
      clipPath: "none",
      mixBlendMode: "normal"
    }) as CSSStyleDeclaration;

    expect(collectVideoFrameSnapshots([video], {
      readStyle: style,
      hitTest: () => null
    })[0]?.compositeSafe).toBe(false);
    expect(collectVideoFrameSnapshots([video], {
      readStyle: style,
      hitTest: () => {
        throw new DOMException("Unavailable", "SecurityError");
      }
    })[0]?.compositeSafe).toBe(false);
    expect(collectVideoFrameSnapshots([video], {
      readStyle: style,
      ownerWindow: {
        innerWidth: 500,
        innerHeight: 500,
        scrollX: 0,
        scrollY: 0,
        getComputedStyle: style
      } as unknown as Window
    })[0]?.compositeSafe).toBe(false);
  });

  it.each([
    ["opacity", { opacity: "0.8" }],
    ["filter", { filter: "blur(2px)" }],
    ["mask", { maskImage: "linear-gradient(black, transparent)" }]
  ])("rejects unsupported ancestor %s compositing", (_name, override) => {
    const ancestor = document.createElement("div");
    const video = document.createElement("video");
    ancestor.append(video);
    document.body.append(ancestor);
    setMediaState(video);
    video.setAttribute(SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE, "");
    video.getBoundingClientRect = () => rect(20, 30, 100, 50);
    const [snapshot] = collectVideoFrameSnapshots([video], {
      readStyle: (element) => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
        objectFit: "cover",
        objectPosition: "center",
        overflow: "visible",
        overflowX: "visible",
        overflowY: "visible",
        filter: "none",
        backdropFilter: "none",
        maskImage: "none",
        clipPath: "none",
        mixBlendMode: "normal",
        ...(element === ancestor ? override : {})
      }) as CSSStyleDeclaration,
      hitTest: () => video
    });
    expect(snapshot?.compositeSafe).toBe(false);
    ancestor.remove();
  });

  it("requires explicit live-video opt-in before compositing", () => {
    const video = document.createElement("video");
    setMediaState(video);
    video.getBoundingClientRect = () => rect(20, 30, 100, 50);
    const readStyle = () => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      objectFit: "cover",
      objectPosition: "center",
      overflow: "visible",
      overflowX: "visible",
      overflowY: "visible",
      filter: "none",
      backdropFilter: "none",
      maskImage: "none",
      clipPath: "none",
      mixBlendMode: "normal"
    }) as CSSStyleDeclaration;

    expect(collectVideoFrameSnapshots([video], {
      readStyle,
      hitTest: () => video
    })[0]?.compositeSafe).toBe(false);

    video.setAttribute(SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE, "");
    expect(collectVideoFrameSnapshots([video], {
      readStyle,
      hitTest: () => video
    })[0]?.compositeSafe).toBe(true);
  });

  it("accepts a caller opt-in predicate but keeps safety checks mandatory", () => {
    const ancestor = document.createElement("div");
    const video = document.createElement("video");
    ancestor.append(video);
    document.body.append(ancestor);
    setMediaState(video);
    video.getBoundingClientRect = () => rect(20, 30, 100, 50);
    const allowLiveVideo = vi.fn(() => true);
    const [safe] = collectVideoFrameSnapshots([video], {
      allowLiveVideo,
      readStyle: () => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
        objectFit: "cover",
        objectPosition: "center",
        overflow: "visible",
        overflowX: "visible",
        overflowY: "visible",
        filter: "none",
        backdropFilter: "none",
        maskImage: "none",
        clipPath: "none",
        mixBlendMode: "normal"
      }) as CSSStyleDeclaration,
      hitTest: () => video
    });
    expect(allowLiveVideo).toHaveBeenCalledWith(video);
    expect(safe?.compositeSafe).toBe(true);

    expect(collectVideoFrameSnapshots([video], {
      allowLiveVideo,
      readStyle: (element) => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
        objectFit: "cover",
        objectPosition: "center",
        overflow: "visible",
        overflowX: "visible",
        overflowY: "visible",
        filter: element === ancestor ? "blur(1px)" : "none",
        backdropFilter: "none",
        maskImage: "none",
        clipPath: "none",
        mixBlendMode: "normal"
      }) as CSSStyleDeclaration,
      hitTest: () => video
    })[0]?.compositeSafe).toBe(false);
    ancestor.remove();
  });

  it("never changes video playback or source state", () => {
    const video = document.createElement("video");
    video.src = "https://example.test/movie.mp4";
    video.autoplay = true;
    video.currentTime = 3;
    setMediaState(video);
    video.getBoundingClientRect = () => rect(0, 0, 100, 100);
    const pause = vi.spyOn(video, "pause");
    const play = vi.spyOn(video, "play");
    const load = vi.spyOn(video, "load");
    const before = {
      src: video.src,
      autoplay: video.autoplay,
      currentTime: video.currentTime
    };

    collectVideoFrameSnapshots([video], {
      readStyle: () => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
        objectFit: "cover",
        objectPosition: "center"
      }) as CSSStyleDeclaration
    });

    expect({ src: video.src, autoplay: video.autoplay, currentTime: video.currentTime })
      .toEqual(before);
    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("feeds computed snapshot object-position into the same mapping as authored edges", () => {
    const video = document.createElement("video");
    setMediaState(video, {
      videoWidth: 100,
      videoHeight: 100
    });
    video.getBoundingClientRect = () => rect(100, 200, 200, 100);
    const [snapshot] = collectVideoFrameSnapshots([video], {
      readStyle: () => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
        objectFit: "contain",
        objectPosition: "calc(100% - 12px) calc(100% - 5px)"
      }) as CSSStyleDeclaration
    });
    expect(snapshot).toBeDefined();
    const stripDocumentRect = { x: 0, y: 0, width: 500, height: 500 };
    const computedMapping = calculateVideoDrawMapping({
      intrinsicWidth: video.videoWidth,
      intrinsicHeight: video.videoHeight,
      elementRect: snapshot!.rect,
      stripDocumentRect,
      objectFit: snapshot!.objectFit,
      objectPosition: snapshot!.objectPosition
    });
    const authoredMapping = calculateVideoDrawMapping({
      intrinsicWidth: video.videoWidth,
      intrinsicHeight: video.videoHeight,
      elementRect: snapshot!.rect,
      stripDocumentRect,
      objectFit: snapshot!.objectFit,
      objectPosition: "right 12px bottom 5px"
    });

    expect(computedMapping).toEqual(authoredMapping);
  });
});

describe("frameIntersectsStrip", () => {
  const frame = {
    rect: { x: 10, y: 100, width: 100, height: 50 }
  };

  it("detects partial intersections and rejects touching or distant strips", () => {
    expect(frameIntersectsStrip(frame, { x: 0, y: 125, width: 200, height: 50 }))
      .toBe(true);
    expect(frameIntersectsStrip(frame, { x: 0, y: 150, width: 200, height: 50 }))
      .toBe(false);
    expect(frameIntersectsStrip(frame, { x: 110, y: 100, width: 20, height: 20 }))
      .toBe(false);
  });
});
