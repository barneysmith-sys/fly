import { useEffect, useState } from "react";
import { describeError, fetchExperiments } from "../api";
import { RANKS, loadProgress, type ProgressState } from "../progress";
import type { ExperimentSummary } from "../types";

export function ProgressPage() {
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const [catalog, setCatalog] = useState<ExperimentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
    const controller = new AbortController();
    const load = async () => {
      try {
        const items = await fetchExperiments(controller.signal);
        if (!controller.signal.aborted) {
          setCatalog(items);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(describeError(caught));
        }
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const current = progress.lessonPassed ? "Flight Fundamentals" : "Beginner";

  return (
    <div className="doc">
      <section className="panel">
        <header className="panel-head">
          <h2>Current standing</h2>
          <p>{current}</p>
        </header>
        <p className="end-state">
          A rank changes only when a check matches a returned simulation. Opening a page, starting a lesson, or running
          an experiment does not by itself award competence.
        </p>
        <p className="field-hint">
          Hover lesson attempts: {progress.lessonAttempts}. Latest attempt:{" "}
          {progress.lessonAttempts === 0 ? "none" : progress.lessonPassed ? "matched" : "did not match"}.
        </p>
      </section>
      <ol className="ranks">
        {RANKS.map((rank) => {
          const earned =
            rank.id === "beginner" || (rank.id === "fundamentals" && progress.lessonPassed);
          const future = rank.id !== "beginner" && rank.id !== "fundamentals";
          return (
            <li key={rank.id} className="panel">
              <header className="panel-head">
                <h2>{rank.title}</h2>
                <p className={earned ? "pass" : "muted"}>{earned ? "Recorded" : future ? "Locked" : "Not yet"}</p>
              </header>
              <p className="end-state">{rank.requirement}</p>
            </li>
          );
        })}
      </ol>
      <section className="panel">
        <header className="panel-head">
          <h2>Experiments run</h2>
          <p>{progress.experimentsRun.length}</p>
        </header>
        {error ? <p className="fail">{error}</p> : null}
        {progress.experimentsRun.length === 0 ? (
          <p className="empty-copy">None yet. A run is recorded when the lab receives an experiment trace.</p>
        ) : (
          <ul className="criteria">
            {progress.experimentsRun.map((id) => (
              <li key={id}>
                <span>{catalog.find((item) => item.experiment_id === id)?.title ?? id}</span>
                <span>Trace returned</span>
              </li>
            ))}
          </ul>
        )}
        <p className="field-hint">This list is practice history. It does not change the rank.</p>
      </section>
    </div>
  );
}
