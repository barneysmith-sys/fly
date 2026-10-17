import { useEffect, useRef } from "react";
import * as THREE from "three";
import { AnatomyFocus } from "../animation/AnatomyFocus";
import { applyPose, OrbitRig } from "../animation/CameraTransitions";
import { E4_DIMENSIONS, buildExplorer4, type PartId } from "../animation/explorer4Model";
import { ExplodedView } from "../animation/ExplodedView";
import { FourMotorVisualController } from "../animation/FourMotorVisualController";
import { EXPLORER_4 } from "../sim/aircraft";

type InspectCanvasProps = {
  motorsRef: { current: [number, number, number, number] };
  failedRef: { current: number[] };
  selectedRef: { current: PartId | null };
  explodeRef: { current: boolean };
  illustrative: boolean;
};

export function InspectCanvas({ motorsRef, failedRef, selectedRef, explodeRef, illustrative }: InspectCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    const model = buildExplorer4();
    model.root.position.set(0, 0, -E4_DIMENSIONS.feetZ);
    const params = EXPLORER_4.params;
    const rotors = new FourMotorVisualController(model, {
      motorMaxN: params.thrustMaxN / 4,
      hoverPerMotorN: (params.massKg * params.gravityM_S2) / 4,
    });
    const focus = new AnatomyFocus(model);
    const exploded = new ExplodedView(model);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c2128);
    scene.add(model.root);
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.46, 0.06, 48),
      new THREE.MeshStandardMaterial({ color: 0x4e4942, roughness: 0.7, metalness: 0.12 }),
    );
    platform.rotation.x = Math.PI / 2;
    platform.position.z = -0.03;
    scene.add(platform);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 64),
      new THREE.MeshStandardMaterial({ color: 0x6d645b, roughness: 0.84, metalness: 0.04 }),
    );
    floor.position.z = -0.07;
    scene.add(floor);
    scene.add(new THREE.HemisphereLight(0xfff6ea, 0x44505c, 2.5));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
    key.position.set(1.1, -1.3, 2.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc5d4e6, 1.6);
    fill.position.set(-1.5, 1.2, 1.4);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 40);
    camera.up.set(0, 0, 1);
    const orbit = new OrbitRig();
    orbit.azimuth = -0.85;
    orbit.target.set(0, 0, 0.03);
    orbit.distance = 0.84;
    orbit.polar = 0.95;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let dragDistance = 0;
    const onDown = (event: PointerEvent) => {
      dragging = true;
      dragDistance = 0;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }
      dragDistance += Math.hypot(event.clientX - lastX, event.clientY - lastY);
      orbit.drag(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      orbit.zoom(event.deltaY);
    };
    const onClick = (event: PointerEvent) => {
      if (dragDistance > 6) {
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObject(model.root, true).find((item) => typeof item.object.userData.part === "string");
      if (hit) {
        mount.dispatchEvent(new CustomEvent("strata-part", { detail: hit.object.userData.part, bubbles: true }));
      }
    };
    mount.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    mount.addEventListener("wheel", onWheel, { passive: false });
    mount.addEventListener("click", onClick);

    let raf = 0;
    let last = performance.now();
    let selected: PartId | null = null;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce && !dragging) {
        orbit.azimuth += dt * 0.15;
      }
      if (selectedRef.current !== selected) {
        selected = selectedRef.current;
        focus.select(selected, true);
      }
      exploded.animateTo(explodeRef.current ? 1 : 0, 1.4);
      exploded.update(dt);
      focus.update(dt);
      rotors.update(motorsRef.current, dt, illustrative ? "illustrative" : "sim", failedRef.current);
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      if (camera.aspect !== width / height) {
        camera.aspect = width / height;
        renderer.setSize(width, height);
      }
      applyPose(camera, orbit.pose());
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      mount.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      mount.removeEventListener("wheel", onWheel);
      mount.removeEventListener("click", onClick);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [explodeRef, failedRef, illustrative, motorsRef, selectedRef]);

  return <div ref={mountRef} className="inspect-mount" />;
}
