# Estado actual

Fecha: 14 de octubre de 2026. **Versión en producción: API 1.12-rc1, web `main` (`v1.12-rc1`) y APK 1.12-rc1.**

## Despliegue v1.12-rc1 — chat de mesa y del vestíbulo (14 oct 2026, ~10:25 en el VPS)

- Ver `CHAT.md`. Parte de una implementación sin commit encontrada en la copia de trabajo (autor desconocido), revisada y completada: el servidor no arrancaba (propiedades de parámetro), los errores del chat cambiaban los estados HTTP de la Competición, el filtro dejaba pasar «H1JU3PUT4!», y el vestíbulo consultaba cada segundo y tapaba contenido en móvil.
- API desde `/opt/domino-3d-v1.12-rc1`, imagen `sha256:366680e2…0a43`, `healthy`. Copia previa: `domino-data-pre-1.12-rc1-20261014-0822.tar.gz` (90 KB, SHA `65bb0c7e…b938`). Vuelta atrás: `cd /opt/domino-3d-v1.11-rc1 && sudo docker compose up -d --no-deps --no-build domino-api`.
- Comprobado en producción: salud, CORS (tres orígenes 204, ajeno 403), liga intacta (9 jugadores), vestíbulo sin partida terminada → 403, sala `UY2LVU` en juego: texto → `CHAT_QUICK_ONLY`, frase → 201 y visible para otro jugador, segundo mensaje inmediato → `CHAT_RATE_LIMITED`.
- Web `index-C7RFdI6m.js`. APK 1.12-rc1 (`versionCode` 15, SHA `123f10ac…c3cf`) instalada en el Samsung: botón flotante del vestíbulo sobre la barra inferior (sin solaparla), vestíbulo con texto habilitado para la cuenta del teléfono (tiene partidas terminadas), ancho 384/384 px.
- Rastro de QA: identidad «QA chat» y la sala `UY2LVU` con cuatro invitados «QA chat 1–4» (la partida termina sola en modo automático).

## Despliegue v1.11-rc1 — amigos completos (14 oct 2026, ~03:40 en el VPS)

- Ver `SOCIAL.md`: buscar por usuario, solicitudes, eliminar, bloquear y desbloquear, presencia por consulta cada 25 s («en línea» = visto en el último minuto), invitar a un amigo a la sala con aviso dentro de la app (10 min, en memoria) e insignia en Cuenta.
- API desde `/opt/domino-3d-v1.11-rc1`, imagen `sha256:2a6a663c…daeb3`, `healthy`. Copia previa: `domino-data-pre-1.11-rc1-20261014-0135.tar.gz` (90 KB, SHA `6e3a7ba9…50e4`). Vuelta atrás: `cd /opt/domino-3d-v1.10-rc1 && sudo docker compose up -d --no-deps --no-build domino-api`.
- Comprobado en producción: salud, CORS (tres orígenes 204, ajeno 403), liga intacta (9 jugadores), sala `3R4766` intacta; búsqueda, solicitud y aceptación entre «QA amigos A» (`@qa_amigos_a`) y «QA amigos B» (`@qa_amigos_b`), «en línea», invitación a la sala All Fives `Q9YAXE` recibida por B.
- Web `index-IPxUrxoh.js`. APK 1.11-rc1 (`versionCode` 14, SHA `d3757f61…662a`) instalada en el Samsung: Cuenta con búsqueda de amigos, ancho 384/384 px.
- Rastro de QA: identidades «QA amigos A» y «QA amigos B» (amigos) y la sala `Q9YAXE` esperando jugadores.
- Prueba iPhone (14 oct 2026): el iPhone 16 Pro del propietario (iOS 27.0.1) está conectado por USB, pero controlar Safari en él requiere el modo desarrollador y un túnel con `sudo`, así que se probó producción con WebKit (motor de Safari, Playwright 1.63) en la pantalla del iPhone 16 Pro (402×874, densidad 3, táctil): Inicio, práctica Latino/Con robo/All Fives con toques, arrastre táctil, sala con código por parejas e «Invitar» (copia el enlace), página `/invitar/Q9YAXE`, Cuenta y el diálogo propio. Sin errores y sin desbordamiento; All Fives con 7 fichas en un brazo cabe en la mesa. Rastro: sala `Q67U9Y` (el creador salió de la sesión). Falta la comprobación manual en el teléfono: sonido, menú de compartir nativo, zonas seguras y barras de Safari.

## Despliegue v1.10-rc1 — All Fives (14 oct 2026, ~03:10 en el VPS)

