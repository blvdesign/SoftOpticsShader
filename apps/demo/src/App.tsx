import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent
} from "react";
import {
  DEFAULT_SOFT_OPTICS_CONFIG,
  type SoftOpticsConfig,
  type SoftOpticsStatus
} from "@blvdesign/soft-optics";
import { SoftOptics } from "@blvdesign/soft-optics-react";

import { CodeExample } from "./components/CodeExample";
import { OpticsControls } from "./components/OpticsControls";
import {
  principles,
  reactCode,
  technicalNotes,
  vanillaCode
} from "./content";

const mediaPath = (file: string) =>
  `${import.meta.env.BASE_URL}media/${file}`;

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const query = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const updatePreference = () =>
      setReducedMotion(query.matches);

    updatePreference();
    query.addEventListener("change", updatePreference);
    return () =>
      query.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}

function useOpticsRouteEnabled(): boolean {
  const readRoute = () =>
    typeof window === "undefined" ||
    new URLSearchParams(window.location.search).get("optics") !==
      "off";
  const [enabled, setEnabled] = useState(readRoute);

  useEffect(() => {
    const updateRoute = () => setEnabled(readRoute());
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);

  return enabled;
}

function requestVideoPlayback(
  event: SyntheticEvent<HTMLVideoElement>,
  shouldPlay: boolean
) {
  const video = event.currentTarget;
  if (!video.muted) {
    video.muted = true;
  }
  if (!shouldPlay) {
    video.pause();
    return;
  }
  void video.play().catch(() => {
    // The poster remains visible if a browser policy blocks autoplay.
  });
}

function OpticalMotionVideo() {
  const reducedMotion = usePrefersReducedMotion();
  const [pausedByViewer, setPausedByViewer] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const shouldPlay = !reducedMotion && !pausedByViewer;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!video.muted) {
      video.muted = true;
    }
    if (shouldPlay) {
      void video.play().catch(() => {
        // The poster and play control remain usable if autoplay is blocked.
      });
    } else {
      video.pause();
    }

    return () => video.pause();
  }, [shouldPlay]);

  const controlLabel = reducedMotion
    ? "Motion paused"
    : pausedByViewer
      ? "Play motion"
      : "Pause motion";

  return (
    <figure className="motion-frame">
      <video
        aria-label="Slowly moving translucent ribbon study"
        data-soft-optics-live
        loop
        muted
        onCanPlay={(event) =>
          requestVideoPlayback(event, shouldPlay)
        }
        playsInline
        poster={mediaPath("editorial-hero.webp")}
        preload="metadata"
        ref={videoRef}
        src={mediaPath("optical-motion.webm")}
      />
      <button
        aria-label={controlLabel}
        className="motion-frame__control"
        data-soft-optics-ignore
        disabled={reducedMotion}
        onClick={() => setPausedByViewer((paused) => !paused)}
        type="button"
      >
        <span aria-hidden="true">
          {shouldPlay ? "Ⅱ" : "▶"}
        </span>
        {controlLabel}
      </button>
      <figcaption>
        <span>Live source</span>
        <span>VP9 · local · looping</span>
      </figcaption>
    </figure>
  );
}

