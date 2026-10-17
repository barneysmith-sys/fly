import { useEffect, useRef, useState } from "react";
import type { PartId } from "../animation/explorer4Model";
import { PART_IDS } from "../animation/explorer4Model";
import { InspectCanvas } from "../components/InspectCanvas";

const NOTES: Record<PartId, { title: string; role: string; how: string; why: string; fail: string }> = {
  prop: {
    title: "Propellers",
    role: "Turn motor torque into thrust.",
    how: "Each two-blade rotor pushes air down. Thrust rises with the square of rotor speed in this display mapping. The sim commands thrust in newtons, not RPM.",
    why: "Unequal thrust between motors is what pitches, rolls, and yaws the aircraft.",
    fail: "A stopped rotor removes its thrust and its reaction torque. The rigid body then tumbles unless the other motors are reduced.",
  },
  motor: {
    title: "Motors",
    role: "Four independent drives in an X layout.",
    how: "Motor 0 is front-right, 1 front-left, 2 rear-left, 3 rear-right. Diagonal pairs spin in opposite directions.",
    why: "The mixer turns one collective command and three torques into four thrust commands.",
    fail: "One motor at zero thrust is a failure case, not a hover. Try it on the motor stand.",
  },
  esc: {
    title: "Speed controllers",
    role: "Apply the motor command.",
    how: "In this model the command is a thrust in newtons. A 0.06 s lag sits between the command and the thrust the body feels.",
    why: "The lag is why the rotors do not jump to a new speed in one frame.",
    fail: "A failed controller is modeled by forcing that motor command to zero. There is no separate ESC electrical model.",
  },
  fc: {
    title: "Flight controller",
    role: "Stabilized and acro attitude laws.",
    how: "Stabilized mode commands a tilt. Acro commands a body rate. Throttle is collective thrust, not an altitude hold.",
    why: "The same mixer feeds both modes. Nothing here is a learned policy.",
    fail: "If the attitude loop is wrong, the aircraft tilts the opposite way. Roll was corrected so arrow-right lowers the right wing.",
  },
  imu: {
    title: "IMU",
    role: "Ideal specific force and angular rate, derived from the truth state.",
    how: "The lesson readout rotates the thrust and drag into the body frame. It is algebra on the simulator state.",
    why: "A real IMU would be noisy and biased. This one is labeled derived, not measured.",
    fail: "There is no simulated IMU failure. The aircraft flies on ground truth.",
  },
  battery: {
    title: "Battery",
    role: "Mass is included. State of charge is not.",
    how: "The 0.65 kg mass includes the pack. Thrust is not reduced as a flight gets longer.",
    why: "Showing a shrinking battery without a model would be fake telemetry.",
    fail: "Not modeled. The motor stand does not drain a pack.",
  },
  gnss: {
    title: "Position reference",
    role: "The simulator knows position because it integrates the rigid body.",
    how: "East, north, and up come from the state vector. There is no satellite receiver.",
    why: "Ground control labels this ground truth so it is not mistaken for a GPS fix.",
    fail: "Not modeled.",
  },
  camera: {
    title: "FPV camera",
    role: "A fixed mount, 15° up, on the nose.",
    how: "FPV is locked to that mount. It is not damped and it is not a gimbal.",
    why: "The view has to match the body, or the pilot cannot tell which way the nose points.",
    fail: "Not modeled. Switching to chase does not change the aircraft.",
  },
  gear: {
    title: "Landing gear",
    role: "The feet sit 0.062 m below the centre of mass.",
    how: "Contact in flight is still a 0.18 m sphere. The mesh is shifted so the feet meet the ground while that sphere is used.",
    why: "Without the shift the body would appear to hover on its collision sphere.",
    fail: "A hard touchdown is whatever vertical speed the rigid body has at contact. The gear does not flex.",
  },
  frame: {
    title: "Frame",
    role: "Carries the motors at 0.12 m from the centre.",
    how: "Arm length sets the torque a difference in thrust can produce.",
    why: "Longer arms make the same thrust difference a larger moment.",
    fail: "The frame is rigid. There is no flex or breakage model.",
  },
  shell: {
    title: "Shell",
    role: "The outer body. It is not in the mass properties separately.",
    how: "Hiding it in the exploded view shows the controller, pack, and sensor blocks.",
    why: "The shell is a drawing. Mass, inertia, and thrust stay on the vehicle parameters.",
    fail: "Not modeled.",
  },
  lights: {
    title: "Status lights",
    role: "Show armed, flying, landing, or a warning from the simulation flags.",
    how: "Below 1 m and descending, the light state is landing. A failed motor flag is a warning.",
    why: "The light is a reading of state, not a decoration on a timer.",
    fail: "Not a separate system.",
  },
};

export function AircraftPage() {
  const motorsRef = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const failedRef = useRef<number[]>([]);
  const selectedRef = useRef<PartId | null>(null);
  const explodeRef = useRef(false);
  const [part, setPart] = useState<PartId | null>(null);
  const [exploded, setExploded] = useState(false);
  const mount = useRef<HTMLElement>(null);
  selectedRef.current = part;
  explodeRef.current = exploded;
  const note = part ? NOTES[part] : null;

  useEffect(() => {
    const node = mount.current;
    if (!node) {
      return;
    }
    const onPart = (event: Event) => {
      const id = (event as CustomEvent<PartId>).detail;
      if (PART_IDS.includes(id)) {
        setPart(id);
      }
    };
    node.addEventListener("strata-part", onPart);
    return () => node.removeEventListener("strata-part", onPart);
  }, []);

  return (
    <section className="inspect-page" ref={mount}>
      <InspectCanvas motorsRef={motorsRef} failedRef={failedRef} selectedRef={selectedRef} explodeRef={explodeRef} illustrative />
      <aside className="inspect-panel">
        <header className="panel-head">
          <h2>EXPLORER-4</h2>
          <p>0.65 kg · 20.40 N max</p>
        </header>
        <div className="stack">
          {PART_IDS.map((id) => (
            <button key={id} type="button" className="stack-button" aria-pressed={part === id} onClick={() => setPart(id)}>
              {NOTES[id].title}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setExploded((value) => !value)}>
          {exploded ? "Assemble" : "Exploded view"}
        </button>
        {note ? (
          <>
            <h3>{note.title}</h3>
            <p>{note.role}</p>
            <p><strong>How it works. </strong>{note.how}</p>
            <p><strong>Why it matters. </strong>{note.why}</p>
            <p><strong>If it fails. </strong>{note.fail}</p>
          </>
        ) : (
          <p>The whole airframe is in view. Choose a part, or click the model. Mass stays 0.65 kg and maximum thrust stays 20.40 N.</p>
        )}
        <p className="field-hint">Drag to orbit. Scroll to zoom. Click a part. Rotors are stopped because this is not a flight.</p>
        <a href="#motors">Motor test stand</a>
      </aside>
    </section>
  );
}
