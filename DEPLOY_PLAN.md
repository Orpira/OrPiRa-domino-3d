# Plan de despliegue — Domino3D-OrPiRa v1.12-rc1 (chat de mesa y del vestíbulo)

Mismo procedimiento que la 1.11-rc1; directorio nuevo `/opt/domino-3d-v1.12-rc1`, vuelta atrás a `/opt/domino-3d-v1.11-rc1`.

| Archivo | SHA-256 |
| --- | --- |
| `domino-api-1.12-rc1.tar.gz` (imagen `sha256:366680e220fc424f30545646b173d10a32a24eee06800dd634d026e385370a43`) | `dd8b4d52cf58cf2934f1c4d152746a6500a2cb9ad2c021019cdf635992839cbb` |
| `domino-3d-src-v1.12-rc1.tar.gz` (`v1.12-rc1`; `compose.yaml` sin cambios) | `f69addf3a2330493a58b36dd4f9be41e0bdfc0b67ebbe736d6920396c4cb2d96` |
| `domino3d-orpira-1.12-rc1-debug.apk` (`versionCode` 15) | `123f10ac4116e9fe48a80c6370576873b09321f487d9ff1dbcc491eddfcec3cf` |

- Datos nuevos: `chat-reports.json` y `mutedIdentityIds` opcional en identidades y plazas; la 1.11 los ignora.
  Mensajes del chat solo en memoria (un reinicio los borra).

---

# Plan de despliegue — Domino3D-OrPiRa v1.11-rc1 (amigos completos)

Mismo procedimiento que la 1.10-rc1; directorio nuevo `/opt/domino-3d-v1.11-rc1`, vuelta atrás a `/opt/domino-3d-v1.10-rc1`.

| Archivo | SHA-256 |
| --- | --- |
| `domino-api-1.11-rc1.tar.gz` (imagen `sha256:2a6a663c3cbeea0795c56d8d17a01c831143be39e397e1355a356e49810daeb3`) | `c6511b624065aea82e430757002a686304af182075503c27dde34d0f019a613e` |
| `domino-3d-src-v1.11-rc1.tar.gz` (`v1.11-rc1`; `compose.yaml` sin cambios) | `fa101a4fb5c78440fab115d33991ae80fa2c00bfb646221c8646c983dc398098` |
| `domino3d-orpira-1.11-rc1-debug.apk` (`versionCode` 14) | `d3757f61526c131c84c194b8602b7b310d7a00b121b833a788f6af46c020662a` |

- Sin cambios de formato: `social.json` puede tener relaciones PENDING y BLOCKED, que la 1.10 ya
  sabe leer (las ignora salvo BLOCKED en invitaciones). Presencia e invitaciones viven en memoria.

---

# Plan de despliegue — Domino3D-OrPiRa v1.10-rc1 (All Fives)

Mismo procedimiento que la 1.9-rc1; directorio nuevo `/opt/domino-3d-v1.10-rc1`, vuelta atrás a `/opt/domino-3d-v1.9-rc1`.

| Archivo | SHA-256 |
| --- | --- |
| `domino-api-1.10-rc1.tar.gz` (imagen `sha256:d2c1f657af7e3505255f26226eb144c7f295e59511952ae976863076220904ad`) | `a2e80ae53218e47bc100a014766abe41eb830f6f0302a2850d16e996e5f5b920` |
| `domino-3d-src-v1.10-rc1.tar.gz` (`v1.10-rc1`; `compose.yaml` sin cambios) | `e924fb6087d9874e585b349dc51aaf8c54f70faa26b3a2bbdff8ba82b2f2121c` |
| `domino3d-orpira-1.10-rc1-debug.apk` (`versionCode` 13) | `070c025adad34297ad475607e8eeb99d7e9142d6757e797f8fb018aa5d0c1b89` |

- Comprobación: `production-smoke.mjs --fives` (probado en local: partida completa, sin liga).
- Vuelta atrás con partidas All Fives en curso: la 1.9 no conoce el spinner ni los brazos; esas
  partidas pueden quedar sin jugadas válidas. Latino y con robo no se ven afectados.

---

# Plan de despliegue — Domino3D-OrPiRa v1.9-rc1 (invitaciones, nombre de usuario y amigos)

Aprobado por el propietario («ve desplegando tan pronto vamos confirmando»). Mismo procedimiento
que la 1.8-rc1; directorio nuevo `/opt/domino-3d-v1.9-rc1`, vuelta atrás a `/opt/domino-3d-v1.8-rc1`.

