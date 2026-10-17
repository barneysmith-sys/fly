import * as THREE from "three";
import type { Explorer4 } from "./explorer4Model.ts";

/**
 * Deterministic, reversible exploded view.
 *
 * The pose is a pure function of progress p ∈ [0, 1]: each object moves from
 * userData.explode.rest by offset × ease(stagger(p)). Same p, same pose, in
 * either direction. animateTo() only moves p; it never stores a pose.
 *
 * Assembly order (staggered, outermost first): shell, GNSS, FC, IMU, ESC,
 * battery, props, motors, camera, gear.
 */

const ORDER: Record<string, number> = { shell: 0, gnss: 1, fc: 2, imu: 3, esc: 4, battery: 5, prop: 6, motor: 7, camera: 8, gear: 9, lights: 9, frame: 9 };

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Entry = { obj: THREE.Object3D; rest: THREE.Vector3; offset: THREE.Vector3; slot: number };

export class ExplodedView {
  private readonly entries: Entry[] = [];
  private progress = 0;
  private target = 0;
  private speed = 0;

  constructor(model: Explorer4, private readonly stagger = 0.45) {
    model.root.traverse((obj) => {
      const ex = obj.userData.explode as { rest: number[]; offset: number[] } | undefined;
      if (!ex) return;
      const off = new THREE.Vector3(...(ex.offset as [number, number, number]));
      if (off.lengthSq() === 0) return;
      const part = (obj.userData.part as string) ?? "frame";
      this.entries.push({ obj, rest: new THREE.Vector3(...(ex.rest as [number, number, number])), offset: off, slot: ORDER[part] ?? 9 });
    });
  }

  /** Pure pose for progress p. */
  setProgress(p: number) {
    this.progress = THREE.MathUtils.clamp(p, 0, 1);
    for (const e of this.entries) {
      const start = (e.slot / 9) * this.stagger;
      const local = THREE.MathUtils.clamp((this.progress - start) / (1 - this.stagger), 0, 1);
      e.obj.position.copy(e.rest).addScaledVector(e.offset, easeInOutCubic(local));
    }
  }

  /** Move toward 1 (explode) or 0 (reassemble) over durationS. */
  animateTo(target: 0 | 1, durationS = 1.4) {
    this.target = target;
    this.speed = 1 / Math.max(0.05, durationS);
  }

  update(dtS: number) {
    if (this.progress === this.target) return;
    const step = this.speed * dtS;
    const next = this.target > this.progress ? Math.min(this.target, this.progress + step) : Math.max(this.target, this.progress - step);
    this.setProgress(next);
  }

  get value() {
    return this.progress;
  }
}