- Reglas en `RULES_CONTRACT.md` (spinner, brazos UP/DOWN, puntos por extremos múltiplos de 5, victoria en el acto, fin de mano redondeado a 5). Mesa 3D centrada en el spinner, cuatro brillos, «+N» flotante, suma de extremos y marcador en la mesa; el tablero se encoge si los brazos no caben.
- API desde `/opt/domino-3d-v1.10-rc1`, imagen `sha256:d2c1f657…04ad`, `healthy`. Copia previa: `domino-data-pre-1.10-rc1-20261014-0107.tar.gz` (87 KB, SHA `202a8382…8c23`). Vuelta atrás: `cd /opt/domino-3d-v1.9-rc1 && sudo docker compose up -d --no-deps --no-build domino-api`.
- Comprobado en producción: salud, CORS (tres orígenes 204, ajeno 403), liga intacta (9 jugadores), sala `3R4766` y su vista previa intactas, `production-smoke.mjs --fives` (191 s, puntos múltiplos de 5, sin liga, historial con `rules`).
- Web `index-CN8xH3QV.js`. APK 1.10-rc1 (`versionCode` 13, SHA `070c025a…1b89`) instalada en el Samsung: práctica All Fives con la cruz de cuatro brazos dentro de la mesa, ancho 384/384 px.
- Rastro de QA: identidad «QA 10-14 01:10».

## Despliegue v1.9-rc1 — invitaciones por enlace, nombre de usuario y amigos (14 oct 2026, ~02:45 en el VPS)

- Ver `SOCIAL.md`. Servidor: `social.ts` (repositorio JSON atómico tras la interfaz `SocialRepository`), salas enlazadas a la cuenta, vista previa pública, amistad al entrar por invitación. Cliente: panel «Invitar» (compartir/copiar, WhatsApp, enlace), página `/invitar/:codigo`, nombre de usuario y amigos en Cuenta.
- API desde `/opt/domino-3d-v1.9-rc1`, imagen `sha256:58a7460b…7ca2`, `healthy`. Copia previa: `domino-data-pre-1.9-rc1-20261014-0042.tar.gz` (86 KB, SHA `3c0b2d7b…65e2`). Vuelta atrás: `cd /opt/domino-3d-v1.8-rc1 && sudo docker compose up -d --no-deps --no-build domino-api` (la 1.8 ignora `social.json`).
- Comprobado en producción: salud, CORS (tres orígenes 204, ajeno 403), liga intacta (9 jugadores), usuario `qa_invita_1014`, vista previa de la sala `3R4766` (parejas), entrada por invitación con `friendWith`, amistad visible, 409 por usuario repetido, 404 por sala inexistente; página `https://domino-3d.orpira.es/invitar/3R4766?de=qa_invita_1014` sin errores y sin desbordamiento.
- Web `index-CjUDjJld.js`; APK 1.9-rc1 (`versionCode` 12, SHA `a9a18cd5…a4c1`) instalada en el Samsung: Cuenta muestra «Perfil y amigos», ancho 384/384 px.
- Rastro de QA: identidades «QA invita» (`@qa_invita_1014`) y «QA invitado», amigas entre sí, y la sala `3R4766` esperando jugadores.

## Despliegue v1.8-rc1 — modalidades Latino y Con robo (14 oct 2026, ~02:15 en el VPS)

- Motor con `RuleSet` (`LATINO_RULES` congelado por golden master, `DRAW_RULES`), objetivo 100/150/200, comando `DRAW`; liga solo Latino. Ver `RULES_CONTRACT.md`.
- API desde `/opt/domino-3d-v1.8-rc1`, imagen `orpira/domino-api:1.8-rc1` (`sha256:16bda43d…9dce`), `healthy`; mismas variables. Copia previa de datos: `domino-data-pre-1.8-rc1-20261014-0014.tar.gz` (70 KB, SHA `2281e545…df83`). Vuelta atrás: `cd /opt/domino-3d-v1.7-rc1 && sudo docker compose up -d --no-deps --no-build domino-api`.
- Comprobado en producción: salud, CORS (204 en los tres orígenes, 403 ajeno), liga conservada (8 jugadores), `INVALID_TARGET` para objetivo 99, `production-smoke.mjs --draw` (449 s, sin puntos de liga, historial con `rules`) y `--pairs` (463 s, +2).
- Web `domino-3d.orpira.es` con `index-DOIWCnYi.js` (1.8-rc1). APK 1.8-rc1 (`versionCode` 11, SHA `01ccf5ff…a493`) instalada en el Samsung: práctica «Con robo» con pozo 8, botón Robar, ancho 384/384 px.
- Rastro de QA: identidad «QA 10-14 00:17» (dos, una por prueba) y +2 en la liga de octubre.

## Despliegue v1.7-rc1 — parejas online (14 oct 2026, ~01:00 hora de Colombia)

