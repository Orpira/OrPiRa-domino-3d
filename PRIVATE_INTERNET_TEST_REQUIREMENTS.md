# Inventario para una prueba privada en internet

Este documento es preparatorio. No autoriza despliegues, compras, creación de
cuentas ni tratamiento de tráfico real.

Actualización del 11 de octubre de 2026: imagen sin root, volumen exclusivo,
healthcheck, CORS exacto, cliente Vercel y APK debug ya están preparados localmente.
DNS, certificado, hostname final de Vercel, límites de solicitudes y operación en el
VPS continúan pendientes.

## 1. HTTPS y exposición de red

- Un nombre de host controlado y certificado TLS válido con renovación automática.
- Terminación HTTPS delante del cliente y de `/api`, sin contenido mixto.
- Redirección obligatoria de HTTP a HTTPS y cabeceras de seguridad adecuadas.
- Proxy con soporte de peticiones persistentes y límites de cuerpo/tiempo.
- Configuración de orígenes: preferiblemente cliente y API bajo el mismo origen;
  si se separan, CORS explícito y restrictivo.
- Cortafuegos que exponga solo 443 y mantenga inaccesible el almacenamiento interno.

Pendiente: elegir proveedor, dominio, proxy y procedimiento de renovación. La
ejecución actual usa HTTP local y no es apta para internet.

## 2. Sesiones e identidad

- Mantener una credencial de sesión distinta del código de sala.
- Tokens aleatorios de alta entropía, almacenados solo mediante transporte HTTPS.
- Caducidad, revocación al abandonar y rotación ante reconexiones sensibles.
- Decidir entre cookie `Secure`/`HttpOnly`/`SameSite` o bearer; documentar protección
  contra CSRF/XSS según la elección.
- No registrar tokens completos ni devolverlos en errores, métricas o URLs.
- Política para nombres visibles, duplicados, abuso y eliminación de salas vencidas.
- Secretos de servidor fuera del repositorio y procedimiento de rotación.

Pendiente: el prototipo usa bearer en `sessionStorage` y UUID de sesión, suficiente
para red local controlada pero todavía sin caducidad, revocación administrativa ni
política de identidad para internet.

## 3. Límites y protección de solicitudes

- Límites por IP, sesión y sala para crear/unirse, consultar estado y enviar comandos.
- Cuotas más estrictas para errores de autenticación y códigos de sala inexistentes.
- Tamaño máximo de cuerpo JSON, tiempos máximos y validación estructural de entradas.
- Límite de salas activas, sesiones por sala y retención de comandos idempotentes.
- Respuestas `429` con espera indicada, sin transformar el rechazo en pase o jugada.
- Registro de abuso sin almacenar manos ni credenciales.

Pendiente: implementar y probar límites antes de exposición pública, incluida concurrencia legítima de cuatro
clientes y recuperación después de un `429`.

## 4. Almacenamiento persistente

- Almacén durable con escrituras atómicas, control de concurrencia y cifrado en reposo.
- Separar metadatos de sala, sesiones, snapshots de partida e idempotencia.
- Migraciones versionadas y compatibilidad con `rulesVersion`.
- Ciclo de vida: expiración de salas terminadas/abandonadas y borrado verificable.
- Copias de seguridad cifradas, política de retención y restauraciones ensayadas.
- Evitar que dos instancias autoritativas procesen simultáneamente la misma sala.

Pendiente: `.data/` con JSON atómico funciona para una única máquina local, pero no
ofrece coordinación multiinstancia, copias externas, cifrado ni operación gestionada.

## 5. Recuperación y operación

- Arranque tras caída recuperando estado, sesiones e historial idempotente sin
  repetir acciones ni otorgar puntos.
- Prueba de caída durante escritura y entre aceptación del comando y respuesta HTTP.
- Objetivos explícitos de pérdida de datos y tiempo de recuperación.
- Health checks de proceso y almacenamiento, logs estructurados y alertas mínimas.
- Procedimiento de rollback compatible con snapshots existentes.
- Ensayo de restauración desde copia y comprobación de privacidad posterior.
- Runbook para caída, corrupción, credencial comprometida y saturación.

Pendiente: seleccionar infraestructura y realizar pruebas de fallo controladas. La
recuperación local actual está automatizada, pero no valida fallos de proveedor ni
operación en internet.

## Condiciones antes de invitar participantes

1. Modelo de amenazas y política de datos aprobados.
2. HTTPS, sesiones, límites y persistencia implementados y probados.
3. Restauración ensayada con evidencia y sin filtrar manos.
4. QA multidispositivo de `ONLINE_QA.md` cerrado.
5. Alcance, participantes, duración y mecanismo para reportar incidencias definidos.
6. Confirmación explícita antes de contratar, desplegar o compartir una URL pública.
