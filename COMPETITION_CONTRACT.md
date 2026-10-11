# Competición de prueba — contrato, almacenamiento y validación

Estado: prototipo local con **COP simulados · sin valor monetario**. No está preparado
para dinero real, no usa pagos y no está autorizado por Coljuegos. Los importes son
valores provisionales del prototipo, no condiciones de una futura operación real.

## Contrato

| Concepto | Valor (servidor) |
| --- | --- |
| Crédito inicial por identidad | 100.000, una sola vez |
| Entrada individual | 5.000 |
| Participantes | 4 identidades distintas |
| Bolsa | 4 × 5.000 = 20.000 |
| Comisión | 0 % |
| Premio al campeón | 20.000 |
| Objetivo | 100 puntos (motor sin cambios) |
| Caducidad de sala incompleta | 15 minutos desde su creación |
| Versión de condiciones | 1 |

Comisión: `round(bolsa × porcentaje / 100)` en pesos enteros (medios hacia arriba). El
premio debe ser exactamente `bolsa − comisión`; si no cuadra, o algún importe no es
entero, el servidor se niega a arrancar (`INCONSISTENT_CONDITIONS`). La comisión
retenida queda registrada en `settlement.commission`; la conservación contable es
`Σ(disponible + reservado) + Σ comisiones = Σ créditos iniciales`.

- Puntos y saldo son magnitudes separadas: el motor (`packages/rules`) no conoce importes.
- Prohibido: compras, depósitos, retiradas, transferencias entre usuarios, canje y bonos.
- El cliente nunca envía entrada, comisión, saldo, premio, actor ni resultado; el servidor
  ignora cualquier campo adicional (prueba «ignora importes, identidad y resultados»).

### Ciclo de una sala

1. `WAITING`: crear o entrar no reserva saldo. Cada participante acepta expresamente
   enviando solo `conditionsVersion`; la reserva (disponible −5.000, reservado +5.000)
   es atómica dentro de la cola serializada del administrador.
2. Inicio solo con cuatro identidades distintas, todas con aceptación y reserva de la
   misma versión de condiciones.
3. Antes del inicio, salir o cancelar devuelve íntegra la reserva (`ENTRY_RELEASED`).
   La caducidad se evalúa en cada operación y al abrir el servidor tras un reinicio.
4. Cada sala guarda una copia de las condiciones con las que se creó. Si el servidor
   arranca con otra versión, las salas en espera se cancelan con devolución y las
   aceptaciones anteriores quedan invalidadas.
5. `PLAYING`: no se puede salir ni retirar la entrada. Una desconexión no es pase, bot,
   penalización ni derrota; se reconecta con el mismo asiento, mano y reserva. La sala
   muestra quién lleva más de 5 s sin conexión y la partida queda pendiente.
6. Anulación: solo con la aceptación de los cuatro. Devuelve las entradas, estado
   `CANCELLED`, sin campeón ni liquidación.
7. Liquidación: solo cuando el servidor confirma `MATCH_ENDED`. Consume las cuatro
   reservas (`ENTRY_CONSUMED`), abona el premio (`PRIZE_AWARDED`) y guarda
   `settlement` con `matchId` y `settledAt`. Un cierre +0 o una dominada que no llega
   a 100 no liquidan. `settle` es idempotente: reintentos o reinicios no duplican.

Decisión pendiente para una fase futura: abandono no recuperable después del inicio.
Hoy la partida queda pendiente indefinidamente salvo anulación unánime.

## HTTP

| Método y ruta | Autenticación | Uso |
| --- | --- | --- |
| `GET /api/simulated-conditions` | No | Condiciones vigentes (sin datos de cuentas) |
| `POST /api/test-identities` | No | Crea identidad de prueba y concede el crédito inicial |
| `GET /api/test-account` | Bearer identidad | Saldo propio y movimientos propios |
| `POST /api/competitions` | Bearer | Crea sala (sin reservar) |
| `GET /api/competitions/:code` | Bearer participante | Vista de sala, partida privada y liquidación |
| `POST /api/competitions/:code/join` | Bearer | Ocupa plaza; `COMPETITION_FULL` con cuatro |
| `POST /api/competitions/:code/accept` | Bearer participante | `{ conditionsVersion }` → reserva |
| `POST /api/competitions/:code/leave` | Bearer participante | Solo antes del inicio; devuelve |
| `POST /api/competitions/:code/cancel` | Bearer participante | Solo antes del inicio; devuelve a todos |
| `POST /api/competitions/:code/annul` | Bearer participante | Consentimiento de anulación |
| `POST /api/competitions/:code/commands` | Bearer participante | Mismo sobre idempotente que el online |

Las vistas nunca incluyen saldos de otros participantes ni manos ajenas.

## Límites por origen

Configurables por entorno (también en `compose.yaml`); `0` desactiva cada límite:

| Variable | Defecto | Efecto |
| --- | --- | --- |
| `DOMINO_RATE_LIMIT_MAX` / `DOMINO_RATE_LIMIT_WINDOW_SECONDS` | 600 / 60 | Peticiones por IP y ventana; `/health` y `OPTIONS` exentos |
| `DOMINO_IDENTITY_LIMIT_MAX` / `DOMINO_IDENTITY_LIMIT_WINDOW_SECONDS` | 20 / 86400 | Identidades creadas por IP y ventana; los intentos fallidos no cuentan |
| `DOMINO_TRUST_PROXY` | `false` (`true` en Compose) | Usa el último salto de `X-Forwarded-For` añadido por Nginx Proxy Manager |

