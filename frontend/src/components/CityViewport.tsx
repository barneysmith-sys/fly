import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { District } from "../sim/district";
import { rotateBodyToWorld, type Quat, type Vec3 } from "../sim/math";
import type { MotorsN } from "../sim/vehicle";

export type CameraMode = "fpv" | "chase" | "external";

export type CityPose = {
  position: Vec3;
  quaternion: Quat;
  motors: MotorsN;
};

type CityViewportProps = {
  district: District;
  poseRef: { current: CityPose };
  cameraMode: CameraMode;
  renderRef: { current: () => void };
};

/** Drawing scale of the airframe only. Position, cameras, and collision use metres. */
const DRAWING_SCALE = 3;

export function CityViewport({ district, poseRef, cameraMode, renderRef }: CityViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    let disposed = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2834);
    scene.fog = new THREE.Fog(0x1a2834, 140, 620);

    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 900);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);

    const sky = new THREE.HemisphereLight(0xd5e2ee, 0x243240, 1.15);
    sky.position.set(0, 0, 1);
    scene.add(sky);
    const sun = new THREE.DirectionalLight(0xf7f4ee, 2.1);
    sun.position.set(90, -50, 140);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9eb4c6, 0.55);
    fill.position.set(-70, 90, 60);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(720, 640),
      new THREE.MeshStandardMaterial({ color: 0x24303a, roughness: 0.95, metalness: 0 }),
    );
    ground.position.z = 0;
    scene.add(ground);

    const grid = new THREE.GridHelper(640, 64, 0x4d6274, 0x334554);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 640),
      new THREE.MeshStandardMaterial({ color: 0x1a3344, roughness: 0.72, metalness: 0.08 }),
    );
    water.position.set(-300, 10, -0.05);
    scene.add(water);

    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0, 0.5);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.04 });
    const instances = new THREE.InstancedMesh(box, material, district.buildings.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    district.buildings.forEach((building, index) => {
      const shaft = building.h > 72 && !building.pad ? building.h * 0.78 : building.h;
      dummy.position.set(building.x, building.y, 0);
      dummy.scale.set(building.w, building.d, shaft);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix);
      color.set(facadeColor(building.h, building.pad, index));
      instances.setColorAt(index, color);
    });
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) {
      instances.instanceColor.needsUpdate = true;
    }
    scene.add(instances);
    scene.add(buildCrowns(district.buildings));

    const pad = district.buildings.find((item) => item.pad);
    if (pad) {
      const mark = new THREE.Mesh(
        new THREE.BoxGeometry(pad.w * 0.55, pad.d * 0.55, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xc7a46b, roughness: 0.7, metalness: 0 }),
      );
      mark.position.set(pad.x, pad.y, pad.h + 0.04);
      scene.add(mark);
    }

    const launch = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.45, 48),
      new THREE.MeshBasicMaterial({ color: 0x75a9cb }),
    );
    launch.position.set(district.launch.x, district.launch.y, 0.03);
    scene.add(launch);

    const drone = buildDrone();
    scene.add(drone);

    const paint = () => {
      if (disposed) {
        return;
      }
      const pose = poseRef.current;
      drone.position.set(pose.position.x, pose.position.y, pose.position.z);
      drone.quaternion.set(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w);
      drone.scale.setScalar(DRAWING_SCALE);
      const mode = cameraModeRef.current;
      drone.visible = mode !== "fpv";
      placeCamera(camera, pose, mode);
      renderer.render(scene, camera);
    };

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      paint();
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
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = mesh.material;
        if (Array.isArray(materials)) {
          materials.forEach((item) => item.dispose());
        } else {
          materials?.dispose();
        }
      });
      mount.removeChild(renderer.domElement);
    };
  }, [district, poseRef, renderRef]);

  return <div ref={mountRef} className="city-mount" />;
}

function placeCamera(camera: THREE.PerspectiveCamera, pose: CityPose, mode: CameraMode) {
  const forward = rotateBodyToWorld(pose.quaternion, { x: 1, y: 0, z: 0 });
  const up = rotateBodyToWorld(pose.quaternion, { x: 0, y: 0, z: 1 });
  if (mode === "fpv") {
    camera.fov = 92;
    camera.up.set(up.x, up.y, up.z);
    camera.position.set(
      pose.position.x + forward.x * 0.15 + up.x * 0.04,
      pose.position.y + forward.y * 0.15 + up.y * 0.04,
      pose.position.z + forward.z * 0.15 + up.z * 0.04,
    );
    camera.lookAt(
      camera.position.x + forward.x,
      camera.position.y + forward.y,
      camera.position.z + forward.z,
    );
  } else if (mode === "chase") {
    camera.fov = 52;
    camera.up.set(0, 0, 1);
    camera.position.set(pose.position.x - forward.x * 12, pose.position.y - forward.y * 12, pose.position.z + 6.5);
    camera.lookAt(pose.position.x + forward.x * 16, pose.position.y + forward.y * 16, pose.position.z + 2);
  } else {
    camera.fov = 46;
    camera.up.set(0, 0, 1);
    camera.position.set(pose.position.x - 55, pose.position.y - 95, pose.position.z + 48);
    camera.lookAt(pose.position.x + 20, pose.position.y + 8, 12);
  }
  camera.updateProjectionMatrix();
}

function facadeColor(heightM: number, pad: boolean, index: number): string {
  if (pad) {
    return "#6d857c";
  }
  if (heightM > 110) {
    return "#b7c8d6";
  }
  if (heightM > 60) {
    return "#8ea6ba";
  }
  return index % 2 === 0 ? "#6e879c" : "#7d98ae";
}

function buildCrowns(buildings: District["buildings"]): THREE.InstancedMesh {
  const tall = buildings.filter((building) => building.h > 72 && !building.pad);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0, 0.5);
  const material = new THREE.MeshStandardMaterial({ color: 0x7f96aa, roughness: 0.6, metalness: 0.06 });
  const crowns = new THREE.InstancedMesh(geometry, material, Math.max(tall.length, 1));
  const dummy = new THREE.Object3D();
  tall.forEach((building, index) => {
    const crownH = building.h * 0.22;
    dummy.position.set(building.x, building.y, building.h * 0.78);
    dummy.scale.set(building.w * 0.62, building.d * 0.62, crownH);
    dummy.updateMatrix();
    crowns.setMatrixAt(index, dummy.matrix);
  });
  crowns.count = tall.length;
  crowns.instanceMatrix.needsUpdate = true;
  return crowns;
}

function buildDrone(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd5dee6, roughness: 0.45, metalness: 0.15 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x8ea0ae, roughness: 0.5, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.04), bodyMat);
  group.add(body);
  const arm = new THREE.BoxGeometry(0.28, 0.025, 0.012);
  for (const yaw of [Math.PI / 4, -Math.PI / 4]) {
    const mesh = new THREE.Mesh(arm, armMat);
    mesh.rotation.z = yaw;
    group.add(mesh);
  }
  const disc = new THREE.CircleGeometry(0.07, 16);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x243240, side: THREE.DoubleSide, roughness: 0.8 });
  for (const [x, y] of [
    [0.09, 0.09],
    [0.09, -0.09],
    [-0.09, 0.09],
    [-0.09, -0.09],
  ]) {
    const prop = new THREE.Mesh(disc, discMat);
    prop.position.set(x, y, 0.03);
    group.add(prop);
  }
  return group;
}
