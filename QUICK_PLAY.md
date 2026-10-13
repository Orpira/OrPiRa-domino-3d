# Jugar ahora — práctica gratuita con emparejamiento público

Estado: implementado en `feature/quick-play`, sin desplegar. Sin entrada, saldo ni
premio. No es la Competición de prueba y nunca la alimenta.

## Reglas de emparejamiento

- Cola pública en el servidor (`QuickPlayManager`), por orden de llegada: cada cuatro
  identidades en cola forman mesa al instante.
- Si la persona más antigua de la cola lleva 45 s esperando (provisional,
  `DOMINO_QUICK_PLAY_FILL_SECONDS`), se forma mesa con quienes haya (hasta cuatro) y se
  completa con bots del servidor llamados «Bot 1», «Bot 2»… y marcados `bot: true` en
  asientos, reloj, resultado e historial. Nunca se presentan como personas.
- Una identidad solo puede estar en una cola o partida pública a la vez: repetir
  «Buscar» devuelve el mismo ticket, y quien ya juega recupera su partida. Cancelar la
  saca de la cola.
- Usa la misma identidad de prueba que la Cuenta (token de servidor). Jugar ahora no
  mueve saldo.
- Los bots y los asientos en modo automático usan el mismo jugador automático y el
  mismo reloj de turno descritos en `COMPETITION_CONTRACT.md`.
- Dos modalidades con colas separadas: individual a 100 (por defecto) y parejas a 200
  (`{ "mode": "PAIRS" }` al entrar). Nunca se mezclan: cada cola forma sus mesas y
  cuenta su propia espera de 45 s. Quien ya está en una cola sigue en ella aunque pida
  la otra modalidad; para cambiar, cancela y vuelve a buscar.
- En parejas los asientos también van por orden de llegada: 0 y 2 contra 1 y 3. Con dos
  humanos y dos bots, los humanos quedan en parejas contrarias, cada uno con un bot de
  compañero (decisión del propietario, 14 oct 2026).
- Nunca hay bots en Competición de prueba: sus salas solo arrancan con cuatro
  identidades que aceptan y reservan, y una sala incompleta caduca sin rellenarse.

## Historial

Cada partida pública terminada se guarda en `.data/quick-play.json` con identificador,
modalidad (`mode`; ausente en las anteriores a las parejas = individual), inicio, fin, campeón y participantes (nombre, asiento, bot, puntuación final y si terminó
en modo automático). Ese historial alimenta la liga (`LEAGUE.md`).

## HTTP (Bearer con el token de la identidad de prueba)

| Ruta | Uso |
| --- | --- |
| `GET /api/quick-play` | Ticket en cola y/o partida actual o último resultado no cerrado |
| `POST /api/quick-play/join` | Entrar en la cola («Buscar partida», «Jugar otra»); cuerpo opcional `{ "mode": "INDIVIDUAL" \| "PAIRS" }`, sin cuerpo = individual |
| `POST /api/quick-play/cancel` | Salir de la cola |
| `POST /api/quick-play/dismiss` | Cerrar el resultado mostrado |
| `POST /api/quick-play/commands` | Sobre de comandos idempotente (incluye `RESUME_CONTROL`) |
| `GET /api/quick-play/history` | Partidas públicas propias |

## Límites conocidos

- La cola vive en memoria: un reinicio del servidor la vacía y quien estaba buscando
  debe volver a pulsar «Buscar partida». Las partidas en curso sí se restauran.
- Un resultado ya terminado deja de mostrarse tras un reinicio (queda en el historial).
- Una sola instancia; sin emparejamiento por nivel ni región.
