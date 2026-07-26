import { useState } from "react";
import {
  SoftOptics,
  type SoftOpticsStatus
} from "@blvdesign/soft-optics-react";

export function App() {
  const [mode, setMode] =
    useState<SoftOpticsStatus["mode"]>("loading");

  return (
    <>
      <header data-soft-optics-ignore>
        <strong>Soft Optics</strong>
        <span>{mode}</span>
      </header>
      <main>
        {Array.from({ length: 8 }, (_, index) => (
          <article key={index}>
            <p className="eyebrow">
              Section {String(index + 1).padStart(2, "0")}
            </p>
            <h1>
              {index === 0
                ? "Optical softness at the viewport edge"
                : "A React adapter over the same core"}
            </h1>
            <p>
              The component renders no DOM of its own and releases the
              controller when this tree unmounts.
            </p>
            <div className="field" aria-hidden="true" />
          </article>
        ))}
      </main>
      <SoftOptics
        preset="default"
        exclude="[data-soft-optics-ignore]"
        layer={{ zIndex: 40 }}
        onStatusChange={(status) => setMode(status.mode)}
      />
    </>
  );
}
