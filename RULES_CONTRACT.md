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
- La partida termina en la misma transición en que un marcador llega a 100.
- Una ronda nueva conserva marcadores y reinicia reparto, cadena, pases y resultado.
- El núcleo no usa red, reloj, almacenamiento, renderizador ni información de modalidad.

No se han añadido reglas regionales, robos, pases voluntarios, bonificaciones,
desempates, penalizaciones, límite de rondas ni consecuencias por desconexión.
