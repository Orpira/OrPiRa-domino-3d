# Dominó 3D — Contrato funcional definitivo y prompt maestro
Versión 1.0 · 11 de octubre de 2026 · Preparado para el agente implementador

## 1. Autoridad y alcance
Este documento fija las decisiones confirmadas para el motor. Prevalece sobre propuestas anteriores. «Latino» identifica este perfil personalizado; no implica incorporar automáticamente otras reglas regionales.

Producto: dominó visual 3D, para web, Android e iPhone, con juego contra IA, juego local y multijugador online. Todas las modalidades utilizan el mismo contrato. El motor no depende del renderizado, de las animaciones ni de la red.

Decisiones confirmadas: cuatro jugadores individuales; doble seis; apertura con 6–6 en cada ronda; turnos antihorarios; pasar cuando no se puede jugar; objetivo 100; dominada 20 puntos fijos; cierre por menor suma de puntos en mano, 0 puntos fijos; empate en cierre sin puntos; victoria de partida inmediata al alcanzar el objetivo.

Convenciones operativas que completan el contrato: repartir siete fichas a cada jugador, sin pozo; cadena con dos extremos y sin ramificaciones; pasar solo cuando no existe colocación legal; cuatro pases consecutivos para cierre; repetir reparto completo en cada ronda. Son especificaciones explícitas de implementación, no nuevas modalidades.

Fuera del reglamento: penalizaciones por tiempo, abandonos, sustitución automática por bots, apuestas, bonos, clasificación competitiva y desempates por estadísticas. No inventarlas. Una interrupción técnica no equivale a un pase o a un cierre.

## 2. Configuración inmutable del perfil
| Campo | Valor |
|---|---|
| ruleSetId | latin-individual-double6-v1 |
| players | 4 |
| teams | individual |
| tileSet | double6 |
| tilesPerPlayer | 7 |
| drawPile | none |
| openingTile | 6-6 |
| openingFrequency | every-round |
| turnDirection | counterclockwise |
| noLegalMove | pass |
| voluntaryPass | forbidden |
| dominoScoring | fixed |
| dominoPoints | 20 |
| blockedWinner | lowest-hand-pip-total |
| blockedScoring | fixed |
| blockedPoints | 0 |
| blockedTie | no-points-no-winner |
| targetScore | 100 |
| matchFinish | immediate-after-round-score |

No exponer opciones para cambiar estos valores en la primera versión. El motor puede admitir futuros perfiles, pero este identificador conserva sus reglas y no cambia silenciosamente.

## 3. Fichas y reparto
Una ficha se identifica de forma canónica por (a,b), con enteros 0 ≤ a ≤ b ≤ 6. Por ejemplo, 2–5 y 5–2 son una única ficha, con diferentes orientaciones sobre la mesa. Hay exactamente 28 fichas, incluidos siete dobles y 0–0. Su peso es a+b: 0–0 vale cero y 6–6 vale doce.

Al iniciar la partida, los cuatro marcadores valen cero. En cada ronda se mezclan las 28 fichas y se entregan siete a cada jugador. No hay pozo ni posibilidad de robar. Las puntuaciones acumuladas se conservan entre rondas; manos, mesa, pases y resultado se reinician.

El reparto debe producir una partición exacta: ninguna ficha duplicada, omitida o asignada a dos jugadores. Un reparto inválido se rechaza sin crear una ronda parcialmente válida. No hay repetición por tener muchos dobles, una mano débil u otra preferencia regional.

Para pruebas y reproducción se permite un reparto explícito o aleatoriedad inyectada. En producción online el servidor reparte y nunca comunica la semilla o las manos rivales antes de terminar la ronda.

## 4. Asientos y orden de juego
Los asientos son estables durante la partida y se numeran en sentido horario vistos desde arriba: P0 abajo, P1 izquierda, P2 arriba, P3 derecha. La sucesión antihoraria es P0 → P3 → P2 → P1 → P0.

Fórmula: nextSeat = (currentSeat + 3) mod 4. La cámara puede rotar para mostrar al usuario abajo, pero la identidad y la sucesión lógica de los asientos no cambian.

Cada ronda empieza el poseedor del 6–6, con independencia del ganador o del abridor anterior. Debe colocar esa ficha; no puede abrir con otra ni pasar. La apertura deja extremos 6 y 6, retira el 6–6 de su mano y cede el turno al siguiente asiento antihorario.

