/** Posiciones de los puntos en una mitad cuadrada (0–1), compartidas por la mano, las ilustraciones y la ficha de rango. */
export const PIPS: Readonly<Record<number, ReadonlyArray<readonly [number, number]>>> = {
  0: [], 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
  5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.28, .22], [.72, .22], [.28, .5], [.72, .5], [.28, .78], [.72, .78]],
};

/** Cara de una ficha vertical con sus puntos: el valor `a` arriba y `b` abajo. Decorativa; el botón lleva el texto accesible. */
export function DominoFace({ a, b }: { a: number; b: number }) {
  return <svg className="tile-face" viewBox="0 0 60 112" aria-hidden="true" focusable="false">
    <line x1="10" y1="56" x2="50" y2="56" stroke="#8f8673" strokeWidth="2.4" strokeLinecap="round"/>
    {PIPS[a]!.map(([x, y], index) => <circle key={`a${index}`} cx={6 + x * 48} cy={4 + y * 48} r="5.6" fill="#121b19"/>)}
    {PIPS[b]!.map(([x, y], index) => <circle key={`b${index}`} cx={6 + x * 48} cy={60 + y * 48} r="5.6" fill="#121b19"/>)}
  </svg>;
}
