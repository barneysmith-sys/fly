import * as THREE from "three";
import { motorLayout } from "./motorLayout.ts";
import type { VehicleParamsLike, VisualFrame } from "./types.ts";

/**
 * World-space force arrows computed from the frame. Nothing here is drawn
 * from input; every length is a force the integrator used.
 *
 *  thrust  = R(q)·[0, 0, ΣT_i]          steel, from the centre of mass
 *  weight  = [0, 0, -m·g]               amber, from the centre of mass
 *  horiz   = horizontal part of thrust  dashed steel
 *  motor_i = R(q)·[0, 0, T_i] at motor i (optional, for the mixing lesson)
 *
 * Scale: metres of arrow per newton. 0.06 m/N makes hover weight 0.38 m,
 * about 1.4 aircraft spans, readable in the true-scale chase view.
 */

export type ForceVectorOptions = { params: VehicleParamsLike; metresPerNewton?: number; showMotors?: boolean };

class Arrow {
  readonly group = new THREE.Group();
  private readonly shaft: THREE.Mesh;
  private readonly head: THREE.Mesh;
  constructor(color: number, radius: number, name: string) {
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 10), mat);
    this.head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.6, radius * 7, 14), mat);
    this.group.add(this.shaft, this.head);
    this.group.name = name;
    this.group.renderOrder = 10;
    this.shaft.renderOrder = 10;
    this.head.renderOrder = 10;
  }
  set(origin: THREE.Vector3, vector: THREE.Vector3) {
    const len = vector.length();
    this.group.visible = len > 1e-4;
    if (!this.group.visible) return;
    const headLen = Math.min(len * 0.35, (this.head.geometry as THREE.ConeGeometry).parameters.height);
    const shaftLen = Math.max(1e-4, len - headLen);
    this.group.position.copy(origin);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.clone().normalize());
    this.shaft.scale.set(1, shaftLen, 1);
    this.shaft.position.set(0, shaftLen / 2, 0);
    this.head.scale.setScalar(headLen / (this.head.geometry as THREE.ConeGeometry).parameters.height);
    this.head.position.set(0, shaftLen + headLen / 2, 0);
  }
  dispose() {
    this.shaft.geometry.dispose();
    this.head.geometry.dispose();
    (this.shaft.material as THREE.Material).dispose();
  }
}

export type ForceReadout = { thrustN: number; weightN: number; verticalThrustN: number; horizontalThrustN: number; netVerticalN: number };

export class ForceVectors {
  readonly group = new THREE.Group();
  private readonly thrust = new Arrow(0x75a9cb, 0.006, "F_thrust");
  private readonly weight = new Arrow(0xc7a46b, 0.006, "F_weight");
  private readonly horizontal = new Arrow(0x9fc4dd, 0.004, "F_thrust_horizontal");
  private readonly motors = [0, 1, 2, 3].map((i) => new Arrow(0x75a9cb, 0.003, `F_motor_${i}`));
  private readonly k: number;
  private readonly layout;
  showMotors: boolean;

  constructor(private readonly opts: ForceVectorOptions) {
    this.k = opts.metresPerNewton ?? 0.06;
    this.showMotors = opts.showMotors ?? false;
    this.layout = motorLayout(opts.params);
    this.group.name = "STRATA_force_vectors";
    this.group.add(this.thrust.group, this.weight.group, this.horizontal.group, ...this.motors.map((m) => m.group));
  }

  update(frame: VisualFrame): ForceReadout {
    const q = new THREE.Quaternion(frame.quaternion.x, frame.quaternion.y, frame.quaternion.z, frame.quaternion.w);
    const com = new THREE.Vector3(frame.positionM.x, frame.positionM.y, frame.positionM.z);
    const [u0, u1, u2, u3] = frame.motorsN;
    const T = u0 + u1 + u2 + u3;
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const thrustW = up.clone().multiplyScalar(T);
    const W = this.opts.params.massKg * this.opts.params.gravityM_S2;
    this.thrust.set(com, thrustW.clone().multiplyScalar(this.k));
    this.weight.set(com, new THREE.Vector3(0, 0, -W * this.k));
    const horiz = new THREE.Vector3(thrustW.x, thrustW.y, 0);
    this.horizontal.set(com, horiz.clone().multiplyScalar(this.k));
    this.layout.forEach((m, i) => {
      const at = new THREE.Vector3(m.bodyX, m.bodyY, 0.031).applyQuaternion(q).add(com);
      this.motors[i].set(at, up.clone().multiplyScalar(frame.motorsN[i] * this.k * 2));
      this.motors[i].group.visible = this.showMotors && frame.motorsN[i] > 1e-3;
    });
    return { thrustN: T, weightN: W, verticalThrustN: thrustW.z, horizontalThrustN: horiz.length(), netVerticalN: thrustW.z - W };
  }

  dispose() {
    [this.thrust, this.weight, this.horizontal, ...this.motors].forEach((a) => a.dispose());
  }
}
