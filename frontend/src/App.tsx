import { useCallback, useEffect, useState } from "react";
import { ChromeContext, type ChromeState } from "./chrome";
import { AircraftPage } from "./pages/AircraftPage";
import { AutonomyPage } from "./pages/AutonomyPage";
import { FlightPage } from "./pages/FlightPage";
import { FlyPage } from "./pages/FlyPage";
import { LabPage } from "./pages/LabPage";
import { LandingPage } from "./pages/LandingPage";
import { LearnPage } from "./pages/LearnPage";
import { MotorPage } from "./pages/MotorPage";
import { ProgressPage } from "./pages/ProgressPage";
import { SystemsPage } from "./pages/SystemsPage";
import { TrainPage } from "./pages/TrainPage";
import { EXPLORER_4 } from "./sim/aircraft";
import { coastalSite, type Site } from "./sim/coastal";
import type { District } from "./sim/district";
import { manhattanDistrict } from "./sim/district";
import type { VehicleParams } from "./sim/vehicle";

const NAV = [
  ["home", "Hangar"],
  ["fly", "Flight"],
  ["learn", "Academy"],
  ["aircraft", "Aircraft"],
  ["ground", "Ground"],
  ["lab", "Lab"],
] as const;

type NavId = (typeof NAV)[number][0];
type SectionId = NavId | "train" | "motors" | "vertical" | "systems" | "progress" | "control";

type Ready = {
  site: Site;
  district: District;
  vehicle: VehicleParams;
};

function sectionFromHash(): SectionId {
  const raw = window.location.hash.replace(/^#/, "");
  if (raw === "" || raw === "home" || raw === "hangar") {
    return "home";
  }
  if (raw === "fly" || raw === "flight") {
    return "fly";
  }
  if (raw === "aircraft" || raw === "systems") {
    return raw === "systems" ? "systems" : "aircraft";
  }
  if (raw === "ground") {
    return "ground";
  }
  if (raw === "motors") {
    return "motors";
  }
  if (raw === "train" || raw === "autonomy") {
    return "train";
  }
  if (raw === "learn" || raw === "academy" || raw === "lab" || raw === "vertical" || raw === "progress" || raw === "control") {
    return raw === "academy" ? "learn" : raw;
  }
  return "home";
}

export function App() {
  const [section, setSection] = useState<SectionId>(sectionFromHash);
  const [ready] = useState<Ready>(() => ({ site: coastalSite(), district: manhattanDistrict(), vehicle: EXPLORER_4.params }));
  const [chrome, setChrome] = useState<ChromeState>({ status: "Ready", mode: "6-DOF" });
  const publish = useCallback((next: ChromeState) => setChrome(next), []);

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (section === "fly" || section === "train" || section === "ground") {
      return;
    }
    const labels: Record<Exclude<SectionId, "fly" | "train" | "ground">, ChromeState> = {
      home: { status: "Cover", mode: "Hangar" },
      learn: { status: "Lesson", mode: "Instruction" },
      aircraft: { status: "Inspection", mode: "EXPLORER-4" },
      motors: { status: "Stand", mode: "Illustrative" },
      lab: { status: "1D plant", mode: "Browser" },
      vertical: { status: "Replay", mode: "PID altitude" },
      systems: { status: "Notes", mode: "Not simulated" },
      progress: { status: "Local record", mode: "Hover lesson" },
      control: { status: "Classical control", mode: "PID" },
    };
    setChrome(labels[section]);
  }, [section]);

  const navCurrent: NavId | null =
    section === "home" || section === "fly" || section === "learn" || section === "aircraft" || section === "ground" || section === "lab"
      ? section
      : null;

  return (
    <ChromeContext.Provider value={publish}>
      <div className="app">
        {section === "home" ? null : <header className="topbar">
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
                rigid body in the browser. The lab runs the 1D plant in the browser. The train episode still uses the
                OpenStreetMap Flatiron extract, which is not a survey.
              </p>
              <a href="#train">Train landing episode</a>
              <a href="#motors">Motor test stand</a>
              <a href="#vertical">Vertical hover replay</a>
              <a href="#control">Why the PID is not AI</a>
              <a href="#systems">Systems notes</a>
              <a href="#progress">Lesson record</a>
            </div>
          </details>
        </header>}
        {section === "home" ? <LandingPage /> : null}
        {section === "fly" ? <FlyPage site={ready.site} /> : null}
        {section === "ground" ? <FlyPage site={ready.site} presentation="gcs" /> : null}
        {section === "aircraft" ? <AircraftPage /> : null}
        {section === "motors" ? <MotorPage /> : null}
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
