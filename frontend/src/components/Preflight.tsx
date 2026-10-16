import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EXPLORER_4, type PartBrief, type PartId } from "../sim/aircraft";
import { hoverThrustN } from "../sim/vehicle";
import { buildExplorer } from "./explorerModel";

type PreflightProps = {
  onEnter: () => void;
};

export function Preflight({ onEnter }: PreflightProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [partId, setPartId] = useState<PartId>("airframe");
  const [anatomy, setAnatomy] = useState(false);
  const part = EXPLORER_4.parts.find((item) => item.id === partId) ?? EXPLORER_4.parts[0];
  const weight = hoverThrustN(EXPLORER_4.params);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d12);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 20);
    camera.up.set(0, 0, 1);
    camera.position.set(0.55, -0.72, 0.38);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xd5e0ea, 0x1a222a, 1.3));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
    key.position.set(1.2, -0.8, 1.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fb4cc, 0.7);
    fill.position.set(-1, 0.4, 0.4);
    scene.add(fill);
    const aircraft = buildExplorer();
    aircraft.scale.setScalar(3.2);
    scene.add(aircraft);
    const target = new THREE.Vector3(0, 0, 0);
    let yaw = -0.9;
    let polar = 0.42;
    let radius = 1.15;
    let dragging = false;
    let dragDistance = 0;
    let lastX = 0;
    let lastY = 0;

    const frameCamera = () => {
      camera.position.set(
        Math.cos(yaw) * Math.cos(polar) * radius,
        Math.sin(yaw) * Math.cos(polar) * radius,
        0.12 + Math.sin(polar) * radius,
      );
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    };

    const paint = () => {
      frameCamera();
      renderer.render(scene, camera);
    };
    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      camera.aspect = width / height;
      renderer.setSize(width, height);
      paint();
    };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      dragDistance = 0;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (dragDistance > 6) {
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(aircraft, true);
      const partHit = hits.find((hit) => typeof hit.object.userData.part === "string");
      if (partHit) {
        setPartId(partHit.object.userData.part as PartId);
        setAnatomy(true);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }
      dragDistance += Math.hypot(event.clientX - lastX, event.clientY - lastY);
      yaw += (event.clientX - lastX) * 0.008;
      polar = Math.min(1.1, Math.max(-0.2, polar + (event.clientY - lastY) * 0.006));
      lastX = event.clientX;
      lastY = event.clientY;
      paint();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      radius = Math.min(1.8, Math.max(0.45, radius + event.deltaY * 0.001));
      paint();
    };
    mount.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("wheel", onWheel, { passive: false });
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    return () => {
      observer.disconnect();
      mount.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("wheel", onWheel);
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
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="preflight">
      <aside className="preflight-col">
        <p className="eyebrow">FLY / Aircraft systems</p>
        <h2 className="preflight-title">EXPLORER-4</h2>
        <p className="field-hint">One training quadcopter. Other classes are not in this build.</p>
        <ul className="part-list">
          {EXPLORER_4.parts.map((item) => (
            <li key={item.id}>
              <button type="button" className={item.id === part.id ? "primary" : ""} onClick={() => { setPartId(item.id); setAnatomy(true); }}>
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="preflight-stage">
        <div ref={mountRef} className="preflight-canvas" />
        <p className="preflight-hint">Drag to orbit. Scroll to zoom. Click a part.</p>
      </div>
      <aside className="preflight-col">
        <p className="eyebrow">{anatomy ? "Component" : "Specification"}</p>
        {anatomy ? <Brief part={part} /> : <Spec weight={weight} />}
        <div className="form-actions">
          <button type="button" onClick={() => setAnatomy((value) => !value)}>
            {anatomy ? "Specifications" : "View components"}
          </button>
          <button type="button" className="primary" onClick={onEnter}>
            Enter coastal base
          </button>
        </div>
      </aside>
    </div>
  );
}

function Spec({ weight }: { weight: number }) {
  const params = EXPLORER_4.params;
  return (
    <dl className="hud-metrics">
      <div>
        <dt>Mass</dt>
        <dd className="mono">{params.massKg.toFixed(2)} kg</dd>
      </div>
      <div>
        <dt>Hover thrust</dt>
        <dd className="mono">{weight.toFixed(2)} N</dd>
      </div>
      <div>
        <dt>Thrust max</dt>
        <dd className="mono">{params.thrustMaxN.toFixed(2)} N</dd>
      </div>
      <div>
        <dt>Arm</dt>
        <dd className="mono">{params.motorRadiusM.toFixed(2)} m</dd>
      </div>
      <div>
        <dt>Motor lag</dt>
        <dd className="mono">{EXPLORER_4.motorTauS.toFixed(2)} s</dd>
      </div>
      <div>
        <dt>Sensors</dt>
        <dd>Truth state</dd>
      </div>
    </dl>
  );
}

function Brief({ part }: { part: PartBrief }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <h2 className="preflight-title">{part.title}</h2>
      <p>{part.short}</p>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide detail" : "Deeper note"}
      </button>
      {open ? <p className="field-hint">{part.detail}</p> : null}
    </div>
  );
}
