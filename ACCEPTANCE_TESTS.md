# Trazabilidad de aceptación

Ejecución: `npm test`. Archivo principal:
`packages/rules/test/acceptance.test.ts`.

| Casos | Cobertura de fase 1 | Estado |
|---|---|---|
| AC01–AC07 | set, peso, reparto, rechazo atómico, apertura y orden | Verificado |
| AC08–AC16 | orientación, dos extremos, dobles, rechazos, pases y cierre | Verificado |
| AC17–AC20 | cierres válidos buscados por partidas reproducibles, empates y 0–0 | Verificado |
| AC21–AC26 | dominada, +20, 100 inmediato, cierre a 0, ronda nueva, no repuntuación | Verificado |
| AC27 | idempotencia por `commandId` y reconexión | Fase 4 (adaptador servidor) |
| AC28 | revisión obsoleta y serialización lógica por revisión | Núcleo verificado; concurrencia de servidor en fase 4 |
| AC29 | proyección de jugador/espectador sin manos ajenas | Verificado |
| AC30 | mismo reparto y comandos, mismo resultado | Verificado |
| AC31 | 500 partidas generadas: 28 identidades, conexiones y puntuación | Verificado |
| AC32 | misma API/reglas; integración humano + tres bots hasta 100 | Verificado en fase 2 |
| AC33 | revisión consumida y turno de bot serializado/bloqueado en UI | Verificado en fase 2; animación 3D en fase 3 |
| AC34 | suspensión lógica no crea acciones; estado local en memoria | Parcial: núcleo verificado; checkpoint persistente pendiente |
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

Pendientes: AC27 y la parte online de AC28 requieren fase 4. El checkpoint durable
de suspensión de AC34 pertenece a la continuidad local futura. La interacción real
de animaciones de AC33 se comprobará en fase 3. No se declaran ejecutados.
