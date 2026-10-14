# Perfiles, amistades e invitaciones

Sin servicios externos: todo vive en el servidor propio (`apps/server/src/social.ts`).

## Almacenamiento

- `SocialRepository` es la única puerta a los datos; `SocialManager` (la lógica) no sabe si
  hay JSON o PostgreSQL detrás. Hoy: `JsonSocialRepository` en `social.json` (escrituras en
  serie, archivo temporal + `rename` atómico, modo 600).
- Para migrar a PostgreSQL basta otro repositorio con las mismas garantías:

```sql
create table profiles (
  identity_id text primary key,
  username    text not null,
  created_at  timestamptz not null
);
create unique index profiles_username_key on profiles (lower(username));

create table friendships (
  friendship_id uuid primary key,
  requester_id  text not null,
  addressee_id  text not null,
  status        text not null check (status in ('PENDING', 'ACCEPTED', 'BLOCKED')),
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  check (requester_id <> addressee_id)
);
create unique index friendships_pair_key on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
```

## Reglas

- Nombre de usuario: se elige una vez sobre la cuenta de prueba (el token y el código de
  recuperación no cambian). 3–20 caracteres `a-z 0-9 . _`, empieza por letra o número, único
  sin distinguir mayúsculas. Errores: `INVALID_USERNAME`, `USERNAME_TAKEN` (409), `USERNAME_ALREADY_SET` (409).
- Invitación: `https://domino-3d.orpira.es/invitar/CODIGO?de=usuario` (la APK comparte siempre
  el dominio público). Quien entra con su cuenta queda como amigo (aceptado) de quien invitó:
  el miembro de la sala con ese usuario, o si el enlace no lo trae o no está en la sala, quien la
  creó con cuenta. Nunca consigo mismo ni sobre una relación bloqueada; una pendiente se acepta.
  Sin cuenta, la página pide crearla antes de entrar.
- La misma cuenta no puede ocupar dos plazas en una sala (`ALREADY_IN_ROOM`, 409).

## HTTP

| Ruta | Uso |
| --- | --- |
| `GET /api/social` (Bearer cuenta) | Usuario y amigos aceptados |
| `POST /api/social/username` `{ username }` | Reclamar nombre de usuario |
| `GET /api/lobbies/:code/preview?de=usuario` | Vista pública de la sala (modalidad, nombres, plazas libres, quien invita); 404 `ROOM_NOT_FOUND` |
| `POST /api/lobbies` y `/:code/join` con Bearer de la cuenta (opcional) | La plaza queda enlazada a la cuenta; `join` con `{ invitation: { inviter? } }` crea la amistad y responde `friendWith` |

## Amigos (fase 3)

- **Buscar** por el principio del nombre de usuario (mínimo 2 caracteres, hasta 10 resultados).
  Quien me bloqueó no aparece.
- **Solicitudes:** enviar, aceptar o rechazar (solo quien la recibe), cancelar la enviada. Si
  los dos se envían solicitud, quedan amigos. Eliminar un amigo borra la relación.
- **Bloquear:** relación `BLOCKED` con `requesterId` = quien bloquea. Deshace la amistad, borra las
  invitaciones pendientes entre ambos, oculta a quien bloquea de las búsquedas del otro e impide
  solicitudes e invitaciones en los dos sentidos (al bloqueado se le responde `USER_NOT_FOUND`).
  Solo quien bloqueó puede desbloquear.
- **Presencia (decisión del propietario, opción A, sin tiempo real):** la app consulta
  `GET /api/social` cada 25 s mientras está visible (y al volver a ella). «En línea» = visto en el
  último minuto. Solo los amigos ven la presencia. Vive en memoria: un reinicio la vacía.
- **Invitar a un amigo a la sala:** solo a amigos aceptados y a salas con plazas libres en las que
  quien invita está con su cuenta. El aviso llega en la siguiente consulta (≤ 25 s), dura 10 min,
  no se duplica (mismo remitente y sala), como mucho 20 por persona, y vive en memoria. «Unirme»
  abre la misma página que el enlace de invitación.

| Ruta (Bearer cuenta) | Uso |
| --- | --- |
| `GET /api/social/search?q=` | Buscar usuarios con su relación (`NONE`, `PENDING_OUT`, `PENDING_IN`, `FRIEND`, `BLOCKED`) |
| `POST /api/social/requests` `{ username }` | Enviar solicitud |
| `POST /api/social/friendships/:id/{accept,decline,remove,block,unblock}` | Gestionar una relación |
| `POST /api/social/block` `{ username }` | Bloquear desde la búsqueda |
| `POST /api/social/invitations` `{ friendshipId, code }` | Invitar a un amigo a mi sala |
| `POST /api/social/invitations/:id/dismiss` | Descartar el aviso |

Errores: `USER_NOT_FOUND` y `FRIENDSHIP_NOT_FOUND` (404), `BLOCKED_BY_YOU` (409), `CANNOT_FRIEND_SELF`,
`ROOM_NOT_FOUND` (sala inexistente o en la que no estoy), `ROOM_FULL` (400).

Pendiente: avatar y notificaciones push fuera de la app.