## 5. Colocaciones legales
Solo puede actuar el jugador del turno, durante una ronda activa. La ficha debe pertenecer a su mano y no estar ya colocada.

Con la mesa vacía solo es legal abrir con 6–6, sin especificar extremo. Con mesa abierta se debe indicar LEFT o RIGHT; al menos una cara de la ficha debe coincidir con el extremo elegido. El motor deduce la orientación y devuelve la ficha orientada. No confiar en una rotación visual enviada por el cliente.

Si el extremo izquierdo es L y el derecho R:
- LEFT exige una cara igual a L. El nuevo extremo izquierdo es la otra cara; R no cambia.
- RIGHT exige una cara igual a R. El nuevo extremo derecho es la otra cara; L no cambia.
- Un doble coincidente conserva el valor del extremo. Su dibujo transversal no añade ramas ni obliga a cubrirlo.
- Si una ficha es válida en ambos extremos, el jugador elige y ambas opciones aparecen como acciones legales.
- Si L = R, LEFT y RIGHT siguen siendo elecciones válidas aunque tengan el mismo efecto en los valores externos.

Cada colocación aceptada retira una ficha, añade una ficha orientada a la cadena y pone el contador de pases a cero. Si la mano queda vacía, resolver dominada inmediatamente; si no, avanzar el turno. No exigir un pase posterior a la última ficha.

La cadena geométrica 3D puede doblarse para caber en la mesa; sus curvas no cambian conexiones, orden ni extremos lógicos. No existe bonificación por sumar múltiplos de cinco, por dobles o por una ficha concreta.

## 6. Pase y cierre
PASS es legal únicamente si el jugador del turno no tiene ninguna ficha colocable en ninguno de los dos extremos. Si tiene al menos una, rechazar el pase sin mutación. No hay robo ni elección de saltar turno voluntariamente.

Un pase aceptado conserva mesa y mano, incrementa consecutivePasses y avanza el turno, excepto si completa el cierre. Cualquier colocación posterior reinicia el contador a cero.

La ronda se cierra al cuarto pase consecutivo aceptado de los cuatro jugadores. No resolver por percepción visual de bloqueo ni por tres pases. El estado que produce el cuarto pase y el resultado de cierre se confirman en una única operación.

Al cerrar:
1. Calcular el peso de cada mano restante.
2. Obtener el mínimo y todos los jugadores que lo alcanzan.
3. Si hay un único mínimo, registrar al jugador como ganador de la ronda por cierre.
4. Si hay dos, tres o cuatro jugadores empatados en el mínimo, registrar empate y winnerId = null.
5. En ambos casos, adjudicar cero puntos a todos.
6. Terminar la ronda y permitir un nuevo reparto, manteniendo el marcador.

No desempatar por cantidad de fichas, asiento, doble más alto, último jugador, puntuación acumulada o azar. Ganar por cierre y sumar puntos son conceptos separados.

## 7. Dominada y puntuación de partida
Dominada significa que una colocación legal deja sin fichas al jugador que la ejecutó. Ese jugador gana la ronda y recibe exactamente 20 puntos; los otros tres reciben cero.

No sumar puntos de las manos rivales ni restar puntos. No acumular ni arrastrar bonificaciones de rondas cerradas.

| Resultado | Ganador de ronda | Incremento |
|---|---|---|
| Dominada | Quien juega su última ficha | +20 al ganador |
| Cierre con mínimo único | Quien tiene menor peso | 0 a todos |
| Cierre con mínimo empatado | Ninguno | 0 a todos |

Después de aplicar una sola vez la puntuación de la ronda, comprobar score ≥ 100. Si se alcanza, finalizar la partida dentro de la misma transición; no abrir otra ronda ni esperar otra vuelta. «Immediate» no significa puntuar durante jugadas intermedias.

En partidas válidas iniciadas en cero, los marcadores son múltiplos de 20; el campeón alcanza exactamente 100 tras su quinta dominada. La comprobación ≥ es defensiva. La primera versión no permite importar puntuaciones arbitrarias.

Una ronda cerrada no puede crear un campeón, porque no añade puntos. No hay máximo de rondas confirmado: muchas rondas cerradas pueden prolongar indefinidamente una partida. No resolver ese caso otorgando puntos artificiales.

Registrar por separado dominadas, cierres ganados y empates si se muestran estadísticas; no usarlos para cambiar el ganador.

