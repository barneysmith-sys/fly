import * as THREE from "three";
import { motorLayout, type MotorInfo } from "./motorLayout.ts";

/**
 * EXPLORER-4, true scale, metres, body frame (+x nose, +y left, +z up).
 * Built procedurally so it needs no asset fetch and can also be exported
 * to assets/aircraft/explorer4.glb with GLTFExporter (see demo/export).
 *
 * Geometry follows design board 04: motors at (±0.085, ±0.085) m, which is
 * the sim's motorRadiusM = 0.120. 110 mm two-blade props. Feet 0.062 m
 * below the centre of mass. Fixed camera, +15° up. No gimbal.
 *
 * Every mesh carries userData.part (anatomy id) and userData.explode
 * (rest position + offset) for ExplodedView.
 */

export type PartId =
  | "frame" | "shell" | "prop" | "motor" | "esc" | "fc" | "imu"
  | "battery" | "gnss" | "camera" | "gear" | "lights";

export const PART_IDS: PartId[] = ["prop", "motor", "esc", "fc", "imu", "battery", "gnss", "camera", "gear", "frame", "shell", "lights"];

export type Explorer4 = {
  root: THREE.Group;
  /** One group per motor at the motor axis. Index = sim motor index. */
  motors: THREE.Group[];
  /** Rotating group per motor (bell + prop). Rotate about local +z. */
  rotors: THREE.Group[];
  blades: THREE.Group[];
  discs: THREE.Mesh[];
  /** Status ring on each motor base. Color shows the motor's state. */
  motorRings: THREE.Mesh[];
  lights: { navFR: THREE.Mesh; navFL: THREE.Mesh; statusAft: THREE.Mesh };
  fpvAnchor: THREE.Object3D;
  layout: MotorInfo[];
  meshesByPart: Map<PartId, THREE.Mesh[]>;
  dispose(): void;
};

export const E4_DIMENSIONS = {
  motorOffsetM: 0.085,
  propRadiusM: 0.055,
  propPlaneZ: 0.031,
  feetZ: -0.062,
  shellTopZ: 0.034,
  cameraUptiltRad: (15 * Math.PI) / 180,
  fpvAnchor: { x: 0.075, y: 0, z: -0.002 },
} as const;

function carbonTexture(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cell = 8;
      const u = Math.floor(x / cell);
      const v = Math.floor(y / cell);
      const twill = (u + v) % 4 < 2;
      const fx = (x % cell) / cell;
      const fy = (y % cell) / cell;
      const sheen = twill ? 0.5 + 0.5 * Math.sin(fx * Math.PI) : 0.5 + 0.5 * Math.sin(fy * Math.PI);
      const base = 18 + sheen * 22;
      const i = (y * size + x) * 4;
      data[i] = base;
      data[i + 1] = base + 3;
      data[i + 2] = base + 7;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.name = "E4_carbon_twill";
  tex.needsUpdate = true;
  return tex;
}

export function createExplorerMaterials() {
  const carbon = carbonTexture();
  carbon.repeat.set(6, 1);
  return {
    shell: new THREE.MeshStandardMaterial({ name: "E4_titanium_shell", color: 0x8a9099, metalness: 1, roughness: 0.35 }),
    body: new THREE.MeshStandardMaterial({ name: "E4_graphite_body", color: 0x2a3138, metalness: 0, roughness: 0.55 }),
    carbon: new THREE.MeshStandardMaterial({ name: "E4_carbon_arm", color: 0xffffff, map: carbon, metalness: 0.1, roughness: 0.4 }),
    alu: new THREE.MeshStandardMaterial({ name: "E4_machined_alu", color: 0x9aa6b0, metalness: 1, roughness: 0.28 }),
    prop: new THREE.MeshStandardMaterial({ name: "E4_prop_composite", color: 0x14181c, metalness: 0, roughness: 0.45, side: THREE.DoubleSide }),
    pcb: new THREE.MeshStandardMaterial({ name: "E4_pcb", color: 0x1f3d31, metalness: 0.2, roughness: 0.6 }),
    chip: new THREE.MeshStandardMaterial({ name: "E4_chip", color: 0x101418, metalness: 0.3, roughness: 0.5 }),
    battery: new THREE.MeshStandardMaterial({ name: "E4_battery_wrap", color: 0x1b1f24, metalness: 0, roughness: 0.7 }),
    label: new THREE.MeshStandardMaterial({ name: "E4_amber_label", color: 0xc7a46b, metalness: 0, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ name: "E4_lens_glass", color: 0x0b1218, metalness: 0.4, roughness: 0.05 }),
    gear: new THREE.MeshStandardMaterial({ name: "E4_gear_composite", color: 0x262c33, metalness: 0.1, roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ name: "E4_rubber", color: 0x0d0f11, metalness: 0, roughness: 0.9 }),
    steelLed: new THREE.MeshStandardMaterial({ name: "E4_led_steel", color: 0x75a9cb, emissive: 0x75a9cb, emissiveIntensity: 0.2, roughness: 0.3 }),
    amberLed: new THREE.MeshStandardMaterial({ name: "E4_led_amber", color: 0xc7a46b, emissive: 0xc7a46b, emissiveIntensity: 0.2, roughness: 0.3 }),
    ring: new THREE.MeshBasicMaterial({ name: "E4_motor_ring", color: 0x3d4b58 }),
    disc: new THREE.MeshBasicMaterial({ name: "E4_rotor_disc", vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 }),
    carbonTexture: carbon,
  };
}