- API en el VPS desde `/opt/domino-3d-v1.7-rc1`, imagen `orpira/domino-api:1.7-rc1` (`sha256:5198597d…a5ba`), `healthy` a los 5 s; mismas variables que la 1.5-rc1. `DOMINO_ALLOWED_ORIGINS` incluye `https://domino-3d.orpira.es` (dominio del propietario, ya presente en la 1.5-rc1).
- Copias previas en `/opt/backups/orpira-domino/` con STAMP `20261013-2300`: `domino-data-pre-1.7-rc1-…` (57 KB, SHA `4fe7c9fa…06ac`) y `opt-domino-3d-v1.5-rc1-pre-1.7-rc1-…` (13 MB, SHA `35a649e9…d117`).
- Comprobado: salud; CORS 204 para los tres orígenes y 403 para uno ajeno; la liga de octubre conservó sus 7 jugadores y puntos; `production-smoke.mjs --pairs` completo (587 s, Bot 1 y Bot 3 campeones con 211, humano 3.º con +2, concesión única, historial con `mode`); sala por parejas `PE4MLY` creada desde la web de producción (queda esperando jugadores).
- Web: Vercel publicó `e9d08e3` (`index-CEbr_Dzw.js`) en `orpira-domino-3d.vercel.app` y `domino-3d.orpira.es`.
- APK 1.7-rc1 (`versionCode` 10, SHA `cfb5d447…da0a`) instalada en el Samsung SM-A165F: Inicio con «Individual a 100 / Parejas a 200», sala online por parejas, aviso propio al cambiar de modalidad, ancho 384/384 px.
- Vuelta atrás: `cd /opt/domino-3d-v1.5-rc1 && sudo docker compose up -d --no-deps --no-build domino-api` (la 1.5-rc1 lee los datos de la 1.7; las partidas por parejas en curso terminarían con reglas individuales).
- Rastro de QA en producción: identidad «QA 10-13 23:10» (+2 en la liga) y sala `PE4MLY`.
- Pendiente: retirar del VPS `/tmp/domino-api-1.7-rc1.tar.gz` y `/tmp/domino-3d-src-v1.7-rc1.tar.gz`; limpiar los directorios antiguos de `/opt` cuando se dé por buena la 1.7.
El 12 oct 2026 `main` avanzó de `f0dddf1` a `81d4ae8` (toda la 1.5 y las fichas más grandes) por decisión del propietario, antes de la prueba con cuatro dispositivos, y después, desde Claude web, hasta `b893b38`: sonidos, confeti más lento, arrastre de fichas desde la mano, manos ilustradas y brillo en el extremo jugable. Vercel publica `main` automáticamente; el 13 oct se comprobó que producción sirve el mismo build que `b893b38` (`index-CxWYywkZ.js`). Ninguno de estos cambios toca el servidor (idéntico a `v1.5-rc1`), así que el VPS no necesita actualizarse. Después llegó el modo en parejas de la práctica local (`57ed999`). La APK 1.6-rc1 (`versionCode` 9) ya incluye todas estas novedades. Suite local tras sincronizar: 120 pruebas aprobadas, TypeScript y build correctos.

`v1.5-rc2` (`ec52fd4`) corrige el ancho en pantallas estrechas y `v1.5-rc3` (`289ac4b`)
oculta el aviso de modo automático cuando la partida ha terminado; ninguna cambia el
servidor, que sigue siendo el de `v1.5-rc1` (`2240f70`). `main` ya incluye toda la 1.5
(ver párrafo anterior); la prueba con cuatro dispositivos sigue pendiente.

- API: desplegada el 11 oct 2026 ~23:40 UTC en el VPS `orpira-cloud` (167.233.139.93),
  Docker Compose, proyecto `orpira-domino`, directorio `/opt/domino-3d-v1.5-rc1`, imagen
  `orpira/domino-api:1.5-rc1` (`sha256:57cd7d6d0e3e…80ae0`), tras Nginx Proxy Manager con
  Let's Encrypt. El directorio anterior `/opt/domino-3d` (0.5.0) queda intacto para volver
  atrás (`DEPLOY_PLAN.md`, sección 6).
- Web: Vercel, despliegue `dpl_2mgkpdYaM2qK4GWmpg99NQhCdVin` desde `v1.5-rc3`, alias
  `https://orpira-domino-3d.vercel.app` (`index-B7WbB0e_.js`). Anteriores para volver
  atrás: `dpl_8Dax53PJda4DK4SVm9KuBbz3Txwd` (rc2), `dpl_H1oJq62k4s6i3RAh4MLC9sqFYGmV` (rc1) y
  `dpl_BQ9kn3vDir7wwwBBN9GpfRY57P4R` (`main`).
- APK: 1.6-rc1 (`versionCode` 9, `78b5e74`), `artifacts/domino3d-orpira-1.6-rc1-debug.apk`, SHA-256
  `0b1d5724fe8426cc35aa7f9af872db597e940e4db2f8092da13931c51729ac2c`, misma firma debug.
  El 14 oct 2026 se instaló en el Samsung SM-A165F con `adb install -r` y se comprobó en el dispositivo:
  ancho 384/384 px en Inicio y en la práctica; la práctica «Parejas · a 200» muestra los marcadores
  «Tú y Bruno» y «Luna y Vera». Se arrastró el 6-6 desde la mano a la mesa 3D y los tres bots
  jugaron hasta devolver el turno. El sonido no se ha verificado: el teléfono estaba en silencio.
