import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrientedTile, Player, TileId } from "../../../packages/rules/src/index.ts";
import type { DropSide, ScreenXY } from "./drop-target.ts";
import { HAND_VIEWBOX, handMarkup } from "./hand-art.ts";
import type { DropLocator, DropOrigin } from "./hand-drag.tsx";
import { endGlows, frameBounds, layoutDominoChain, seatSide, TILE_LENGTH, TILE_WIDTH, type SeatSide, type TableBounds, type TablePoint } from "./table-layout.ts";

/** Un destino donde colocar la ficha elegida. El texto accesible es completo (p. ej. «Izquierda · 3»); en pantalla solo se ve el valor. */
export interface PlacementTarget { readonly label: string; readonly value: string | number; readonly onPlace: () => void }
export interface PlacementTargets {
  readonly left?: PlacementTarget | undefined; readonly right?: PlacementTarget | undefined; readonly center?: PlacementTarget | undefined;
  readonly disabled?: boolean;
  /** Destino sobre el que está la ficha arrastrada: se resalta para indicar dónde caerá. */
  readonly hot?: DropSide | null;
}
interface ScreenPoint { readonly left: number; readonly top: number }
interface ScreenEnds { readonly left: ScreenPoint; readonly right: ScreenPoint }
interface Visual { readonly mesh: THREE.Mesh; readonly texture: THREE.Texture }
interface Motion {
  readonly mesh: THREE.Mesh; readonly from: THREE.Vector3; readonly to: THREE.Vector3;
  readonly fromRotation: number; readonly toRotation: number; readonly started: number; readonly duration: number;
  /** Altura extra en el punto medio del trayecto: la ficha se levanta al salir de la mano y cae sobre la mesa. */
  readonly arc: number;
  /** "travel": acelera y frena (llegada desde un asiento); "settle": solo frena (reajustes y fichas soltadas a mano). */
  readonly easing: "travel" | "settle";
  /** Mano que lleva la ficha: entra desde el asiento de quien juega y la suelta al final del trayecto. */
  readonly hand?: { readonly element: HTMLElement; readonly side: SeatSide; readonly releaseAt: number } | undefined;
}
interface CameraPose { readonly target: THREE.Vector3; readonly distance: number }
interface CameraMotion { readonly from: CameraPose; readonly to: CameraPose; readonly started: number; readonly duration: number }
interface SceneContext {
  readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera; readonly renderer: THREE.WebGLRenderer;
  readonly visuals: Map<TileId, Visual>; readonly motions: Map<TileId, Motion>; readonly overlay: HTMLElement;
  frame: number; width: number; height: number; initialized: boolean;
  view: CameraPose; cameraMotion: CameraMotion | null;
  /** Brillos de los destinos jugables y qué se muestra ahora (con el destino resaltado al arrastrar). */
  readonly glows: Record<DropSide, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>;
  glowState: { readonly active: readonly DropSide[]; readonly hot: DropSide | null; readonly reduced: boolean };
}

// La cámara conserva siempre la misma inclinación; solo cambia el punto al que mira y su distancia.
const VIEW_DIRECTION = new THREE.Vector3(0, 12.8, 6.2).normalize();
const OVERVIEW: CameraPose = { target: new THREE.Vector3(0, 0, 0), distance: Math.hypot(12.8, 6.2) };
/** Fracción de la pantalla (en coordenadas normalizadas) que pueden ocupar las fichas; el resto deja sitio a los botones de extremo. */
const FRAME_MARGIN = .78;
const TEXTURE_SIZE = 256;
/** Punto de la pantalla (coordenadas normalizadas, fuera del encuadre) por el que entra la ficha de cada asiento. */
const SEAT_ENTRY: Record<SeatSide, readonly [number, number]> = { BOTTOM: [0, -1.25], RIGHT: [1.25, -.1], TOP: [0, 1.15], LEFT: [-1.25, -.1] };
const HAND_HEIGHT = 1.1; const ARRIVAL_MS = 850;
/** Altura a la que «sostiene» el jugador la ficha soltada y tiempo que tarda en asentarse; pasado DROP_FRESH_MS ya no se usa. */
const HELD_HEIGHT = .5; const SETTLE_MS = 340; const DROP_FRESH_MS = 6000;
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

/** Dirección en pantalla (y hacia abajo) en la que queda cada asiento: hacia ahí apunta la muñeca. */
const SEAT_DIRECTION: Record<SeatSide, readonly [number, number]> = { BOTTOM: [0, 1], RIGHT: [1, 0], TOP: [0, -1], LEFT: [-1, 0] };
/** Borde inferior de la ficha en las coordenadas del dibujo de la mano (ver hand-art.ts). */
const HAND_TILE_EDGE = 80;
let handCount = 0;

