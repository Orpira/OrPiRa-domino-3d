# OrPiRa Dominó 3D

Dominó 3D incluye partida web local con mesa procedural, contra tres bots o
para cuatro personas con relevo privado. Está construida exclusivamente sobre el
motor determinista `latin-individual-double6-v1`. La fase 4 incorpora además una
experiencia online completa con salas privadas. La imagen Docker, Vercel y la APK
debug están preparados localmente, pero el servicio aún no está desplegado ni se
considera habilitado en internet.

## Requisitos

- Node.js 24 o posterior
- npm

## Abrir y jugar

```bash
npm install
npm run dev
```

Vite mostrará la dirección local (normalmente `http://localhost:5173`). Ábrela en
un navegador de escritorio o móvil conectado al mismo equipo. Puedes elegir:

- **1 persona + 3 bots:** los bots continúan automáticamente.
- **4 personas · relevo:** después de cada turno se oculta la mano hasta que la
  siguiente persona confirma que tiene el dispositivo.

Selecciona una ficha habilitada y después el extremo; **Pasar** solo se activa
cuando no existe colocación. La partida se guarda en `localStorage` después de cada
cambio y se reanuda al volver a abrir la página. Cambiar de modalidad inicia una
partida nueva. La opción de movimiento reducido detiene el movimiento ambiental 3D.

## Comprobar

```bash
npm run check
npm run build
npm run replay
```

`npm run check` ejecuta tipos y 55 pruebas: 26 del motor, 2 de privacidad y
estrategia de bots, 4 de partida local, 4 de checkpoint/relevo, 3 de presentación
online, 7 de interacción de colocación y 9 del servidor. El build valida la interfaz/Three.js y la prueba generativa conserva
500 partidas legales. `npm run replay` reproduce cinco rondas
con dominada de P0 hasta el marcador 100.

## Núcleo online local

`apps/server` proporciona una sala autoritativa y un adaptador HTTP sin dependencias:

- `Authorization: Bearer <sessionId>` liga la sesión a un asiento; el cliente no
  puede elegir `actorId`.
- `GET /matches/:matchId` devuelve solo la vista privada de esa sesión.
- `POST /matches/:matchId/commands` recibe `commandId`, `expectedRevision` y el
  comando `PLACE`, `PASS` o `NEXT_ROUND`.
- Los comandos se procesan en serie; reintentos idénticos devuelven la respuesta
  original incluso tras restaurar la sala.
- Desconectar no pasa turno, no puntúa y no sustituye al jugador.

La API se prueba con un servidor real en puerto efímero, pero no se ofrece todavía
un servicio público ni TLS. Consulta
[ONLINE_PROTOCOL.md](ONLINE_PROTOCOL.md).

El cierre manual multidispositivo se controla en [ONLINE_QA.md](ONLINE_QA.md); sus
casos permanecen pendientes hasta confirmación expresa. Los requisitos aún no
implementados para una futura prueba privada fuera de la red local están en
[PRIVATE_INTERNET_TEST_REQUIREMENTS.md](PRIVATE_INTERNET_TEST_REQUIREMENTS.md).

## Preparación de despliegue y Android

`Dockerfile` y `compose.yaml` ejecutan una única API sin root, sin publicar 8787,
con healthcheck y volumen `orpira_domino_data`. `vercel.json` construye el cliente
desde la raíz del monorepo. Capacitor 8 genera la APK debug con:

```bash
npm run android:apk
```

La instalación, DNS, Proxy Host, respaldo y reversión están documentados en
[DEPLOYMENT.md](DEPLOYMENT.md). Nada de ello autoriza desplegar sin completar las
comprobaciones allí indicadas.

## Probar online con cuatro ventanas o dispositivos

En dos terminales diferentes:

```bash
npm run dev:server
```

```bash
npm run dev
```

Abre `http://localhost:5173`. Desde otros dispositivos de la misma red abre
`http://IP_DEL_ORDENADOR:5173`; permite los puertos 5173 y 8787 en el cortafuegos
local si fuese necesario.

1. Selecciona **Partida online**, escribe un nombre y crea una sala.
2. Comparte el código de seis caracteres.
3. Entra desde otras tres sesiones con nombre y código. En un solo equipo usa
   perfiles o ventanas privadas independientes; cada pestaña guarda su asiento en
   `sessionStorage`.
4. La partida empieza al entrar la cuarta persona.

Si alguien pierde conexión, la sala espera: no pasa, no penaliza y no añade bots.
El servidor guarda las salas en `.data/` y las recupera tras reiniciarse. El código
localiza la sala, pero cada lectura y acción exige además la credencial de sesión.

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