## 8. Estado, comandos y eventos
Estado mínimo:
- rulesVersion, matchId, roundId, roundNumber, revision.
- phase: READY, ROUND_ACTIVE, ROUND_ENDED o MATCH_ENDED.
- Cuatro jugadores con playerId, seat y score; manos privadas.
- Cadena de fichas orientadas, extremos o null, openingPlayerId, currentPlayerId o null.
- consecutivePasses entre 0 y 4.
- Resultado de ronda: reason DOMINO o BLOCKED, winnerId nullable, tiedPlayerIds, handPipTotals y scoreDeltas.
- Resultado de partida: campeón y marcador final.

ROUND_ACTIVE con cadena vacía representa la apertura pendiente: solo el dueño del 6–6 puede actuar. ROUND_ENDED y MATCH_ENDED no admiten PLACE ni PASS. En MATCH_ENDED también se prohíbe NEXT_ROUND; otra partida requiere nueva identidad.

Comandos:
- START_MATCH: cuatro jugadores únicos, asientos únicos, perfil exacto.
- PLACE: actorId, tileId, side opcional solo para apertura.
- PASS: actorId.
- NEXT_ROUND: únicamente desde ROUND_ENDED; limpia la ronda y reparte otra.
- Las envolturas online añaden commandId y expectedRevision.

Consultas: legalActions(state, actorId), getPlayerView(state, viewerId), getRoundResult(state).

La transición devuelve estado nuevo y eventos ordenados, o un error tipado sin modificar el estado. Eventos orientativos: MATCH_STARTED, ROUND_STARTED, TILE_PLACED, TURN_PASSED, TURN_CHANGED, ROUND_ENDED, SCORE_APPLIED, MATCH_ENDED. SCORE_APPLIED incluye los cuatro deltas, incluso si todos son cero. La última jugada no emite un nuevo turno activo.

Errores mínimos: INVALID_CONFIGURATION, INVALID_DEAL, WRONG_PHASE, NOT_YOUR_TURN, TILE_NOT_OWNED, INVALID_OPENING, INVALID_SIDE, TILE_DOES_NOT_MATCH, PASS_FORBIDDEN, STALE_REVISION. No utilizar la UI como única validación.

El núcleo es determinista para igual estado y comando. La aleatoriedad pertenece al reparto inyectado, no a la decisión de reglas. No contiene acceso a red, almacenamiento, reloj o motor 3D.

## 9. Invariantes y transacciones
Durante una ronda, las 28 identidades se conservan exactamente entre cuatro manos y mesa. Cada conexión es compatible. El número de fichas de cada mano coincide con sus identidades reales.

Una acción aceptada modifica el estado una sola vez. Una rechazada no cambia manos, mesa, turno, pases, marcador ni revisión. La puntuación de cada roundId se aplica una sola vez, incluso tras recarga, reintento o reconexión.

El final de ronda, su resultado, el incremento y el final de partida deben confirmarse atómicamente. No reconstruir puntos sumando otra vez eventos que ya se aplicaron.

Si se detecta corrupción, detener la sesión y reportarla; no «reparar» inventando fichas, resultados o puntos.

## 10. Modalidades, privacidad y continuidad
Contra IA: un humano y tres bots por defecto. Cada bot recibe su mano, mesa, historial público, cantidades restantes y marcador; nunca las identidades de las manos rivales. Sus decisiones deben ser acciones legales; dificultad cambia estrategia, no reglas.

Local: admitir cuatro humanos en el mismo dispositivo y combinaciones con bots. Antes de revelar la mano del siguiente humano, mostrar una pantalla de relevo que oculte la anterior. La privacidad frente a quien mira físicamente la pantalla no puede garantizarse.

Online: cuatro asientos, con autoridad del servidor sobre reparto, turnos, legalidad y resultado. El cliente solicita acciones y representa estados confirmados. Mandar manos privadas solo a sus titulares; al finalizar la ronda se pueden revelar para explicar el resultado. Espectadores reciben vista pública.

El servidor procesa en serie los comandos de cada partida. Reintentar el mismo commandId devuelve el mismo resultado sin duplicar una jugada o puntos. El actor se obtiene de la sesión autenticada, no se acepta identidad arbitraria del cliente. Una revisión obsoleta se rechaza y se sincroniza al cliente. Reconectar conserva asiento y estado confirmado.

