import { memo, useMemo } from "react";
import { formatFixed } from "../format";
import type { Draft } from "../types";

type ParameterFormProps = {
  draft: Draft;
  disabled: boolean;
  onChange: (draft: Draft) => void;
  onRun: () => void;
  onRestoreHover: () => void;
};

export const ParameterForm = memo(function ParameterForm({
  draft,
  disabled,
  onChange,
  onRun,
  onRestoreHover,
}: ParameterFormProps) {
  const weightN = useMemo(() => {
    const mass = Number(draft.mass_kg);
    const gravity = Number(draft.gravity_m_s2);
    if (!Number.isFinite(mass) || !Number.isFinite(gravity)) {
      return null;
    }
    return mass * gravity;
  }, [draft.mass_kg, draft.gravity_m_s2]);

  const set = (key: Exclude<keyof Draft, "ground_contact">, value: string) => {
    onChange({ ...draft, [key]: value });
  };

  return (
    <form
      className="panel parameters"
      onSubmit={(event) => {
        event.preventDefault();
        onRun();
      }}
    >
      <header className="panel-head">
        <h2>Model inputs</h2>
        <p>Sent to the Python integrator</p>
      </header>

      <fieldset>
        <legend>Vehicle</legend>
        <Field id="mass" label="Mass" unit="kg" value={draft.mass_kg} onChange={(value) => set("mass_kg", value)} />
        <Field
          id="gravity"
          label="Gravity"
          unit="m/s²"
          value={draft.gravity_m_s2}
          onChange={(value) => set("gravity_m_s2", value)}
        />
        <Field
          id="thrust-min"
          label="Thrust min"
          unit="N"
          value={draft.thrust_min_n}
          onChange={(value) => set("thrust_min_n", value)}
        />
        <Field
          id="thrust-max"
          label="Thrust max"
          unit="N"
          value={draft.thrust_max_n}
          onChange={(value) => set("thrust_max_n", value)}
        />
        <Field
          id="drag"
          label="Drag c_d"
          unit="kg/m"
          value={draft.drag_coefficient_kg_per_m}
          onChange={(value) => set("drag_coefficient_kg_per_m", value)}
        />
        <Field
          id="external"
          label="External force"
          unit="N"
          value={draft.external_force_n}
          onChange={(value) => set("external_force_n", value)}
          hint="Constant, positive upward."
        />
        <p className="parameter-note">
          Weight from these inputs: {weightN === null ? "—" : `${formatFixed(weightN, 4)} N`}. This is m·g, not a
          sample.
        </p>
      </fieldset>

      <fieldset>
        <legend>Initial state</legend>
        <Field
          id="z0"
          label="Altitude"
          unit="m"
          value={draft.initial_altitude_m}
          onChange={(value) => set("initial_altitude_m", value)}
        />
        <Field
          id="v0"
          label="Vertical velocity"
          unit="m/s"
          value={draft.initial_vertical_velocity_m_s}
          onChange={(value) => set("initial_vertical_velocity_m_s", value)}
        />
        <label className="check" htmlFor="ground">
          <input
            id="ground"
            type="checkbox"
            checked={draft.ground_contact}
            onChange={(event) => onChange({ ...draft, ground_contact: event.target.checked })}
          />
          Inelastic ground at z = 0
        </label>
      </fieldset>

      <fieldset>
        <legend>Altitude law</legend>
        <Field
          id="z-ref"
          label="Target altitude"
          unit="m"
          value={draft.target_altitude_m}
          onChange={(value) => set("target_altitude_m", value)}
        />
        <Field id="kp" label="Kp" unit="N/m" value={draft.kp_n_per_m} onChange={(value) => set("kp_n_per_m", value)} />
        <Field
          id="ki"
          label="Ki"
          unit="N/(m·s)"
          value={draft.ki_n_per_m_s}
          onChange={(value) => set("ki_n_per_m_s", value)}
          hint="0 for the 2 m hover. A positive value rejects a constant force and winds up on a large step."
        />
        <Field
          id="kd"
          label="Kd"
          unit="N·s/m"
          value={draft.kd_n_s_per_m}
          onChange={(value) => set("kd_n_s_per_m", value)}
        />
      </fieldset>

      <fieldset>
        <legend>Integrator</legend>
        <Field
          id="dt"
          label="Timestep"
          unit="s"
          value={draft.timestep_s}
          onChange={(value) => set("timestep_s", value)}
        />
        <Field
          id="duration"
          label="Duration"
          unit="s"
          value={draft.duration_s}
          onChange={(value) => set("duration_s", value)}
        />
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="primary" disabled={disabled}>
          Run inputs
        </button>
        <button type="button" onClick={onRestoreHover} disabled={disabled}>
          Reload 2 m hover
        </button>
      </div>
    </form>
  );
});

function Field({
  id,
  label,
  unit,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">
        {label}
        <span>{unit}</span>
      </span>
      <input
        id={id}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
