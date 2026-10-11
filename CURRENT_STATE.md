# Estado actual

Fecha: 11 de octubre de 2026. Fase 4 ejecutable; cliente web de fase 5
desplegado en Vercel, backend todavía sin desplegar.

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

## Comprobación reproducible

```bash
npm install
npm run check
npm run build
npm run replay
```

Resultado de referencia: 59 pruebas aprobadas, 0 fallos; TypeScript sin errores;
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

La integración de identidad del 11 de octubre de 2026 repitió `npm run check`,
`npm run build:web` y `npm run android:apk` con resultado correcto. El APK contiene
los recursos web y Android esperados y verifica con APK Signature Scheme v2.
La revisión de cadena compacta se empaquetó como APK debug 1.2 (`versionCode` 3),
SHA-256 `63980772c5b2aa5b7c0c2d1c83cc143208c96b57e1bb6cf6af606d4e55140f43`.

## Límites deliberados

El cliente está desplegado en Vercel, pero la API no está desplegada. No existen
todavía TLS verificado para el backend, rate limiting, almacenamiento
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

## Siguiente tarea

Revisar visualmente la identidad desplegada en web. En paralelo sigue pendiente
desplegar y verificar la API en el VPS, corregir DNS y ejecutar el QA externo de
cuatro clientes. No considerar el online habilitado hasta completar esa prueba.
