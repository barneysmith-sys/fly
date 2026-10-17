import type { UnitNote } from "../types";

function UnitRow({ note }: { note: UnitNote }) {
  return (
    <li>
      <p className="unit-name">
        <span>{note.quantity}</span>
        <span className="unit-symbol">{note.symbol}</span>
        <span className="unit-code">{note.unit}</span>
      </p>
      <p className="unit-plain">{note.plain}</p>
    </li>
  );
}

type UnitGuideProps = {
  notes: UnitNote[];
  conventions: string[];
};

export function UnitGuide({ notes, conventions }: UnitGuideProps) {
  if (notes.length === 0) {
    return null;
  }
  const primary = notes.filter((note) => note.primary);
  const rest = notes.filter((note) => !note.primary);
  return (
    <section className="panel unit-guide" aria-label="Units">
      <header className="panel-head">
        <h2>Units</h2>
        <p>SI, the equation standard</p>
      </header>
      <ul className="unit-rows">
        {primary.map((note) => (
          <UnitRow key={note.quantity} note={note} />
        ))}
      </ul>
      <details>
        <summary>Gain units and other conventions</summary>
        {conventions.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <ul className="unit-rows">
          {rest.map((note) => (
            <UnitRow key={note.quantity} note={note} />
          ))}
        </ul>
      </details>
    </section>
  );
}