Mientras no exista una política adicional confirmada, desconexión no provoca pase, penalización, derrota ni sustitución automática. La partida espera y permite reanudar; esto puede bloquear una sesión online, y debe comunicarse en la interfaz. Salir de una sesión no concede puntos a otros. En local se conserva un checkpoint; suspensión de la aplicación no termina la ronda.

## 11. Casos límite y criterios de aceptación
Cada caso debe transformarse en prueba automatizada del núcleo o de su adaptador según corresponda. Los escenarios de cierre se construyen con repartos y secuencias válidos; no basta inventar un estado imposible.

| ID | Escenario | Resultado esperado |
|---|---|---|
| AC01 | Construcción doble seis | 28 identidades únicas; peso total 168 |
| AC02 | Reparto normal | 7 fichas por jugador; sin pozo; 6–6 en una sola mano |
| AC03 | Ficha duplicada, ausente o valores inválidos | Rechazo completo del reparto |
| AC04 | Primera ronda y rondas posteriores | Abre siempre el poseedor actual de 6–6 |
| AC05 | Abridor intenta otra ficha o pasa | Rechazo; estado intacto |
| AC06 | Apertura 6–6 aceptada | Mano de 6 fichas; extremos 6/6; turno antihorario |
| AC07 | Recorrer los asientos | P0 → P3 → P2 → P1 → P0 |
| AC08 | Extremos 2/5; jugar 2–4 a LEFT | Nuevos extremos 4/5 |
| AC09 | Extremos 2/5; jugar 3–5 a RIGHT | Nuevos extremos 2/3 |
| AC10 | Extremos 2/5; ficha 2–5 | LEFT produce 5/5; RIGHT produce 2/2 |
| AC11 | Doble coincidente | Extremo igual; sin ramas, bonus ni turno extra |
| AC12 | Ficha incompatible, ajena o actor incorrecto | Rechazo sin mutación |
| AC13 | Ficha legal solo en un extremo e intento de pase | PASS_FORBIDDEN |
| AC14 | Ninguna colocación legal | PASS aceptado; mano y mesa intactas |
| AC15 | Tres pases y luego una colocación | Contador vuelve a cero; ronda activa |
| AC16 | Cuarto pase consecutivo válido | Un cierre y un único resultado; ningún turno nuevo |
| AC17 | Cierre; pesos 5, 9, 12, 18 | Gana quien tiene 5; deltas 0/0/0/0 |
| AC18 | Cierre; pesos 5, 5, 12, 18 | Empate de dos; sin ganador y sin puntos |
| AC19 | Tres o cuatro empatan en mínimo | Sin ganador; todos los mínimos registrados |
| AC20 | Calcular mano con 0–0 | Aporta cero; no se ignora su existencia |
| AC21 | Última ficha legal | Dominada; exactamente +20; ronda termina inmediatamente |
| AC22 | Jugador con 80 domina | Llega a 100; partida termina en la misma transición |
| AC23 | Jugador con 80 gana por cierre | Sigue en 80; puede haber siguiente ronda |
| AC24 | Cinco dominadas del mismo jugador con cierres intercalados | Campeón con 100, sin contar cierres |
| AC25 | Rondas nuevas | Reparto completo; contador y mesa reiniciados; marcador conservado |
| AC26 | Acción tras final de ronda o partida | Rechazo; sin segundo incremento |
| AC27 | Repetición de comando online y reconexión | Mismo resultado; puntuación aplicada una sola vez |
| AC28 | Comandos concurrentes o revisión vieja | Solo secuencia autorizada; resto rechazado/sincronizado |
| AC29 | Vista de bot, rival o espectador | No contiene identidades privadas ajenas |
| AC30 | Replay con igual reparto y comandos | Mismo estado, eventos y resultado |
| AC31 | Secuencias generadas de acciones legales | Conservación de 28 fichas, extremos válidos y puntuación correcta |
| AC32 | IA y humano en distintas modalidades | Misma legalidad y mismos resultados con igual secuencia |
| AC33 | Animación pendiente o doble clic | No acepta segunda jugada ni bloquea estado confirmado |
| AC34 | Desconexión o suspensión | Conserva estado; no genera pases ni puntos |
| AC35 | Varias rondas cerradas sin dominadas | Partida sigue sin añadir puntos ni forzar campeón |

No usar datos irreales para AC17–AC19: esos pesos ilustran el cálculo; las pruebas de integración deben encontrar o construir secuencias legales que produzcan mínimos únicos y empates.

