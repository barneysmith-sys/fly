import * as THREE from "three";
import type { Explorer4 } from "./explorer4Model.ts";
import type { MotorQuad, MotorSource } from "./types.ts";

/**
 * Drives the four rotors from four independent thrust values.
 *
 * Input is newtons per motor in sim order (motorLayout.ts). The sim has no
 * RPM state, so this controller never reports RPM. It reports the normalized
 * command T_i / T_max_i and a *visual* angular rate:
 *
 *   omegaVis_i = OMEGA_VIS_MAX * sqrt(T_i / T_max_i)     (T ∝ ω² for a fixed prop)
 *
 * OMEGA_VIS_MAX is chosen for readability, not physics: real rotors spin at
 * hundreds of rad/s and alias on a 60 Hz display. Blades fade into a rotor
 * disc as the command rises so speed differences stay legible.
 */

export type RotorStatus = "stopped" | "low" | "hover" | "high" | "failed";

export type RotorReadout = {
  index: number;
  thrustN: number;
  /** T_i / T_max_i, 0..1. Not RPM. */
  command: number;
  /** Visual rad/s used for the animation. Not a measurement. */
  omegaVis: number;
  spinSign: 1 | -1;
  status: RotorStatus;
  source: MotorSource;
};

export type FourMotorOptions = {
  motorMaxN: number;
  hoverPerMotorN: number;
  omegaVisMax?: number;
  /** Command where blades start fading into the disc. */
  blurStart?: number;
  blurFull?: number;
};

const RING_COLORS: Record<RotorStatus, number> = {
  stopped: 0x3d4b58,
  low: 0x5d7f99,
  hover: 0x75a9cb,
  high: 0xc7a46b,
  failed: 0xc77474,
};

export class FourMotorVisualController {
  private readonly angles = [0, 0, 0, 0];
  private readonly readouts: RotorReadout[] = [];
  private readonly opts: Required<FourMotorOptions>;

  constructor(private readonly model: Explorer4, options: FourMotorOptions) {
    this.opts = { omegaVisMax: 38, blurStart: 0.22, blurFull: 0.55, ...options };
    for (let i = 0; i < 4; i += 1) {
      this.readouts.push({ index: i, thrustN: 0, command: 0, omegaVis: 0, spinSign: model.layout[i].spinSign, status: "stopped", source: "sim" });
    }
  }

  /**
   * @param motorsN lagged per-motor thrust, the same array stepRigidBody used
   * @param dtS real frame time; pass 0 while paused so rotors freeze
   * @param failed motors whose thrust is forced to zero (shown red)
   */
  update(motorsN: MotorQuad, dtS: number, source: MotorSource, failed: readonly number[] = []): readonly RotorReadout[] {
    const { motorMaxN, hoverPerMotorN, omegaVisMax, blurStart, blurFull } = this.opts;
    for (let i = 0; i < 4; i += 1) {
      const thrust = Math.max(0, Math.min(motorMaxN, motorsN[i]));
      const command = thrust / motorMaxN;
      const omegaVis = omegaVisMax * Math.sqrt(command);
      const sign = this.model.layout[i].spinSign;
      this.angles[i] = (this.angles[i] + sign * omegaVis * dtS) % (Math.PI * 2);
      this.model.rotors[i].rotation.z = this.angles[i];

      const blur = THREE.MathUtils.clamp((command - blurStart) / (blurFull - blurStart), 0, 1);
      const disc = this.model.discs[i];
      disc.visible = blur > 0.001;
      (disc.material as THREE.MeshBasicMaterial).opacity = blur;
      this.model.blades[i].traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.name.includes("blade")) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (!mat.userData.cloned) {
            mesh.material = mat.clone();
            (mesh.material as THREE.Material).userData.cloned = true;
          }
          const m = mesh.material as THREE.MeshStandardMaterial;
          m.transparent = blur > 0;
          m.opacity = 1 - 0.85 * blur;
        }
      });

      const isFailed = failed.includes(i);
      const status: RotorStatus = isFailed
        ? "failed"
        : command < 0.01
          ? "stopped"
          : thrust < hoverPerMotorN * 0.8
            ? "low"
            : thrust <= hoverPerMotorN * 1.25
              ? "hover"
              : "high";
      ((this.model.motorRings[i].material) as THREE.MeshBasicMaterial).color.setHex(RING_COLORS[status]);
      const r = this.readouts[i];
      r.thrustN = thrust;
      r.command = command;
      r.omegaVis = omegaVis;
      r.status = status;
      r.source = source;
    }
    return this.readouts;
  }

  get state(): readonly RotorReadout[] {
    return this.readouts;
  }
}