| Archivo | SHA-256 |
| --- | --- |
| `domino-api-1.9-rc1.tar.gz` (imagen `sha256:58a7460bcdf5dcf5e3d4b8dfe5cd9db9af132cf39bb0301df1a90e4bf08e7ca2`) | `7e5044f7dc96955162c5885726ce73086bd95bd502a408291d4161de49210f38` |
| `domino-3d-src-v1.9-rc1.tar.gz` (`v1.9-rc1`, `0afd4e1`; `compose.yaml` sin cambios) | `98c07e62583a39c9a6302e0cdc9d07553201ee59c611d143f6074d8d32d89c94` |
| `domino3d-orpira-1.9-rc1-debug.apk` (`versionCode` 12) | `a9a18cd5859569ad0aa4f8c4b9f8ef69b21e1d96bfcb272db7d64854c705a4c1` |

- Datos nuevos: `social.json` (perfiles y amistades) y `identityId` opcional en las plazas de `lobbies.json`.
  La 1.8 ignora ambos, así que volver atrás no rompe nada; solo deja de ver usuarios y amigos.

---

# Plan de despliegue — Domino3D-OrPiRa v1.8-rc1 (modalidades: Latino y Con robo)

Estado: **aprobado por el propietario el 14 oct 2026** («ve desplegando tan pronto vamos
confirmando»). Mismo procedimiento que la 1.7-rc1 (abajo), cambiando versión y sumas:

| Archivo | SHA-256 |
| --- | --- |
| `domino-api-1.8-rc1.tar.gz` (imagen `sha256:16bda43d7b50e7b5daac4a4b46ceffaeb5b7f9cfe9d7eb9a54cd3e6b1fcb9dce`) | `efa311554e4eb8b37702612a3f3feae0b8046f76bf0479197a0b05d73fdfd243` |
| `domino-3d-src-v1.8-rc1.tar.gz` (`v1.8-rc1`, `1bcbbfc`; `compose.yaml` sin cambios, `9030814824…e441`) | `a9e13f09a111924a0580b78bce3cee1652b69f41ff641a12bdf829b9a0a84619` |
| `domino3d-orpira-1.8-rc1-debug.apk` (`versionCode` 11) | `01ccf5fffc3179f7d78bccb0268b0bfc2f66c2f3f1771b78803104a59390a493` |

- Directorio nuevo `/opt/domino-3d-v1.8-rc1`; vuelta atrás a `/opt/domino-3d-v1.7-rc1`.
- Comprobación: `production-smoke.mjs --draw` (probado en local: 257 s, sin puntos de liga) y `--pairs`.
- Vuelta atrás con partidas «con robo» en curso: la 1.7 no conoce el robo; esas partidas
  terminan con reglas Latino y una mano sin el 6–6 repartido puede quedarse sin salida.
  Las de Latino no se ven afectadas.

---

# Plan de despliegue — Domino3D-OrPiRa v1.7-rc1 (parejas online)

Estado: **preparado; pendiente de aprobación**. Nada de este documento se ha ejecutado aún
en el VPS. Revisión: 14 de octubre de 2026. El plan de la 1.5-rc1, ya ejecutado, está en el
historial de git (`git show v1.5-rc1:DEPLOY_PLAN.md`).

Igual que en la 1.5: tú ejecutas los bloques del VPS (usuario `orpira`, con `sudo`) y me
pegas la salida; yo hago desde este equipo las comprobaciones HTTPS, el push, la APK y la
documentación. **Si algún resultado difiere de lo «esperado», paramos.** Dos partes: la
parte A (bloques 0–3) no corta el servicio; la parte B (bloques 4–7) solo empieza con tu
aprobación expresa tras revisar la A.

## 1. Qué cambia

- Solo cambia el API: salas con código y «Jugar ahora» por parejas, el historial guarda
  `mode`, y la liga da 40 a cada ganador y 10 a cada perdedor sin cambiar la fórmula.
  El motor (`packages/rules`) incluye las parejas desde `57ed999`.
- Sin cambios: `compose.yaml` (mismo SHA que la 1.5-rc1), variables de entorno, proxy,
  volumen, reloj de turno, competición (sigue individual), límites de peticiones.
- La web ya está publicada desde `main` (`38338a1`): hoy ofrece parejas online, pero
  la API 1.5-rc1 las convierte en partidas individuales. Este despliegue lo corrige.

