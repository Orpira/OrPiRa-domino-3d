import type { OrientedTile, TileId } from "../../../packages/rules/src/index.ts";

export const MAX_CHAIN_TILES = 28;
export const TILE_LENGTH = 1.12;
export const TILE_WIDTH = .58;

export interface TablePoint { readonly x: number; readonly z: number }
export interface ChainPlacement extends TablePoint {
  readonly id: TileId;
  readonly rotation: number;
  readonly tangent: number;
  readonly scale: number;
  readonly distanceFromOpening: number;
}

/** Por debajo de esta proporción ancho/alto (móvil y tableta vertical) se usa el trazado compacto. */
export const COMPACT_ASPECT = 1.6;

function layoutScale(width: number, height: number) { return Math.max(.68, Math.min(.74, width / 1000, height / 600)); }

/** Trazado ancho: los dos brazos avanzan cinco fichas por fila y bajan hacia el jugador. */
function wideArmSlots(width: number, height: number, side: "LEFT" | "RIGHT") {
  const scale = layoutScale(width, height);
  const points: Array<TablePoint & { tangent: number }> = [];
  const inner = -.86; const outer = -5.42; const rows = [0, 1.45, 2.9, 4.35, 5.8];
  rows.forEach((z, row) => {
    const towardOuter = row % 2 === 0; const tangent = towardOuter ? Math.PI : 0;
    const xs = towardOuter ? [inner, -2, -3.14, -4.28, outer] : [outer, -4.28, -3.14, -2, inner];
    xs.forEach((x) => points.push({ x, z, tangent }));
    if (row < rows.length - 1) points.push({ x: towardOuter ? outer - .58 : inner + .58, z: (z + rows[row + 1]!) / 2, tangent: -Math.PI / 2 });
  });
  return points.map((point) => {
    if (side === "LEFT") return { x: point.x * scale, z: point.z * scale, tangent: point.tangent, scale };
    return { x: -point.x * scale, z: point.z * scale, tangent: Math.atan2(Math.sin(point.tangent), -Math.cos(point.tangent)), scale };
  });
}

/**
 * Trazado compacto: filas de tres fichas; el brazo derecho baja y el izquierdo sube (simetría central),
 * así la cadena ocupa toda la mesa y la cámara puede acercarse más en pantallas casi cuadradas.
 * Convención de ángulos: una tangente t avanza en la dirección (cos t, −sin t) sobre X/Z, igual que la rotación en Y de THREE.
 */
function compactArmSlots(width: number, height: number, side: "LEFT" | "RIGHT") {
  const scale = layoutScale(width, height);
  const points: Array<TablePoint & { tangent: number }> = [];
  const inner = .86; const outer = 3.14; const columns = [inner, 2, outer]; const rows = 7; const step = 1.45;
  for (let row = 0; row < rows; row += 1) {
    const towardOuter = row % 2 === 0; const z = row * step; const tangent = towardOuter ? 0 : Math.PI;
    (towardOuter ? columns : [...columns].reverse()).forEach((x) => points.push({ x, z, tangent }));
    if (row < rows - 1) points.push({ x: towardOuter ? outer + .58 : inner - .58, z: z + step / 2, tangent: -Math.PI / 2 });
  }
  return points.map((point) => {
    if (side === "RIGHT") return { x: point.x * scale, z: point.z * scale, tangent: point.tangent, scale };
    return { x: -point.x * scale, z: -point.z * scale, tangent: Math.atan2(-Math.sin(point.tangent), -Math.cos(point.tangent)), scale };
  });
}

function armSlots(width: number, height: number, side: "LEFT" | "RIGHT") {
  return width / height < COMPACT_ASPECT ? compactArmSlots(width, height, side) : wideArmSlots(width, height, side);
}

export interface TableBounds { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }

/** Tamaño mínimo del encuadre: con pocas fichas la cámara se acerca, pero nunca tanto como para que una ficha llene la mesa. */
export const MIN_FRAME_WIDTH = 4;
export const MIN_FRAME_DEPTH = 2.6;

