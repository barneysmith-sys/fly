import { useCallback, useEffect, useState } from "react";
import { BootSequence } from "./components/BootSequence";
import { ChromeContext, type ChromeState } from "./chrome";
import { AutonomyPage } from "./pages/AutonomyPage";
import { FlightPage } from "./pages/FlightPage";
import { FlyPage } from "./pages/FlyPage";
import { LabPage } from "./pages/LabPage";
import { LearnPage } from "./pages/LearnPage";
import { ProgressPage } from "./pages/ProgressPage";
import { SystemsPage } from "./pages/SystemsPage";
import { TrainPage } from "./pages/TrainPage";
import { EXPLORER_4 } from "./sim/aircraft";
import { coastalSite, type Site } from "./sim/coastal";
import type { District } from "./sim/district";
import { manhattanDistrict } from "./sim/district";
import type { VehicleParams } from "./sim/vehicle";

const NAV = [
  ["fly", "Flight"],
  ["learn", "Academy"],
  ["train", "Train"],
  ["lab", "Lab"],
] as const;

type NavId = (typeof NAV)[number][0];
type SectionId = NavId | "vertical" | "systems" | "progress" | "control";

type Ready = {
  site: Site;
  district: District;
  vehicle: VehicleParams;
};

const BOOT_KEY = "fly.boot.v1";

function sectionFromHash(): SectionId {
  const raw = window.location.hash.replace(/^#/, "");
  if (raw === "" || raw === "fly" || raw === "flight") {
    return "fly";
  }
  if (raw === "train" || raw === "autonomy") {
    return "train";
  }
  if (raw === "learn" || raw === "lab" || raw === "vertical" || raw === "systems" || raw === "progress" || raw === "control") {
    return raw;
  }
  return "fly";
}

function rememberedReady(): Ready | null {
  if (window.sessionStorage.getItem(BOOT_KEY) !== "1") {
    return null;
  }
  return { site: coastalSite(), district: manhattanDistrict(), vehicle: EXPLORER_4.params };
}

export function App() {
  const [section, setSection] = useState<SectionId>(sectionFromHash);
  const [ready, setReady] = useState<Ready | null>(rememberedReady);
  const [chrome, setChrome] = useState<ChromeState>({ status: "Ready", mode: "6-DOF" });
  const publish = useCallback((next: ChromeState) => setChrome(next), []);
  const onReady = useCallback((next: Ready) => setReady(next), []);

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (section === "fly" || section === "train") {
      return;
    }
    const labels: Record<Exclude<SectionId, "fly" | "train">, ChromeState> = {
      learn: { status: "Lesson", mode: "Instruction" },
      lab: { status: "1D plant", mode: "Python API" },
      vertical: { status: "Replay", mode: "PID altitude" },
      systems: { status: "Notes", mode: "Not simulated" },
      progress: { status: "Local record", mode: "Hover lesson" },
      control: { status: "Classical control", mode: "PID" },
    };
    setChrome(labels[section]);
  }, [section]);

  if (!ready) {
    return (
      <div className="app">
        <BootSequence onReady={onReady} />
      </div>
    );
  }

  const navCurrent: NavId | null =
    section === "fly" || section === "learn" || section === "train" || section === "lab" ? section : null;

  return (
    <ChromeContext.Provider value={publish}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M16 4 L28 26 H21.5 L16 15.5 L10.5 26 H4 Z" />
            </svg>
            <h1>STRATA</h1>
            <p className="eyebrow">Flight simulation & training</p>
          </div>
          <nav className="nav" aria-label="STRATA">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={navCurrent === id ? "page" : undefined}
                onClick={() => setSection(id)}
              >
                {label}
              </a>
            ))}
          </nav>
          <p className="chrome" aria-label="Simulation status">
            <span>{section === "train" ? ready.district.label : ready.site.label}</span>
            <span>{chrome.status}</span>
            <span>{chrome.mode}</span>
          </p>
          <details className="settings">
            <summary>Settings</summary>
            <div className="settings-panel">
              <p className="field-hint">
                Civilian educational simulator. Coastal Base 01 is a fictional field. The flight view integrates a 6-DOF
                rigid body in the browser. The lab and the hover lesson call the Python 1D plant. The train episode
                still uses the OpenStreetMap Flatiron extract, which is not a survey.
              </p>
              <a href="#vertical">Vertical hover replay</a>
              <a href="#control">Why the PID is not AI</a>
              <a href="#systems">Systems notes</a>
              <a href="#progress">Lesson record</a>
            </div>
          </details>
        </header>
        {section === "fly" ? <FlyPage site={ready.site} /> : null}
        {section === "learn" ? (
          <div className="section-scroll">
            <LearnPage />
          </div>
        ) : null}
        {section === "train" ? <TrainPage district={ready.district} /> : null}
        {section === "lab" ? (
          <div className="section-scroll">
            <LabPage />
          </div>
        ) : null}
        {section === "vertical" ? (
          <div className="section-scroll">
            <FlightPage />
          </div>
        ) : null}
        {section === "systems" ? (
          <div className="section-scroll">
            <SystemsPage />
          </div>
        ) : null}
        {section === "progress" ? (
          <div className="section-scroll">
            <ProgressPage />
          </div>
        ) : null}
        {section === "control" ? (
          <div className="section-scroll">
            <AutonomyPage />
          </div>
        ) : null}
      </div>
    </ChromeContext.Provider>
  );
}