export function App() {
  const opticsRouteEnabled = useOpticsRouteEnabled();
  const [config, setConfig] = useState<SoftOpticsConfig>({
    ...DEFAULT_SOFT_OPTICS_CONFIG,
    edges: [...DEFAULT_SOFT_OPTICS_CONFIG.edges]
  });
  const [status, setStatus] = useState<SoftOpticsStatus>({
    mode: "loading"
  });
  const [comparing, setComparing] = useState(false);
  const [debugBoundaries, setDebugBoundaries] =
    useState(false);
  const [opticsRoot, setOpticsRoot] =
    useState<HTMLElement | null>(null);
  const captureContentRoot = useCallback(
    (node: HTMLElement | null) => {
      setOpticsRoot((current) =>
        current === node ? current : node
      );
    },
    []
  );

  const activeConfig = useMemo(
    () => ({
      ...config,
      enabled: config.enabled && !comparing
    }),
    [comparing, config]
  );

  return (
    <>
      <nav
        aria-label="Primary"
        className="site-nav"
        data-soft-optics-ignore
      >
        <a className="wordmark" href="#top">
          <span aria-hidden="true" />
          Soft Optics
        </a>
        <div className="site-nav__links">
          <a href="#how-it-works">How it works</a>
          <a href="#install">Install</a>
          <a
            href="https://github.com/blvdesign/SoftOpticsShader"
            rel="noreferrer"
            target="_blank"
          >
            GitHub ↗
          </a>
        </div>
      </nav>

      <main id="top" ref={captureContentRoot}>
        <section className="hero shell">
          <div className="hero__copy">
            <p className="eyebrow">
              Open-source WebGL effect · v0.1
            </p>
            <h1>
              A softer edge
              <br />
              to the viewport.
            </h1>
            <p className="hero__lede">
              Progressive blur, gentle refraction, and restrained
              color dispersion that respond to the way a page moves.
            </p>
            <a className="text-link" href="#experience">
              Scroll into the effect <span>↓</span>
            </a>
          </div>

          <div className="hero__fact">
            <span>Optical profile</span>
            <strong>7vh</strong>
            <p>
              A continuous field at both viewport edges, strongest at
              the glass and feathered toward the page.
            </p>
          </div>
        </section>

        <figure className="hero-media shell-wide" id="experience">
          <img
            alt="A translucent ivory ribbon bending through a soft optical field"
            decoding="async"
            fetchPriority="high"
            height="941"
            src={mediaPath("editorial-hero.webp")}
            width="1672"
          />
          <figcaption>
            <span>01 / Progressive field</span>
            <span>Blur · bend · disperse</span>
          </figcaption>
        </figure>

        <section
          className="statement shell"
          id="how-it-works"
        >
          <p className="eyebrow">Designed for continuity</p>
          <h2>
            Not a fog layer.
            <br />
            An optical boundary.
          </h2>
          <p className="statement__body">
            Soft Optics samples the page itself, then reshapes only the
            top and bottom edges. Fine type, image contours, and motion
            remain recognizable while they gently diffuse into the
            viewport.
          </p>
        </section>

        <section className="principles shell">
          {principles.map((principle) => (
            <article className="principle" key={principle.number}>
              <span>{principle.number}</span>
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
            </article>
          ))}
        </section>

        <section className="motion-section shell-wide">
          <div className="motion-section__copy">
            <p className="eyebrow">Live media compositing</p>
            <h2>Motion passes through.</h2>
            <p>
              The video below stays a real, playing video—even while
              its current frame crosses an optical edge.
            </p>
          </div>
          <OpticalMotionVideo />
        </section>

        <section className="detail-study shell">
          <div className="detail-study__image">
            <img
              alt="An ivory membrane crossing a diagonal optical transition"
              height="941"
              loading="lazy"
              src={mediaPath("editorial-detail.webp")}
              width="1672"
            />
          </div>
          <div className="detail-study__copy">
            <p className="eyebrow">What the shader preserves</p>
            <h2>Shape first. Effect second.</h2>
            <p>
              The center remains legible. Near the edge, blur grows
              progressively while a small directional offset creates
              a physical lens-like bend.
            </p>
            <dl>
              <div>
                <dt>Blur</dt>
                <dd>20px max</dd>
              </div>
              <div>
                <dt>Refraction</dt>
                <dd>3px</dd>
              </div>
              <div>
                <dt>Dispersion</dt>
                <dd>2px</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="signal-field shell-wide" aria-label="Refraction test field">
          <div className="signal-field__line" />
          <div className="signal-field__copy">
            <p className="eyebrow">Look at the edge</p>
            <h2>Fine signals make the bend visible.</h2>
          </div>
          <div className="signal-field__grid" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        </section>

        <section className="technical shell">
          <div>
            <p className="eyebrow">Under the surface</p>
            <h2>Small API. Deliberate pipeline.</h2>
          </div>
          <ul>
            {technicalNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>

        <section className="install shell" id="install">
          <div className="install__header">
            <div>
              <p className="eyebrow">Install</p>
              <h2>Two ways in.</h2>
            </div>
            <code>pnpm add @blvdesign/soft-optics</code>
          </div>
          <div className="code-grid">
            <CodeExample code={vanillaCode} label="Vanilla" />
            <CodeExample code={reactCode} label="React" />
          </div>
        </section>

        <footer className="page-footer shell">
          <p>Soft Optics Shader</p>
          <p>MIT licensed · Built for the open web</p>
          <a href="#top">Back to top ↑</a>
        </footer>
      </main>

      <div
        aria-hidden="true"
        data-optics-diagnostics=""
        data-optics-enabled={activeConfig.enabled ? "true" : "false"}
        data-optics-mode={status.mode}
        data-optics-mounted={opticsRouteEnabled ? "true" : "false"}
        data-optics-reason={"reason" in status ? status.reason : ""}
        data-soft-optics-ignore=""
        hidden
      />

      {debugBoundaries ? (
        <div
          aria-hidden="true"
          className="debug-boundaries"
          data-soft-optics-ignore
        >
          <span style={{ height: `${config.edgeHeight}vh` }} />
          <span style={{ height: `${config.edgeHeight}vh` }} />
        </div>
      ) : null}

      <OpticsControls
        config={config}
        debugBoundaries={debugBoundaries}
        onCompareChange={setComparing}
        onConfigChange={setConfig}
        onDebugBoundariesChange={setDebugBoundaries}
        status={status}
      />

      {opticsRoot && opticsRouteEnabled ? (
        <SoftOptics
          config={activeConfig}
          exclude="[data-soft-optics-ignore]"
          layer={{ zIndex: 80 }}
          onStatusChange={setStatus}
          root={opticsRoot}
        />
      ) : null}
    </>
  );
}
