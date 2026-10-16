import * as THREE from "three";

/** Procedural coastal materials. No photograph is used as a texture or skybox. */

const SUN = new THREE.Vector3(0.42, -0.72, 0.28).normalize();

export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sun: { value: SUN } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 sun;
      void main() {
        vec3 dir = normalize(vDir);
        float up = dir.z;
        vec3 zenith = vec3(0.11, 0.18, 0.28);
        vec3 high = vec3(0.45, 0.58, 0.70);
        vec3 horizon = vec3(0.97, 0.62, 0.34);
        vec3 below = vec3(0.16, 0.18, 0.20);
        vec3 color = mix(horizon, high, smoothstep(0.02, 0.28, up));
        color = mix(color, zenith, smoothstep(0.28, 0.85, up));
        color = mix(below, color, smoothstep(-0.2, 0.02, up));
        float glow = pow(max(dot(dir, sun), 0.0), 6.0);
        float disc = pow(max(dot(dir, sun), 0.0), 420.0);
        color += vec3(1.0, 0.55, 0.22) * glow * 0.9;
        color += vec3(1.0, 0.92, 0.75) * disc;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), material);
}

export function createApron(width: number, depth: number): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: { sun: { value: SUN } },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      uniform vec3 sun;
      void main() {
        vec2 cell = fract(vWorld.xy / 8.0);
        float joint = smoothstep(0.985, 0.998, cell.x) + smoothstep(0.985, 0.998, cell.y);
        float noise = fract(sin(dot(floor(vWorld.xy * 3.0), vec2(127.1, 311.7))) * 43758.5);
        vec3 concrete = mix(vec3(0.22, 0.24, 0.27), vec3(0.30, 0.33, 0.36), noise);
        concrete *= 1.0 - 0.18 * clamp(joint, 0.0, 1.0);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 reflectDir = reflect(-viewDir, normalize(vNormal));
        float sunGlint = pow(max(dot(reflectDir, sun), 0.0), 28.0);
        float fres = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 3.0);
        vec3 sky = mix(vec3(0.95, 0.55, 0.28), vec3(0.35, 0.45, 0.55), reflectDir.z * 0.5 + 0.5);
        vec3 color = mix(concrete, sky, fres * 0.42);
        color += vec3(1.0, 0.75, 0.45) * sunGlint * fres * 0.65;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 1, 1), material);
  mesh.receiveShadow = true;
  return mesh;
}

export function createWater(width: number, depth: number): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      sun: { value: SUN },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      uniform float time;
      void main() {
        vec3 displaced = position;
        displaced.z += sin(position.x * 0.08 + time) * 0.06 + cos(position.y * 0.06 + time * 0.8) * 0.05;
        vec4 world = modelMatrix * vec4(displaced, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      uniform vec3 sun;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.4);
        vec3 deep = vec3(0.03, 0.10, 0.16);
        vec3 glare = vec3(0.85, 0.48, 0.22);
        vec3 color = mix(deep, glare, fres * 0.75);
        vec3 reflectDir = reflect(-viewDir, vec3(0.0, 0.0, 1.0));
        color += vec3(1.0, 0.8, 0.5) * pow(max(dot(reflectDir, sun), 0.0), 40.0);
        gl_FragColor = vec4(color, 0.92);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 48, 48), material);
  mesh.userData.water = true;
  return mesh;
}

export function tickWater(root: THREE.Object3D, timeS: number): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const material = mesh.material as THREE.ShaderMaterial | undefined;
    if (mesh.userData.water && material?.uniforms?.time) {
      material.uniforms.time.value = timeS;
    }
  });
}

/** Heightfield range north of the apron. Collision is still the ridge box, not this mesh. */
export function createPeaks(): THREE.Group {
  const group = new THREE.Group();
  const width = 980;
  const depth = 640;
  const geo = new THREE.PlaneGeometry(width, depth, 180, 110);
  const position = geo.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const north = Math.max(0, (y + 40) / 280);
    const f = fbm(x * 0.008, y * 0.008);
    const height = north * north * (30 + f * 260);
    position.setZ(index, height);
    const snow = smooth(150, 230, height);
    const rock = 0.28 + fbm(x * 0.02, y * 0.02) * 0.15;
    const tree = north > 0.08 && north < 0.35 && f > 0.55 ? 0.15 : 0;
    colors[index * 3] = rock * (1 - snow) * (1 - tree) + 0.12 * tree + 0.9 * snow;
    colors[index * 3 + 1] = (rock + 0.03) * (1 - snow) * (1 - tree) + 0.18 * tree + 0.93 * snow;
    colors[index * 3 + 2] = (rock + 0.05) * (1 - snow) * (1 - tree) + 0.14 * tree + 0.96 * snow;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 }),
  );
  mesh.position.set(20, 430, 0);
  group.add(mesh);
  return group;
}

function fbm(x: number, y: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 5; octave += 1) {
    value += amplitude * valueNoise(x * frequency, y * frequency);
    frequency *= 2;
    amplitude *= 0.5;
  }
  return value;
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const v00 = hash2(x0, y0);
  const v10 = hash2(x0 + 1, y0);
  const v01 = hash2(x0, y0 + 1);
  const v11 = hash2(x0 + 1, y0 + 1);
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smooth(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

