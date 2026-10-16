import { useEffect, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BuildingStyle, District, Footprint, Street } from "../sim/district";
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
    scene.background = new THREE.Color(0x9aabba);
    scene.fog = new THREE.Fog(0x9aabba, 220, 780);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 1200);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const sky = new THREE.HemisphereLight(0xd7e4ef, 0x6a7380, 1.05);
    sky.position.set(0, 0, 1);
    scene.add(sky);
    const sun = new THREE.DirectionalLight(0xfff2e2, 2.35);
    sun.position.set(-120, -160, 210);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260;
    sun.shadow.camera.bottom = -260;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 620;
    sun.shadow.bias = -0.00035;
    scene.add(sun);
    scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xc5d4e4, 0.9);
    fill.position.set(140, 80, 90);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x3c444c, roughness: 0.94, metalness: 0 }),
    );
    ground.position.z = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    scene.add(buildStreets(district.streets));
    const city = buildCity(district.buildings);
    scene.add(city);

    const pad = district.buildings.find((item) => item.pad);
    if (pad) {
      const center = centroid(pad.ring);
      const mark = new THREE.Mesh(
        new THREE.BoxGeometry(10, 10, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xc7a46b, roughness: 0.55, metalness: 0.05 }),
      );
      mark.position.set(center.x, center.y, pad.h + 0.08);
      mark.castShadow = true;
      scene.add(mark);
    }

    const launch = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.55, 48),
      new THREE.MeshBasicMaterial({ color: 0x75a9cb }),
    );
    launch.position.set(district.launch.x, district.launch.y, 0.04);
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
    camera.fov = 78;
    camera.up.set(up.x, up.y, up.z);
    camera.position.set(
      pose.position.x + forward.x * 0.15 + up.x * 0.04,
      pose.position.y + forward.y * 0.15 + up.y * 0.04,
      pose.position.z + forward.z * 0.15 + up.z * 0.04,
    );
    camera.lookAt(camera.position.x + forward.x, camera.position.y + forward.y, camera.position.z + forward.z);
  } else if (mode === "chase") {
    camera.fov = 52;
    camera.up.set(0, 0, 1);
    camera.position.set(pose.position.x - forward.x * 14, pose.position.y - forward.y * 14, pose.position.z + 7);
    camera.lookAt(pose.position.x + forward.x * 18, pose.position.y + forward.y * 18, pose.position.z + 3);
  } else {
    camera.fov = 42;
    camera.up.set(0, 0, 1);
    camera.position.set(pose.position.x - 70, pose.position.y - 120, pose.position.z + 70);
    camera.lookAt(pose.position.x + 10, pose.position.y, 18);
  }
  camera.updateProjectionMatrix();
}

function buildCity(buildings: Footprint[]): THREE.Group {
  const group = new THREE.Group();
  const textures = new Map<BuildingStyle, THREE.CanvasTexture>();
  const buckets = new Map<BuildingStyle, THREE.BufferGeometry[]>();
  for (const building of buildings) {
    const list = buckets.get(building.style) ?? [];
    list.push(extrude(building.ring, building.h, building.h > 48 && !building.pad));
    buckets.set(building.style, list);
  }
  for (const [style, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) {
      continue;
    }
    geometries.forEach((geometry) => geometry.dispose());
    const material = new THREE.MeshStandardMaterial({
      map: styleTexture(style, textures),
      roughness: style === "glass" ? 0.28 : 0.82,
      metalness: style === "glass" ? 0.35 : 0.02,
    });
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.add(buildRoofGear(buildings));
  return group;
}

function extrude(ring: { x: number; y: number }[], height: number, setback: boolean): THREE.BufferGeometry {
  const shaft = height;
  const parts: THREE.BufferGeometry[] = [];
  if (setback) {
    parts.push(extrudeRing(ring, height * 0.72));
    parts.push(extrudeRing(inset(ring, 0.78), height * 0.28, height * 0.72));
  } else {
    parts.push(extrudeRing(ring, shaft));
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) {
    return parts[0];
  }
  parts.forEach((part) => part.dispose());
  return merged;
}

function extrudeRing(ring: { x: number; y: number }[], height: number, z0 = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(ring.map((point) => new THREE.Vector2(point.x, point.y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(height, 0.4), bevelEnabled: false });
  if (z0 !== 0) {
    geometry.translate(0, 0, z0);
  }
  paintUvs(geometry);
  return geometry;
}

function inset(ring: { x: number; y: number }[], scale: number): { x: number; y: number }[] {
  const center = centroid(ring);
  return ring.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  }));
}