/** Faceted top-view outline of the fuselage, metres. Nose at +x. */
function fuselageShape(scale = 1): THREE.Shape {
  const s = new THREE.Shape();
  const pts: [number, number][] = [
    [0.086, 0.0], [0.072, 0.02], [0.05, 0.032], [-0.06, 0.032], [-0.072, 0.022],
    [-0.072, -0.022], [-0.06, -0.032], [0.05, -0.032], [0.072, -0.02],
  ];
  s.moveTo(pts[0][0] * scale, pts[0][1] * scale);
  for (const [x, y] of pts.slice(1)) s.lineTo(x * scale, y * scale);
  s.closePath();
  return s;
}

/** Twisted, tapered blade from hub to tip along +x. spinSign sets the pitch hand. */
function bladeGeometry(spinSign: 1 | -1): THREE.BufferGeometry {
  const span = 12;
  const chordSeg = 3;
  const r0 = 0.007;
  const r1 = 0.055;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= span; i += 1) {
    const t = i / span;
    const r = r0 + (r1 - r0) * t;
    const chord = 0.012 - 0.006 * t + 0.003 * Math.sin(t * Math.PI) * (1 - t);
    const twist = ((20 - 12 * t) * Math.PI) / 180;
    for (let j = 0; j <= chordSeg; j += 1) {
      const c = (j / chordSeg - 0.5) * chord;
      // Leading edge (+tangent for CCW, -tangent for CW) sits higher.
      const y = c * Math.cos(twist) * spinSign;
      const z = c * Math.sin(twist) + 0.0006 * (1 - Math.abs(j / chordSeg - 0.5) * 2);
      positions.push(r, y, z);
    }
  }
  const row = chordSeg + 1;
  for (let i = 0; i < span; i += 1) {
    for (let j = 0; j < chordSeg; j += 1) {
      const a = i * row + j;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function discGeometry(): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(0.006, 0.056, 48, 3);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i += 1) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    const t = (r - 0.006) / 0.05;
    const a = 0.08 + 0.28 * Math.pow(t, 1.6) * (t > 0.96 ? 0.4 : 1);
    colors[i * 4] = 0.55;
    colors[i * 4 + 1] = 0.6;
    colors[i * 4 + 2] = 0.66;
    colors[i * 4 + 3] = a;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  return g;
}