function createHand(context: SceneContext): HTMLElement {
  const element = document.createElement("div"); element.className = "table-hand"; element.setAttribute("aria-hidden", "true");
  element.innerHTML = `<svg viewBox="${HAND_VIEWBOX}" focusable="false">${handMarkup(`table-hand-${handCount += 1}`)}</svg>`;
  context.overlay.appendChild(element); return element;
}

/**
 * Coloca la mano sobre la ficha tal como se ve en pantalla: alineada con su eje largo, sujetándola por el extremo
 * más cercano al asiento de quien juega. Al soltar, la mano se eleva (crece un poco) y se retira hacia ese asiento.
 */
function placeHand(context: SceneContext, motion: Motion, progress: number) {
  const hand = motion.hand; if (!hand) return;
  const mesh = motion.mesh; const toScreen = (point: THREE.Vector3) => { const p = point.project(context.camera); return [(p.x + 1) / 2 * context.width, (1 - p.y) / 2 * context.height] as const; };
  const axis = (x: number, z: number) => mesh.position.clone().add(new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), mesh.rotation.y).multiplyScalar(mesh.scale.x));
  const [cx, cy] = toScreen(mesh.position.clone());
  const [lx, ly] = toScreen(axis(TILE_LENGTH / 2, 0)); const [wx, wy] = toScreen(axis(0, TILE_WIDTH / 2));
  const widthPx = Math.max(10, Math.hypot(wx - cx, wy - cy) * 2); const lengthPx = Math.max(widthPx, Math.hypot(lx - cx, ly - cy) * 2);
  // «Arriba» de la mano (de la muñeca a los dedos) sigue el eje largo, con la muñeca hacia el asiento.
  let ux = (lx - cx) / (lengthPx / 2); let uy = (ly - cy) / (lengthPx / 2);
  const [sx, sy] = SEAT_DIRECTION[hand.side]; if (ux * sx + uy * sy > 0) { ux = -ux; uy = -uy; }
  const turn = Math.atan2(ux, -uy) * 180 / Math.PI; const unit = widthPx / 100;
  const release = Math.max(0, (progress - hand.releaseAt) / (1 - hand.releaseAt)); const away = release * widthPx * 2.2;
  const x = cx - ux * away; const y = cy - uy * away; const anchorY = HAND_TILE_EDGE - lengthPx / 2 / unit;
  hand.element.style.width = `${200 * unit}px`;
  hand.element.style.transform = `translate(${x}px, ${y}px) rotate(${turn}deg) scale(${1 + release * .18}) translate(${-100 * unit}px, ${-anchorY * unit}px)`;
  hand.element.style.opacity = String(1 - release);
}

function glowTexture() {
  const size = 128; const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d")!; const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,236,170,1)"); gradient.addColorStop(.35, "rgba(255,214,110,.75)"); gradient.addColorStop(1, "rgba(255,200,80,0)");
  context.fillStyle = gradient; context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

/** Halo plano, en el suelo de la escena, que se suma a la luz: sobre la ficha la aclara y sobre el tapete dibuja un resplandor. */
function createGlow(texture: THREE.Texture) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture, color: 0xffd36a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.visible = false; mesh.renderOrder = 5; return mesh;
}

/** Intensidad de cada brillo: late suavemente; el destino bajo la ficha arrastrada brilla más. Devuelve si hay que seguir animando. */
function updateGlows(context: SceneContext, now: number) {
  const { active, hot, reduced } = context.glowState; const pulse = reduced ? .5 : .5 + .5 * Math.sin(now / 1400 * Math.PI * 2);
  for (const side of ["LEFT", "RIGHT", "CENTER"] as const) {
    const mesh = context.glows[side]; const on = active.includes(side); mesh.visible = on; if (!on) continue;
    const isHot = hot === side; mesh.material.opacity = isHot ? 1 : .42 + .3 * pulse;
    const base = mesh.userData.baseScale as { x: number; y: number } | undefined;
    if (base) mesh.scale.set(base.x * (isHot ? 1.3 : 1), base.y * (isHot ? 1.3 : 1), 1);
  }
  return active.length > 0 && !reduced;
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
      const progress = Math.min(1, (now - motion.started) / motion.duration);
      // La llegada desde la mano acelera y frena (se ve el trayecto); los reajustes solo frenan.
      const eased = motion.easing === "travel" ? (progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2) : 1 - (1 - progress) ** 3;
      motion.mesh.position.lerpVectors(motion.from, motion.to, eased); motion.mesh.position.y += Math.sin(Math.PI * eased) * motion.arc;
      motion.mesh.rotation.y = motion.fromRotation + (motion.toRotation - motion.fromRotation) * eased;
      placeHand(context, motion, progress);
      if (progress === 1) { motion.hand?.element.remove(); context.motions.delete(id); }
    }
    const glowing = updateGlows(context, now);
    context.renderer.render(context.scene, context.camera);
    context.frame = context.motions.size || context.cameraMotion || glowing ? requestAnimationFrame(tick) : 0;
  };
  context.frame = requestAnimationFrame(tick);
}