Criterio de cierre del motor: todos los casos aplicables pasan, existe prueba de propiedades sobre secuencias legales y al menos una partida completa reproducible hasta 100; ninguna dependencia del renderizador o servidor dentro del núcleo.

## 12. Arquitectura y proceso autónomo propuestos
Esta es una decisión de diseño para el agente; las reglas anteriores son obligatorias. El agente verificará versiones, compatibilidad y documentación oficial al implementar.

Estructura sugerida:
- packages/rules: dominio puro TypeScript, validaciones, transiciones y pruebas.
- packages/bots: estrategias sobre vistas permitidas.
- packages/protocol: comandos, eventos, proyecciones y validación de mensajes.
- apps/client: React para menús e interfaz; Three.js para mesa y fichas 3D.
- apps/server: Node.js, transporte de tiempo real y persistencia autoritativa.
- Adaptadores móviles con Capacitor, conservando el mismo cliente y motor.

Preferir fichas 3D procedurales y materiales livianos; evitar que descargar assets sea requisito para validar reglas. Accesibilidad: controles táctiles amplios, selección por clic/toque, alternativa a arrastrar, resaltado de extremos válidos, texto del turno y opción de reducir animaciones.

Fases con entregas comprobables:
1. Motor puro y suite de aceptación. Entregar reporte y replay; no empezar la mesa 3D antes de validar.
2. Partida local completa con bots y una interfaz mínima de diagnóstico.
3. Cliente 3D responsive y relevo local, con prueba en móvil y escritorio.
4. Servidor online, privacidad, idempotencia, reconexión y recuperación.
5. Persistencia, empaquetado Android/iOS y pruebas en dispositivos.
6. Preparación de publicación y operación.

El agente elige detalles reversibles, implementa, ejecuta, inspecciona y corrige. Solo consulta decisiones funcionales nuevas o bloqueos reales de acceso/cuentas. No pide al usuario abrir un motor gráfico ni escribir código. La firma/publicación móvil necesita recursos y credenciales del titular; no afirmar que se realizó sin evidencia.

En cada fase: cambios pequeños en Git, comprobaciones apropiadas, evidencias reales y actualización de CURRENT_STATE.md. Al detenerse dejar estado reproducible, comandos, fallos y siguiente tarea. No comenzar una nueva función para ocultar pruebas fallidas.

## 13. Revisión con seis sombreros
- Blanco: todos los valores funcionales confirmados están fijados; todavía no están fijadas penalizaciones, tiempos ni abandonos competitivos.
- Rojo: se busca que el creador describa y revise el juego en español sin manejar herramientas técnicas.
- Negro: cierres de cero puntos prolongan partidas; online puede quedar esperando por desconexión; bots pueden filtrar información si reciben estado completo.
- Amarillo: puntuación simple, motor reutilizable y apertura uniforme facilitan explicación y pruebas.
- Verde: ofrecer partidas reanudables y mostrar cierres ganados como estadística, sin modificar el marcador. Una modalidad rápida futura tendría otro perfil.
- Azul: conservar exactamente el contrato y validar el núcleo antes de inversión visual y multijugador.

Consecuencias: a corto plazo, dominadas y cierres son fáciles de distinguir. A largo plazo, no hay duración máxima garantizada y el reglamento deberá identificarse como variante personalizada.
Impacto/esfuerzo: motor y pruebas tienen alto impacto y esfuerzo moderado; 3D tiene impacto visual alto y esfuerzo mayor; online y móvil elevan esfuerzo operativo.
Mitigaciones: reanudación para partidas largas; servidor autoritativo e idempotencia para red; vistas privadas para bots; pruebas de reglas antes de mejorar gráficos.

## 14. Prompt maestro de Vibe Coding
Copiar el bloque y adjuntar este mismo documento al agente.

---
Actúa como agente desarrollador principal de mi aplicación Dominó 3D. Yo soy el responsable del producto y doy instrucciones en español. Encárgate de la implementación técnica mediante lenguaje natural: inspecciona el entorno, decide detalles reversibles, programa, ejecuta pruebas, revisa resultados y corrige errores. No me pidas abrir Unity, Godot ni otra herramienta gráfica, ni escribir código.

Tu fuente de verdad es el documento «Dominó 3D — Contrato funcional definitivo y prompt maestro», versión 1.0. Léelo completo. No sustituyas reglas personalizadas por reglas regionales o por tu interpretación de lo que debería ser un dominó latino.

