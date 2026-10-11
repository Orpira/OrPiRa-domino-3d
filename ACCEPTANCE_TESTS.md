# Trazabilidad de aceptación

Ejecución: `npm test`. Archivo principal:
`packages/rules/test/acceptance.test.ts`.

| Casos | Cobertura de fase 1 | Estado |
|---|---|---|
| AC01–AC07 | set, peso, reparto, rechazo atómico, apertura y orden | Verificado |
| AC08–AC16 | orientación, dos extremos, dobles, rechazos, pases y cierre | Verificado |
| AC17–AC20 | cierres válidos buscados por partidas reproducibles, empates y 0–0 | Verificado |
| AC21–AC26 | dominada, +20, 100 inmediato, cierre a 0, ronda nueva, no repuntuación | Verificado |
| AC27 | idempotencia por `commandId`, restauración y reconexión | Verificado en adaptador local de fase 4 |
| AC28 | revisión obsoleta y cola concurrente autoritativa | Verificado en adaptador local de fase 4 |
| AC29 | proyección de jugador/espectador sin manos ajenas | Verificado |
| AC30 | mismo reparto y comandos, mismo resultado | Verificado |
| AC31 | 500 partidas generadas: 28 identidades, conexiones y puntuación | Verificado |
| AC32 | misma API/reglas; integración humano + tres bots hasta 100 | Verificado en fase 2 |
| AC33 | revisión consumida, bot serializado y mesa 3D solo representativa | Verificado en fases 2–3 |
| AC34 | suspensión/desconexión no actúa; recuperación local y online | Verificado en fases 3–4 |
| AC35 | cierres repetidos no puntúan ni fuerzan campeón | Verificado |

Los cierres de AC17–AC19 no se fabrican modificando estados: se encuentran mediante
repartos completos con PRNG determinista y secuencias compuestas exclusivamente por
`legalActions`. Entre los fixtures reproducibles están semilla 4 (mínimo único) y
semilla 90 (empate P1/P3). El replay completo usa semilla 1 cinco veces: P0 domina
en cada ronda y llega exactamente a 100.

Pruebas de fase 2 adicionales: los bots reciben una `PlayerView` sin `hands` rivales,
solo producen acciones incluidas en `legalActions`, cada turno consume exactamente
una revisión, una partida local reproducible llega a 100, las rondas conservan el
marcador y el reinicio crea una partida nueva. El build de producción comprueba la
integración compilable de la interfaz.

La fase 4 local añade pruebas de idempotencia antes y después de restaurar,
concurrencia con una sola aceptación, actor derivado de sesión, vistas privadas,
desconexión sin efectos, conflicto de `commandId` y transporte HTTP autenticado.
La ampliación del lobby prueba cuatro sesiones/asientos únicos, espera hasta el
cuarto jugador, una partida online hasta 100, privacidad de las cuatro vistas y
recuperación desde archivos con reintento idempotente. La regresión de apertura
recorre selección del 6–6 en el cliente, `PLACE` sin extremo, respuesta HTTP y las
cuatro vistas confirmadas: ficha en mesa, seis fichas para el abridor y siguiente
turno antihorario. Quedan pendientes despliegue, TLS y persistencia de producción;
no se declaran ejecutados.

La presentación online añade tres pruebas puras: dominadas restantes hasta 100,
texto contractual de dominada/cierre y clasificación con empates. La integración
confirma que las cuatro sesiones reciben el mismo `matchResult` y que
`NEXT_ROUND` se rechaza con `WRONG_PHASE` después de `MATCH_ENDED`. Un cierre +0
permanece como resultado de ronda y no activa la pantalla final.

La interacción de colocación tiene regresiones para extremo único, LEFT/RIGHT,
extremos con igual valor, apertura sin extremo, ficha inválida, doble toque y
selección invalidada por cambio de revisión. Cliente local y online consumen esta
misma interpretación de `legalActions`; no replican compatibilidad de fichas.

El adaptador HTTP añade una prueba de CORS: admite únicamente los orígenes HTTPS
configurados para web y Android, responde al preflight y rechaza un origen ajeno.

La fase 3 añade cuatro pruebas: serialización/restauración exacta, rechazo de datos
corruptos, turno de cuatro humanos sin bots y borrado del checkpoint. La pantalla
de relevo mantiene la mano fuera del DOM hasta la confirmación del siguiente jugador.
