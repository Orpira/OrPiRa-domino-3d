import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { TILE_BY_ID, type TileId } from "../../../packages/rules/src/index.ts";
import { DominoFace } from "./DominoFace.tsx";
import { HandGrip } from "./HandGrip.tsx";
import type { PlacementTargets } from "./Table3D.tsx";
import { dragIntent, nearestDrop, type DropSide, type ScreenXY } from "./drop-target.ts";

/** Lo que la mesa 3D responde sobre un punto de la pantalla: si está dentro y dónde se ven los extremos. */
export interface DropProbe {
  readonly inside: boolean; readonly anchors: Partial<Record<DropSide, ScreenXY>>;
  /** Punto relativo a la mesa (0–1 en cada eje): sigue valiendo aunque la página se desplace al cambiar de turno. */
  readonly local: ScreenXY;
}
export type DropLocator = (clientX: number, clientY: number) => DropProbe;
/** Punto de la pantalla donde se soltó la ficha: la mesa la hace aparecer ahí y la asienta en su sitio. */
export interface DropOrigin { readonly tileId: TileId; readonly local: ScreenXY; readonly at: number }

interface Gesture {
  readonly tileId: TileId; readonly pointerId: number; readonly pointerType: string; readonly source: HTMLElement;
  readonly startX: number; readonly startY: number; readonly offsetX: number; readonly offsetY: number;
  readonly width: number; readonly height: number; active: boolean;
}
type Phase = "DRAGGING" | "PLACING" | "RETURNING";
interface GhostState { readonly tileId: TileId; readonly width: number; readonly height: number; readonly phase: Phase }

/** Destinos que la mesa muestra para la ficha elegida o arrastrada: solo los legales. */
export function placementTargets(sides: readonly DropSide[], ends: { readonly left: number | null; readonly right: number | null; readonly up?: number | null; readonly down?: number | null },
  onPlace: (side: DropSide) => void, hot: DropSide | null, disabled = false): PlacementTargets | undefined {
  if (sides.length === 0) return undefined;
  const target = (side: DropSide, label: string, value: string | number) => sides.includes(side) ? { label, value, onPlace: () => onPlace(side) } : undefined;
  return { left: target("LEFT", `Colocar a la izquierda · ${ends.left}`, ends.left ?? ""), right: target("RIGHT", `Colocar a la derecha · ${ends.right}`, ends.right ?? ""),
    up: target("UP", `Colocar en el brazo de arriba · ${ends.up ?? ""}`, ends.up ?? ""), down: target("DOWN", `Colocar en el brazo de abajo · ${ends.down ?? ""}`, ends.down ?? ""),
    center: target("CENTER", "Abrir la ronda con 6–6", "6·6"), hot, disabled };
}

const RETURN_MS = 220; const PLACING_TIMEOUT_MS = 3000;