- APK anterior: 1.5-rc3 (`versionCode` 8), `artifacts/domino3d-orpira-1.5-rc3-debug.apk`, SHA-256
  `a53f4c789488471a1ce2d30a043ff97c0cb6cae14dacef7059b4d10dff000e24`, instalada en el
  Samsung SM-A165F. Verificado en el dispositivo sobre una partida terminada: sin aviso de
  modo automático ni «Retomar el control», y ancho 384/384 px. La 1.5-rc2 (`versionCode` 7)
  tenía SHA-256 `3f6c2dd78ad658092c081dbfa2edeb02ffd795be1e25ad7c9987e4038847d4c7`. En el dispositivo, con el marcador de nombres largos, el ancho del
  documento es 384 px (igual al de la pantalla) y ningún elemento queda fuera. La 1.5
  (`versionCode` 6) tenía SHA-256 `f4f2c5d07e7506a1bfdaf2c0959b78635a5b5f40e55242fea2e8997dd9165bb2`.
- Copias previas en el VPS, `/opt/backups/orpira-domino/` (STAMP `20261011-2325`):
  - `domino-data-pre-1.5-rc1-20261011-2325.tar.gz` — `5103527208fd3917622d68645173772345bb9b71ff56f5a3f8d8dff28cfcd1e4` (volumen vacío)
  - `domino-api-0.5.0-pre-1.5-rc1-20261011-2325.tar.gz` — `ee6e996d82d1fcba8bbdf6c848f428338abd0bd7cb4b9a95ba1d0071207fb341`
  - `opt-domino-3d-pre-1.5-rc1-20261011-2325.tar.gz` — `16aab9bae3b24f663f4892ea5a197143535c83e82dd45c55d6ae13c45e3d262a`
  - `SHA256SUMS-20261011-2325`
- Comprobaciones en producción: HTTPS y `/health`; importes de
  `/api/simulated-conditions`; CORS de la web y de la APK (otros orígenes, 403); partida
  de «Jugar ahora» con tres bots terminada en 675 s con +5 puntos de liga concedidos
  una sola vez; límite de peticiones con 429 y `Retry-After: 59`. La primera
  comprobación del límite falló por un defecto del script (peticiones secuenciales más
  lentas que la ventana); se corrigió con lotes paralelos.
- Datos de prueba que quedan en producción: identidades «QA 10-11 23:33» y «Samsung», con
  sus partidas públicas y puntos de liga de octubre.
- Defecto encontrado en el dispositivo y corregido en 1.5-rc2: a 384 px de ancho
  (densidad 450) los nombres largos ensanchaban el marcador y la página.
- Corregido en 1.5-rc3: el aviso «Modo automático» con «Retomar el control» ya no aparece
  en una partida terminada.

## Fichas más grandes en la mesa (12 oct 2026, `81d4ae8`, web en producción desde `main`)

- Fichas de la mesa más legibles: puntos casi el doble de grandes y textura a doble resolución.
- La cámara encuadra las fichas jugadas (con un tamaño mínimo) en lugar de mostrar siempre toda la mesa; se mueve con suavidad y respeta `prefers-reduced-motion`.
- Trazado compacto para pantallas con proporción menor de 1,6 (móvil y tableta vertical): filas de tres fichas, brazo derecho hacia abajo y brazo izquierdo hacia arriba. En móvil las fichas se ven en torno al doble de grandes con 16 fichas en mesa. El trazado ancho de escritorio no cambia.
- Botones de extremo circulares con el valor del extremo (texto completo en `aria-label`), colocados más allá de la ficha extrema y siempre dentro de la mesa.
- Corregida la dirección del botón de extremo cuando la última ficha está en un giro.
- Fichas de la mano con puntos en lugar de números (componente `DominoFace`, compartido con las ilustraciones y la ficha de rango).
- Cada ficha jugada entra en la mesa desde el lado de quien la jugó (jugador local abajo; antihorario: abajo → derecha → arriba → izquierda), elevándose y girando hasta su sitio. En relevo entre personas todas llegan desde abajo. Sin animación con `prefers-reduced-motion` ni al restaurar varias fichas a la vez.
- Sonidos sintetizados en el navegador con Web Audio, sin archivos (`sound.tsx`, `sound-events.ts`): ficha colocada, doble, pase forzado del rival, capicúa, ronda ganada por dominada o por cierre, ronda de otro jugador, partida ganada o perdida y barajado al empezar ronda. Botón «Sonido» en la práctica y en la mesa online, recordado en `localStorage` (activado por defecto). Al abrir o reconectar no suena nada.
- Las fichas se colocan arrastrándolas desde la mano hasta la mesa (`hand-drag.tsx`, `drop-target.ts`), en la práctica y en la mesa online. Tocar una ficha ya no la juega: solo la levanta y muestra sus destinos legales (uno o dos extremos, o «6·6» en el centro para abrir), que también sirven para jugar sin arrastrar. Al arrastrar, la ficha sigue al dedo inclinándose con el movimiento, se resalta el extremo más cercano y, al soltar, la ficha 3D aparece en ese punto y se asienta en su sitio. Soltada fuera de la mesa vuelve a la mano. En el móvil, deslizar en horizontal sigue desplazando la mano; el arrastre empieza al mover la ficha hacia arriba.
- Manos ilustradas en vista cenital, palma hacia abajo (`hand-art.ts`, `HandGrip.tsx`): se ve el dorso, los nudillos y las uñas; el pulgar engancha el borde de la ficha. Al soltar, la mano se eleva y se retira. Al seleccionar una ficha aparece una mano que la sujeta; al arrastrarla, la mano la lleva hasta la mesa y la suelta. Cada ficha rival llega en la mano de quien la juega, desde su lado de la mesa, alineada con la ficha, y la mano se abre y se retira al final. Sin manos en la mesa con `prefers-reduced-motion`. La mano del jugador ya no desaparece en el turno de los bots, así la página no salta al soltar.
- Sin números ni botones de texto para elegir extremo: el extremo jugable se marca con un brillo dorado suave en la escena 3D (`endGlows` en `table-layout.ts`), centrado en el borde abierto de la ficha extrema; late despacio y se intensifica bajo la ficha arrastrada. Tocar el brillo (zona táctil invisible, con `aria-label`) coloca la ficha seleccionada. En la apertura brilla el centro de la mesa.
- La lluvia de confeti del medallero cae más despacio (unos 8 s en total, antes 2 s) y se balancea de lado a lado.
- Limitación conocida: con más de unas 20 fichas en un mismo brazo, el trazado compacto sobrepasa el borde dibujado de la mesa (las fichas siguen visibles).

