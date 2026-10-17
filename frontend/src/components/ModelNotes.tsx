import type { ModelDocument } from "../types";

type ModelNotesProps = {
  model: ModelDocument | null;
};

export function ModelNotes({ model }: ModelNotesProps) {
  if (!model) {
    return null;
  }
  return (
    <details className="panel model-notes">
      <summary>Equations in this response</summary>
      <ul className="equations">
        {Object.entries(model.equations).map(([name, equation]) => (
          <li key={name}>
            <code>{equation}</code>
          </li>
        ))}
      </ul>
      <h3>Assumptions</h3>
      <ul>
        {model.assumptions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>Limitations</h3>
      <ul>
        {model.limitations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}
