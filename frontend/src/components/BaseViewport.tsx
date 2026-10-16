import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildExplorer, spinProps } from "./explorerModel";
import { APRON, MAINTENANCE, MAIN_HANGAR, PRECISION_PAD, type Site } from "../sim/coastal";
import { rotateBodyToWorld, type Quat, type Vec3 } from "../sim/math";
import type { MotorsN } from "../sim/vehicle";

export type CameraMode = "fpv" | "chase" | "orbit";

export type AircraftPose = {
  position: Vec3;
  quaternion: Quat;
  motors: MotorsN;
};

type BaseViewportProps = {
  site: Site;
  poseRef: { current: AircraftPose };
  cameraMode: CameraMode;
  paused: boolean;
  quality: "high" | "low";
  renderRef: { current: () => void };
};

const DRAWING_SCALE = 6;

export function BaseViewport({ site, poseRef, cameraMode, paused, quality, renderRef }: BaseViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraModeRef = useRef(cameraMode);
  const pausedRef = useRef(paused);
  const qualityRef = useRef(quality);
  cameraModeRef.current = cameraMode;
  pausedRef.current = paused;
  qualityRef.current = quality;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    let disposed = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8e9aaa);
    scene.fog = new THREE.Fog(0x9aa6b0, 120, 760);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.04, 1400);
    camera.up.set(0, 0, 1);
    const orbit = { azimuth: 0, polar: 0.55 };

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    const shadows = qualityRef.current === "high";
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.HemisphereLight(0xd5e2ee, 0x2c343c, 1.1));
    const envSun = new THREE.DirectionalLight(0xffc48a, 2.4);
    envSun.position.set(1, -0.25, 0.35);
    envScene.add(envSun);
    const env = pmrem.fromScene(envScene, 0.04);
    scene.environment = env.texture;

    scene.add(buildSky());
    const hemi = new THREE.HemisphereLight(0xd7e4f0, 0x6a624e, 1.15);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd7b0, 3.1);
    sun.position.set(40, -140, 36);
    sun.target.position.set(40, 20, 0);
    if (shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -180;
      sun.shadow.camera.right = 180;
      sun.shadow.camera.top = 140;
      sun.shadow.camera.bottom = -140;
      sun.shadow.camera.near = 10;
      sun.shadow.camera.far = 420;
      sun.shadow.bias = -0.00025;
      sun.shadow.normalBias = 0.04;
    }
    scene.add(sun);
    scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0x9eb0c2, 0.45);
    fill.position.set(-80, 40, 60);
    scene.add(fill);

    const { color, rough } = apronTextures();
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(APRON.maxX - APRON.minX, APRON.maxY - APRON.minY),
      new THREE.MeshStandardMaterial({
        map: color,
        roughnessMap: rough,
        roughness: 1,
        metalness: 0.18,
      }),
    );
    apron.position.set((APRON.minX + APRON.maxX) / 2, (APRON.minY + APRON.maxY) / 2, 0.02);
    apron.receiveShadow = true;
    scene.add(apron);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 700),
      new THREE.MeshStandardMaterial({
        color: 0x1a333c,
        roughness: 0.08,
        metalness: 0.72,
        transparent: true,
        opacity: 0.94,
      }),
    );
    water.position.set(-40, -80, 0);
    water.receiveShadow = true;
    scene.add(water);

    scene.add(buildMarkings());
    scene.add(buildStructures(shadows));
    scene.add(buildMountains());
    scene.add(buildClouds());
    scene.add(buildBoats());

    const warm = new THREE.PointLight(0xff9a4a, 18, 28, 2);
    warm.position.set(22, 40, 3.2);
    scene.add(warm);
    const lampA = new THREE.PointLight(0xffb060, 8, 16, 2);
    lampA.position.set(8, 8, 5);
    scene.add(lampA);
    const lampB = new THREE.PointLight(0xffb060, 8, 16, 2);
    lampB.position.set(70, 8, 5);
    scene.add(lampB);

    const drone = buildExplorer();
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
      const thrust = pose.motors.reduce((sum, motor) => sum + motor, 0);
      spinProps(drone, thrust * 0.035);
      placeCamera(camera, pose, mode, orbit);
      renderer.render(scene, camera);
    };

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const ratio = qualityRef.current === "high" ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height);
      paint();
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (event: PointerEvent) => {
      if (cameraModeRef.current !== "orbit" || !pausedRef.current) {
        return;
      }
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }
      orbit.azimuth -= (event.clientX - lastX) * 0.005;
      orbit.polar = Math.min(1.2, Math.max(0.15, orbit.polar + (event.clientY - lastY) * 0.004));
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    mount.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    renderRef.current = paint;
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    return () => {
      disposed = true;
      renderRef.current = () => {};
      observer.disconnect();
      mount.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      renderer.dispose();
      pmrem.dispose();
      env.texture.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = mesh.material;
        if (Array.isArray(materials)) {
          materials.forEach(disposeMaterial);
        } else if (materials) {
          disposeMaterial(materials);
        }
      });
      mount.removeChild(renderer.domElement);
    };
  }, [poseRef, renderRef, site]);

  return <div ref={mountRef} className="city-mount" />;
}

