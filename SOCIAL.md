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

Pendiente (fase 3): buscar por usuario, solicitudes, aceptar o rechazar, bloquear, avatar,
presencia en línea e invitar a un amigo conectado.
