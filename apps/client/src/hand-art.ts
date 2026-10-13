/**
 * Mano derecha vista desde arriba, palma hacia abajo, agarrando la ficha por su extremo inferior: se ve el dorso,
 * los nudillos y las uñas; el pulgar engancha el borde izquierdo y los dedos, algo flexionados, apoyan las yemas
 * sobre la ficha. Coordenadas: 100 unidades = ancho de la ficha; la ficha ocupa x 50–150 y su borde inferior está
 * en y 80; la muñeca queda abajo. Sirve igual en la mano del jugador, en la ficha arrastrada y sobre la mesa 3D.
 */
export const HAND_VIEWBOX = "0 0 200 230";

const SKIN = "var(--hand-skin, #d9a07a)"; const LIGHT = "var(--hand-light, #e8b993)"; const SHADE = "var(--hand-shade, #b67b55)";
const LINE = "var(--hand-line, #7d4f33)"; const NAIL = "#f4dccb";

/** Dedo visto por el dorso: contorno, relleno, pliegue de la falange y uña en la punta. */
function finger(baseX: number, baseY: number, tipX: number, tipY: number, width: number) {
  const dx = tipX - baseX; const dy = tipY - baseY; const length = Math.hypot(dx, dy); const ux = dx / length; const uy = dy / length;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  const nailX = tipX - ux * width * .42; const nailY = tipY - uy * width * .42;
  const creaseX = baseX + dx * .52; const creaseY = baseY + dy * .52; const half = width * .32;
  return `<line x1="${baseX}" y1="${baseY}" x2="${tipX}" y2="${tipY}" stroke="${LINE}" stroke-width="${width + 4}" stroke-linecap="round"/>` +
    `<line x1="${baseX}" y1="${baseY}" x2="${tipX}" y2="${tipY}" stroke="${SKIN}" stroke-width="${width}" stroke-linecap="round"/>` +
    // Brillo en el lomo del dedo para dar volumen.
    `<line x1="${baseX - uy * width * .18}" y1="${baseY + ux * width * .18}" x2="${tipX - uy * width * .18 - ux * width * .5}" y2="${tipY + ux * width * .18 - uy * width * .5}" stroke="${LIGHT}" stroke-width="${width * .28}" stroke-linecap="round" opacity=".8"/>` +
    `<path d="M${creaseX - uy * half} ${creaseY + ux * half}Q${creaseX + ux * 2.4} ${creaseY + uy * 2.4} ${creaseX + uy * half} ${creaseY - ux * half}" fill="none" stroke="${SHADE}" stroke-width="1.8" stroke-linecap="round"/>` +
    `<rect x="${nailX - width * .3}" y="${nailY - width * .36}" width="${width * .6}" height="${width * .72}" rx="${width * .26}" fill="${NAIL}" stroke="${SHADE}" stroke-width="1.3" transform="rotate(${angle} ${nailX} ${nailY})"/>`;
}

/** Marcado SVG interior de la mano. `id` se mantiene por compatibilidad con quien la incrusta varias veces. */
export function handMarkup(_id: string): string {
  return (
    // Antebrazo que entra desde abajo (desde el asiento de quien juega).
    `<path d="M86 186L80 232H142L136 186Z" fill="${SKIN}" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M96 200L94 230M126 200L128 230" stroke="${SHADE}" stroke-width="2" opacity=".45"/>` +
    // Pulgar: sale del lado izquierdo del dorso y engancha el borde izquierdo de la ficha.
    `<path d="M76 146C62 134 52 118 49 98" fill="none" stroke="${LINE}" stroke-width="27" stroke-linecap="round"/>` +
    `<path d="M76 146C62 134 52 118 49 98" fill="none" stroke="${SKIN}" stroke-width="23" stroke-linecap="round"/>` +
    `<path d="M70 140C60 130 54 118 52 106" fill="none" stroke="${LIGHT}" stroke-width="6" stroke-linecap="round" opacity=".7"/>` +
    `<rect x="42" y="88" width="14" height="17" rx="6" fill="${NAIL}" stroke="${SHADE}" stroke-width="1.3" transform="rotate(-12 49 96)"/>` +
    // Dorso de la mano.
    `<path d="M64 156C56 128 62 102 76 92C92 82 128 82 145 94C158 106 157 136 148 160C141 176 137 184 137 194L85 194C82 182 71 172 64 156Z" fill="${SKIN}" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M82 112C94 104 124 104 138 114" fill="none" stroke="${LIGHT}" stroke-width="7" stroke-linecap="round" opacity=".55"/>` +
    // Tendones que bajan de los nudillos hacia la muñeca.
    `<path d="M82 104L96 178M102 98L108 178M121 100L120 178M138 108L130 176" fill="none" stroke="${SHADE}" stroke-width="2" stroke-linecap="round" opacity=".35"/>` +
    // Dedos flexionados con las yemas sobre la ficha: índice, corazón, anular y meñique.
    finger(80, 96, 73, 50, 19) + finger(101, 91, 99, 40, 20) + finger(121, 94, 124, 47, 19) + finger(140, 104, 147, 66, 16) +
    // Nudillos.
    `<g fill="${LIGHT}" opacity=".9"><ellipse cx="80" cy="97" rx="7" ry="4.5"/><ellipse cx="101" cy="92" rx="7.5" ry="4.5"/><ellipse cx="121" cy="95" rx="7" ry="4.5"/><ellipse cx="140" cy="105" rx="6" ry="4"/></g>`
  );
}