## 2. Situación actual esperada (según `CURRENT_STATE.md`; el bloque 0 lo confirma)

| Elemento | Valor |
| --- | --- |
| Contenedor | `orpira-domino-api`, imagen `orpira/domino-api:1.5-rc1` (`sha256:57cd7d6d0e3e…80ae0`), `healthy` |
| Directorio de despliegue | `/opt/domino-3d-v1.5-rc1` (proyecto `orpira-domino`) |
| Reserva | `/opt/domino-3d` con la imagen 0.5.0, intacto |
| Datos | Volumen `orpira_domino_data`, **con datos reales de prueba** (identidades, partidas, liga de octubre) |
| Respaldos | `/opt/backups/orpira-domino/` (STAMP `20261011-2325`) |

## 3. Compatibilidad de datos (probada en este equipo)

- **1.7 lee datos de 1.5:** `mode` es opcional en salas, partidas públicas e historial;
  sin él todo es individual. Cubierto por la batería (141 pruebas).
- **1.5 lee datos de 1.7 (vuelta atrás):** probado arrancando el servidor `v1.5-rc1` sobre
  datos generados por 1.7 con una sala por parejas en juego, una partida pública por
  parejas en juego y otra terminada. Arranca sin errores, muestra la terminada y lleva
  hasta el final las que estaban en juego. **Limitación:** si se vuelve atrás, una partida
  por parejas en curso termina con reglas individuales (a 100).

## 4. Artefactos (en `artifacts/` de este equipo)

| Archivo | SHA-256 |
| --- | --- |
| `domino-api-1.7-rc1.tar.gz` (imagen `orpira/domino-api:1.7-rc1`, ID `sha256:5198597d378f667ae47e491d310e0f7d35831180ad3c95db4b8d50b7b7aca5ba`) | `d14ea0b7aee15299de14108da939e1d89d2f7583e6c4a349813fb67914b65c8a` |
| `domino-3d-src-v1.7-rc1.tar.gz` (`git archive v1.7-rc1`, commit `3ca6871`) | `ef89923394a8c9848833be148a1b0c037616e24f46dd845ac9cdc96dffe222ac` |
| `compose.yaml` dentro del anterior (igual que en 1.5-rc1) | `9030814824def92c4376341009b23b8adf3fedf8452f580760c9d3b57b90e441` |
| `domino3d-orpira-1.7-rc1-debug.apk` (`versionCode` 10) | `cfb5d447474e0d4c7f3fc008326e56d10b695555114d52a213ebcf6bbbd1da0a` |

La imagen se probó en local: `healthy` y `production-smoke.mjs --pairs` completo (partida
por parejas a 200 con 3 bots, liga +10, concesión única, historial con `mode`).

**Estrategia (la misma de la 1.5):** directorio nuevo `/opt/domino-3d-v1.7-rc1`, imagen
cargada y `--no-build`. `/opt/domino-3d-v1.5-rc1` queda intacto para volver atrás.

## 5. Parte A — sin corte (solo tras «aprobado»)

### Bloque 0 — inspección de solo lectura. En el VPS

```bash
docker inspect orpira-domino-api --format 'imagen={{.Config.Image}} id={{.Image}} salud={{.State.Health.Status}} directorio={{index .Config.Labels "com.docker.compose.project.working_dir"}}'
grep -E '^DOMINO_IMAGE_TAG=' /opt/domino-3d-v1.5-rc1/.env 2>/dev/null || sudo grep -E '^DOMINO_IMAGE_TAG=' /opt/domino-3d-v1.5-rc1/.env
sudo docker run --rm -v orpira_domino_data:/data:ro alpine:3.22 sh -c 'du -sh /data; ls -la /data; ls /data/matches | wc -l'
df -h / | tail -1; ls /opt | grep domino; sudo ls /opt/backups/orpira-domino | tail -3
```

Esperado: imagen `1.5-rc1` (`57cd7d6d…`), `healthy`, directorio `/opt/domino-3d-v1.5-rc1`,
`DOMINO_IMAGE_TAG=1.5-rc1`, datos presentes, varios GB libres.

### Bloque 1 — copias de seguridad (≈ 2 min). En el VPS

