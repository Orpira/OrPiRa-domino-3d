import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrientedTile, TileId } from "../../../packages/rules/src/index.ts";
import { endAnchors, frameBounds, layoutDominoChain, TILE_LENGTH, TILE_WIDTH, type TableBounds, type TablePoint } from "./table-layout.ts";

interface EndTargets {
  /** Texto accesible completo (p. ej. «Izquierda · 3»); en pantalla solo se ve el valor del extremo. */
  readonly leftLabel: string; readonly rightLabel: string; readonly leftValue: number; readonly rightValue: number; readonly disabled?: boolean;
  readonly onLeft: () => void; readonly onRight: () => void;
}
interface ScreenPoint { readonly left: number; readonly top: number }
interface ScreenEnds { readonly left: ScreenPoint; readonly right: ScreenPoint }
interface Visual { readonly mesh: THREE.Mesh; readonly texture: THREE.Texture }
interface Motion {
  readonly mesh: THREE.Mesh; readonly from: THREE.Vector3; readonly to: THREE.Vector3;
  readonly fromRotation: number; readonly toRotation: number; readonly started: number; readonly duration: number;
}
interface CameraPose { readonly target: THREE.Vector3; readonly distance: number }
interface CameraMotion { readonly from: CameraPose; readonly to: CameraPose; readonly started: number; readonly duration: number }
interface SceneContext {
  readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera; readonly renderer: THREE.WebGLRenderer;
  readonly visuals: Map<TileId, Visual>; readonly motions: Map<TileId, Motion>;
  frame: number; width: number; height: number; initialized: boolean;
  view: CameraPose; cameraMotion: CameraMotion | null;
}

// La cámara conserva siempre la misma inclinación; solo cambia el punto al que mira y su distancia.
const VIEW_DIRECTION = new THREE.Vector3(0, 12.8, 6.2).normalize();
const OVERVIEW: CameraPose = { target: new THREE.Vector3(0, 0, 0), distance: Math.hypot(12.8, 6.2) };
/** Fracción de la pantalla (en coordenadas normalizadas) que pueden ocupar las fichas; el resto deja sitio a los botones de extremo. */
const FRAME_MARGIN = .78;
const TEXTURE_SIZE = 256;
/** Medio tamaño del botón circular de extremo con su halo, para que no se salga por el borde. */
const END_TARGET_HALF_WIDTH = 34; const END_TARGET_HALF_HEIGHT = 34;

function drawPips(context: CanvasRenderingContext2D, value: number, xOffset: number) {
  const half = TEXTURE_SIZE;
  const positions: Record<number, Array<[number, number]>> = {
    0: [], 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]],
    4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]],
    6: [[.27, .22], [.73, .22], [.27, .5], [.73, .5], [.27, .78], [.73, .78]],
  };
  // Puntos grandes y casi negros: cerca del 20 % del lado de cada mitad, como en una ficha real.
  for (const [x, y] of positions[value]!) {
    const cx = xOffset + x * half; const cy = y * half; const radius = half * .098;
    const gradient = context.createRadialGradient(cx - radius * .3, cy - radius * .3, radius * .1, cx, cy, radius);
    gradient.addColorStop(0, "#2a3532"); gradient.addColorStop(1, "#070d0c");
    context.fillStyle = gradient; context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill();
  }
}

function tileTexture(left: number, right: number) {
  const size = TEXTURE_SIZE; const canvas = document.createElement("canvas"); canvas.width = size * 2; canvas.height = size;
  const context = canvas.getContext("2d")!; context.fillStyle = "#f6f1e3"; context.fillRect(0, 0, size * 2, size);
  context.strokeStyle = "#6f6857"; context.lineWidth = size * .03; context.lineCap = "round";
  context.beginPath(); context.moveTo(size, size * .12); context.lineTo(size, size * .88); context.stroke();
  drawPips(context, left, 0); drawPips(context, right, size);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}

function createDomino(tile: OrientedTile): Visual {
  const texture = tileTexture(tile.left, tile.right);
  const materials = [new THREE.MeshStandardMaterial({ color: 0xc9c1ae }), new THREE.MeshStandardMaterial({ color: 0xc9c1ae }),
    new THREE.MeshStandardMaterial({ map: texture, roughness: .68 }), new THREE.MeshStandardMaterial({ color: 0xa69d88 }),
    new THREE.MeshStandardMaterial({ color: 0xc9c1ae }), new THREE.MeshStandardMaterial({ color: 0xc9c1ae })];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE_LENGTH, .22, TILE_WIDTH), materials); mesh.castShadow = true; mesh.receiveShadow = true;
  return { mesh, texture };
}

function disposeVisual(visual: Visual) {
  visual.mesh.geometry.dispose();
  (Array.isArray(visual.mesh.material) ? visual.mesh.material : [visual.mesh.material]).forEach((material) => material.dispose());
  visual.texture.dispose();
}
function shortestRotation(from: number, to: number) { return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)); }