function projectAnchor(context: SceneContext, anchor: TablePoint): ScreenPoint {
  const point = new THREE.Vector3(anchor.x, .18, anchor.z).project(context.camera);
  // El botón entero debe quedar dentro de la mesa: se limita su centro según su tamaño aproximado en píxeles.
  const marginX = Math.min(45, END_TARGET_HALF_WIDTH / context.width * 100); const marginY = Math.min(45, END_TARGET_HALF_HEIGHT / context.height * 100);
  return { left: Math.max(marginX, Math.min(100 - marginX, (point.x + 1) * 50)), top: Math.max(marginY, Math.min(100 - marginY, (1 - point.y) * 50)) };
}

/** Punto, a la altura de la mano, por el que entra en la mesa una ficha jugada desde un asiento. */
function seatEntry(camera: THREE.PerspectiveCamera, side: SeatSide, fallback: THREE.Vector3): THREE.Vector3 {
  const [x, y] = SEAT_ENTRY[side]; const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x, y), camera);
  const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -HAND_HEIGHT), new THREE.Vector3());
  return point ?? fallback.clone().setY(HAND_HEIGHT);
}

/** Punto de la mesa bajo un punto de la pantalla, a la altura a la que el jugador sostiene la ficha. */
function heldPoint(camera: THREE.PerspectiveCamera, ndc: THREE.Vector2): THREE.Vector3 | null {
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -HELD_HEIGHT), new THREE.Vector3());
}

/** Giro equivalente a «ficha vertical en pantalla» (como en la mano) más cercano al giro final. */
function uprightNear(rotation: number) {
  const up = shortestRotation(rotation, Math.PI / 2); return Math.abs(up - rotation) > Math.PI / 2 ? up - Math.PI * Math.sign(up - rotation) : up;
}

function dropMotion(context: SceneContext, id: TileId) { context.motions.get(id)?.hand?.element.remove(); context.motions.delete(id); }