function disposeMaterial(material: THREE.Material) {
  const mapped = material as THREE.MeshStandardMaterial;
  mapped.map?.dispose();
  mapped.roughnessMap?.dispose();
  mapped.alphaMap?.dispose();
  material.dispose();
}

function placeCamera(
  camera: THREE.PerspectiveCamera,
  pose: AircraftPose,
  mode: CameraMode,
  orbit: { azimuth: number; polar: number },
) {
  const forward = rotateBodyToWorld(pose.quaternion, { x: 1, y: 0, z: 0 });
  const up = rotateBodyToWorld(pose.quaternion, { x: 0, y: 0, z: 1 });
  if (mode === "fpv") {
    camera.fov = 74;
    camera.up.set(up.x, up.y, up.z);
    camera.position.set(
      pose.position.x + forward.x * 0.18 + up.x * 0.03,
      pose.position.y + forward.y * 0.18 + up.y * 0.03,
      pose.position.z + forward.z * 0.18 + up.z * 0.03,
    );
    camera.lookAt(
      camera.position.x + forward.x,
      camera.position.y + forward.y,
      camera.position.z + forward.z,
    );
  } else if (mode === "chase") {
    camera.fov = 50;
    camera.up.set(0, 0, 1);
    camera.position.set(
      pose.position.x - forward.x * 11,
      pose.position.y - forward.y * 11,
      pose.position.z + 3.4,
    );
    camera.lookAt(
      pose.position.x + forward.x * 12,
      pose.position.y + forward.y * 12,
      pose.position.z + 1.2,
    );
  } else {
    camera.fov = 46;
    camera.up.set(0, 0, 1);
    const radius = 16;
    const cos = Math.cos(orbit.polar);
    camera.position.set(
      pose.position.x + Math.cos(orbit.azimuth) * radius * cos,
      pose.position.y + Math.sin(orbit.azimuth) * radius * cos,
      pose.position.z + 4 + Math.sin(orbit.polar) * 10,
    );
    camera.lookAt(pose.position.x, pose.position.y, pose.position.z + 0.4);
  }
  camera.updateProjectionMatrix();
}

function buildSky(): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas is unavailable");
  }
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#2a3440");
  gradient.addColorStop(0.42, "#6d7c88");
  gradient.addColorStop(0.62, "#c9b089");
  gradient.addColorStop(0.78, "#e7d3ae");
  gradient.addColorStop(1, "#8a97a3");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 8, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(780, 24, 16), material);
  return sky;
}

