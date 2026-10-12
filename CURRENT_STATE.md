# Estado actual

Fecha: 12 de octubre de 2026. **Versión en producción: 1.5-rc1** (etiqueta `v1.5-rc1`,
commit `2240f70`, rama `feature/league`; `main` sigue en `f0dddf1` hasta la prueba con
cuatro dispositivos).

- API: desplegada el 11 oct 2026 ~23:40 UTC en el VPS `orpira-cloud` (167.233.139.93),
  Docker Compose, proyecto `orpira-domino`, directorio `/opt/domino-3d-v1.5-rc1`, imagen
  `orpira/domino-api:1.5-rc1` (`sha256:57cd7d6d0e3e…80ae0`), tras Nginx Proxy Manager con
  Let's Encrypt. El directorio anterior `/opt/domino-3d` (0.5.0) queda intacto para volver
  atrás (`DEPLOY_PLAN.md`, sección 6).
- Web: Vercel, despliegue `dpl_H1oJq62k4s6i3RAh4MLC9sqFYGmV` desde la etiqueta, alias
  `https://orpira-domino-3d.vercel.app` (`index-mnwN1v2X.js`). Anterior para volver
  atrás: `dpl_BQ9kn3vDir7wwwBBN9GpfRY57P4R`.
- APK: 1.5 (`versionCode` 6), SHA-256 `f4f2c5d07e7506a1bfdaf2c0959b78635a5b5f40e55242fea2e8997dd9165bb2`,
  instalada en el Samsung SM-A165F.
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
- Defecto encontrado en el dispositivo: a 384 px de ancho (densidad 450) los nombres
  largos ensanchaban el marcador y la página, desplazando la barra inferior. Corregido
  en la rama después de la etiqueta (sin desplegar; requiere una nueva candidata).

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
