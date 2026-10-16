import * as THREE from "three";

/** Original training quad. Dimensions are metres in the body frame, x forward, z up. */

const BODY = 0x2a3138;
const SHELL = 0x3c4650;
const ARM = 0x9aa6b0;
const ACCENT = 0x75a9cb;
const WARM = 0xc7a46b;

export function buildExplorer(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.45, metalness: 0.35 });
  const shellMat = new THREE.MeshStandardMaterial({ color: SHELL, roughness: 0.4, metalness: 0.25 });
  const armMat = new THREE.MeshStandardMaterial({ color: ARM, roughness: 0.35, metalness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.3, metalness: 0.4, emissive: ACCENT, emissiveIntensity: 0.15 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a2128, roughness: 0.6, metalness: 0.2 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.062, 0.022), bodyMat);
  body.userData.part = "controller";
  group.add(body);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.046, 0.008), shellMat);
  shell.position.z = 0.014;
  shell.userData.part = "airframe";
  group.add(shell);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.014), shellMat);
  nose.position.set(0.052, 0, 0.002);
  nose.userData.part = "airframe";
  group.add(nose);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.002), accentMat);
  stripe.position.set(0, 0, 0.019);
  stripe.userData.part = "airframe";
  group.add(stripe);

  for (const [sx, sy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.005), armMat);
    arm.position.set(sx * 0.048, sy * 0.048, 0.004);
    arm.rotation.z = Math.atan2(sy, sx);
    arm.userData.part = "airframe";
    group.add(arm);
  }

  const motorGeo = new THREE.CylinderGeometry(0.011, 0.013, 0.016, 16);
  motorGeo.rotateX(Math.PI / 2);
  const positions: [number, number][] = [
    [0.078, 0.078],
    [0.078, -0.078],
    [-0.078, 0.078],
    [-0.078, -0.078],
  ];
  const props = new THREE.Group();
  props.name = "props";
  for (const [x, y] of positions) {
    const motor = new THREE.Mesh(motorGeo, armMat);
    motor.position.set(x, y, 0.016);
    motor.userData.part = "motor";
    group.add(motor);
    const hub = new THREE.Group();
    hub.position.set(x, y, 0.028);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.005, 0.0015), darkMat);
    blade.userData.part = "propeller";
    hub.add(blade);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.12, 0.0015), darkMat);
    blade2.userData.part = "propeller";
    hub.add(blade2);
    props.add(hub);
  }
  group.add(props);

  const camera = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.012), darkMat);
  camera.position.set(0.062, 0, -0.004);
  camera.userData.part = "camera";
  group.add(camera);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.01, 12), accentMat);
  lens.rotateZ(Math.PI / 2);
  lens.position.set(0.072, 0, -0.004);
  lens.userData.part = "sensors";
  group.add(lens);

  const railGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.1, 8);
  railGeo.rotateY(Math.PI / 2);
  for (const y of [0.032, -0.032]) {
    const rail = new THREE.Mesh(railGeo, darkMat);
    rail.position.set(0, y, -0.036);
    rail.userData.part = "limits";
    group.add(rail);
    for (const x of [0.03, -0.03]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.028, 6), darkMat);
      leg.rotateX(Math.PI / 2);
      leg.position.set(x, y, -0.02);
      leg.userData.part = "limits";
      group.add(leg);
    }
  }
  const led = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.012, 0.004),
    new THREE.MeshStandardMaterial({ color: WARM, emissive: WARM, emissiveIntensity: 0.8, roughness: 0.4 }),
  );
  led.position.set(-0.06, 0, 0.02);
  led.userData.part = "controller";
  group.add(led);
  return group;
}

export function spinProps(group: THREE.Object3D, deltaRad: number): void {
  const props = group.getObjectByName("props");
  if (!props) {
    return;
  }
  props.children.forEach((hub, index) => {
    hub.rotation.z += deltaRad * (index % 2 === 0 ? 1 : -1);
  });
}
