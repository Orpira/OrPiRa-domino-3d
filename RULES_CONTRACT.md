# Contrato de reglas del motor

Fuente normativa completa: `Domino_3D_Contrato_Definitivo_y_Prompt_Maestro.md`,
versión 1.0. Este resumen no la sustituye.

- Perfil inmutable `latin-individual-double6-v1`: cuatro jugadores individuales,
  doble seis, siete fichas por persona y sin pozo.
- Cada ronda reparte las 28 fichas y empieza con el poseedor de 6–6, quien debe
  colocarla. Los asientos son estables y el orden es P0 → P3 → P2 → P1 → P0.
- La cadena tiene solo dos extremos. El motor orienta las fichas; los dobles no
  crean ramas, puntos ni turnos adicionales.
- Pasar es obligatorio y posible únicamente sin colocación legal. Una colocación
  reinicia los pases; el cuarto pase consecutivo cierra la ronda.
- Dominada: quien vacía su mano recibe exactamente 20 puntos. Cierre: mínimo único
  gana la ronda; mínimo empatado no tiene ganador. Todo cierre da cero puntos.
- La partida termina en la misma transición en que un marcador llega al objetivo (100 por
  defecto; 150 o 200 si se elige al crear la mesa).
- Una ronda nueva conserva marcadores y reinicia reparto, cadena, pases y resultado.
- El núcleo no usa red, reloj, almacenamiento, renderizador ni información de modalidad.

En Latino no se han añadido reglas regionales, robos, pases voluntarios, bonificaciones,
desempates, penalizaciones, límite de rondas ni consecuencias por desconexión.

## Modalidades (desde el 14 oct 2026)

El motor separa las reglas por modalidad con la interfaz `RuleSet`
(`packages/rules/src/engine.ts`): `deal`, `opening`, `canPlay`, `onCannotPlay`,
`scoreDuringHand`, `isHandOver`, `scoreEndOfHand`, `targetScore` y `openEnds`. El motor
común valida revisión, fase y turno, coloca y orienta fichas, y aplica lo que decida la
modalidad. Las partidas online las valida siempre el servidor con este mismo motor.

- **Latino** (`LATINO_RULES`): el perfil de arriba, más su variante en parejas (2 contra 2,
  compañero enfrente, a 200; la mano ganada suma las cuatro manos; en tranque gana la
  pareja con menos puntos; desde la 2.ª mano sale quien ganó con la ficha que quiera). Su
  comportamiento queda congelado por `packages/rules/test/latino-golden.test.ts`.
- **Con robo** (`DRAW_RULES`, solo individual, 4 jugadores): 5 fichas por jugador y 8 al
  pozo. Quien no puede colocar roba de una en una (comando `DRAW`, el turno sigue siendo
  suyo) hasta poder; con el pozo vacío, pasa. Pasar con fichas en el pozo está prohibido.
  Cuatro pases seguidos (solo posibles con el pozo vacío) cierran la mano.
- **Objetivo** configurable 100, 150 o 200 (`targetScore`); sin elegir, 100 en individual y
  200 en parejas. La Competición de prueba sigue en Latino individual a 100.

Reglas interpretadas para «con robo» (pendientes de confirmar por el propietario):

1. **Reparto:** de un reparto 4×7 barajado, las 5 primeras fichas de cada jugador van a su
   mano y las 2 últimas de cada uno, por asiento, al pozo en ese orden (el barajado es
   uniforme, así que manos y pozo también lo son).
2. **Salida:** sale quien tenga el doble más alto y debe salir con él; si nadie tiene dobles
   en mano, la ficha de más puntos (a igualdad, la de extremo mayor). Igual en cada mano.
3. **Dominada:** el ganador suma los puntos en mano de los tres rivales.
4. **Tranque:** gana quien tenga menos puntos en mano y suma los de los tres rivales; si
   varios empatan en el mínimo, nadie suma.
5. **Campeón:** el primero que alcanza el objetivo (solo puede puntuar el ganador de la mano).
6. **Tiempo agotado:** la jugada automática completa el turno (roba hasta poder y después
   coloca o pasa) y cuenta como un solo tiempo agotado.

## All Fives (`ALL_FIVES_RULES`, desde el 14 oct 2026; reglas confirmadas por el propietario)

- Solo individual, 4 jugadores. Reparto, salida (doble más alto), robo y pase como «con robo».
- **Spinner:** el primer doble jugado en la mano, sea o no la salida. Cuando tiene fichas a
  izquierda y derecha se abren los brazos `UP` y `DOWN` (lados nuevos de `PLACE`; en otras
  modalidades o con los brazos cerrados, `INVALID_SIDE`). Solo hay un spinner por mano.
- **Puntos al colocar:** se suman los extremos abiertos (un doble en un extremo cuenta sus dos
  mitades; con una sola ficha en mesa, sus dos mitades; un brazo vacío no cuenta). Si la suma es
  múltiplo de 5, quien colocó suma esos puntos (evento `SCORE_APPLIED` con `reason: "FIVES"`).
- **Objetivo en el acto:** quien alcanza el objetivo con esos puntos gana sin cerrar la mano
  (`roundResult.reason = "TARGET"`).
- **Fin de mano:** al dominar, o en tranque quien menos puntos tenga en mano (empate en el mínimo:
  nadie), el ganador suma los puntos en mano de los rivales redondeados al múltiplo de 5 más
  cercano, a mitad hacia arriba (12 → 10, 13 → 15).
- No puntúa en la liga. La mesa 3D se centra en el spinner; si los brazos no caben, todo el
  tablero se encoge por igual para quedar dentro de la mesa.
