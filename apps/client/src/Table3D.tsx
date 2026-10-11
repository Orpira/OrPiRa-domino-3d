import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrientedTile, TileId } from "../../../packages/rules/src/index.ts";
import { layoutDominoChain, TILE_LENGTH, TILE_WIDTH, type ChainPlacement } from "./table-layout.ts";

interface EndTargets {
  readonly leftLabel: string; readonly rightLabel: string; readonly disabled?: boolean;
  readonly onLeft: () => void; readonly onRight: () => void;
}
interface ScreenPoint { readonly left: number; readonly top: number }
interface ScreenEnds { readonly left: ScreenPoint; readonly right: ScreenPoint }
interface Visual { readonly mesh: THREE.Mesh; readonly texture: THREE.Texture }
interface Motion {
  readonly mesh: THREE.Mesh; readonly from: THREE.Vector3; readonly to: THREE.Vector3;
  readonly fromRotation: number; readonly toRotation: number; readonly started: number; readonly duration: number;
}
interface SceneContext {
  readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera; readonly renderer: THREE.WebGLRenderer;
  readonly visuals: Map<TileId, Visual>; readonly motions: Map<TileId, Motion>;
  frame: number; width: number; height: number; initialized: boolean;
}

function drawPips(context: CanvasRenderingContext2D, value: number, xOffset: number) {
  const positions: Record<number, Array<[number, number]>> = {
    0: [], 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]],
    4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]],
    6: [[.27, .22], [.73, .22], [.27, .5], [.73, .5], [.27, .78], [.73, .78]],
  };
  context.fillStyle = "#12201d";
  for (const [x, y] of positions[value]!) { context.beginPath(); context.arc(xOffset + x * 128, y * 128, 9, 0, Math.PI * 2); context.fill(); }
}

function tileTexture(left: number, right: number) {
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext("2d")!; context.fillStyle = "#f3eedf"; context.fillRect(0, 0, 256, 128);
  context.strokeStyle = "#847d69"; context.lineWidth = 3; context.beginPath(); context.moveTo(128, 14); context.lineTo(128, 114); context.stroke();
  drawPips(context, left, 0); drawPips(context, right, 128);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
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

function renderMotion(context: SceneContext) {
  if (context.frame) return;
  const tick = (now: number) => {
    for (const [id, motion] of context.motions) {
      const progress = Math.min(1, (now - motion.started) / motion.duration); const eased = 1 - (1 - progress) ** 3;
      motion.mesh.position.lerpVectors(motion.from, motion.to, eased);
      motion.mesh.rotation.y = motion.fromRotation + (motion.toRotation - motion.fromRotation) * eased;
      if (progress === 1) context.motions.delete(id);
    }
    context.renderer.render(context.scene, context.camera);
    context.frame = context.motions.size ? requestAnimationFrame(tick) : 0;
  };
  context.frame = requestAnimationFrame(tick);
}

function projectEnd(context: SceneContext, placement: ChainPlacement, direction: -1 | 1): ScreenPoint {
  const distance = .9 * placement.scale;
  const point = new THREE.Vector3(placement.x + Math.cos(placement.tangent) * distance * direction, .18,
    placement.z + Math.sin(placement.tangent) * distance * direction).project(context.camera);
  return { left: Math.max(9, Math.min(91, (point.x + 1) * 50)), top: Math.max(12, Math.min(88, (1 - point.y) * 50)) };
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
  context.initialized = true;
  setEnds(placements.length ? { left: projectEnd(context, placements[0]!, -1), right: projectEnd(context, placements.at(-1)!, 1) } : null);
  if (context.motions.size) renderMotion(context); else context.renderer.render(context.scene, context.camera);
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
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(40, 1, .1, 100); camera.position.set(0, 12.8, 6.2); camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xfff3d4, 0x063128, 2.2));
    const key = new THREE.DirectionalLight(0xffe8ae, 3.2); key.position.set(-4, 9, 5); key.castShadow = true; scene.add(key);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, .42, 64), new THREE.MeshStandardMaterial({ color: 0x0c5b4c, roughness: .88, metalness: .05 }));
    table.position.y = -.32; table.receiveShadow = true; scene.add(table);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.72, .16, 12, 64), new THREE.MeshStandardMaterial({ color: 0x8e582e, roughness: .55 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = -.05; scene.add(rim);
    const context: SceneContext = { scene, camera, renderer, visuals: new Map(), motions: new Map(), frame: 0, width: 1, height: 1, initialized: false };
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
      <button type="button" className="end-target spatial" style={{ left: `${ends.left.left}%`, top: `${ends.left.top}%` }} disabled={endTargets.disabled} onClick={endTargets.onLeft}>{endTargets.leftLabel}</button>
      <button type="button" className="end-target spatial" style={{ left: `${ends.right.left}%`, top: `${ends.right.top}%` }} disabled={endTargets.disabled} onClick={endTargets.onRight}>{endTargets.rightLabel}</button>
    </div>}
    <ol className="sr-only">{chain.map((tile, index) => <li key={`${tile.id}-${index}`}>{tile.left}–{tile.right}</li>)}</ol>
  </div>;
}