## Modo en parejas en la práctica local (13 oct 2026)

- Motor (`packages/rules`): `startMatch(..., { mode: "PAIRS" })`. Compañeros enfrente (asientos 0–2 contra 1–3), partida a 200. Al dominar, la pareja ganadora suma los puntos de las cuatro manos; en tranque gana la pareja con menos puntos entre sus dos manos y se lleva todos; si empatan, nadie suma. La primera mano la abre el 6–6; desde la segunda sale quien dominó (o quien cerró el tranque) con la ficha que quiera (`freeOpening`, `openingTileId`). Sin bonificaciones (capicúa, pase corrido) por decisión de producto. El modo individual no cambia (sus estados no llevan `mode`).
- Práctica local: selector «Individual · a 100 / Parejas · a 200» que combina con bots o relevo; marcador por pareja; resultados y medallero de pareja; en la salida libre brilla el centro de la mesa y la cadena se centra en la ficha de salida (a lo largo si no es doble). Los sonidos de victoria cuentan la del compañero como propia.
- Corregido de paso (también en individual): con solo el 6–6 en mesa las zonas táctiles de los dos extremos se solapaban; ahora se separan.
- Pendiente (segunda fase): parejas en online (Jugar ahora, salas, competición) y liga; bots que tengan en cuenta al compañero.

## Parejas online y en la liga (14 oct 2026, rama `feature/pairs-online`, sin desplegar)

- Servidor: `AuthoritativeRoom` acepta `mode` y lo conserva al restaurar; salas con código por parejas (`POST /api/lobbies` con `mode`); «Jugar ahora» con una cola por modalidad y bots por orden de llegada; el historial guarda `mode`. Sin cambios en el motor, el reloj de turno ni la competición, que sigue siendo individual.
- Liga: la fórmula no cambia; en parejas da 40 a cada ganador y 10 a cada perdedor (× humanos/4). Decisión del propietario.
- Cliente: selector «Individual · a 100 / Parejas · a 200» en «Jugar ahora» y en la sala con código; marcador por pareja con la del espectador primero; resultado de mano y final por pareja.
- Defecto encontrado en la QA y corregido: la mesa online se caía al empezar la segunda mano de parejas, porque la vista 3D esperaba el 6–6 como ficha de salida.
- QA local (servidor en 8788 con reloj rápido, Chrome a 384 px): partida de «Jugar ahora» por parejas con 3 bots hasta el final, sin errores; sala con código de cuatro personas en la que cada una ve primero a su pareja; ancho 0 px de desbordamiento. Suite: 141 pruebas aprobadas.
- Despliegue: requiere nueva imagen del API en el VPS (plan y aprobación aparte) y Vercel al fusionar en `main`. El cliente nuevo habla con el API 1.5-rc1 sin romperse, pero sin parejas online hasta desplegar el servidor; los clientes anteriores siguen funcionando con el API nuevo.

## Implementado

