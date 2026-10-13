/**
 * Mano ilustrada que sujeta una ficha por su extremo inferior: el pulgar delante y los demás dedos por detrás,
 * asomando por el borde derecho. Coordenadas: 100 unidades = ancho de la ficha; la ficha ocupa x 50–150 y su
 * borde inferior está en y 80. Todo se dibuja encima de la ficha; los dedos «de detrás» se recortan fuera de
 * ella, así no hace falta ordenar capas y sirve igual en la mano, en la ficha arrastrada y sobre la mesa 3D.
 */
export const HAND_VIEWBOX = "0 0 200 220";

const SKIN = "var(--hand-skin, #d9a07a)"; const SHADE = "var(--hand-shade, #b67b55)"; const LINE = "var(--hand-line, #7d4f33)"; const NAIL = "#f3d6c4";

function finger(x1: number, y1: number, x2: number, y2: number, width: number) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${LINE}" stroke-width="${width + 4}" stroke-linecap="round"/>` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SKIN}" stroke-width="${width}" stroke-linecap="round"/>`;
}

/** Marcado SVG interior de la mano; `clipId` debe ser único por documento cuando conviven varias. */
export function handMarkup(clipId: string): string {
  return `<defs><clipPath id="${clipId}"><path clip-rule="evenodd" d="M-40 -40H240V260H-40Z M52 -40H148V78H52Z"/></clipPath></defs>` +
    `<g clip-path="url(#${clipId})">` +
      // Dedos por detrás de la ficha: solo asoman las yemas por el borde derecho.
      finger(132, 112, 160, 26, 19) + finger(140, 116, 167, 46, 19) + finger(148, 122, 170, 68, 18) + finger(154, 132, 168, 92, 15) +
      // Palma y antebrazo, que entran desde abajo.
      `<path d="M70 222C66 196 60 166 66 140C72 114 92 98 120 96C146 94 170 104 172 128C174 152 162 176 156 198L154 222Z" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/>` +
      `<path d="M96 168C112 176 134 176 150 166" fill="none" stroke="${SHADE}" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M120 100C138 102 156 110 164 124" fill="none" stroke="${SHADE}" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>` +
    `</g>` +
    // Pulgar delante de la ficha, apoyado en su mitad inferior.
    finger(80, 150, 92, 56, 26) +
    `<path d="M71 146C76 120 82 98 90 74" fill="none" stroke="${SHADE}" stroke-width="3" stroke-linecap="round" opacity=".55"/>` +
    `<ellipse cx="93" cy="58" rx="8.5" ry="10.5" fill="${NAIL}" stroke="${SHADE}" stroke-width="1.6"/>`;
}
