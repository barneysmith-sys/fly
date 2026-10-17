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
    scene.background = new THREE.Color(0xa9b8c6);
    scene.fog = new THREE.Fog(0xa9b8c6, 280, 920);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 1200);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const sky = new THREE.HemisphereLight(0xe7eef5, 0x8e9890, 1.28);
    sky.position.set(0, 0, 1);
    scene.add(sky);
    // High sun from the northeast, so the south-facing launch street stays readable.
    const sun = new THREE.DirectionalLight(0xfff4e4, 2.05);
    sun.position.set(190, 230, 380);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260;
    sun.shadow.camera.bottom = -260;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 900;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 2;
    scene.add(sun);
    scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xc9d7e6, 0.62);
    fill.position.set(-170, -50, 90);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x4e565e, roughness: 0.94, metalness: 0 }),
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
      // One repeat is about 12.5 m: four bays and four floors.
      uv[index * 2] = (nx > ny ? y : x) * 0.08;
      uv[index * 2 + 1] = z * 0.08;
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
    masonry: ["#cfc3b0", "#24303c", "#b7ab9a", "#e4dacb"],
    brick: ["#8d5346", "#1b2430", "#6e3d34", "#c48472"],
    limestone: ["#e7dfd4", "#3a4452", "#d5cdc2", "#f4efe8"],
    glass: ["#7f97a8", "#163040", "#d5e4ee", "#9eb4c4"],
  }[style];
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas is unavailable");
  }
  context.fillStyle = palette[0];
  context.fillRect(0, 0, 256, 256);
  const floors = 4;
  const floorH = 256 / floors;
  for (let row = 0; row < floors; row += 1) {
    const y = row * floorH;
    context.fillStyle = palette[2];
    context.fillRect(0, y, 256, 7);
    context.fillStyle = palette[3];
    context.fillRect(0, y + floorH - 5, 256, 3);
  }
  context.fillStyle = palette[0];
  for (let column = 0; column < 4; column += 1) {
    context.fillRect(column * 64, 0, 8, 256);
  }
  context.fillStyle = palette[1];
  for (let row = 0; row < floors; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const x = 16 + column * 64;
      const y = 14 + row * floorH;
      context.fillRect(x, y, 34, 36);
      context.fillStyle = palette[3];
      context.fillRect(x + 2, y + 2, 10, 8);
      context.fillStyle = palette[1];
    }
  }
  context.fillStyle = palette[2];
  context.fillRect(0, 248, 256, 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  cache.set(style, texture);
  return texture;
}

function buildRoofGear(buildings: Footprint[]): THREE.Group {
  const group = new THREE.Group();
  const hosts = buildings.filter((building) => building.h > 20 && !building.pad);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0, 0.5);
  const material = new THREE.MeshStandardMaterial({ color: 0x5c6770, roughness: 0.7, metalness: 0.15 });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(hosts.length, 1));
  const dummy = new THREE.Object3D();
  hosts.forEach((building, index) => {
    const center = centroid(building.ring);
    const shift = (index % 5) - 2;
    dummy.position.set(center.x + shift * 2.2, center.y + ((index % 3) - 1) * 1.6, building.h);
    dummy.scale.set(3.4, 2.2, building.h > 48 ? 2.6 : 1.5);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.count = hosts.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  group.add(mesh);

  const tanks = buildings.filter((building) => !building.pad && building.style !== "glass" && building.h > 16 && building.h < 55);
  const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  tankGeo.rotateX(Math.PI / 2);
  tankGeo.translate(0, 0, 0.5);
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x6d5840, roughness: 0.58, metalness: 0.18 });
  const tankMesh = new THREE.InstancedMesh(tankGeo, tankMat, Math.max(tanks.length, 1));
  tanks.forEach((building, index) => {
    const center = centroid(building.ring);
    const shift = (index % 4) - 1.5;
    dummy.position.set(center.x - shift * 3.2, center.y + 2.4, building.h);
    dummy.scale.set(1.5, 1.5, 2.2);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    tankMesh.setMatrixAt(index, dummy.matrix);
  });
  tankMesh.count = tanks.length;
  tankMesh.instanceMatrix.needsUpdate = true;
  tankMesh.castShadow = true;
  group.add(tankMesh);
  return group;
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
  group.add(meshFromPositions(sidewalk, 0xc4bdb0, 0.92));
  group.add(meshFromPositions(road, 0x4c555d, 0.9));
  group.add(meshFromPositions(marks, 0xe4dfd4, 0.55));
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