/** Rectángulo que ocupan las fichas sobre la mesa, con sus esquinas reales según la rotación de cada una. */
export function chainBounds(placements: readonly ChainPlacement[]): TableBounds | null {
  if (placements.length === 0) return null;
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const placement of placements) {
    const halfLength = TILE_LENGTH / 2 * placement.scale; const halfWidth = TILE_WIDTH / 2 * placement.scale;
    const cos = Math.cos(placement.rotation); const sin = Math.sin(placement.rotation);
    for (const [along, across] of [[halfLength, halfWidth], [halfLength, -halfWidth], [-halfLength, halfWidth], [-halfLength, -halfWidth]] as const) {
      // Igual que THREE: una rotación en Y lleva el eje X local a (cos, -sin) en XZ y el eje Z local a (sin, cos).
      const x = placement.x + along * cos + across * sin; const z = placement.z - along * sin + across * cos;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

/** Distancia, en longitudes de ficha, desde el centro de la ficha extrema hasta el botón de ese extremo: deja libre la ficha. */
export const END_ANCHOR_REACH = 1.75;
/** El encuadre reserva sitio hasta donde iría la siguiente ficha; el botón cabe en el margen que deja la cámara. */
const FRAME_END_REACH = 1;

/**
 * Puntos justo más allá de cada extremo de la cadena, donde se colocan los botones de elección.
 * Una tangente t avanza en (cos t, −sin t) sobre X/Z; el extremo izquierdo avanza en sentido contrario.
 */
export function endAnchors(placements: readonly ChainPlacement[], reachInTiles = END_ANCHOR_REACH): { readonly left: TablePoint; readonly right: TablePoint } | null {
  if (placements.length === 0) return null;
  const anchor = (placement: ChainPlacement, direction: -1 | 1) => {
    const reach = reachInTiles * TILE_LENGTH * placement.scale * direction;
    return { x: placement.x + Math.cos(placement.tangent) * reach, z: placement.z - Math.sin(placement.tangent) * reach };
  };
  return { left: anchor(placements[0]!, -1), right: anchor(placements.at(-1)!, 1) };
}

/** Punto de brillo sobre el extremo abierto de la cadena, girado como la ficha extrema. */
export interface EndGlow extends TablePoint { readonly rotation: number; readonly scale: number }

/**
 * Dónde se ilumina cada extremo jugable: centrado en el borde abierto de la ficha extrema, de modo que medio brillo
 * cae sobre la ficha y medio sobre la mesa, justo donde se apoyará la siguiente. En un doble (cruzado) el borde
 * abierto está a media anchura del centro. Con solo el 6–6 en la mesa, cada lado brilla en un costado del doble.
 */
export function endGlows(placements: readonly ChainPlacement[]): { readonly left: EndGlow; readonly right: EndGlow } | null {
  if (placements.length === 0) return null;
  const glow = (placement: ChainPlacement, direction: -1 | 1): EndGlow => {
    const crosswise = Math.abs(Math.sin(placement.rotation - placement.tangent)) > .5;
    const reach = (crosswise ? TILE_WIDTH : TILE_LENGTH) / 2 * placement.scale * direction;
    return { x: placement.x + Math.cos(placement.tangent) * reach, z: placement.z - Math.sin(placement.tangent) * reach, rotation: placement.tangent, scale: placement.scale };
  };
  return { left: glow(placements[0]!, -1), right: glow(placements.at(-1)!, 1) };
}

/** Zona que debe encuadrar la cámara: las fichas jugadas y el hueco de cada extremo, ampliada hasta el tamaño mínimo. */
export function frameBounds(placements: readonly ChainPlacement[]): TableBounds | null {
  const tiles = chainBounds(placements); const anchors = endAnchors(placements, FRAME_END_REACH); if (!tiles || !anchors) return null;
  const bounds = { minX: Math.min(tiles.minX, anchors.left.x, anchors.right.x), maxX: Math.max(tiles.maxX, anchors.left.x, anchors.right.x),
    minZ: Math.min(tiles.minZ, anchors.left.z, anchors.right.z), maxZ: Math.max(tiles.maxZ, anchors.left.z, anchors.right.z) };
  const centerX = (bounds.minX + bounds.maxX) / 2; const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const halfWidth = Math.max(bounds.maxX - bounds.minX, MIN_FRAME_WIDTH) / 2; const halfDepth = Math.max(bounds.maxZ - bounds.minZ, MIN_FRAME_DEPTH) / 2;
  return { minX: centerX - halfWidth, maxX: centerX + halfWidth, minZ: centerZ - halfDepth, maxZ: centerZ + halfDepth };
}

export function layoutDominoChain(chain: readonly OrientedTile[], width: number, height: number): readonly ChainPlacement[] {
  if (chain.length > MAX_CHAIN_TILES) throw new Error(`La cadena excede ${MAX_CHAIN_TILES} fichas`);
  if (chain.length === 0) return [];
  const openingIndex = chain.findIndex((tile) => tile.id === "6-6");
  if (openingIndex < 0) throw new Error("La cadena no contiene el 6-6 de apertura");
  const leftSlots = armSlots(width, height, "LEFT"); const rightSlots = armSlots(width, height, "RIGHT");
  const scale = leftSlots[0]!.scale;
  return chain.map((tile, index) => {
    if (index === openingIndex) return { id: tile.id, x: 0, z: 0, tangent: 0, rotation: Math.PI / 2, scale, distanceFromOpening: 0 };
    const isLeft = index < openingIndex;
    const distanceFromOpening = isLeft ? openingIndex - index : index - openingIndex;
    const outward = (isLeft ? leftSlots : rightSlots)[distanceFromOpening - 1]!;
    const tangent = isLeft ? outward.tangent + Math.PI : outward.tangent;
    const rotation = tangent + (tile.left === tile.right ? Math.PI / 2 : 0);
    return { id: tile.id, x: outward.x, z: outward.z, tangent, rotation, scale, distanceFromOpening };
  });
}

export type SeatSide = "BOTTOM" | "RIGHT" | "TOP" | "LEFT";

/**
 * Lado de la mesa desde el que llega una ficha, con el jugador local siempre abajo.
 * El turno avanza en sentido antihorario (asiento s → s − 1): abajo → derecha → arriba → izquierda.
 * Sin jugador local (relevo entre personas) o con un autor desconocido, la ficha llega desde abajo.
 */
export function seatSide(players: readonly { readonly playerId: string; readonly seat: number }[], viewerId: string | undefined, playedBy: string): SeatSide {
  const viewer = players.find((player) => player.playerId === viewerId); const actor = players.find((player) => player.playerId === playedBy);
  if (!viewer || !actor) return "BOTTOM";
  const turnsAfterViewer = ((viewer.seat - actor.seat) % 4 + 4) % 4;
  return (["BOTTOM", "RIGHT", "TOP", "LEFT"] as const)[turnsAfterViewer]!;
}