Al superarlos: `429` con `Retry-After` y código `RATE_LIMITED` o
`IDENTITY_LIMIT_REACHED`. Ventana fija en memoria: válido para una instancia y se
reinicia con el proceso. Sin `DOMINO_TRUST_PROXY` una cabecera falsificada no abre otro
cupo; con él, solo es seguro si el contenedor no es accesible salvo por el proxy (sin
puertos publicados, como en `compose.yaml`). Un cliente activo sondea ~1 petición/s,
así que 600/min admite varias personas tras la misma IP.

## Almacenamiento: decisión

Se inspeccionó la arquitectura existente: servidor Node sin dependencias, una sola
instancia, volumen Docker exclusivo y snapshots JSON atómicos (`JsonFileMatchStore`,
`lobbies.json`). Para no introducir una base de datos ni tocar las de otros proyectos,
la economía usa el mismo patrón:

- `.data/simulated-competition.json`: identidades, salas, liquidaciones y registro de
  movimientos append-only; escritura en `.tmp` con modo 0600 y `rename` atómico.
- Todas las operaciones económicas pasan por una cola serializada; cada mutación se
  persiste antes de responder.
- Cantidades enteras; los saldos se pueden reconstruir sumando movimientos.
- La partida se guarda en `.data/matches` y la economía en otro archivo. Si el proceso
  cae entre ambos guardados, al abrir se detecta `MATCH_ENDED` sin liquidación y se
  liquida una sola vez (prueba de recuperación).
- El cliente guarda solo el token de la identidad de prueba (y el código de la sala
  activa); el saldo no depende de `localStorage`.

Límites: una sola instancia; sin cifrado en reposo, copias ni retención definidas.
Para algo más que un prototipo haría falta una base transaccional real (p. ej.
PostgreSQL con transacciones y restricciones de saldo no negativo).

## Identidad de prueba

Token aleatorio emitido por el servidor, separado del asiento. El cliente lo guarda en
`localStorage` (web y Android) para volver a entrar; la pantalla Cuenta muestra un
código de recuperación para usarlo en otro dispositivo. No es una identidad verificada:
cualquiera puede crear identidades nuevas, cada una con su crédito único.

## Comprobaciones automatizadas

`node apps/server/test/competition.test.ts` (11 pruebas):

- Crédito inicial único; saldo insuficiente; 21 reservas concurrentes del mismo saldo
  en salas distintas → exactamente 20 aceptadas, sin saldo negativo.
- Con exactamente 5.000 disponibles, dos aceptaciones simultáneas en dos salas
  distintas → una reserva y un `INSUFFICIENT_BALANCE`.
- Comisión del 5 %: redondeo (1000,2 → 1.000; 1000,6 → 1.001), rechazo de condiciones
  que no cuadran y partida completa liquidada con entrada 5.001, comisión 1.000 y
  premio 19.004, conservando la contabilidad.
- Cuatro aceptaciones antes del inicio; cancelación y caducidad con devolución única,
  también tras reinicio.
- Restauración de partida tras reinicio y liquidación única al campeón confirmado.
- Recuperación de una liquidación interrumpida, sin duplicar premio ni consumos.
- Cambio de condiciones: cancelación con devolución única y rechazo de versión antigua.
- Conservación contable: disponible y reservado de cada cuenta coinciden con la suma
  de sus movimientos y el total coincide con los créditos iniciales.
- Privacidad: la vista de sala no contiene saldos ni tokens; tokens falsos rechazados.
- Falsificación: importes, identidad, campeón o liquidación enviados por el cliente se
  ignoran.

`node apps/server/test/rate-limit.test.ts` (4 pruebas): ventana fija, `429` con
`Retry-After`, `/health` exento, tope de identidades sin contar fallos, cabecera
falsificada ignorada sin proxy de confianza y conteo por cliente detrás del proxy.

`apps/client/test/competition-presentation.test.ts` cubre el desglose, la distinción
entre premio recibido y resultado neto, «Liquidación pendiente» sin cálculo local, el
historial agrupado y los mensajes de error.

## Prueba con cuatro dispositivos

Requisito: un backend con este código accesible por los cuatro dispositivos (red local
o el VPS cuando esté desplegado). No hay backend público disponible todavía.

1. Red local: `DOMINO_DATA_DIR=.data DOMINO_ALLOWED_ORIGINS=http://<IP>:5173 npm run dev:server`
   y `npm run dev -- --host`. Abrir `http://<IP>:5173` en cada dispositivo. Para la APK,
   compilar con `VITE_API_BASE_URL` apuntando a un backend HTTPS accesible.
2. En cada dispositivo (o navegador/perfil distinto: la identidad se comparte entre
   pestañas del mismo navegador): Cuenta → crear cuenta de prueba. Comprobar 100.000
   disponibles y 0 reservados.
3. Dispositivo A: Mesas → Ver condiciones → Crear sala privada. Compartir el código.
4. B, C y D: Mesas → Entrar con código. Verificar las cuatro plazas y «Pendiente de aceptar».
5. Aceptar en tres dispositivos; comprobar «3 de 4», que la partida no empieza y que
   cada uno ve 95.000 disponibles y 5.000 reservados.
6. En el cuarto, intentar aceptar dos veces seguidas: solo una reserva.
7. Al aceptar el cuarto empieza la partida; comprobar indicador de bolsa y objetivo,
   y que cada dispositivo ve solo su mano.
8. Cortar la red de uno: los demás ven «sin conexión reciente» y la partida espera.
   Recuperar la red y recargar: mismo asiento, mano y reserva.
9. Jugar hasta 100. Comprobar campeón, clasificación y liquidación: campeón +15.000 neto
   (premio recibido 20.000), resto −5.000. Historial con movimientos confirmados.
10. Repetir con una sala cancelada antes del inicio y con una anulación unánime:
    devoluciones únicas y sin campeón.
11. Reiniciar el servidor durante una partida y comprobar que todo se conserva.
