# Chat de mesa y del vestíbulo

Servicio del servidor: `apps/server/src/chat.ts` (`ChatManager`) y `chat-access.ts` (quién puede
qué en cada canal). Transporte: consultas HTTP periódicas, como el resto de la app (no hay canal
en tiempo real); si se añade WebSocket, solo cambia el transporte. Cliente: `apps/client/src/chat-ui.tsx`.

## Canales

| Canal | Ruta (Bearer) | Quién |
| --- | --- | --- |
| Vestíbulo | `/api/chat/lobby` | Cualquier cuenta de prueba lee; **escribe solo con al menos una partida terminada** (Jugar ahora, sala con código o Competición) |
| Sala con código | `/api/chat/private/:codigo` | Sus miembros (sesión de la sala; sin cuenta, como invitados) |
| Competición de prueba | `/api/chat/competition/:codigo` | Sus miembros (cuenta) |
| Jugar ahora | `/api/chat/quick/:matchId` | Los humanos de la mesa (los bots no tienen sesión: ni leen ni escriben) |

`GET` devuelve la vista (`messages`, `mutedIdentityIds`, `canSend`, `policy`, `serverNow`,
`viewerId`); `POST` envía; `POST …/mute` `{ authorId, muted }`; `POST …/report` `{ messageId }`
(en el vestíbulo: `/api/chat/lobby/mute` y `/api/chat/lobby/report`).

## Reglas (las aplica el servidor)

- Contenido: `{ kind: "PHRASE", id }`, `{ kind: "EMOJI", id }` o `{ kind: "TEXT", text }`.
  Frases: Hola, Buena suerte, Gracias, Bien jugado, Enhorabuena, Buena partida, Hasta luego,
  Vamos a divertirnos. Emojis: 👋 😊 👏 🎉 🙌 🤝. Ninguno alude a fichas, números ni palos.
- `policy`: `QUICK` con una mano en curso (frases y emojis; texto → `CHAT_QUICK_ONLY`); `PHRASES` en
  la Competición, siempre (también el vestíbulo mientras se está en una; otra cosa →
  `CHAT_PHRASES_ONLY`); `TEXT` entre manos, en la sala de espera y tras el final. Estar en una
  mano en curso limita también el vestíbulo a frases y emojis.
- Texto: 1–200 caracteres, palabrotas enmascaradas con `*` (español y variantes colombianas,
  tildes, «leet» y letras separadas; «chimba» sola no, por ser elogio). Siempre texto plano.
- Frecuencia por identidad, entre todos los chats: 1 cada 2 s y 10 por minuto (`CHAT_RATE_LIMITED`, 429).
- Historial en memoria: vestíbulo, últimos 50 (quien entra los recibe); mesa, hasta 100, se vacía
  al terminar la partida y se borra al cerrarse la mesa. No se persiste nada del chat salvo:
- Reportes en `chat-reports.json` (modo 600): id del mensaje, texto, autor, quien reporta y fecha.
- Silenciados guardados en la identidad (`simulated-competition.json`; invitados de una sala, en la
  plaza de `lobbies.json`). El servidor no envía al silenciador los mensajes de los silenciados.

Estados HTTP del chat: 401 sin sesión válida, 403 regla (`CHAT_QUICK_ONLY`, `CHAT_PHRASES_ONLY`,
`CHAT_FINISHED_MATCH_REQUIRED`, `NOT_A_PARTICIPANT`), 404 mensaje o mesa inexistente, 409 mesa
cerrada, 429 frecuencia, 400 contenido inválido. El resto de rutas conserva sus estados.

## Cliente

- Mesa: «Frases rápidas» junto a «Tu mano»; burbuja ~3 s sobre el avatar de quien la envía (solo
  humanos); panel «Chat de mesa» con texto libre habilitado entre manos. Consulta cada 2 s.
- Vestíbulo: panel lateral en escritorio; en móvil, botón flotante sobre la barra inferior con
  insignia de no leídos y hoja deslizable. Oculto en las vistas de partida (práctica, Jugar ahora,
  salas, Mesas) para no tapar la mesa ni los controles. Consulta cada 3 s abierto y 20 s cerrado.
- Menú en cada mensaje ajeno: Silenciar y Reportar; lista de silenciados con su nombre.

## Probar con 2 navegadores

1. Navegador A: Cuenta → crear cuenta. Jugar online → Crear sala. Navegadores B, C y D (o pestañas
   de incógnito) entran con el código; la partida empieza con 4.
2. Durante la mano: A abre «Frases rápidas» → «Buena suerte»; B ve la burbuja sobre «A» unos 3 s.
   El campo de texto está desactivado («Mano en curso: solo frases rápidas y emojis»).
3. Al terminar la mano: B escribe «buena mano, gonorrea»; A lo ve como «buena mano, ********».
4. A: Opciones → Silenciar en el mensaje de B; B escribe otra vez: C lo ve, A no.
5. Vestíbulo (Inicio): sin partidas terminadas aparece «Termina al menos una partida…»; tras
   terminar una, se puede escribir y quien abre el vestíbulo ve los últimos mensajes.
