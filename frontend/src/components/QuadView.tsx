import { useEffect, useRef } from "react";
import * as THREE from "three";

type QuadViewProps = {
  altitudeM: number | null;
  targetAltitudeM: number | null;
  thrustN: number | null;
  weightN: number | null;
};

/** Screen metres of arrow when thrust equals weight. Not a physical length. */
const ARROW_METRES_AT_WEIGHT = 0.35;
/** Drawing scale only. Altitude is not multiplied by this. */
const AIRFRAME_DRAWING_SCALE = 1.5;

type ViewState = {
  altitudeM: number;
  targetAltitudeM: number | null;
  thrustN: number | null;
  weightN: number | null;
  active: boolean;
};

export function QuadView({ altitudeM, targetAltitudeM, thrustN, weightN }: QuadViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<() => void>(() => {});
  const viewRef = useRef<ViewState>({
    altitudeM: 0,
    targetAltitudeM: null,
    thrustN: null,
    weightN: null,
    active: false,
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    let disposed = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1016);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40);
    camera.position.set(2.35, 1.28, 2.5);
    camera.lookAt(0, 1.05, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(mount.clientWidth, 1), Math.max(mount.clientHeight, 1));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xc5d0da, 0x1a2129, 0.85));
    const sun = new THREE.DirectionalLight(0xf2f4f6, 1.15);
    sun.position.set(4, 8, 3);
    scene.add(sun);

    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 64),
      new THREE.MeshStandardMaterial({ color: 0x12181f, roughness: 1, metalness: 0 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -0.004;
    scene.add(pad);

    const grid = new THREE.GridHelper(4, 8, 0x3a4a5c, 0x243140);
    grid.position.y = 0;
    scene.add(grid);

    const mast = buildMast();
    scene.add(mast);

    const vehicle = buildVehicle();
    scene.add(vehicle.group);
    scene.add(vehicle.drop);

    const target = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.005, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xc4a36a }),
    );
    target.rotation.x = Math.PI / 2;
    scene.add(target);

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      paint();
    };

    const paint = () => {
      if (disposed) {
        return;
      }
      const state = viewRef.current;
      const altitude = state.active ? state.altitudeM : 0;
      vehicle.group.position.y = altitude;
      vehicle.drop.visible = state.active;
      vehicle.dropPositions[4] = altitude;
      vehicle.dropGeometry.attributes.position.needsUpdate = true;
      const weight = state.weightN;
      const thrust = state.thrustN;
      const showArrow =
        state.active && weight !== null && weight > 0 && thrust !== null && thrust > 0;
      vehicle.arrow.visible = showArrow;
      if (showArrow && weight !== null && thrust !== null) {
        vehicle.arrow.scale.y = ARROW_METRES_AT_WEIGHT * (thrust / weight);
      }
      const showTarget = state.active && state.targetAltitudeM !== null;
      target.visible = showTarget;
      if (showTarget && state.targetAltitudeM !== null) {
        target.position.y = state.targetAltitudeM;
      }
      renderer.render(scene, camera);
    };

    renderRef.current = paint;
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    return () => {
      disposed = true;
      renderRef.current = () => {};
      observer.disconnect();
      renderer.dispose();
      disposeObject(scene);
      mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    viewRef.current = {
      altitudeM: altitudeM ?? 0,
      targetAltitudeM,
      thrustN,
      weightN,
      active: altitudeM !== null,
    };
    renderRef.current();
  }, [altitudeM, targetAltitudeM, thrustN, weightN]);

  return (
    <div className="stage-frame">
      <div ref={mountRef} className="quad-mount" />
      <p className="stage-caption">
        {altitudeM === null
          ? "No trace yet. The vehicle stays on the ground until the model returns samples."
          : `Height ${altitudeM.toFixed(3)} m is this sample’s altitude. Grid is 0.5 m. The airframe is drawn at ${AIRFRAME_DRAWING_SCALE}× and is not in the equations. Arrow length is ${ARROW_METRES_AT_WEIGHT} m on screen when thrust equals weight.`}
      </p>
    </div>
  );
}

function buildMast(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0x6d7d8e });
  const spine = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.25, 0, 0),
    new THREE.Vector3(-1.25, 3, 0),
  ]);
  group.add(new THREE.Line(spine, material));
  for (const height of [0, 1, 2, 3]) {
    const tick = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.33, height, 0),
      new THREE.Vector3(-1.17, height, 0),
    ]);
    group.add(new THREE.Line(tick, material));
  }
  return group;
}

function buildVehicle(): {
  group: THREE.Group;
  arrow: THREE.Group;
  drop: THREE.Line;
  dropGeometry: THREE.BufferGeometry;
  dropPositions: Float32Array;
} {
  const group = new THREE.Group();
  const airframe = new THREE.Group();
  airframe.scale.setScalar(AIRFRAME_DRAWING_SCALE);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xd5dde6,
    roughness: 0.42,
    metalness: 0.2,
  });
  const armMaterial = new THREE.MeshStandardMaterial({
    color: 0xb7c2cc,
    roughness: 0.5,
    metalness: 0.16,
  });
  const motorMaterial = new THREE.MeshStandardMaterial({
    color: 0x6a7580,
    roughness: 0.4,
    metalness: 0.25,
  });
  const discMaterial = new THREE.MeshBasicMaterial({
    color: 0xe7eef3,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.036, 0.16), bodyMaterial);
  airframe.add(body);

  const armGeometry = new THREE.BoxGeometry(0.18, 0.012, 0.022);
  const motorGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.022, 16);
  const discGeometry = new THREE.CircleGeometry(0.085, 24);
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const arm = new THREE.Mesh(armGeometry, armMaterial);
    arm.position.set(Math.cos(angle) * 0.15, 0, Math.sin(angle) * 0.15);
    arm.rotation.y = -angle;
    airframe.add(arm);
    const motor = new THREE.Mesh(motorGeometry, motorMaterial);
    motor.position.set(Math.cos(angle) * 0.25, 0.01, Math.sin(angle) * 0.25);
    airframe.add(motor);
    const disc = new THREE.Mesh(discGeometry, discMaterial);
    disc.position.set(Math.cos(angle) * 0.25, 0.026, Math.sin(angle) * 0.25);
    disc.rotation.x = -Math.PI / 2;
    airframe.add(disc);
  }
  group.add(airframe);

  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.78, 10),
    new THREE.MeshBasicMaterial({ color: 0xc4a36a }),
  );
  shaft.position.y = 0.39;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.028, 0.16, 12),
    new THREE.MeshBasicMaterial({ color: 0xc4a36a }),
  );
  head.position.y = 0.86;
  arrow.add(shaft, head);
  arrow.position.y = 0.05;
  arrow.visible = false;
  group.add(arrow);

  const dropPositions = new Float32Array(6);
  const dropGeometry = new THREE.BufferGeometry();
  dropGeometry.setAttribute("position", new THREE.BufferAttribute(dropPositions, 3));
  const drop = new THREE.Line(dropGeometry, new THREE.LineBasicMaterial({ color: 0x8fa4b8 }));
  return { group, arrow, drop, dropGeometry, dropPositions };
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const withGeometry = child as THREE.Mesh;
    withGeometry.geometry?.dispose();
    const material = withGeometry.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else {
      material?.dispose();
    }
  });
}
