import * as THREE from "three";
import { E4_DIMENSIONS, type Explorer4, type PartId } from "./explorer4Model.ts";

/**
 * Component inspection: highlight the selected part, ghost the rest, and run
 * a small component-specific demonstration in the aircraft's body frame.
 *
 * Demonstrations are explanatory overlays. They never touch rotor speed or
 * pose; the prop demo, for example, draws a thrust arrow but the rotors keep
 * following whatever motor values the frame supplies.
 */

type MatState = { mat: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean; emissive?: THREE.Color; emissiveIntensity?: number };

export class AnatomyFocus {
  readonly overlays = new THREE.Group();
  private readonly saved = new Map<THREE.Mesh, MatState>();
  private selected: PartId | null = null;
  private t = 0;
  private flowLines: THREE.Line[] = [];
  private axisRings: THREE.Group | null = null;

  constructor(private readonly model: Explorer4) {
    this.overlays.name = "E4_anatomy_overlays";
    model.root.add(this.overlays);
    // Own material per mesh so ghosting one part never ghosts a shared material elsewhere.
    model.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.name.startsWith("E4_disc")) m.material = (m.material as THREE.Material).clone();
    });
  }

  get current() {
    return this.selected;
  }

  select(part: PartId | null, ghostOthers = true) {
    this.restore();
    this.clearOverlays();
    this.selected = part;
    if (!part) return;
    this.model.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.parent === this.overlays || mesh.name.startsWith("E4_disc")) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      this.saved.set(mesh, { mat, opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite, emissive: mat.emissive?.clone(), emissiveIntensity: mat.emissiveIntensity });
      if (mesh.userData.part === part) {
        if (mat.emissive) {
          mat.emissive.setHex(0x75a9cb);
          mat.emissiveIntensity = 0.35;
        }
      } else if (ghostOthers) {
        mat.transparent = true;
        mat.opacity = 0.14;
        mat.depthWrite = false;
      }
    });
    this.buildOverlay(part);
  }

  /** World-space focus target for CameraTransitions. */
  focusTarget(): { center: THREE.Vector3; radius: number } {
    const box = new THREE.Box3();
    const meshes = this.selected ? this.model.meshesByPart.get(this.selected) ?? [] : [];
    if (meshes.length === 0) box.setFromObject(this.model.root);
    else meshes.forEach((m) => box.expandByObject(m));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    return { center: sphere.center, radius: Math.max(0.03, sphere.radius) };
  }

  update(dtS: number) {
    this.t += dtS;
    for (const line of this.flowLines) {
      const mat = line.material as THREE.LineDashedMaterial & { dashOffset?: number };
      line.userData.offset = (line.userData.offset ?? 0) - dtS * 0.04;
      // three r170 has no dashOffset uniform on LineDashedMaterial: shift via the geometry's line distances.
      const geo = line.geometry as THREE.BufferGeometry;
      const dist = geo.getAttribute("lineDistance") as THREE.BufferAttribute | undefined;
      if (dist && line.userData.base) {
        const base = line.userData.base as Float32Array;
        for (let i = 0; i < dist.count; i += 1) dist.setX(i, base[i] + line.userData.offset);
        dist.needsUpdate = true;
      }
      mat.needsUpdate = false;
    }
    if (this.axisRings) this.axisRings.rotation.z = Math.sin(this.t * 1.2) * 0.25;
  }

  private restore() {
    for (const [mesh, s] of this.saved) {
      const mat = s.mat as THREE.MeshStandardMaterial;
      mesh.material = mat;
      mat.opacity = s.opacity;
      mat.transparent = s.transparent;
      mat.depthWrite = s.depthWrite;
      if (s.emissive && mat.emissive) mat.emissive.copy(s.emissive);
      if (s.emissiveIntensity !== undefined) mat.emissiveIntensity = s.emissiveIntensity;
    }
    this.saved.clear();
  }

  private clearOverlays() {
    this.overlays.children.slice().forEach((c) => {
      this.overlays.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    });
    this.flowLines = [];
    this.axisRings = null;
  }

  private flow(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const mid = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 0.012));
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 0.006, gapSize: 0.004, depthTest: false, transparent: true }));
    line.computeLineDistances();
    line.userData.base = Float32Array.from((geo.getAttribute("lineDistance") as THREE.BufferAttribute).array as Float32Array);
    line.renderOrder = 12;
    this.overlays.add(line);
    this.flowLines.push(line);
  }

  private arrow(dir: THREE.Vector3, origin: THREE.Vector3, len: number, color: number) {
    const a = new THREE.ArrowHelper(dir.clone().normalize(), origin, len, color, len * 0.25, len * 0.12);
    a.traverse((o) => { o.renderOrder = 12; const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) { m.depthTest = false; m.transparent = true; } });
    this.overlays.add(a);
  }

  private buildOverlay(part: PartId) {
    const motorTop = (i: number) => new THREE.Vector3(this.model.layout[i].bodyX, this.model.layout[i].bodyY, 0.028);
    const fc = new THREE.Vector3(0.018, 0, 0.019);
    switch (part) {
      case "prop":
        this.model.layout.forEach((_, i) => this.arrow(new THREE.Vector3(0, 0, 1), motorTop(i).setZ(0.034), 0.08, 0x75a9cb));
        break;
      case "motor":
        this.model.layout.forEach((_, i) => {
          const axis = new THREE.BufferGeometry().setFromPoints([motorTop(i).setZ(-0.01), motorTop(i).setZ(0.07)]);
          const l = new THREE.Line(axis, new THREE.LineBasicMaterial({ color: 0xc7a46b, depthTest: false, transparent: true }));
          l.renderOrder = 12;
          this.overlays.add(l);
        });
        break;
      case "fc":
        this.flow(new THREE.Vector3(0.027, 0.006, 0.019), fc, 0x7fae91); // IMU → FC
        this.flow(new THREE.Vector3(-0.034, 0, 0.044), fc, 0x7fae91); // GNSS → FC (not modeled; shown as wiring)
        this.flow(fc, new THREE.Vector3(0.018, 0, 0.012), 0x75a9cb); // FC → ESC
        this.model.layout.forEach((_, i) => this.flow(new THREE.Vector3(0.018, 0, 0.012), motorTop(i).setZ(0.012), 0x75a9cb));
        break;
      case "imu": {
        const at = new THREE.Vector3(0.027, 0.006, 0.02);
        this.arrow(new THREE.Vector3(1, 0, 0), at, 0.06, 0xc77474);
        this.arrow(new THREE.Vector3(0, 1, 0), at, 0.06, 0x7fae91);
        this.arrow(new THREE.Vector3(0, 0, 1), at, 0.06, 0x75a9cb);
        const rings = new THREE.Group();
        rings.position.copy(at);
        const ring = (axis: "x" | "y" | "z", color: number) => {
          const m = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0008, 6, 48), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 }));
          if (axis === "x") m.rotation.y = Math.PI / 2;
          if (axis === "y") m.rotation.x = Math.PI / 2;
          m.renderOrder = 12;
          rings.add(m);
        };
        ring("x", 0xc77474); ring("y", 0x7fae91); ring("z", 0x75a9cb);
        this.overlays.add(rings);
        this.axisRings = rings;
        break;
      }
      case "battery": {
        const bat = new THREE.Vector3(-0.012, 0, 0.008);
        const escP = new THREE.Vector3(0.018, 0, 0.012);
        this.flow(bat, escP, 0xc7a46b);
        this.model.layout.forEach((_, i) => this.flow(escP, motorTop(i).setZ(0.012), 0xc7a46b));
        this.flow(escP, fc, 0xc7a46b);
        break;
      }
      case "camera": {
        // Fixed mount: show the field of view, no articulation.
        const tilt = E4_DIMENSIONS.cameraUptiltRad;
        const origin = new THREE.Vector3(0.088, 0, -0.004);
        const dir = new THREE.Vector3(Math.cos(tilt), 0, Math.sin(tilt));
        const half = (74 / 2) * (Math.PI / 180);
        const len = 0.16;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sy, sz]) => {
          const side = Math.tan(half) * len;
          const up = new THREE.Vector3(-Math.sin(tilt), 0, Math.cos(tilt));
          return origin.clone().addScaledVector(dir, len).add(new THREE.Vector3(0, sy * side, 0)).addScaledVector(up, sz * side * 0.5625);
        });
        const pts: THREE.Vector3[] = [];
        corners.forEach((c, i) => { pts.push(origin, c, c, corners[(i + 1) % 4]); });
        const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x75a9cb, depthTest: false, transparent: true, opacity: 0.8 }));
        l.renderOrder = 12;
        this.overlays.add(l);
        break;
      }
      case "gear":
        [[0.045, -0.045], [0.045, 0.045], [-0.045, 0.045], [-0.045, -0.045]].forEach(([x, y]) => this.arrow(new THREE.Vector3(0, 0, 1), new THREE.Vector3(x, y, -0.11), 0.045, 0xc7a46b));
        break;
      default:
        break;
    }
  }
}