function apronTextures(): { color: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = 512;
  roughCanvas.height = 512;
  const roughContext = roughCanvas.getContext("2d");
  if (!context || !roughContext) {
    throw new Error("canvas is unavailable");
  }
  context.fillStyle = "#5c656e";
  context.fillRect(0, 0, 512, 512);
  roughContext.fillStyle = "#c8c8c8";
  roughContext.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1800; i += 1) {
    const shade = 46 + Math.floor(Math.random() * 28);
    context.fillStyle = `rgba(${shade},${shade + 2},${shade + 5},0.45)`;
    context.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  context.strokeStyle = "rgba(18,22,26,0.55)";
  context.lineWidth = 2;
  for (let line = 0; line <= 512; line += 64) {
    context.beginPath();
    context.moveTo(line, 0);
    context.lineTo(line, 512);
    context.stroke();
    context.beginPath();
    context.moveTo(0, line);
    context.lineTo(512, line);
    context.stroke();
  }
  roughContext.fillStyle = "#2a2a2a";
  for (let puddle = 0; puddle < 7; puddle += 1) {
    const x = 40 + Math.random() * 430;
    const y = 40 + Math.random() * 430;
    const rx = 18 + Math.random() * 36;
    const ry = 8 + Math.random() * 16;
    context.fillStyle = "rgba(18, 24, 28, 0.35)";
    context.beginPath();
    context.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2);
    context.fill();
    roughContext.beginPath();
    roughContext.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2);
    roughContext.fill();
  }
  const color = new THREE.CanvasTexture(canvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.wrapS = THREE.RepeatWrapping;
  color.wrapT = THREE.RepeatWrapping;
  color.repeat.set(8, 6);
  const rough = new THREE.CanvasTexture(roughCanvas);
  rough.colorSpace = THREE.NoColorSpace;
  rough.wrapS = THREE.RepeatWrapping;
  rough.wrapT = THREE.RepeatWrapping;
  rough.repeat.set(8, 6);
  return { color, rough };
}

function buildMarkings(): THREE.Group {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xd5dbe0, roughness: 0.55, metalness: 0.02 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xc7a46b, roughness: 0.45, metalness: 0.05, emissive: 0x6a4e28, emissiveIntensity: 0.25 });
  const center = new THREE.Mesh(new THREE.BoxGeometry(0.18, 28, 0.01), paint);
  center.position.set(6, 20, 0.045);
  group.add(center);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.85, 48), new THREE.MeshBasicMaterial({ color: 0x75a9cb }));
  ring.position.set(6, 4, 0.05);
  group.add(ring);
  const pad = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.45, 48), amber);
  pad.position.set(PRECISION_PAD.x, PRECISION_PAD.y, 0.05);
  group.add(pad);
  const crossA = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 0.01), amber);
  crossA.position.set(PRECISION_PAD.x, PRECISION_PAD.y, 0.055);
  group.add(crossA);
  const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.2, 0.01), amber);
  crossB.position.set(PRECISION_PAD.x, PRECISION_PAD.y, 0.055);
  group.add(crossB);
  return group;
}

function claddingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas is unavailable");
  }
  context.fillStyle = "#4e585f";
  context.fillRect(0, 0, 128, 256);
  context.strokeStyle = "#3a434a";
  context.lineWidth = 2;
  for (let x = 8; x < 128; x += 16) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 256);
    context.stroke();
  }
  context.fillStyle = "#5b656c";
  for (let y = 20; y < 256; y += 32) {
    context.fillRect(0, y, 128, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function buildStructures(shadows: boolean): THREE.Group {
  const group = new THREE.Group();
  const cladding = new THREE.MeshStandardMaterial({ map: claddingTexture(), color: 0xc5ced6, roughness: 0.48, metalness: 0.45 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a4248, roughness: 0.5, metalness: 0.4 });
  const interior = new THREE.MeshStandardMaterial({
    color: 0xc47a45,
    emissive: 0xff8a3c,
    emissiveIntensity: 0.55,
    roughness: 0.7,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xffb15e,
    emissive: 0xff9a3c,
    emissiveIntensity: 1.35,
    roughness: 0.25,
  });

  const main = new THREE.Mesh(new THREE.BoxGeometry(MAIN_HANGAR.maxX - MAIN_HANGAR.minX, MAIN_HANGAR.maxY - MAIN_HANGAR.minY, MAIN_HANGAR.h), cladding);
  main.position.set(
    (MAIN_HANGAR.minX + MAIN_HANGAR.maxX) / 2,
    (MAIN_HANGAR.minY + MAIN_HANGAR.maxY) / 2,
    MAIN_HANGAR.h / 2,
  );
  main.castShadow = shadows;
  main.receiveShadow = true;
  group.add(main);

  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.12, 0.7), windowMat, 18);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 18; index += 1) {
    dummy.position.set(MAIN_HANGAR.minX + 6 + index * 3.6, MAIN_HANGAR.minY - 0.05, 8.2);
    dummy.updateMatrix();
    windows.setMatrixAt(index, dummy.matrix);
  }
  windows.instanceMatrix.needsUpdate = true;
  group.add(windows);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 3.2), roofMat);
  tower.position.set(108, 56, MAIN_HANGAR.h + 1.6);
  tower.castShadow = shadows;
  group.add(tower);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.1), windowMat);
  glass.position.set(108, 53.4, MAIN_HANGAR.h + 1.8);
  group.add(glass);

  const width = MAINTENANCE.x1 - MAINTENANCE.x0;
  const depth = MAINTENANCE.y1 - MAINTENANCE.y0;
  const west = new THREE.Mesh(new THREE.BoxGeometry(0.8, depth, MAINTENANCE.h), cladding);
  west.position.set(MAINTENANCE.x0, (MAINTENANCE.y0 + MAINTENANCE.y1) / 2, MAINTENANCE.h / 2);
  west.castShadow = shadows;
  group.add(west);
  const east = new THREE.Mesh(new THREE.BoxGeometry(0.8, depth, MAINTENANCE.h), cladding);
  east.position.set(MAINTENANCE.x1, (MAINTENANCE.y0 + MAINTENANCE.y1) / 2, MAINTENANCE.h / 2);
  east.castShadow = shadows;
  group.add(east);
  const north = new THREE.Mesh(new THREE.BoxGeometry(width, 1, MAINTENANCE.h), cladding);
  north.position.set((MAINTENANCE.x0 + MAINTENANCE.x1) / 2, MAINTENANCE.y1, MAINTENANCE.h / 2);
  north.castShadow = shadows;
  group.add(north);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(width, depth, MAINTENANCE.h - MAINTENANCE.roofZ), roofMat);
  roof.position.set(
    (MAINTENANCE.x0 + MAINTENANCE.x1) / 2,
    (MAINTENANCE.y0 + MAINTENANCE.y1) / 2,
    (MAINTENANCE.roofZ + MAINTENANCE.h) / 2,
  );
  roof.castShadow = shadows;
  group.add(roof);
  const bay = new THREE.Mesh(new THREE.BoxGeometry(width - 6, 4, 4.5), interior);
  bay.position.set((MAINTENANCE.x0 + MAINTENANCE.x1) / 2, MAINTENANCE.y0 + 6, 2.6);
  group.add(bay);

  const shed = new THREE.Mesh(new THREE.BoxGeometry(22, 16, 8), cladding);
  shed.position.set(147, 36, 4);
  shed.castShadow = shadows;
  group.add(shed);
  const shedDoor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 3.4), interior);
  shedDoor.position.set(147, 28, 2);
  group.add(shedDoor);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 18, 8), cladding);
  mast.rotateX(Math.PI / 2);
  mast.position.set(159, 59, 9);
  mast.castShadow = shadows;
  group.add(mast);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 16), roofMat);
  dish.position.set(159, 59, 18.2);
  group.add(dish);

  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8);
  poleGeo.rotateX(Math.PI / 2);
  for (const [x, y] of [
    [-34, 4],
    [-26, 4],
    [-34, 12],
    [-26, 12],
  ] as const) {
    const pole = new THREE.Mesh(poleGeo, cladding);
    pole.position.set(x, y, 1.3);
    pole.castShadow = shadows;
    group.add(pole);
  }
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.7 }));
  barrier.position.set(-30, 17.1, 0.45);
  group.add(barrier);

  for (const [x, y] of [
    [10, 10],
    [68, 12],
  ] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 8), cladding);
    pole.rotateX(Math.PI / 2);
    pole.position.set(x, y, 2.5);
    group.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9a3c, emissiveIntensity: 0.8 }),
    );
    head.position.set(x, y, 5);
    group.add(head);
  }
  return group;
}