```bash
STAMP=$(date -u +%Y%m%d-%H%M); echo "STAMP=$STAMP"; B=/opt/backups/orpira-domino
sudo docker run --rm -v orpira_domino_data:/data:ro -v "$B":/backup alpine:3.22 tar -czf /backup/domino-data-pre-1.7-rc1-$STAMP.tar.gz -C /data .
sudo tar -czf "$B/opt-domino-3d-v1.5-rc1-pre-1.7-rc1-$STAMP.tar.gz" -C /opt domino-3d-v1.5-rc1
sudo sh -c "cd $B && sha256sum *-$STAMP.tar.gz | tee SHA256SUMS-$STAMP"
sudo ls -la "$B"
```

La imagen 1.5-rc1 no se respalda: su archivo original sigue en `artifacts/` de este
equipo (SHA `77e3acf0…2522`) y la imagen queda cargada en el VPS. **Pégame la salida y
anota el `STAMP`.**

### Bloque 2 — transferencia (≈ 1–2 min)

En **este equipo**:

```bash
cd /home/orpira/OrPiRa/Desarrollos/OrPiRa-domino-3d-reparado
scp artifacts/domino-api-1.7-rc1.tar.gz artifacts/domino-3d-src-v1.7-rc1.tar.gz orpira@167.233.139.93:/tmp/
```

En el **VPS**:

```bash
cd /tmp && sha256sum -c - <<'EOF'
d14ea0b7aee15299de14108da939e1d89d2f7583e6c4a349813fb67914b65c8a  domino-api-1.7-rc1.tar.gz
ef89923394a8c9848833be148a1b0c037616e24f46dd845ac9cdc96dffe222ac  domino-3d-src-v1.7-rc1.tar.gz
EOF
gunzip -c /tmp/domino-api-1.7-rc1.tar.gz | sudo docker load
sudo docker image inspect orpira/domino-api:1.7-rc1 --format '{{.Id}}'
```

Esperado: dos `OK` y el ID `sha256:5198597d378f667ae47e491d310e0f7d35831180ad3c95db4b8d50b7b7aca5ba`.

### Bloque 3 — directorio nuevo y configuración. En el VPS

```bash
N=/opt/domino-3d-v1.7-rc1
sudo install -d -m 755 "$N"
sudo tar -xzf /tmp/domino-3d-src-v1.7-rc1.tar.gz -C "$N"
sudo cp -p /opt/domino-3d-v1.5-rc1/.env "$N/.env"
sudo sed -i 's/^DOMINO_IMAGE_TAG=.*/DOMINO_IMAGE_TAG=1.7-rc1/' "$N/.env"
sudo grep -q '^DOMINO_IMAGE_TAG=1.7-rc1$' "$N/.env" && echo "etiqueta 1.7-rc1 en .env" || echo "DETENER: falta DOMINO_IMAGE_TAG en .env"
sha256sum "$N/compose.yaml"
cd "$N" && sudo docker compose config | grep -E 'name:|image:|container_name|DOMINO_|NODE_ENV|orpira_domino_data'
sudo docker compose config | grep -E 'AUTOMATIC_DELAY|ROUND_BREAK|CLOCK_TICK' && echo "DETENER" || echo "sin variables de aceleración"
```

Esperado: `compose.yaml` con SHA `9030814824…e441`; proyecto `orpira-domino`; imagen
`orpira/domino-api:1.7-rc1`; volumen `orpira_domino_data`; orígenes, proxy y límites
idénticos a los de la 1.5-rc1; sin variables de aceleración.

**Fin de la parte A. Aquí paramos hasta tu aprobación expresa de la parte B.**

## 6. Parte B — cambio de versión

### Bloque 4 — cambio (corte estimado: 10–30 s). En el VPS

```bash
cd /opt/domino-3d-v1.7-rc1
sudo docker compose up -d --no-deps --no-build domino-api
sudo docker compose ps
for i in 1 2 3 4 5 6 7 8; do docker inspect --format '{{.State.Health.Status}}' orpira-domino-api; sleep 5; done
docker inspect orpira-domino-api --format 'imagen={{.Config.Image}} id={{.Image}} directorio={{index .Config.Labels "com.docker.compose.project.working_dir"}}'
docker inspect orpira-domino-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^DOMINO_' | sort
docker logs --since 3m orpira-domino-api
```

Esperado: `healthy`, imagen `1.7-rc1` (`5198597d…`), directorio `/opt/domino-3d-v1.7-rc1`,
las mismas variables que antes y en el registro solo `Dominó online local: http://0.0.0.0:8787`.
Las partidas en curso continúan (mismo volumen; las horas límite guardadas se respetan).
La cola de «Jugar ahora» está en memoria: quien estuviera buscando tendrá que volver a pulsar.