function paintUvs(geometry: THREE.BufferGeometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const nz = normal.getZ(index);
    if (Math.abs(nz) > 0.6) {
      uv[index * 2] = x * 0.08;
      uv[index * 2 + 1] = y * 0.08;
    } else {
      const nx = Math.abs(normal.getX(index));
      const ny = Math.abs(normal.getY(index));
      uv[index * 2] = (nx > ny ? y : x) * 0.14;
      uv[index * 2 + 1] = z * 0.16;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
}

function styleTexture(style: BuildingStyle, cache: Map<BuildingStyle, THREE.CanvasTexture>): THREE.CanvasTexture {
  const cached = cache.get(style);
  if (cached) {
    return cached;
  }
  const palette = {
    masonry: ["#c8bba8", "#2c3642", "#b3a794"],
    brick: ["#8d5346", "#1b2430", "#a86452"],
    limestone: ["#e4dcd0", "#3c4654", "#d4cdc2"],
    glass: ["#8ea6b8", "#1d2833", "#b7c8d4"],
  }[style];
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas is unavailable");
  }
  context.fillStyle = palette[0];
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = palette[2];
  for (let row = 0; row < 4; row += 1) {
    context.fillRect(0, row * 32, 128, 3);
  }
  context.fillStyle = palette[1];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      context.fillRect(8 + column * 32, 8 + row * 32, 16, 18);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  cache.set(style, texture);
  return texture;
}

function buildRoofGear(buildings: Footprint[]): THREE.InstancedMesh {
  const hosts = buildings.filter((building) => building.h > 20 && !building.pad);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0, 0.5);
  const material = new THREE.MeshStandardMaterial({ color: 0x5c6770, roughness: 0.7, metalness: 0.15 });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(hosts.length, 1));
  const dummy = new THREE.Object3D();
  hosts.forEach((building, index) => {
    const center = centroid(building.ring);
    dummy.position.set(center.x, center.y, building.h);
    dummy.scale.set(3.2, 2.1, 1.4);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.count = hosts.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  return mesh;
}

function buildStreets(streets: Street[]): THREE.Group {
  const group = new THREE.Group();
  const sidewalk: number[] = [];
  const road: number[] = [];
  const marks: number[] = [];
  for (const street of streets) {
    if (street.kind === "pedestrian" || street.kind === "living_street" || street.kind === "service") {
      continue;
    }
    const span = street.line.reduce((best, point, index) => {
      if (index === 0) {
        return best;
      }
      const prev = street.line[index - 1];
      return best + Math.hypot(point.x - prev.x, point.y - prev.y);
    }, 0);
    if (span < 25) {
      continue;
    }
    ribbon(street.line, street.width + 4, 0.02, sidewalk);
    ribbon(street.line, Math.max(6, street.width - 3), 0.045, road);
    dashes(street.line, street.width, marks);
  }
  group.add(meshFromPositions(sidewalk, 0xb7b1a6, 0.92));
  group.add(meshFromPositions(road, 0x3a4148, 0.9));
  group.add(meshFromPositions(marks, 0xd5d0c6, 0.6));
  return group;
}

function ribbon(line: { x: number; y: number }[], width: number, z: number, out: number[]) {
  if (line.length < 2) {
    return;
  }
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  const half = width / 2;
  for (let index = 0; index < line.length; index += 1) {
    const prev = line[Math.max(0, index - 1)];
    const next = line[Math.min(line.length - 1, index + 1)];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const length = Math.hypot(tx, ty) || 1;
    const nx = -ty / length;
    const ny = tx / length;
    const ahead = line[Math.min(line.length - 1, index + 1)];
    const current = line[index];
    const sx = ahead.x - current.x;
    const sy = ahead.y - current.y;
    const sl = Math.hypot(sx, sy) || 1;
    const align = Math.abs((sx / sl) * ny - (sy / sl) * nx);
    const miter = Math.min(half * 1.6, half / Math.max(align, 0.45));
    left.push({ x: current.x + nx * miter, y: current.y + ny * miter });
    right.push({ x: current.x - nx * miter, y: current.y - ny * miter });
  }
  for (let index = 0; index < line.length - 1; index += 1) {
    quad(
      out,
      left[index].x,
      left[index].y,
      right[index].x,
      right[index].y,
      right[index + 1].x,
      right[index + 1].y,
      left[index + 1].x,
      left[index + 1].y,
      z,
    );
  }
}

function dashes(line: { x: number; y: number }[], width: number, out: number[]) {
  if (width < 12) {
    return;
  }
  for (let index = 0; index < line.length - 1; index += 1) {
    const start = line[index];
    const end = line[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 18) {
      continue;
    }
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy * 0.18;
    const ny = ux * 0.18;
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const half = Math.min(4, length * 0.18);
    quad(
      out,
      midX - ux * half + nx,
      midY - uy * half + ny,
      midX - ux * half - nx,
      midY - uy * half - ny,
      midX + ux * half - nx,
      midY + uy * half - ny,
      midX + ux * half + nx,
      midY + uy * half + ny,
      0.06,
    );
  }
}

function quad(
  out: number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  z: number,
) {
  out.push(ax, ay, z, bx, by, z, cx, cy, z, ax, ay, z, cx, cy, z, dx, dy, z);
}

function meshFromPositions(positions: number[], color: number, roughness: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function centroid(ring: { x: number; y: number }[]): { x: number; y: number } {
  let twice = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const cross = start.x * end.y - end.x * start.y;
    twice += cross;
    x += (start.x + end.x) * cross;
    y += (start.y + end.y) * cross;
  }
  if (Math.abs(twice) < 1e-6) {
    return {
      x: ring.reduce((sum, point) => sum + point.x, 0) / ring.length,
      y: ring.reduce((sum, point) => sum + point.y, 0) / ring.length,
    };
  }
  return { x: x / (3 * twice), y: y / (3 * twice) };
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
