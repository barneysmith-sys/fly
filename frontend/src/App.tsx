import { useEffect, useState } from "react";
import { AutonomyPage } from "./pages/AutonomyPage";
import { FlightPage } from "./pages/FlightPage";
import { LabPage } from "./pages/LabPage";
import { LearnPage } from "./pages/LearnPage";
import { ProgressPage } from "./pages/ProgressPage";
import { SystemsPage } from "./pages/SystemsPage";

const SECTIONS = [
  ["flight", "Flight"],
  ["learn", "Learn"],
  ["lab", "Lab"],
  ["autonomy", "Autonomy"],
  ["systems", "Systems"],
  ["progress", "Progress"],
] as const;

type SectionId = (typeof SECTIONS)[number][0];

function sectionFromHash(): SectionId {
  const raw = window.location.hash.replace(/^#/, "");
  const match = SECTIONS.find(([id]) => id === raw);
  return match ? match[0] : "flight";
}

export function App() {
  const [section, setSection] = useState<SectionId>(sectionFromHash);

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Training center · vertical dynamics</p>
          <h1>FLY</h1>
        </div>
        <p className="muted">1D model · v0.2</p>
      </header>
      <nav className="nav" aria-label="Training center">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>
            {label}
          </a>
        ))}
      </nav>
      {section === "flight" ? <FlightPage /> : null}
      {section === "learn" ? <LearnPage /> : null}
      {section === "lab" ? <LabPage /> : null}
      {section === "autonomy" ? <AutonomyPage /> : null}
      {section === "systems" ? <SystemsPage /> : null}
      {section === "progress" ? <ProgressPage /> : null}
    </div>
  );
}