function buildMountains(): THREE.Group {
  const group = new THREE.Group();
  const near = new THREE.MeshStandardMaterial({ color: 0x3c4854, roughness: 0.9, metalness: 0.02 });
  const far = new THREE.MeshStandardMaterial({ color: 0x6a7886, roughness: 0.85, metalness: 0.02 });
  const snow = new THREE.MeshStandardMaterial({ color: 0xe7eef3, roughness: 0.7, metalness: 0.02 });
  const peaks = [
    { x: -150, y: 280, h: 150, r: 42, far: false, cap: false },
    { x: -70, y: 340, h: 220, r: 48, far: true, cap: true },
    { x: 10, y: 390, h: 280, r: 52, far: true, cap: true },
    { x: 90, y: 360, h: 240, r: 46, far: true, cap: true },
    { x: 170, y: 320, h: 190, r: 40, far: true, cap: true },
    { x: 240, y: 290, h: 140, r: 36, far: false, cap: false },
    { x: 40, y: 250, h: 90, r: 28, far: false, cap: false },
  ];
  for (const peak of peaks) {
    const geo = new THREE.ConeGeometry(peak.r, peak.h, 6);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, peak.h / 2);
    const mesh = new THREE.Mesh(geo, peak.far ? far : near);
    mesh.position.set(peak.x, peak.y, 0);
    group.add(mesh);
    if (peak.cap) {
      const capGeo = new THREE.ConeGeometry(peak.r * 0.28, peak.h * 0.22, 6);
      capGeo.rotateX(Math.PI / 2);
      capGeo.translate(0, 0, peak.h * 0.11);
      const cap = new THREE.Mesh(capGeo, snow);
      cap.position.set(peak.x, peak.y, peak.h * 0.78);
      group.add(cap);
    }
  }
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(18, 100, 9), near);
  cliff.position.set(-74, 30, 4.5);
  group.add(cliff);
  return group;
}

function buildClouds(): THREE.Group {
  const group = new THREE.Group();
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) {
    return group;
  }
  const gradient = context.createRadialGradient(64, 32, 8, 64, 32, 60);
  gradient.addColorStop(0, "rgba(230,236,242,0.55)");
  gradient.addColorStop(1, "rgba(230,236,242,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, fog: true });
  for (const [x, y, z, sx] of [
    [-40, 40, 90, 80],
    [80, 80, 120, 110],
    [20, 160, 150, 140],
    [160, 20, 100, 90],
  ] as const) {
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(sx, sx * 0.35), material);
    cloud.rotateX(Math.PI / 2);
    cloud.position.set(x, y, z);
    group.add(cloud);
  }
  return group;
}

function buildBoats(): THREE.Group {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x242a30, roughness: 0.55, metalness: 0.3 });
  for (const [x, y] of [
    [-48, -20],
    [-36, -8],
    [-55, 6],
  ] as const) {
    const boat = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.4, 0.7), hull);
    boat.position.set(x, y, 0.4);
    group.add(boat);
  }
  return group;
}
