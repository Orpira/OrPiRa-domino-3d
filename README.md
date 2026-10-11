# OrPiRa Dominó 3D

Fase 2 del producto: partida web local contra tres bots, construida exclusivamente
sobre el motor determinista `latin-individual-double6-v1`. No incluye todavía 3D
ni multijugador online.

## Requisitos

- Node.js 24 o posterior
- npm

## Abrir y jugar

```bash
npm install
npm run dev
```

Vite mostrará la dirección local (normalmente `http://localhost:5173`). Ábrela en
un navegador de escritorio o móvil conectado al mismo equipo. Selecciona una ficha
habilitada y después el extremo; el botón **Pasar** solo se activa cuando no existe
colocación. Los bots continúan automáticamente.

## Comprobar

```bash
npm run check
npm run build
npm run replay
```

`npm run check` ejecuta tipos, las 26 pruebas del motor, 2 pruebas de privacidad y
estrategia de bots y 4 pruebas de partida local. El build valida la compilación de
la interfaz y la prueba generativa conserva 500 partidas legales. `npm run replay` reproduce cinco rondas
con dominada de P0 hasta el marcador 100.

## Paquete del motor

La API pública está en `packages/rules/src/index.ts`:

- `startMatch` y `nextRound` crean estados con reparto explícito validado.
- `transition` aplica `PLACE` o `PASS` y devuelve estado nuevo más eventos, o un
  error tipado conservando exactamente el estado recibido.
- `legalActions`, `getPlayerView` y `getRoundResult` son consultas puras.
- `shuffledDeal` acepta una fuente aleatoria inyectada.

Las reglas confirmadas se resumen en [RULES_CONTRACT.md](RULES_CONTRACT.md), la
trazabilidad en [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) y el relevo técnico en
[CURRENT_STATE.md](CURRENT_STATE.md).
