# Cierre de QA online local

Fecha de preparación: 11 de octubre de 2026.

Estado global: **pendiente de validación manual**. Ninguna comprobación de esta
matriz se considera aprobada hasta recibir confirmación expresa del responsable.

## Dispositivos y sesiones

| Asiento | Dispositivo | Navegador | Estado de QA |
| --- | --- | --- | --- |
| P0 | Samsung | Pendiente de anotar | Pendiente |
| P1 | iPhone | Chrome (WebKit en iOS) | Pendiente |
| P2 | iPad | Pendiente de anotar | Pendiente |
| P3 | Portátil | Chrome según captura | Pendiente |

La captura `Captura de pantalla de 2026-10-11 13-39-41.png` muestra los cuatro
asientos conectados en la ronda 9, marcadores 40/40/0/20, mesa en apertura y turno
de P3. Es evidencia de que la sesión de prueba fue preparada, no de que los casos
siguientes hayan sido aprobados.

## Matriz de comprobación manual

| Caso | Procedimiento y resultado esperado | Estado |
| --- | --- | --- |
| Apertura 6–6 | En el dispositivo que tiene el 6–6, tocarlo, comprobar que queda seleccionado y pulsar **Abrir con 6–6**. Los cuatro clientes deben mostrar el 6–6, seis fichas para el abridor y el siguiente asiento antihorario. | Pendiente |
| Partida hasta 100 | Jugar rondas completas hasta que un jugador alcance exactamente el final de partida definido por el motor. No debe permitirse jugar después. | Pendiente |
| Cuatro marcadores | Después de cada resultado de ronda, comparar los cuatro clientes: mismos puntos para P0–P3 y mismo jugador activo. | Pendiente |
| Transición de ronda | En fin de ronda, pulsar **Siguiente ronda** una sola vez. Debe conservar puntuaciones, repartir siete fichas, vaciar la mesa y exigir una nueva apertura con 6–6. | Pendiente |
| Privacidad de manos | En cada dispositivo, comprobar que solo aparece su mano. Los demás jugadores exponen únicamente nombre, asiento, conexión, puntuación y cantidad de fichas. Revisar también las respuestas de red si se usan herramientas de desarrollo. | Pendiente |
| Recarga | Recargar cada dispositivo durante una ronda. Debe conservar la sesión y el asiento, recuperar solo su vista privada y mostrar el estado confirmado actual. | Pendiente |
| Desconexión | Desconectar un dispositivo durante su turno y esperar al menos 10 segundos. Los otros clientes deben mostrarlo desconectado; turno, mesa, revisiones y marcadores no deben avanzar. No debe generarse pase, puntuación ni bot. | Pendiente |
| Reconexión | Restaurar la conexión y recargar. Debe recuperar el mismo asiento, mano privada y turno pendiente; entonces debe poder realizar una única acción válida. | Pendiente |
| Reintento seguro | Cortar la red durante el envío de una jugada y restaurarla. El mismo `commandId` debe confirmarse una sola vez, sin ficha o puntuación duplicada. | Pendiente |
| Fin y salida | Al llegar a 100, comprobar campeón, marcador y clasificación. No debe aparecer **Siguiente ronda** ni aceptarse otra jugada; **Volver al lobby** debe eliminar la sesión de esa pestaña. | Pendiente |
| Presentación de objetivos | Antes de empezar deben verse formato individual, cuatro jugadores, objetivo 100, dominada +20 y cierre +0. Durante la partida deben verse objetivo, progreso y dominadas restantes en móvil y escritorio. | Pendiente |
| Resultado y clasificación | Tras cada ronda deben verse motivo, ganador/empate, puntos y marcador. Al terminar, los cuatro dispositivos deben mostrar el mismo campeón y clasificación; puntuaciones iguales deben figurar como empate. | Pendiente |
| Movimiento reducido | Con la preferencia del sistema activada, la mesa online no debe mantener animación ambiental. | Pendiente |
| Colocación simplificada | Tocar una ficha con un solo extremo debe jugarla directamente. Con dos extremos deben aparecer dos objetivos resaltados sobre la mesa y dos botones accesibles; tocar dos veces no debe duplicar la jugada. | Pendiente |

## Evidencia automatizada disponible

- La regresión de apertura reproduce selección del 6–6, `PLACE` sin extremo,
  respuesta HTTP autoritativa y lectura posterior desde cuatro sesiones.
- Comprueba una sola ficha 6–6 en mesa, mano del abridor reducida a seis y turno
  siguiente antihorario.
- La suite existente verifica privacidad de vistas, sesión/asiento tras reconectar,
  idempotencia, revisiones obsoletas, partida completa hasta 100 y recuperación del
  servidor.
- La desconexión está cubierta a nivel de sala: `disconnect` y `connect` no cambian
  el estado. La comprobación perceptible en los cuatro dispositivos sigue pendiente.

## Registro de incidencias

Anotar por incidencia: dispositivo, navegador y versión, asiento, ronda/revisión,
pasos, resultado observado, resultado esperado y captura. Tras corregirla, ejecutar
la prueba automatizada afectada y repetir manualmente solo el caso y sus regresiones
relacionadas.
