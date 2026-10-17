import * as THREE from "three";
import { E4_DIMENSIONS, type Explorer4 } from "./explorer4Model.ts";
import { FourMotorVisualController, type RotorReadout } from "./FourMotorVisualController.ts";
import type { AircraftLightState, VehicleParamsLike, VisualFrame } from "./types.ts";

/**
 * Copies the authoritative vehicle state onto the EXPLORER-4 scene graph.
 *
 * Rules this class keeps:
 *  - Position and attitude come only from VisualFrame. No bob, sway or tilt.
 *  - Rotors come only from frame.motorsN (FourMotorVisualController).
 *  - Lights come only from frame flags.
 *
 * The one deliberate visual translation is `contactSphereOffsetM`: the sim's
 * ground contact is a sphere of radius `radiusM` (0.18 m) around the centre
 * of mass, but the gear feet are 0.062 m below it. Without an offset the
 * aircraft floats 0.118 m above the ground. The offset is constant and
 * state-independent; remove it when foot-plane contact lands in collision.ts.
 */

export type AircraftVisualOptions = {
  params: VehicleParamsLike;
  /** 1 = true scale. The repo currently draws at 6. Board 12 recommends 1. */
  visualScale?: number;
  /** Default true: shift the mesh so feet meet the contact sphere's ground. */
  alignFeetToContactSphere?: boolean;
};

export class AircraftVisualController {
  readonly rotors: FourMotorVisualController;
  readonly holder = new THREE.Group();
  private lightState: AircraftLightState = "disarmed";
  private clock = 0;
  private readonly offsetZ: number;

  constructor(readonly model: Explorer4, readonly options: AircraftVisualOptions) {
    const { params } = options;
    this.rotors = new FourMotorVisualController(model, {
      motorMaxN: params.thrustMaxN / 4,
      hoverPerMotorN: (params.massKg * params.gravityM_S2) / 4,
    });
    const scale = options.visualScale ?? 1;
    this.offsetZ = options.alignFeetToContactSphere === false ? 0 : -(params.radiusM + E4_DIMENSIONS.feetZ * scale);
    this.holder.name = "E4_visual_holder";
    model.root.scale.setScalar(scale);
    model.root.position.set(0, 0, 0);
    this.holder.add(model.root);
  }

  /** Call once per rendered frame with the latest physics frame. */
  update(frame: VisualFrame, dtS: number): { rotors: readonly RotorReadout[]; lights: AircraftLightState } {
    this.holder.position.set(frame.positionM.x, frame.positionM.y, frame.positionM.z);
    this.holder.quaternion.set(frame.quaternion.x, frame.quaternion.y, frame.quaternion.z, frame.quaternion.w);
    // Constant offset along world z, applied to the child so it does not rotate with attitude.
    this.model.root.position.set(0, 0, 0);
    if (this.offsetZ !== 0) {
      const local = new THREE.Vector3(0, 0, this.offsetZ).applyQuaternion(this.holder.quaternion.clone().invert());
      this.model.root.position.copy(local);
    }
    const rotors = this.rotors.update(frame.motorsN, dtS, frame.motorSource, frame.failedMotors ?? []);
    this.clock += dtS;
    this.lightState = lightStateOf(frame);
    this.applyLights();
    return { rotors, lights: this.lightState };
  }

  private applyLights() {
    const { navFL, navFR, statusAft } = this.model.lights;
    const t = this.clock;
    const set = (mesh: THREE.Mesh, intensity: number) => {
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
    };
    switch (this.lightState) {
      case "disarmed":
        set(navFL, 0.05); set(navFR, 0.05);
        set(statusAft, 0.4 + 1.2 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2)));
        break;
      case "armed":
        set(navFL, 0.3); set(navFR, 0.3);
        (statusAft.material as THREE.MeshStandardMaterial).emissive.setHex(0x75a9cb);
        set(statusAft, 1.6);
        return;
      case "flight":
        set(navFL, 1.6); set(navFR, 1.6); set(statusAft, 1.4);
        break;
      case "landing":
        set(navFL, 2.0); set(navFR, 2.0); set(statusAft, 1.4);
        break;
      case "warning":
        set(navFL, 1.6); set(navFR, 1.6);
        set(statusAft, Math.sin(t * Math.PI * 8) > 0 ? 2.0 : 0.1);
        break;
    }
    (statusAft.material as THREE.MeshStandardMaterial).emissive.setHex(0xc7a46b);
  }
}

/** Board 04 light table, as a pure function of the frame. */
export function lightStateOf(frame: VisualFrame): AircraftLightState {
  if (frame.warning || (frame.failedMotors && frame.failedMotors.length > 0)) return "warning";
  if (!frame.armed) return "disarmed";
  const thrust = frame.motorsN[0] + frame.motorsN[1] + frame.motorsN[2] + frame.motorsN[3];
  if (frame.onGround && thrust < 0.05) return "armed";
  if (!frame.onGround && frame.positionM.z < 1.18 && frame.velocityM_S.z < -0.05) return "landing";
  return "flight";
}