- Motor TypeScript puro en `packages/rules`.
- Perfil confirmado, set doble seis, reparto aleatorio inyectable y reparto explícito.
- Inicio/nueva ronda, colocación, pase, dominada, cierre, puntuación y final de partida.
- Estados inmutables, revisión optimista, errores tipados y eventos ordenados.
- Consultas de acciones legales, resultado y vista privada.
- Suite de aceptación, prueba generativa y replay completo hasta 100.
- Cliente React/Vite responsive para un humano y tres bots.
- Selección de ficha/extremo, pase legal, cadena, marcador, resultados, rondas y reinicio.
- Bots deterministas limitados a su `PlayerView` y acciones legales.
- Control de turnos de bots sin acciones simultáneas o duplicadas.
- Mesa 3D procedural con Three.js, iluminación, sombras y fichas generadas en código.
- Modalidad de cuatro personas con pantalla de relevo que oculta la mano anterior.
- Checkpoint en `localStorage` tras cada transición y restauración validada al abrir.
- Rechazo de checkpoints corruptos, sin reparar ni inventar fichas.
- Movimiento ambiental reducible y fallback textual accesible para la cadena.
- Protocolo online tipado con `commandId` y `expectedRevision`.
- Sala autoritativa serializada, actor derivado de sesión y vistas privadas.
- Idempotencia persistida en snapshots, reconexión y recuperación en memoria.
- Adaptador HTTP autenticado probado en puerto local efímero.
- Lobby privado por código, nombres visibles y cuatro asientos únicos.
- Cliente online 3D separado del local, con espera, desconexión y reconexión.
- Fichas de la mano verticales en local y online, en una sola fila adaptable con
  desplazamiento horizontal en móvil; la cadena y la orientación lógica no cambian.
- Apertura online mediante selección táctil del 6–6 y botón explícito, compatible
  con navegadores móviles sin `crypto.randomUUID()` en HTTP local.
- Objetivo y progreso online permanentes; resumen de ronda con motivo y puntos;
  final persistente con campeón, marcador y clasificación que conserva empates.
- La mesa online respeta `prefers-reduced-motion`; una partida terminada no ofrece
  otra ronda y permite volver al lobby.
- Colocación simplificada en local y online: acción única inmediata, elección táctil
  de extremos solo cuando ambos son legales, selección ligada a revisión y bloqueo
  de doble envío.
- Backend de producción compilado en imagen Docker, proceso UID 1000, healthcheck,
  CORS por lista exacta, volumen exclusivo y Compose sin puertos publicados.
- Cliente Vercel preparado desde la raíz del monorepo y API HTTPS configurable.
- Cliente publicado en `https://orpira-domino-3d.vercel.app`, con HTTPS verificado y
  repositorio privado de GitHub conectado a Vercel.
- Capacitor 8.5.3 y proyecto Android API 36; APK debug firmada y verificada.
- En Android, sesión y comando pendiente usan almacenamiento local para sobrevivir
  al cierre de la aplicación; la web conserva aislamiento por `sessionStorage`.
- Reintento de comandos pendientes con el mismo `commandId`.
- Persistencia atómica en `.data/` y recuperación tras reiniciar servidor.
- Identidad visual Domino3D-OrPiRa integrada localmente en web y Android: maestro
  original, variante simplificada, favicons, manifest web, Apple touch icon y
  launchers clásicos/redondos/adaptativos en cinco densidades.
- APK debug 1.2 (`versionCode` 3) preparada con el mismo `applicationId`, firma debug,
  almacenamiento de sesión y endpoint `https://api-domino.orpira.es`.

- Competición de prueba (COP simulados · sin valor monetario): identidad de prueba
  persistente y recuperable, crédito inicial único, reserva atómica al aceptar, inicio
  solo con cuatro aceptaciones, salida/cancelación/caducidad con devolución única,
  anulación unánime sin campeón y liquidación idempotente vinculada a `matchId`,
  recuperable tras reinicio. Condiciones fijadas por sala; un cambio de versión
  invalida aceptaciones. Consulta pública `GET /api/simulated-conditions`.
- Comisión configurable con redondeo a pesos enteros y validación al arrancar.
  Límite de peticiones y tope de identidades por IP, configurables por entorno
  (`DOMINO_RATE_LIMIT_*`, `DOMINO_IDENTITY_LIMIT_*`, `DOMINO_TRUST_PROXY`).
- Rediseño de interfaz: navegación Inicio · Mesas · Historial · Cuenta (barra inferior
  en móvil con áreas seguras de Android, raíl lateral en escritorio), tokens de color y
  espaciado, controles de 48 px, foco visible, ilustraciones SVG en línea y
  `viewport-fit=cover`. Mesas, condiciones, sala de espera con aceptaciones, indicador
  de bolsa durante la partida, liquidación (premio bruto, comisión, premio recibido y
  neto individual) o «Liquidación pendiente», historial y cuenta de prueba.
- La mesa online se extrajo a `GameBoard.tsx` y la cola de comandos a
  `use-command-channel.ts`, compartidas por la sala entre amigos y la competición.
  Práctica (bots y relevo) y online sin saldo siguen accesibles desde Inicio. Three.js
  solo se descarga al mostrar una mesa.

