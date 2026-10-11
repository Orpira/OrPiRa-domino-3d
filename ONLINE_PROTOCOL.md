# Protocolo online local — fase 4

Estado: experiencia completa para red local; no desplegada ni preparada para producción.

## Lobby privado

`POST /api/lobbies` crea una sala y concede la primera sesión. Los otros jugadores
usan `POST /api/lobbies/:code/join`. Los asientos P0–P3 se asignan en orden de
entrada y la partida comienza automáticamente al entrar el cuarto jugador. El código
solo localiza la sala: consultar o jugar siempre exige además el `sessionId` secreto.

## Autoridad y privacidad

`AuthoritativeRoom` conserva el único `GameState` completo. Cada `sessionId` está
asociado en servidor a un jugador y asiento. Los mensajes del cliente no incluyen
`actorId`; se deriva de la sesión. Jugadores reciben `PlayerView` con su mano y
cantidades rivales; espectadores reciben `ownHand: null`. Nunca se devuelve `hands`.

## Comandos

```json
{
  "commandId": "uuid-del-cliente",
  "expectedRevision": 14,
  "command": { "type": "PLACE", "tileId": "2-6", "side": "RIGHT" }
}
```

También admite `PASS` y `NEXT_ROUND`. La sala procesa una cola por partida. Una
revisión vieja produce `STALE_REVISION` con la vista confirmada para sincronizar.
El mismo `commandId` y contenido devuelve exactamente la respuesta almacenada; si
se reutiliza con otro contenido produce `COMMAND_ID_CONFLICT`.

## HTTP

- `GET /health`
- `POST /api/lobbies`
- `POST /api/lobbies/:code/join`
- `GET /api/lobbies/:code`
- `POST /api/lobbies/:code/commands`
- `GET /matches/:matchId`
- `POST /matches/:matchId/commands`

Las rutas privadas requieren `Authorization: Bearer <sessionId>`. Las respuestas
usan `cache-control: no-store`. Crear o entrar concede únicamente la sesión del
asiento solicitado, nunca las credenciales de los demás.

Competición de prueba (COP simulados): rutas `/api/simulated-conditions`,
`/api/test-identities`, `/api/test-account` y `/api/competitions/...`, descritas en
`COMPETITION_CONTRACT.md`. Usan el mismo sobre de comandos idempotente.

## Continuidad

`MatchStore` guarda estado, sesiones y resultados idempotentes. `JsonFileMatchStore`
escribe snapshots atómicos con modo 0600 bajo `.data/matches`; el lobby guarda sus
metadatos en `.data/lobbies.json`. Las pruebas reconstruyen el administrador desde
disco y reintentan el mismo comando tras reiniciar. Desconectar no muta el estado.

## Pendiente antes de producción

- Proveedor y región de alojamiento, dominio y TLS.
- Identidad real y rotación/expiración de sesiones.
- Almacenamiento de producción con cifrado, copias y política de retención.
- Límite de tamaño, rate limiting, validación estructural endurecida y observabilidad.
- Pruebas automatizadas de navegador y red degradada real.
- Pruebas de carga, seguridad y recuperación de proceso/instancia.