### Bloque 5 — comprobaciones (desde este equipo; yo pego la salida)

```bash
curl -sS https://api-domino.orpira.es/health
curl -sS -o /dev/null -D - -X OPTIONS -H 'Origin: https://orpira-domino-3d.vercel.app' -H 'Access-Control-Request-Method: GET' https://api-domino.orpira.es/api/league | grep -i -E '^HTTP|access-control-allow-origin'
curl -sS https://api-domino.orpira.es/api/league | head -c 300     # la liga de octubre conserva sus puntos
node scripts/production-smoke.mjs https://api-domino.orpira.es --pairs   # partida por parejas con bots (~8–10 min)
```

Más una prueba visual en la web de producción: crear una sala con código por parejas y
comprobar que la sala dice «parejas» y muestra «Pareja A / Pareja B».

### Bloque 6 — publicar la versión (desde este equipo)

```bash
git push origin main v1.7-rc1     # main lleva el cambio de versión 1.7-rc1; Vercel publica solo
curl -s https://orpira-domino-3d.vercel.app/ | grep -o 'assets/index-[^"]*'   # cambia respecto a index-BeuMlloE.js
```

### Bloque 7 — APK y cierre (desde este equipo)

```bash
sha256sum artifacts/domino3d-orpira-1.7-rc1-debug.apk   # cfb5d447…da0a
adb install -r artifacts/domino3d-orpira-1.7-rc1-debug.apk
```

Comprobación en el Samsung: «Jugar ahora» por parejas, sala con código por parejas, el
aviso propio al cambiar de modalidad y ancho 384/384 px. Después actualizo
`CURRENT_STATE.md` y retiras del VPS los temporales:
`rm /tmp/domino-api-1.7-rc1.tar.gz /tmp/domino-3d-src-v1.7-rc1.tar.gz`.

## 7. Vuelta atrás

Se aplica si falla cualquier comprobación del bloque 5. Te aviso antes de ejecutarla.

**API** (≈ 10–30 s de corte; no requiere restaurar datos, porque 1.5-rc1 lee los de 1.7).
En el VPS:

```bash
cd /opt/domino-3d-v1.5-rc1
sudo docker compose up -d --no-deps --no-build domino-api
docker inspect orpira-domino-api --format 'imagen={{.Config.Image}} directorio={{index .Config.Labels "com.docker.compose.project.working_dir"}} salud={{.State.Health.Status}}'
curl -sS https://api-domino.orpira.es/health
```

**Datos** (solo si hubiera corrupción; se pierde lo jugado después del bloque 1):

```bash
cd /opt/domino-3d-v1.5-rc1 && sudo docker compose stop domino-api
sudo docker run --rm -v orpira_domino_data:/data:ro -v /opt/backups/orpira-domino:/backup alpine:3.22 tar -czf /backup/domino-data-failed-1.7-rc1-$(date -u +%Y%m%d-%H%M).tar.gz -C /data .
sudo sh -c "cd /opt/backups/orpira-domino && sha256sum -c SHA256SUMS-$STAMP"
sudo docker run --rm -v orpira_domino_data:/data -v /opt/backups/orpira-domino:/backup:ro alpine:3.22 sh -c "find /data -mindepth 1 -delete && tar -xzf /backup/domino-data-pre-1.7-rc1-$STAMP.tar.gz -C /data"
sudo docker compose up -d --no-deps --no-build domino-api
```

**Web:** sin acción. Con la API 1.5-rc1, la web actual sigue funcionando y las parejas
online vuelven a ser individuales, como hoy.

## 8. Riesgos

1. **Rastro de QA en producción:** una identidad «QA MM-DD HH:MM», una partida pública
   por parejas con tres bots y 2–10 puntos en la liga de octubre; además, una sala con
   código de la prueba visual, que queda esperando jugadores (las salas entre amigos no caducan).
2. **Corte breve** de 10–30 s: los clientes reintentan solos; la cola de «Jugar ahora» se vacía.
3. **Vuelta atrás con parejas en curso:** terminarían con reglas individuales (sección 3).
4. **Tres directorios de despliegue** en `/opt`: 0.5.0, 1.5-rc1 y 1.7-rc1. La limpieza de
   los antiguos queda para después de dar por buena la 1.7.
5. **Sin prueba de cuatro dispositivos reales** todavía con parejas; solo cuatro navegadores en local.