function applyPose(camera: THREE.PerspectiveCamera, pose: CameraPose) {
  camera.position.copy(pose.target).addScaledVector(VIEW_DIRECTION, pose.distance); camera.lookAt(pose.target); camera.updateMatrixWorld();
}

/** Acerca la cámara a las fichas jugadas: la menor distancia a la que todo el encuadre cabe en pantalla. */
function fitPose(camera: THREE.PerspectiveCamera, bounds: TableBounds | null): CameraPose {
  if (!bounds) return OVERVIEW;
  const target = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  const corners = [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.minX, bounds.maxZ], [bounds.maxX, bounds.maxZ]]
    .map(([x, z]) => new THREE.Vector3(x, .14, z)); const projected = new THREE.Vector3();
  const fits = (distance: number) => {
    applyPose(camera, { target, distance });
    return corners.every((corner) => { projected.copy(corner).project(camera); return Math.abs(projected.x) <= FRAME_MARGIN && Math.abs(projected.y) <= FRAME_MARGIN; });
  };
  let near = 2; let far = OVERVIEW.distance; while (!fits(far) && far < 80) far *= 1.5;
  for (let step = 0; step < 24; step += 1) { const middle = (near + far) / 2; if (fits(middle)) far = middle; else near = middle; }
  return { target, distance: far };
}

function renderMotion(context: SceneContext) {
  if (context.frame) return;
  const tick = (now: number) => {
    const cameraMotion = context.cameraMotion;
    if (cameraMotion) {
      const progress = Math.min(1, (now - cameraMotion.started) / cameraMotion.duration); const eased = 1 - (1 - progress) ** 3;
      context.view = { target: cameraMotion.from.target.clone().lerp(cameraMotion.to.target, eased),
        distance: cameraMotion.from.distance + (cameraMotion.to.distance - cameraMotion.from.distance) * eased };
      applyPose(context.camera, context.view); if (progress === 1) context.cameraMotion = null;
    }
    for (const [id, motion] of context.motions) {
      const progress = Math.min(1, (now - motion.started) / motion.duration); const eased = 1 - (1 - progress) ** 3;
      motion.mesh.position.lerpVectors(motion.from, motion.to, eased);
      motion.mesh.rotation.y = motion.fromRotation + (motion.toRotation - motion.fromRotation) * eased;
      if (progress === 1) context.motions.delete(id);
    }
    context.renderer.render(context.scene, context.camera);
    context.frame = context.motions.size || context.cameraMotion ? requestAnimationFrame(tick) : 0;
  };
  context.frame = requestAnimationFrame(tick);
}

function projectAnchor(context: SceneContext, anchor: TablePoint): ScreenPoint {
  const point = new THREE.Vector3(anchor.x, .18, anchor.z).project(context.camera);
  // El botón entero debe quedar dentro de la mesa: se limita su centro según su tamaño aproximado en píxeles.
  const marginX = Math.min(45, END_TARGET_HALF_WIDTH / context.width * 100); const marginY = Math.min(45, END_TARGET_HALF_HEIGHT / context.height * 100);
  return { left: Math.max(marginX, Math.min(100 - marginX, (point.x + 1) * 50)), top: Math.max(marginY, Math.min(100 - marginY, (1 - point.y) * 50)) };
}

function syncChain(context: SceneContext, chain: readonly OrientedTile[], reducedMotion: boolean, animateChange: boolean, setEnds: (ends: ScreenEnds | null) => void) {
  const placements = layoutDominoChain(chain, context.width, context.height); const ids = new Set(chain.map((tile) => tile.id));
  for (const [id, visual] of context.visuals) if (!ids.has(id)) {
    context.scene.remove(visual.mesh); context.visuals.delete(id); context.motions.delete(id); disposeVisual(visual);
  }
  const newIds = chain.filter((tile) => !context.visuals.has(tile.id));
  const animateArrival = context.initialized && animateChange && !reducedMotion && newIds.length === 1;
  placements.forEach((placement, index) => {
    const tile = chain[index]!; let visual = context.visuals.get(tile.id); const isNew = !visual;
    if (!visual) { visual = createDomino(tile); context.visuals.set(tile.id, visual); context.scene.add(visual.mesh); }
    const target = new THREE.Vector3(placement.x, .02, placement.z); visual.mesh.scale.setScalar(placement.scale);
    if (!context.initialized || reducedMotion || !animateChange) {
      visual.mesh.position.copy(target); visual.mesh.rotation.y = placement.rotation; context.motions.delete(tile.id);
    } else {
      const from = visual.mesh.position.clone();
      if (isNew && animateArrival) {
        const openingIndex = chain.findIndex((candidate) => candidate.id === "6-6");
        const neighbour = placements[placement.distanceFromOpening === 0 ? index : index < openingIndex ? index + 1 : index - 1];
        from.set(neighbour?.x ?? placement.x, .72, neighbour?.z ?? placement.z);
        visual.mesh.position.copy(from); visual.mesh.rotation.y = placement.rotation - .24;
      }
      const fromRotation = visual.mesh.rotation.y;
      context.motions.set(tile.id, { mesh: visual.mesh, from, to: target, fromRotation,
        toRotation: shortestRotation(fromRotation, placement.rotation), started: performance.now(), duration: isNew ? 520 : 240 });
    }
  });
  const animateCamera = context.initialized && animateChange && !reducedMotion;
  const previous = context.view; const next = fitPose(context.camera, frameBounds(placements));
  applyPose(context.camera, next); context.initialized = true;
  // Los botones de extremo se colocan con la cámara ya en su posición final.
  const anchors = endAnchors(placements);
  setEnds(anchors ? { left: projectAnchor(context, anchors.left), right: projectAnchor(context, anchors.right) } : null);
  const moved = previous.target.distanceTo(next.target) > 1e-3 || Math.abs(previous.distance - next.distance) > 1e-3;
  if (animateCamera && moved) { context.cameraMotion = { from: previous, to: next, started: performance.now(), duration: 520 }; applyPose(context.camera, previous); }
  else { context.cameraMotion = null; context.view = next; }
  if (context.motions.size || context.cameraMotion) renderMotion(context); else context.renderer.render(context.scene, context.camera);
}