- Reloj de turno autoritativo en todas las modalidades online (30 s provisional): al
  agotarse, el jugador automático único del servidor (`auto-player.ts`, estrategia de los
  bots locales con desempate por semilla) juega una acción legal y lo anuncia a todos.
  Tras 2 turnos agotados seguidos o 60 s sin conexión el asiento pasa a modo automático;
  el jugador recupera el control con «Retomar el control» desde su siguiente turno. La
  hora límite se guarda y se respeta tras reiniciar. Sustituye a «desconexión sin bot»:
  toda partida iniciada termina; en competición liquida una sola vez y registra los
  asientos que terminaron en modo automático.
- «Jugar ahora»: botón principal en Inicio; cola pública por orden de llegada, mesa al
  reunir cuatro o, tras 45 s, completada con bots del servidor rotulados «Bot»; búsqueda
  cancelable, una identidad por cola o partida, resultado con «Jugar otra» e historial
  de partidas públicas con bots, marcador y asientos automáticos. Nunca bots en
  competición.

- Liga: solo puntúan las partidas terminadas de «Jugar ahora»; 40/20/10/4 por posición
  × humanos/4 con redondeo hacia abajo, 0 en modo automático y sin bots. Concesión única
  por `matchId`, reconciliada al arrancar. Temporada mensual en America/Bogota con
  cierre único y archivo; siete rangos de Doble blanca a Doble seis. Pestaña Liga,
  puntos y ascenso en el resultado, ficha de rango en la mesa e historial de temporadas.

## Comprobación reproducible

```bash
npm install
npm run check
npm run build
npm run replay
```

Resultado de referencia: 105 pruebas aprobadas, 0 fallos; TypeScript sin errores;
build de producción correcto; replay con P0 campeón, marcador final P0=100 y resto=0.

La mesa 3D usa ahora una distribución serpenteante reproducible. El 6–6 permanece
vertical en el centro durante toda la ronda; LEFT y RIGHT crecen desde esa ancla
por brazos independientes, sin recentrar las fichas ya colocadas. Los dobles cruzan
el tramo, los objetivos táctiles se proyectan sobre los extremos reales y la escala
se adapta uniformemente hasta alojar las 28 fichas. Las fichas nuevas se animan solo
al incorporarse al estado observado; restaurar, reconectar, redimensionar o activar
movimiento reducido aplica directamente la geometría estable.
El ajuste posterior compacta los centros consecutivos y hace que cada ficha nueva
parta visualmente desde su vecina interior antes de asentarse, reforzando la lectura
secuencial de la cadena sin desplazar el resto.

El final confirmado `MATCH_ENDED` presenta un trofeo, el texto explícito
«¡[Nombre] ganó la partida!», la puntuación del campeón y la clasificación completa.
Una capa breve de confeti y serpentinas doradas/verdes se reclama una sola vez por
`matchId` y sesión del dispositivo; recargar o reconectar conserva el final sin
repetirla. Con `prefers-reduced-motion` solo se presenta el resultado estático.

La integración de identidad del 11 de octubre de 2026 repitió `npm run check`,
`npm run build:web` y `npm run android:apk` con resultado correcto. El APK contiene
los recursos web y Android esperados y verifica con APK Signature Scheme v2.
La revisión de cadena compacta se empaquetó como APK debug 1.2 (`versionCode` 3),
SHA-256 `63980772c5b2aa5b7c0c2d1c83cc143208c96b57e1bb6cf6af606d4e55140f43`.

La rama de rediseño corrigió además dos fallos del servidor de competición previo,
que no estaba en ningún commit: `competition.ts` usaba parameter properties (Node en
modo strip no las admite, por lo que el servidor no arrancaba) y la prueba tenía un
error de sintaxis. QA de navegador automatizado (Chrome, 412×915 y 1440×960, movimiento
reducido) contra servidor local: 18 pantallas por tamaño en `assets/qa/redesign/`,
incluidos estados no disponible, saldo insuficiente, sala completa, cancelación con
devolución y reconexión. APK debug 1.3 (`versionCode` 4, mismo `applicationId` y firma
debug, v2 verificada), SHA-256
`e5f0ff2c0794a6fa16e334b175db7a7af69dfc64aeede9bb5fb7fd7395f49051`, instalada con
`adb install -r` sobre la 1.1 en el Samsung SM-A165F (1080×2340, densidad 450),
conservando la partida local guardada. En el dispositivo se comprobaron barra de
estado, barra inferior sobre los botones del sistema, navegación entre las cuatro
pestañas y acceso a la práctica; capturas en `assets/qa/device/`. Esa revisión detectó
y corrigió que el contenido se mezclaba con la barra de estado al desplazarse y que el
404 del backend publicado se mostraba como error genérico en vez de «no disponible».