export function useHandDrag({ enabled, sidesOf, onDrop, handIds, reducedMotion }: {
  /** Si el jugador puede mover ahora (su turno, sin envíos pendientes). */
  readonly enabled: boolean;
  readonly sidesOf: (tileId: TileId) => readonly DropSide[];
  readonly onDrop: (tileId: TileId, side: DropSide) => void;
  /** Fichas que siguen en la mano: cuando la soltada desaparece de aquí, la fantasma se retira. */
  readonly handIds: readonly TileId[];
  readonly reducedMotion: boolean;
}) {
  const locatorRef = useRef<DropLocator | null>(null);
  const gesture = useRef<Gesture | null>(null); const ghostEl = useRef<HTMLDivElement | null>(null);
  const position = useRef({ x: 0, y: 0, tilt: 0, lastX: 0 }); const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<GhostState | null>(null); const [hot, setHot] = useState<DropSide | null>(null);
  const [dropOrigin, setDropOrigin] = useState<DropOrigin | undefined>(undefined);
  const latest = useRef({ enabled, sidesOf, onDrop, reducedMotion }); latest.current = { enabled, sidesOf, onDrop, reducedMotion };
  const timer = useRef(0);

  const paint = useCallback((scale: number) => {
    const element = ghostEl.current; const current = gesture.current; if (!element || !current) return;
    const { x, y, tilt } = position.current;
    element.style.transform = `translate(${x - current.offsetX}px, ${y - current.offsetY}px) rotate(${tilt}deg) scale(${scale})`;
  }, []);

  const finish = useCallback(() => { gesture.current = null; setGhost(null); setHot(null); }, []);

  const probe = (clientX: number, clientY: number, tileId: TileId) => {
    const locate = locatorRef.current; const sides = latest.current.sidesOf(tileId);
    if (!locate || sides.length === 0) return { inside: false, side: null, local: null };
    const result = locate(clientX, clientY);
    return { inside: result.inside, side: result.inside ? nearestDrop(sides, { x: clientX, y: clientY }, result.anchors) : null, local: result.local };
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = gesture.current; if (!current || event.pointerId !== current.pointerId) return;
      if (!current.active) {
        const intent = dragIntent(event.clientX - current.startX, event.clientY - current.startY, current.pointerType);
        if (intent === "SCROLL") { gesture.current = null; return; }
        if (intent === "WAIT") return;
        current.active = true; suppressClick.current = true;
        position.current = { x: event.clientX, y: event.clientY, tilt: 0, lastX: event.clientX };
        setGhost({ tileId: current.tileId, width: current.width, height: current.height, phase: "DRAGGING" });
      }
      event.preventDefault();
      // La ficha se inclina hacia donde se mueve la mano y se endereza al detenerse.
      const velocity = event.clientX - position.current.lastX;
      const tilt = Math.max(-14, Math.min(14, position.current.tilt * .7 + velocity * .9));
      position.current = { x: event.clientX, y: event.clientY, tilt, lastX: event.clientX };
      const { side } = probe(event.clientX, event.clientY, current.tileId);
      setHot(side); paint(side ? 1.04 : 1.16);
    };
    const end = (event: PointerEvent) => {
      const current = gesture.current; if (!current || event.pointerId !== current.pointerId) return;
      if (!current.active) { gesture.current = null; return; }
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      const { side, local } = event.type === "pointerup" && latest.current.enabled ? probe(event.clientX, event.clientY, current.tileId) : { side: null, local: null };
      setHot(null);
      if (side && local) {
        position.current = { ...position.current, tilt: 0 }; paint(1);
        setDropOrigin({ tileId: current.tileId, local, at: performance.now() });
        setGhost({ tileId: current.tileId, width: current.width, height: current.height, phase: "PLACING" });
        window.clearTimeout(timer.current); timer.current = window.setTimeout(finish, PLACING_TIMEOUT_MS);
        latest.current.onDrop(current.tileId, side);
        return;
      }
      // Fuera de la mesa: la ficha vuelve a su hueco en la mano.
      const home = current.source.getBoundingClientRect();
      position.current = { x: home.left + current.offsetX, y: home.top + current.offsetY, tilt: 0, lastX: 0 };
      if (latest.current.reducedMotion) { finish(); return; }
      setGhost({ tileId: current.tileId, width: current.width, height: current.height, phase: "RETURNING" });
      window.clearTimeout(timer.current); timer.current = window.setTimeout(finish, RETURN_MS);
    };
    window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); window.clearTimeout(timer.current); };
  }, [finish, paint]);

  // La fantasma soltada se retira en cuanto la ficha sale de la mano (jugada aceptada) o si el turno se cierra.
  const placingId = ghost?.phase === "PLACING" ? ghost.tileId : null;
  useEffect(() => { if (placingId && !handIds.includes(placingId)) { window.clearTimeout(timer.current); finish(); } }, [placingId, handIds, finish]);
  useEffect(() => { if (!enabled && ghost?.phase === "DRAGGING") finish(); }, [enabled, ghost, finish]);

  const bind = (tileId: TileId) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (!latest.current.enabled || gesture.current || event.button !== 0 || latest.current.sidesOf(tileId).length === 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      gesture.current = { tileId, pointerId: event.pointerId, pointerType: event.pointerType, source: event.currentTarget, startX: event.clientX, startY: event.clientY,
        offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, height: rect.height, active: false };
    },
    onDragStart: (event: { preventDefault: () => void }) => event.preventDefault(),
  });
  /** Tras un arrastre el navegador aún dispara un clic: se ignora para que no seleccione la ficha. */
  const consumeClick = () => suppressClick.current;

  const tile = ghost ? TILE_BY_ID.get(ghost.tileId) : undefined;
  const ghostNode = ghost && tile ? createPortal(<div ref={(element) => { ghostEl.current = element; if (element) paint(ghost.phase === "DRAGGING" ? (hot ? 1.04 : 1.16) : 1); }}
    className={`drag-ghost ${ghost.phase.toLowerCase()} ${hot ? "over-target" : ""}`} style={{ width: ghost.width, height: ghost.height }} aria-hidden="true">
    <DominoFace a={tile.a} b={tile.b}/><HandGrip/></div>, document.body) : null;

  return { bind, consumeClick, locatorRef, dropOrigin, hot, draggingId: ghost?.phase === "DRAGGING" ? ghost.tileId : null,
    hiddenId: ghost ? ghost.tileId : null, ghost: ghostNode };
}