export function Table3D({ chain, reducedMotion, endTargets }: { chain: readonly OrientedTile[]; reducedMotion: boolean; endTargets?: EndTargets | undefined }) {
  const host = useRef<HTMLDivElement>(null); const sceneRef = useRef<SceneContext | null>(null);
  const chainRef = useRef(chain); chainRef.current = chain; const reducedRef = useRef(reducedMotion); reducedRef.current = reducedMotion;
  const [unsupported, setUnsupported] = useState(false); const [ends, setEnds] = useState<ScreenEnds | null>(null);
  useEffect(() => {
    const element = host.current; if (!element) return; let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setUnsupported(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; element.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(40, 1, .1, 100); applyPose(camera, OVERVIEW);
    scene.add(new THREE.HemisphereLight(0xfff3d4, 0x063128, 2.2));
    const key = new THREE.DirectionalLight(0xffe8ae, 3.2); key.position.set(-4, 9, 5); key.castShadow = true; scene.add(key);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, .42, 64), new THREE.MeshStandardMaterial({ color: 0x0c5b4c, roughness: .88, metalness: .05 }));
    table.position.y = -.32; table.receiveShadow = true; scene.add(table);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.72, .16, 12, 64), new THREE.MeshStandardMaterial({ color: 0x8e582e, roughness: .55 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = -.05; scene.add(rim);
    const context: SceneContext = { scene, camera, renderer, visuals: new Map(), motions: new Map(), frame: 0, width: 1, height: 1, initialized: false, view: OVERVIEW, cameraMotion: null };
    sceneRef.current = context;
    const resize = () => {
      context.width = Math.max(element.clientWidth, 1); context.height = Math.max(element.clientHeight, 1); renderer.setSize(context.width, context.height, false);
      camera.aspect = context.width / context.height; camera.fov = camera.aspect < 1.25 ? 46 : camera.aspect < 1.65 ? 42 : 36; camera.updateProjectionMatrix();
      syncChain(context, chainRef.current, reducedRef.current, false, setEnds);
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    return () => {
      observer.disconnect(); if (context.frame) cancelAnimationFrame(context.frame); for (const visual of context.visuals.values()) disposeVisual(visual);
      table.geometry.dispose(); (table.material as THREE.Material).dispose(); rim.geometry.dispose(); (rim.material as THREE.Material).dispose();
      renderer.dispose(); renderer.domElement.remove(); sceneRef.current = null;
    };
  }, []);
  useEffect(() => { const context = sceneRef.current; if (context) syncChain(context, chain, reducedMotion, true, setEnds); }, [chain, reducedMotion]);
  return <div className="three-stage" ref={host} aria-label={`Mesa 3D con ${chain.length} fichas`}>
    {chain.length === 0 && <p>El poseedor de 6–6 abre la ronda</p>}
    {unsupported && <p>WebGL no disponible. Usa la descripción accesible de la cadena.</p>}
    {endTargets && ends && <div className="spatial-end-targets" aria-label="Elige un extremo">
      <button type="button" className="end-target spatial" style={{ left: `${ends.left.left}%`, top: `${ends.left.top}%` }} disabled={endTargets.disabled} aria-label={endTargets.leftLabel} title={endTargets.leftLabel} onClick={endTargets.onLeft}>{endTargets.leftValue}</button>
      <button type="button" className="end-target spatial" style={{ left: `${ends.right.left}%`, top: `${ends.right.top}%` }} disabled={endTargets.disabled} aria-label={endTargets.rightLabel} title={endTargets.rightLabel} onClick={endTargets.onRight}>{endTargets.rightValue}</button>
    </div>}
    <ol className="sr-only">{chain.map((tile, index) => <li key={`${tile.id}-${index}`}>{tile.left}–{tile.right}</li>)}</ol>
  </div>;
}