Reglas obligatorias:
- 4 jugadores individuales, doble seis, 28 fichas, 7 por jugador, sin pozo.
- En CADA ronda abre el poseedor de 6–6 jugando obligatoriamente esa ficha.
- Turnos antihorarios con asientos estables; cadena de dos extremos y sin ramificaciones.
- Solo pasar cuando no existe jugada legal; no robar ni pasar voluntariamente.
- Dominada: ganador +20 puntos fijos, los demás +0.
- Cuatro pases consecutivos cierran la ronda. Una colocación reinicia los pases.
- Cierre: gana quien tenga menor suma en mano si es único; TODOS reciben 0 puntos.
- Empate en el menor peso: ningún ganador, TODOS reciben 0 puntos.
- Objetivo 100. Finalizar inmediatamente tras aplicar el resultado que alcanza el objetivo.
- Los cierres no suman puntos ni alteran reglas, y no hay máximo de rondas.
- Cada nueva ronda reparte todo y vuelve a abrir con 6–6.

Producto final: visual 3D; web, Android e iPhone; contra IA, local y online. Construye un único motor de reglas compartido y desacoplado del renderizado, bots, transporte y almacenamiento. Usa la arquitectura propuesta como punto de partida y verifica la documentación oficial de las tecnologías y versiones elegidas. No utilices Phaser como sustituto silencioso del requisito 3D.

Empieza ahora por la fase 1: revisa el repositorio y sus instrucciones, registra el contrato y crea el motor puro con todas las pruebas de aceptación aplicables. Si no existe proyecto, crea la estructura mínima. No construyas aún una mesa 3D ni un multijugador para aparentar progreso. No te detengas después de presentar un plan: completa la fase autorizada, ejecuta las pruebas y entrega evidencia.

Procedimiento:
1. Inspecciona el estado existente y protege trabajo ajeno.
2. Mantén trazabilidad entre reglas y pruebas AC01–AC35.
3. Implementa transiciones deterministas, reparto inyectable y errores sin mutación.
4. Prueba dominada, cierre único de cero puntos, empates, apertura repetida, orden antihorario, quinta dominada e invariantes.
5. Añade fixtures válidos, pruebas de propiedades y replay de partida completa hasta 100.
6. Ejecuta controles de tipos y pruebas; corrige errores y vuelve a comprobar lo afectado.
7. Mantén README, RULES_CONTRACT.md, ACCEPTANCE_TESTS.md y CURRENT_STATE.md.
8. Entrega resumen en español: qué funciona, pruebas realmente ejecutadas, limitaciones y cómo reproducirlo.

En fases posteriores, cada bot solo verá información permitida. Online usará autoridad del servidor, validación, comandos idempotentes y reconexión. Ningún doble clic, animación o reintento podrá duplicar fichas o puntos. No inventes derrotas por desconexión ni penalizaciones.

Puedes escoger nombres internos, librerías auxiliares y organización reversible sin preguntarme. Consulta únicamente si falta una decisión funcional que cambia este contrato o si existe un bloqueo real que requiere acceso o recursos míos. No confundas una preferencia de implementación con un requisito que deba decidir yo.

No agregues apuestas, compras, anuncios, chat, cuentas externas ni nuevas reglas sin solicitud. No declares una prueba, instalación, build o publicación como realizada si no la has ejecutado. Si una herramienta no está disponible, describe el bloqueo y deja preparado todo lo que sí pueda completarse.

Al finalizar cada fase, deja cambios verificables y un estado de continuación preciso. Continúa con nuevas fases cuando yo las autorice; no publiques en tiendas ni contrates servicios sin autorización.
---

## 15. Decisión y siguiente acción
1. Mejor opción recomendada: implementar primero el motor puro con este contrato.
2. Segunda mejor alternativa: motor acompañado de una interfaz mínima de diagnóstico textual para revisar partidas.
3. Justificación: ambas preservan el reglamento; el motor primero tiene menor esfuerzo y detecta fallos antes de invertir en 3D y red.
4. Plan de acción: entregar este archivo al agente, ejecutar el prompt, revisar las pruebas de fase 1 y después autorizar la partida local y la mesa 3D.
5. Señales de alerta: puntos por cierre, apertura distinta de 6–6, pases voluntarios, bots con manos rivales, marcador duplicado o pruebas construidas con estados imposibles. Cualquiera exige corregir antes de avanzar.

