/**
 * Mano derecha vista desde arriba, palma hacia abajo, agarrando la ficha por su extremo inferior, en estilo
 * ilustración plana y mate: un tono de piel, sombras lisas de un segundo tono, pliegues mínimos y uñas rosadas.
 * Coordenadas: 100 unidades = ancho de la ficha; la ficha ocupa x 50–150 y su borde inferior está en y 80; la muñeca
 * queda abajo. Sirve igual en la mano del jugador, en la ficha arrastrada y sobre la mesa 3D.
 */
export const HAND_VIEWBOX = "0 0 200 230";

/** Marcado SVG interior de la mano. `_id` se mantiene por compatibilidad (el dibujo no usa identificadores). */
export function handMarkup(_id: string): string {
  const SKIN = "#f2b38d", SHADOW = "#e39d76", CREASE = "#cf8660", NAIL = "#fbe6df", NAIL_PINK = "#f4c3b6";
  const finger = (bx: number, by: number, tx: number, ty: number, wb: number, wt: number, fill: string) => {
    const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, px = -uy, py = ux;
    const P = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
    const bl: [number, number] = [bx + px * wb / 2, by + py * wb / 2];
    const br: [number, number] = [bx - px * wb / 2, by - py * wb / 2];
    const tl: [number, number] = [tx + px * wt / 2, ty + py * wt / 2];
    const tr: [number, number] = [tx - px * wt / 2, ty - py * wt / 2];
    const cap: [number, number] = [tx + ux * wt * .55, ty + uy * wt * .55];
    const outline = `M${P(...bl)}L${P(...tl)}C${P(tl[0] + ux * wt * .55, tl[1] + uy * wt * .55)} ${P(cap[0] + px * wt * .35, cap[1] + py * wt * .35)} ${P(...cap)}C${P(cap[0] - px * wt * .35, cap[1] - py * wt * .35)} ${P(tr[0] + ux * wt * .55, tr[1] + uy * wt * .55)} ${P(...tr)}L${P(...br)}Z`;
    // Sombra plana: franja del lado derecho del dedo, del mismo contorno recortado.
    const shadow = `M${P(bx - px * wb * .1, by - py * wb * .1)}L${P(tx - px * wt * .05, ty - py * wt * .05)}C${P(tx + ux * wt * .4 - px * wt * .1, ty + uy * wt * .4 - py * wt * .1)} ${P(cap[0] - px * wt * .3, cap[1] - py * wt * .3)} ${P(cap[0] - px * wt * .15, cap[1] - py * wt * .15)}C${P(cap[0] - px * wt * .38, cap[1] - py * wt * .38)} ${P(tr[0] + ux * wt * .5, tr[1] + uy * wt * .5)} ${P(...tr)}L${P(...br)}Z`;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI + 90; const nx = tx - ux * wt * .12, ny = ty - uy * wt * .12;
    const k: [number, number] = [bx + dx * .5, by + dy * .5];
    return `<path d="${outline}" fill="${fill}"/><path d="${shadow}" fill="${SHADOW}"/>` +
      `<path d="M${P(k[0] + px * wb * .22, k[1] + py * wb * .22)}q${(ux * 2.5).toFixed(1)} ${(uy * 2.5).toFixed(1)} ${(-px * wb * .44).toFixed(1)} ${(-py * wb * .44).toFixed(1)}" fill="none" stroke="${CREASE}" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>` +
      `<g transform="rotate(${ang.toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)})"><rect x="${(nx - wt * .33).toFixed(1)}" y="${(ny - wt * .4).toFixed(1)}" width="${(wt * .66).toFixed(1)}" height="${(wt * .78).toFixed(1)}" rx="${(wt * .3).toFixed(1)}" fill="${NAIL_PINK}"/>` +
      `<rect x="${(nx - wt * .27).toFixed(1)}" y="${(ny - wt * .36).toFixed(1)}" width="${(wt * .54).toFixed(1)}" height="${(wt * .5).toFixed(1)}" rx="${(wt * .25).toFixed(1)}" fill="${NAIL}"/></g>`;
  };
  return `` +
  // antebrazo con sombra lateral plana
  `<path d="M91 178C91 200 88 216 87 234H133C132 216 130 200 131 178Z" fill="${SKIN}"/>` +
  `<path d="M120 178C120 200 122 216 123 234H133C132 216 130 200 131 178Z" fill="${SHADOW}"/>` +
  // pulgar enganchando el borde izquierdo
  `<path d="M88 146C75 140 65 128 59 115C55 105 56 96 62 93C68 91 73 98 78 107C83 117 90 124 97 129Z" fill="${SKIN}"/>` +
  `<path d="M88 146C78 141 70 132 65 122C72 128 82 132 94 133Z" fill="${SHADOW}"/>` +
  `<g transform="rotate(-22 62 101)"><rect x="56" y="93" width="11.5" height="14" rx="5.5" fill="${NAIL_PINK}"/><rect x="57.5" y="94" width="8.5" height="9" rx="4.2" fill="${NAIL}"/></g>` +
  // dedos (meñique, anular, índice, corazón)
  finger(135, 108, 145, 62, 12.5, 10, SKIN) + finger(119, 100, 124, 40, 15, 12, SKIN) + finger(85, 102, 77, 44, 15, 12, SKIN) + finger(102, 97, 100, 32, 16, 12.5, SKIN) +
  // dorso de la mano y su sombra plana a la derecha y abajo
  `<path d="M73 150C68 128 72 106 85 98C99 91 123 91 136 101C146 110 146 134 140 154C136 168 132 178 132 186L91 186C89 172 78 164 73 150Z" fill="${SKIN}"/>` +
  `<path d="M136 101C146 110 146 134 140 154C136 168 132 178 132 186L112 186C120 172 128 152 130 130C131 118 130 108 136 101Z" fill="${SHADOW}"/>` +
  // pliegues mínimos entre nudillos
  `<path d="M93 101q2 4 0 8M111 100q2 4 0 8M127 104q2 4 0 7" fill="none" stroke="${CREASE}" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>` +
  `<path d="M80 152C90 160 102 164 114 164" fill="none" stroke="${CREASE}" stroke-width="1.5" stroke-linecap="round" opacity=".4"/>`;
}