function syncChain(context: SceneContext, chain: readonly OrientedTile[], reducedMotion: boolean, animateChange: boolean, setEnds: (ends: ScreenEnds | null) => void,
  originOf: (playedBy: string) => SeatSide = () => "BOTTOM", dropNdcOf: (tileId: TileId) => THREE.Vector2 | null = () => null) {
  const placements = layoutDominoChain(chain, context.width, context.height); const ids = new Set(chain.map((tile) => tile.id));
  for (const [id, visual] of context.visuals) if (!ids.has(id)) {
    context.scene.remove(visual.mesh); context.visuals.delete(id); dropMotion(context, id); disposeVisual(visual);
  }
  const newIds = chain.filter((tile) => !context.visuals.has(tile.id));
  const animateArrival = context.initialized && animateChange && !reducedMotion && newIds.length === 1;
  // La cámara se calcula primero: la ficha nueva entra por el borde del encuadre final, desde el lado de quien la jugó.
  const animateCamera = context.initialized && animateChange && !reducedMotion;
  // Una ficha soltada a mano aparece justo donde el jugador levantó el dedo, con la cámara tal y como la veía.
  const dropped = new Map<TileId, THREE.Vector3>();
  if (animateArrival) for (const tile of newIds) {
    const ndc = dropNdcOf(tile.id); const point = ndc && heldPoint(context.camera, ndc); if (point) dropped.set(tile.id, point);
  }
  const previous = context.view; const next = fitPose(context.camera, frameBounds(placements)); applyPose(context.camera, next);
  placements.forEach((placement, index) => {
    const tile = chain[index]!; let visual = context.visuals.get(tile.id); const isNew = !visual;
    if (!visual) { visual = createDomino(tile); context.visuals.set(tile.id, visual); context.scene.add(visual.mesh); }
    const target = new THREE.Vector3(placement.x, .02, placement.z); visual.mesh.scale.setScalar(placement.scale);
    if (!context.initialized || reducedMotion || !animateChange) {
      visual.mesh.position.copy(target); visual.mesh.rotation.y = placement.rotation; dropMotion(context, tile.id);
    } else {
      const from = visual.mesh.position.clone();
      const arrives = isNew && animateArrival; const side = originOf(tile.playedBy); const held = arrives ? dropped.get(tile.id) : undefined;
      if (held) {
        // Soltada por el jugador: baja desde su mano y gira lo justo para encajar en el extremo.
        from.copy(held); visual.mesh.position.copy(from); visual.mesh.rotation.y = uprightNear(placement.rotation);
        const fromRotation = visual.mesh.rotation.y;
        context.motions.set(tile.id, { mesh: visual.mesh, from, to: target, fromRotation, toRotation: shortestRotation(fromRotation, placement.rotation),
          arc: .08, easing: "settle", started: performance.now(), duration: SETTLE_MS,
          hand: { element: createHand(context), side: "BOTTOM", releaseAt: .4 } });
        return;
      }
      if (arrives) {
        // Sale de la mano del jugador (fuera de cámara, a su lado de la mesa) y gira mientras viaja hasta su sitio.
        from.copy(seatEntry(context.camera, side, target));
        visual.mesh.position.copy(from); visual.mesh.rotation.y = placement.rotation + (side === "LEFT" || side === "TOP" ? -.9 : .9);
      }
      const fromRotation = visual.mesh.rotation.y; dropMotion(context, tile.id);
      context.motions.set(tile.id, { mesh: visual.mesh, from, to: target, fromRotation, arc: arrives ? .55 : 0, easing: arrives ? "travel" : "settle",
        hand: arrives ? { element: createHand(context), side, releaseAt: .78 } : undefined,
        toRotation: shortestRotation(fromRotation, placement.rotation), started: performance.now(), duration: arrives ? ARRIVAL_MS : isNew ? 520 : 240 });
    }
  });
  context.initialized = true;
  // Los brillos (y su zona táctil) se colocan con la cámara ya en su posición final.
  const glows = endGlows(placements);
  const lay = (side: DropSide, spot: { x: number; z: number; rotation: number; scale: number }, along: number, across: number) => {
    const mesh = context.glows[side]; mesh.position.set(spot.x, .16, spot.z); mesh.rotation.set(-Math.PI / 2, 0, spot.rotation);
    mesh.userData.baseScale = { x: along * spot.scale, y: across * spot.scale }; mesh.scale.set(along * spot.scale, across * spot.scale, 1);
  };
  if (glows) { lay("LEFT", glows.left, TILE_WIDTH * 1.5, TILE_WIDTH * 2); lay("RIGHT", glows.right, TILE_WIDTH * 1.5, TILE_WIDTH * 2); }
  lay("CENTER", { x: 0, z: 0, rotation: 0, scale: placements[0]?.scale ?? .7 }, TILE_LENGTH * 2.2, TILE_LENGTH * 2.2);
  setEnds(glows ? { left: projectAnchor(context, glows.left), right: projectAnchor(context, glows.right) } : null);
  const moved = previous.target.distanceTo(next.target) > 1e-3 || Math.abs(previous.distance - next.distance) > 1e-3;
  if (animateCamera && moved) { context.cameraMotion = { from: previous, to: next, started: performance.now(), duration: 520 }; applyPose(context.camera, previous); }
  else { context.cameraMotion = null; context.view = next; }
  if (context.motions.size || context.cameraMotion || context.glowState.active.length) renderMotion(context); else context.renderer.render(context.scene, context.camera);
}

