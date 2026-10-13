# Liga — clasificación por temporadas

Estado: implementada en `feature/league`, sin desplegar. Los puntos de liga no son
COP simulados: no tienen valor, no se compran y no se canjean. Sin premios ni
recompensas.

## Qué puntúa

- Solo las partidas de «Jugar ahora» terminadas (`MATCH_ENDED`) en **Latino** (individual o
  parejas). Las modalidades casuales («con robo») no puntúan (decisión del propietario, 14 oct 2026). Las salas entre
  amigos y la Competición de prueba no dan puntos.
- Puntos = base por posición × (humanos en la mesa / 4), redondeando hacia abajo.

| Posición | Base | 4 humanos | 3 humanos | 2 humanos | 1 humano |
| --- | --- | --- | --- | --- | --- |
| 1.º | 40 | 40 | 30 | 20 | 10 |
| 2.º | 20 | 20 | 15 | 10 | 5 |
| 3.º | 10 | 10 | 7 | 5 | 2 |
| 4.º | 4 | 4 | 3 | 2 | 1 |

- Parejas (decisión del propietario, 14 oct 2026): la fórmula no cambia. Los dos
  compañeros comparten marcador, así que empatan: cada ganador queda 1.º (40) y cada
  perdedor 3.º (10), con el mismo × humanos/4 y el mismo 0 en modo automático.
- Un asiento que termina en modo automático recibe 0 (cuenta como partida jugada).
- Los bots ocupan posiciones en la mesa, pero no reciben puntos ni aparecen en la
  clasificación.
- Empates: el mismo criterio que el resultado final (`finalRanking`), un ranking de
  competición por puntuación. Los empatados comparten la mejor posición y la siguiente
  se salta: 100, 40, 40, 20 → 1.º, 2.º, 2.º, 4.º. El campeón siempre es único.
- Concesión única por `matchId`: se aplica al registrarse el final y, además, al
  arrancar el servidor y en cada pasada del reloj se reconcilia con el historial de
  «Jugar ahora». Si el proceso cae entre ambos guardados, los puntos llegan al
  reiniciar, sin duplicarse.

## Temporadas

- Una por mes natural en `America/Bogota` (UTC−5): de las 00:00 del día 1 a las 00:00
  del día 1 del mes siguiente. Identificador `AAAA-MM`.
- Una partida pertenece a la temporada de su hora de final. Si llega con retraso y su
  temporada ya cerró, se suma a la temporada abierta y no reabre el archivo.
- Al cerrar se archivan los puntos, la posición (con empates compartidos) y el rango
  final de cada identidad, y la siguiente empieza con 0. El cierre se evalúa en cada
  pasada del reloj y al arrancar, recorre los meses vencidos uno a uno y ocurre una
  sola vez por temporada.

## Rangos (umbrales provisionales de puntos de temporada)

| Rango | Desde |
| --- | --- |
| Doble blanca | 0 |
| Doble uno | 40 |
| Doble dos | 120 |
| Doble tres | 250 |
| Doble cuatro | 450 |
| Doble cinco | 700 |
| Doble seis | 1.000 |

Criterio: con cuatro humanos una partida media da unos 18,5 puntos por persona
((40 + 20 + 10 + 4) / 4). Doble uno se alcanza con una victoria o dos o tres partidas;
Doble tres, con unas 14 partidas medias al mes; Doble seis exige unas 54 partidas
medias o 25 victorias en el mes, para que el rango alto sea poco frecuente.

## Configuración del servidor

| Variable | Defecto |
| --- | --- |
| `DOMINO_LEAGUE_POSITION_POINTS` | `40,20,10,4` |
| `DOMINO_LEAGUE_RANK_THRESHOLDS` | `0,40,120,250,450,700,1000` (7 valores crecientes, el primero 0) |
| `DOMINO_LEAGUE_TIME_ZONE` | `America/Bogota` |

Una configuración inválida impide arrancar (`INVALID_LEAGUE_RANKS` / `INVALID_LEAGUE_POINTS`).

## Almacenamiento

`.data/league.json`, con el mismo patrón que el resto (escritura atómica con
`rename`, modo 0600, cola serializada): temporada abierta, clasificación, concesiones
por `matchId` con su desglose y archivo de temporadas cerradas.

## HTTP (solo lectura)

| Ruta | Uso |
| --- | --- |
| `GET /api/league` | Temporada, días restantes, rangos, 50 primeros (alias, rango, puntos, posición) y la fila del espectador si envía su token |
| `GET /api/league/history` | Bearer: puntos por partida con desglose y temporadas archivadas propias |

No existe ninguna ruta que acepte puntos, rango ni posición: `POST` responde 405. La
vista de «Jugar ahora» añade `ranks` (rango de cada humano) y `league` (desglose de la
concesión del espectador). La Competición de prueba muestra el rango junto al nombre,
pero no concede puntos. Las salas entre amigos no tienen identidad persistente y no
muestran rango.

## Pruebas

`node apps/server/test/league.test.ts` (7) y `node apps/client/test/league-presentation.test.ts` (2).