export function buildExplorer4(): Explorer4 {
  const mats = createExplorerMaterials();
  const layout = motorLayout({ motorRadiusM: 0.12 });
  const root = new THREE.Group();
  root.name = "E4_root";
  const meshesByPart = new Map<PartId, THREE.Mesh[]>();
  const geometries: THREE.BufferGeometry[] = [];

  const add = (parent: THREE.Object3D, name: string, geo: THREE.BufferGeometry, mat: THREE.Material, part: PartId, explode: [number, number, number], at: [number, number, number] = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.position.set(...at);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.part = part;
    mesh.userData.explode = { rest: mesh.position.toArray(), offset: explode };
    parent.add(mesh);
    geometries.push(geo);
    const list = meshesByPart.get(part) ?? [];
    list.push(mesh);
    meshesByPart.set(part, list);
    return mesh;
  };

  const body = new THREE.Group();
  body.name = "E4_body";
  root.add(body);

  const fus = new THREE.ExtrudeGeometry(fuselageShape(), { depth: 0.032, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
  fus.translate(0, 0, -0.019);
  add(body, "E4_fuselage", fus, mats.body, "frame", [0, 0, 0]);

  const shellGeo = new THREE.ExtrudeGeometry(fuselageShape(0.82), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3 });
  shellGeo.translate(-0.004, 0, 0.02);
  add(body, "E4_shell_top", shellGeo, mats.shell, "shell", [0, 0, 0.07]);

  const battery = add(body, "E4_battery", new THREE.BoxGeometry(0.078, 0.036, 0.02), mats.battery, "battery", [-0.1, 0, -0.012], [-0.012, 0, -0.004]);
  add(battery, "E4_battery_label", new THREE.BoxGeometry(0.03, 0.0362, 0.0204), mats.label, "battery", [0, 0, 0], [0.012, 0, 0]);

  const esc = add(body, "E4_esc", new THREE.BoxGeometry(0.036, 0.036, 0.0016), mats.pcb, "esc", [0, 0, 0.035], [0.018, 0, 0.011]);
  for (let i = 0; i < 4; i += 1) {
    add(esc, `E4_esc_fet_${i}`, new THREE.BoxGeometry(0.006, 0.006, 0.0014), mats.chip, "esc", [0, 0, 0], [i < 2 ? 0.01 : -0.01, i % 2 ? 0.01 : -0.01, 0.0015]);
  }
  const fc = add(body, "E4_fc", new THREE.BoxGeometry(0.036, 0.036, 0.0016), mats.pcb, "fc", [0, 0, 0.055], [0.018, 0, 0.017]);
  add(fc, "E4_fc_mcu", new THREE.BoxGeometry(0.01, 0.01, 0.0014), mats.chip, "fc", [0, 0, 0], [-0.006, 0, 0.0015]);
  add(fc, "E4_imu", new THREE.BoxGeometry(0.006, 0.006, 0.0018), mats.steelLed, "imu", [0, 0, 0.02], [0.009, 0.006, 0.0017]);

  const mast = new THREE.Group();
  mast.name = "E4_gnss_mast";
  mast.position.set(-0.034, 0, 0.034);
  body.add(mast);
  add(mast, "E4_gnss", new THREE.CylinderGeometry(0.012, 0.012, 0.006, 32).rotateX(Math.PI / 2), mats.body, "gnss", [0, 0, 0.09], [0, 0, 0.007]);
  add(mast, "E4_gnss_cap", new THREE.CylinderGeometry(0.0105, 0.0105, 0.0012, 32).rotateX(Math.PI / 2), mats.shell, "gnss", [0, 0, 0.09], [0, 0, 0.0106]);
  for (const side of [1, -1]) {
    const ant = add(mast, side > 0 ? "E4_antenna_L" : "E4_antenna_R", new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, 8).rotateX(Math.PI / 2), mats.gear, "gnss", [0, side * 0.03, 0.08], [-0.026, side * 0.016, 0.006]);
    ant.rotation.set(side * 0.35, -0.5, 0);
  }

  const camMount = new THREE.Group();
  camMount.name = "E4_cam_mount";
  camMount.position.set(0.07, 0, -0.004);
  camMount.rotation.y = -E4_DIMENSIONS.cameraUptiltRad;
  body.add(camMount);
  add(camMount, "E4_camera", new THREE.BoxGeometry(0.02, 0.022, 0.02), mats.body, "camera", [0.06, 0, 0], [0, 0, 0]);
  add(camMount, "E4_lens", new THREE.CylinderGeometry(0.0065, 0.0075, 0.008, 24).rotateZ(Math.PI / 2), mats.glass, "camera", [0.06, 0, 0], [0.013, 0, 0]);
  const fpvAnchor = new THREE.Object3D();
  fpvAnchor.name = "E4_fpv_anchor";
  fpvAnchor.position.set(0.018, 0, 0);
  camMount.add(fpvAnchor);

  const motors: THREE.Group[] = [];
  const rotors: THREE.Group[] = [];
  const blades: THREE.Group[] = [];
  const discs: THREE.Mesh[] = [];
  const motorRings: THREE.Mesh[] = [];
  const discGeo = discGeometry();
  geometries.push(discGeo);
  for (const m of layout) {
    const angle = Math.atan2(m.bodyY, m.bodyX);
    const armLen = Math.hypot(m.bodyX, m.bodyY) - 0.02;
    const armGeo = new THREE.BoxGeometry(armLen, 0.014, 0.006);
    armGeo.translate(armLen / 2 + 0.02, 0, 0);
    const arm = add(root, `E4_arm_${m.index}`, armGeo, mats.carbon, "frame", [0, 0, 0], [0, 0, 0.004]);
    arm.rotation.z = angle;

    const motor = new THREE.Group();
    motor.name = `E4_motor_${m.index}`;
    motor.position.set(m.bodyX, m.bodyY, 0);
    motor.userData.motorIndex = m.index;
    motor.userData.part = "motor";
    const radial = new THREE.Vector3(m.bodyX, m.bodyY, 0).normalize().multiplyScalar(0.035);
    motor.userData.explode = { rest: motor.position.toArray(), offset: [radial.x, radial.y, 0.02] };
    root.add(motor);
    motors.push(motor);
    add(motor, `E4_motor_base_${m.index}`, new THREE.CylinderGeometry(0.0135, 0.0145, 0.006, 32).rotateX(Math.PI / 2), mats.alu, "motor", [0, 0, 0], [0, 0, 0.01]);
    const ring = add(motor, `E4_motor_ring_${m.index}`, new THREE.TorusGeometry(0.0148, 0.0012, 8, 40), mats.ring.clone(), "motor", [0, 0, 0], [0, 0, 0.0075]);
    motorRings.push(ring);

    const rotor = new THREE.Group();
    rotor.name = `E4_rotor_${m.index}`;
    rotor.position.set(0, 0, 0.013);
    rotor.userData.spinSign = m.spinSign;
    motor.add(rotor);
    rotors.push(rotor);
    add(rotor, `E4_bell_${m.index}`, new THREE.CylinderGeometry(0.014, 0.014, 0.012, 32).rotateX(Math.PI / 2), mats.alu, "motor", [0, 0, 0], [0, 0, 0.006]);
    add(rotor, `E4_bell_vent_${m.index}`, new THREE.TorusGeometry(0.009, 0.0016, 6, 6), mats.chip, "motor", [0, 0, 0], [0, 0, 0.0122]);
    const prop = new THREE.Group();
    prop.name = `E4_prop_${m.index}`;
    prop.position.set(0, 0, E4_DIMENSIONS.propPlaneZ - 0.013);
    prop.userData.part = "prop";
    prop.userData.explode = { rest: prop.position.toArray(), offset: [0, 0, 0.06] };
    rotor.add(prop);
    const bladeGroup = new THREE.Group();
    bladeGroup.name = `E4_blades_${m.index}`;
    prop.add(bladeGroup);
    blades.push(bladeGroup);
    const bg = bladeGeometry(m.spinSign);
    add(bladeGroup, `E4_blade_${m.index}_a`, bg, mats.prop, "prop", [0, 0, 0]);
    const b2 = add(bladeGroup, `E4_blade_${m.index}_b`, bg, mats.prop, "prop", [0, 0, 0]);
    b2.rotation.z = Math.PI;
    add(bladeGroup, `E4_prop_hub_${m.index}`, new THREE.CylinderGeometry(0.0055, 0.0065, 0.006, 20).rotateX(Math.PI / 2), mats.alu, "prop", [0, 0, 0]);
    const disc = add(prop, `E4_disc_${m.index}`, discGeo, mats.disc.clone(), "prop", [0, 0, 0], [0, 0, 0.0008]);
    disc.castShadow = false;
    disc.visible = false;
    discs.push(disc);
  }

  // Rigid gear: four legs, body corners to feet at z = -0.062.
  const feet: [number, number][] = [[0.045, -0.045], [0.045, 0.045], [-0.045, 0.045], [-0.045, -0.045]];
  feet.forEach(([fx, fy], i) => {
    const top = new THREE.Vector3(Math.sign(fx) * 0.03, Math.sign(fy) * 0.024, -0.02);
    const foot = new THREE.Vector3(fx, fy, -0.058);
    const len = top.distanceTo(foot);
    const leg = add(root, `E4_gear_${i}`, new THREE.CylinderGeometry(0.0024, 0.0028, len, 10), mats.gear, "gear", [Math.sign(fx) * 0.02, Math.sign(fy) * 0.02, -0.05], top.clone().add(foot).multiplyScalar(0.5).toArray() as [number, number, number]);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), foot.clone().sub(top).normalize());
    add(root, `E4_foot_${i}`, new THREE.SphereGeometry(0.004, 12, 8), mats.rubber, "gear", [Math.sign(fx) * 0.02, Math.sign(fy) * 0.02, -0.05], [fx, fy, -0.058]);
  });

  const navFR = add(root, "E4_light_nav_FR", new THREE.BoxGeometry(0.006, 0.004, 0.003), mats.steelLed.clone(), "lights", [0, 0, 0], [0.064, -0.064, 0.0075]);
  const navFL = add(root, "E4_light_nav_FL", new THREE.BoxGeometry(0.006, 0.004, 0.003), mats.steelLed.clone(), "lights", [0, 0, 0], [0.064, 0.064, 0.0075]);
  const statusAft = add(root, "E4_light_status_aft", new THREE.BoxGeometry(0.004, 0.026, 0.005), mats.amberLed.clone(), "lights", [-0.03, 0, 0], [-0.0745, 0, 0.012]);

  return {
    root, motors, rotors, blades, discs, motorRings,
    lights: { navFR, navFL, statusAft },
    fpvAnchor, layout, meshesByPart,
    dispose() {
      for (const g of geometries) g.dispose();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          list.forEach((mat) => mat.dispose());
        }
      });
      mats.carbonTexture.dispose();
    },
  };
}