export function Table3D({ chain, reducedMotion, targets, players, viewerId, locatorRef, dropOrigin }: {
  chain: readonly OrientedTile[]; reducedMotion: boolean; targets?: PlacementTargets | undefined;
  /** Jugadores con su asiento y jugador local: deciden desde qué lado llega cada ficha. */
  players?: readonly Player[] | undefined; viewerId?: string | undefined;
  /** La mesa publica aquí cómo localizar un punto de pantalla para el arrastre desde la mano. */
  locatorRef?: { current: DropLocator | null } | undefined;
  /** Último punto en que el jugador soltó una ficha. */
  dropOrigin?: DropOrigin | undefined;
}) {
  const host = useRef<HTMLDivElement>(null); const sceneRef = useRef<SceneContext | null>(null);
  const originRef = useRef<(playedBy: string) => SeatSide>(() => "BOTTOM");
  originRef.current = (playedBy) => seatSide(players ?? [], viewerId, playedBy);
  const chainRef = useRef(chain); chainRef.current = chain; const reducedRef = useRef(reducedMotion); reducedRef.current = reducedMotion;
  const [unsupported, setUnsupported] = useState(false); const [ends, setEnds] = useState<ScreenEnds | null>(null);
  const endsRef = useRef(ends); endsRef.current = ends; const dropRef = useRef(dropOrigin); dropRef.current = dropOrigin;
  const dropNdcRef = useRef<(tileId: TileId) => THREE.Vector2 | null>(() => null);
  dropNdcRef.current = (tileId) => {
    const drop = dropRef.current; const element = host.current;
    if (!drop || !element || drop.tileId !== tileId || performance.now() - drop.at > DROP_FRESH_MS) return null;
    return new THREE.Vector2(drop.local.x * 2 - 1, -drop.local.y * 2 + 1);
  };
  useEffect(() => {
    if (!locatorRef) return;
    locatorRef.current = (clientX, clientY) => {
      const element = host.current; if (!element) return { inside: false, anchors: {}, local: { x: .5, y: .5 } };
      const rect = element.getBoundingClientRect(); const current = endsRef.current;
      const toClient = (point: ScreenPoint): ScreenXY => ({ x: rect.left + point.left / 100 * rect.width, y: rect.top + point.top / 100 * rect.height });
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      const local = { x: (clientX - rect.left) / Math.max(rect.width, 1), y: (clientY - rect.top) / Math.max(rect.height, 1) };
      return { inside, local, anchors: { CENTER: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, ...(current ? { LEFT: toClient(current.left), RIGHT: toClient(current.right) } : {}) } };
    };
    return () => { locatorRef.current = null; };
  }, [locatorRef]);
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
    const overlay = document.createElement("div"); overlay.className = "table-hands"; element.appendChild(overlay);
    const halo = glowTexture(); const glows = { LEFT: createGlow(halo), RIGHT: createGlow(halo), CENTER: createGlow(halo) };
    Object.values(glows).forEach((mesh) => scene.add(mesh));
    const context: SceneContext = { scene, camera, renderer, visuals: new Map(), motions: new Map(), overlay, frame: 0, glows, glowState: { active: [], hot: null, reduced: false }, width: 1, height: 1, initialized: false, view: OVERVIEW, cameraMotion: null };
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
      Object.values(glows).forEach((mesh) => { mesh.geometry.dispose(); mesh.material.dispose(); }); halo.dispose();
      renderer.dispose(); renderer.domElement.remove(); overlay.remove(); sceneRef.current = null;
    };
  }, []);
  useEffect(() => { const context = sceneRef.current; if (context) syncChain(context, chain, reducedMotion, true, setEnds, originRef.current, dropNdcRef.current); }, [chain, reducedMotion]);
  const activeSides = (["LEFT", "RIGHT", "CENTER"] as const).filter((side) => targets?.[side === "LEFT" ? "left" : side === "RIGHT" ? "right" : "center"]);
  const activeKey = activeSides.join(","); const hot = targets?.hot ?? null;
  useEffect(() => {
    const context = sceneRef.current; if (!context) return;
    context.glowState = { active: activeKey ? activeKey.split(",") as DropSide[] : [], hot, reduced: reducedMotion };
    if (!context.frame) { updateGlows(context, performance.now()); if (context.glowState.active.length && !reducedMotion) renderMotion(context); else context.renderer.render(context.scene, context.camera); }
  }, [activeKey, hot, reducedMotion]);
  const targetButton = (side: DropSide, target: PlacementTarget | undefined, point: ScreenPoint | undefined) => target && point &&
    <button key={side} type="button" className={`end-glow-hit ${side === "CENTER" ? "center" : ""}`}
      style={{ left: `${point.left}%`, top: `${point.top}%` }} disabled={targets?.disabled} aria-label={target.label} title={target.label} onClick={target.onPlace}/>;
  return <div className="three-stage" ref={host} aria-label={`Mesa 3D con ${chain.length} fichas`}>
    {chain.length === 0 && !targets?.center && <p>El poseedor de 6–6 abre la ronda</p>}
    {unsupported && <p>WebGL no disponible. Usa la descripción accesible de la cadena.</p>}
    {targets && (targets.left || targets.right || targets.center) && <div className="spatial-end-targets" aria-label="Elige dónde colocar la ficha">
      {targetButton("LEFT", targets.left, ends?.left)}{targetButton("RIGHT", targets.right, ends?.right)}{targetButton("CENTER", targets.center, { left: 50, top: 50 })}
    </div>}
    <ol className="sr-only">{chain.map((tile, index) => <li key={`${tile.id}-${index}`}>{tile.left}–{tile.right}</li>)}</ol>
  </div>;
}