QA de «Jugar ahora» (Chrome 412×915 y 1440×960 contra servidor local, movimiento
reducido): buscando, mesa con reloj, jugada automática anunciada, resultado con bots e
historial, en `assets/qa/quick-play/`. El resultado se alcanzó reiniciando el servidor
con reloj acelerado sobre los mismos datos, lo que también ejercitó la restauración del
reloj. APK debug 1.4 (`versionCode` 5, mismo `applicationId` y firma debug), SHA-256
`8d52f6196e05c2f80c3e7358ffbf9c39938dd4e9a7eb4203cdaaf3ae5cfa3111`, instalada en el Samsung. APK debug 1.5 de la liga (`versionCode` 6), SHA-256
`8d6bca2d3f944a21965cbda627e415ddfa0a97c82602f20362b5a08e4d2bc6de`; no instalada.

QA de liga (Chrome móvil y escritorio, servidor local aislado): Liga sin cuenta y con
rango, mesa con fichas de rango, resultado con puntos, ascenso real a Doble uno e
historial, en `assets/qa/league/`. La APK 1.4 se instaló en el Samsung el 12 de
octubre de 2026; capturas `assets/qa/device/samsung-1.4-*`.

## Límites deliberados

El cliente está desplegado en Vercel, pero la API no está desplegada. No existen
todavía TLS verificado para el backend, rate limiting distribuido (solo hay límites
en memoria por instancia), almacenamiento
gestionado/cifrado ni observabilidad. La APK es debug y no está
publicada. El volumen Docker mantiene JSON atómico para una única instancia.
La identidad visual nueva se publica en `main` y Vercel mediante el despliegue
automático autorizado. La APK 1.1 se instaló correctamente en el Samsung SM-A165F
con `adb install -r`, conservando el identificador y la firma de pruebas.
Las evidencias ejecutadas y la aceptación visual manual están en `PHASE_3_QA.md`.
El QA online con Samsung, iPhone, iPad y portátil está preparado en `ONLINE_QA.md`;
todas sus comprobaciones manuales siguen pendientes. Los requisitos de una futura
prueba privada en internet se detallan en
`PRIVATE_INTERNET_TEST_REQUIREMENTS.md`, sin despliegue autorizado.

GitHub conserva en `origin/main` las fases 3 a 5, la configuración de despliegue y la
identidad visual. El repositorio local conserva en `main` el commit `d7726a9` de fase
2. El
entorno monta únicamente `.git` desde la misma partición ext4 con opción `ro`; los
permisos, ACL y atributos del índice sí son normales. Por eso Git puede leer el
historial pero no crear `index.lock` ni registrar fase 3. No se ha borrado ni
reconstruido el historial. El respaldo recuperable está en
`backups/phase3-working-tree-20261011.tar.gz`; su contenido y suma se documentan en
`backups/README.md`. La base local posterior de fase 4 tiene un segundo respaldo en
`backups/phase4-local-working-tree-20261011.tar.gz`; la experiencia online completa
está en `backups/phase4-complete-local-20261011.tar.gz`. La corrección de apertura
y la preparación del QA quedan en `backups/phase4-online-qa-prepared-20261011.tar.gz`.
El intento de registrar `fix: make online opening reliable on mobile` volvió a
fallar al no poder crear `.git/index.lock` sobre el montaje de solo lectura.

El DNS de `api-domino.orpira.es` devuelve actualmente `64.29.17.65` y `64.29.17.1`,
no el VPS `167.233.139.93`. SSH rechazó por clave tanto `orpira` como `root`, por lo
que no se inspeccionó ni modificó el servidor. Consulta `DEPLOYMENT.md`.

Competición de prueba: el backend desplegado no tiene todavía estas rutas, así que web
y APK muestran «Competición no disponible» hasta desplegar este servidor. No hay mesas
públicas ni emparejamiento: la ocupación solo se ve dentro de cada sala privada. El
servidor no lista las salas activas de una identidad; el cliente recuerda la sala en el
dispositivo y, si se pierde, se vuelve a entrar con el código. Límites por IP solo en
memoria (una instancia). La cola de «Jugar ahora» vive en memoria y se vacía al
reiniciar; las partidas en curso sí se restauran.
Los flujos de competición no se pudieron recorrer en el Samsung porque el backend
publicado no tiene esas rutas; se recorrieron en Chrome contra un servidor local.

## Siguiente tarea

Revisar `feature/league` (sin commit); validar en dispositivo el reloj y Jugar
ahora con personas reales; revisar y fusionar `feature/interface-redesign`; desplegar el
servidor nuevo y ejecutar la prueba de cuatro dispositivos de
`COMPETITION_CONTRACT.md`. Revisar visualmente la identidad desplegada en web. En paralelo sigue pendiente
desplegar y verificar la API en el VPS, corregir DNS y ejecutar el QA externo de
cuatro clientes. No considerar el online habilitado hasta completar esa prueba.
