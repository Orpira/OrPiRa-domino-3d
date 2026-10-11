# Plan de despliegue — Domino3D-OrPiRa v1.5-rc1

Estado: **preparado con la inspección real del VPS; pendiente de aprobación**. Nada de
este documento se ha ejecutado aún en el VPS ni en Vercel. Revisión: 12 de octubre de 2026.

Modo de ejecución elegido: **opción B**. Tú ejecutas los bloques del VPS (usuario
`orpira`, con contraseña y `sudo`) y me pegas la salida; yo hago desde este equipo las
comprobaciones HTTPS, la web en Vercel, la APK y la documentación. Si algún resultado
difiere de lo indicado como «esperado», paramos.

## 1. Situación actual (inspección del 11 oct 2026, 23:16 UTC)

| Elemento | Valor |
| --- | --- |
| Máquina | `orpira-cloud`, 167.233.139.93, 38 GB de disco (26 GB libres) |
| Gestor | Docker Compose, proyecto `orpira-domino`, directorio `/opt/domino-3d` (copia del repositorio, propiedad de `root`; `.env` en modo 600) |
| Contenedor | `orpira-domino-api`, imagen `orpira/domino-api:0.5.0` (ID `ba95ba155ad4…`, construida en el VPS), usuario `node`, `unless-stopped`, `healthy`, sin puertos publicados |
| `compose.yaml` | SHA-256 `cf62b0bd…6325`, igual al de 0.5.0 del repositorio |
| Entorno | `DOMINO_ALLOWED_ORIGINS=https://orpira-domino-3d.vercel.app,https://localhost`, `DOMINO_DATA_DIR=/app/data`, `NODE_ENV=production` |
| Datos | Volumen `orpira_domino_data` (`/var/lib/docker/volumes/orpira_domino_data/_data`): **vacío**, 0 archivos y 4 KB; nunca se ha usado |
| Proxy | Nginx Proxy Manager, `proxy_host/4.conf`: `api-domino.orpira.es` → `http://orpira-domino-api:8787`, Let's Encrypt (`npm-10`), Force SSL, `block-exploits`; `proxy.conf` añade `X-Forwarded-For $proxy_add_x_forwarded_for` |
| Certificado | `CN=api-domino.orpira.es`, Let's Encrypt, hasta el 9 de enero de 2027 |
| Red `orpira-network` | `orpira-domino-api`, `nginx-proxy-manager`, `portainer` |
| Servicios vecinos, **no se tocan** | evolution-api, postgres (127.0.0.1:5432), n8n, redis, nginx-proxy-manager, portainer |
| Respaldos | No existe `/opt/backups/orpira-domino` |
| Web | Vercel `orpira-domino-3d`, publicada automáticamente desde `main` (`f0dddf1`); producción `dpl_BQ9kn3vDir7wwwBBN9GpfRY57P4R`, `https://orpira-domino-3d-4j0q5csr2-orpira-7163s-projects.vercel.app`, alias `https://orpira-domino-3d.vercel.app` |

La inspección descargó la imagen `alpine:3.22` en el VPS (≈ 8 MB). Se reutiliza en las
copias de seguridad.

## 2. Compatibilidad de datos

Producción no tiene datos, así que no hay nada que migrar. La compatibilidad con el
formato 0.5.0 se probó igualmente con datos sintéticos: la versión nueva lee las salas y
partidas antiguas y conserva sesiones, revisiones e idempotencia, y la 0.5.0 lee los
datos escritos por la nueva. Cambios de formato: campo opcional `control` en
`matches/*.json`, y archivos nuevos `simulated-competition.json`, `quick-play.json` y
`league.json`, creados al usarse.

## 3. Artefactos (en `artifacts/` de este equipo)

| Archivo | SHA-256 |
| --- | --- |
| `domino-api-1.5-rc1.tar.gz` (imagen `orpira/domino-api:1.5-rc1`, ID `sha256:57cd7d6d0e3e6ff189815ec2490dc5ffc54b1b5b56b05bd197df10cb13880ae0`) | `77e3acf0bf4cf9dccd4b86b12db2ababaa5335687f074e03c968e4d286422522` |
| `domino-3d-src-v1.5-rc1.tar.gz` (`git archive v1.5-rc1`, commit `2240f70`) | `cf7c72a218a69d58d7969677d8db25c148697421b37cbec39925f7ed2fa87bc7` |
| `compose.yaml` dentro del anterior | `9030814824def92c4376341009b23b8adf3fedf8452f580760c9d3b57b90e441` |
| `domino3d-orpira-1.5-rc1-debug.apk` (`versionCode` 6) | `f4f2c5d07e7506a1bfdaf2c0959b78635a5b5f40e55242fea2e8997dd9165bb2` |

**Estrategia:** se despliega desde un directorio nuevo, `/opt/domino-3d-v1.5-rc1`, con el
código exacto de la etiqueta y la imagen ya probada en local (`--no-build`). El directorio
`/opt/domino-3d` y la imagen 0.5.0 quedan intactos. Para volver atrás basta con ejecutar
Compose desde el directorio antiguo. El volumen tiene nombre fijo (`orpira_domino_data`)
y el proyecto se llama igual (`orpira-domino`), así que ambos directorios gestionan el
mismo contenedor y los mismos datos.

## 4. Configuración de producción

| Variable | Valor | Dónde |
| --- | --- | --- |
| `DOMINO_IMAGE_TAG` | `1.5-rc1` | `.env` del directorio nuevo |
| `DOMINO_ALLOWED_ORIGINS` | sin cambios: `https://orpira-domino-3d.vercel.app,https://localhost` | `.env` (se copia) |
| `NODE_ENV`, `HOST`, `PORT`, `DOMINO_DATA_DIR` | `production`, `0.0.0.0`, `8787`, `/app/data` | `compose.yaml` |
| `DOMINO_TRUST_PROXY` | `true` (confirmado: NPM añade `X-Forwarded-For`) | `compose.yaml` |
| `DOMINO_RATE_LIMIT_MAX` / `_WINDOW_SECONDS` | `600` / `60` | `compose.yaml` |
| `DOMINO_IDENTITY_LIMIT_MAX` / `_WINDOW_SECONDS` | `20` / `86400` | `compose.yaml` |
| `DOMINO_TURN_SECONDS`, `DOMINO_QUICK_PLAY_FILL_SECONDS`, `DOMINO_LEAGUE_*` | sin definir (30 s, 45 s, 40/20/10/4, umbrales por defecto, America/Bogota) | — |
| `DOMINO_AUTOMATIC_DELAY_SECONDS`, `DOMINO_ROUND_BREAK_SECONDS`, `DOMINO_CLOCK_TICK_MS` | **sin definir**: `compose.yaml` no las declara, no pueden llegar al contenedor | — |

## 5. Ejecución (solo tras «aprobado»)

### Bloque 1 — copias de seguridad (≈ 2 min, sin corte). En el VPS

```bash
STAMP=$(date -u +%Y%m%d-%H%M); echo "STAMP=$STAMP"; B=/opt/backups/orpira-domino
sudo install -d -m 700 "$B"
sudo docker run --rm -v orpira_domino_data:/data:ro -v "$B":/backup alpine:3.22 tar -czf /backup/domino-data-pre-1.5-rc1-$STAMP.tar.gz -C /data .
sudo sh -c "docker image save orpira/domino-api:0.5.0 | gzip > $B/domino-api-0.5.0-pre-1.5-rc1-$STAMP.tar.gz"
sudo tar -czf "$B/opt-domino-3d-pre-1.5-rc1-$STAMP.tar.gz" -C /opt domino-3d
sudo sh -c "cd $B && sha256sum *-$STAMP.tar.gz | tee SHA256SUMS-$STAMP"
sudo ls -la "$B"
```

Esperado: tres archivos y su `SHA256SUMS`. El de datos ocupa pocos bytes (volumen
vacío), la imagen unos 58 MB y el directorio unos 15 MB. **Pégame la salida y anota el `STAMP`.**

### Bloque 2 — transferencia (≈ 1–2 min, sin corte)

En **este equipo**:

```bash
cd /home/orpira/OrPiRa/Desarrollos/OrPiRa-domino-3d-reparado
scp artifacts/domino-api-1.5-rc1.tar.gz artifacts/domino-3d-src-v1.5-rc1.tar.gz orpira@167.233.139.93:/tmp/
```

En el **VPS**:

```bash
cd /tmp && sha256sum -c - <<'EOF'
77e3acf0bf4cf9dccd4b86b12db2ababaa5335687f074e03c968e4d286422522  domino-api-1.5-rc1.tar.gz
cf7c72a218a69d58d7969677d8db25c148697421b37cbec39925f7ed2fa87bc7  domino-3d-src-v1.5-rc1.tar.gz
EOF
gunzip -c /tmp/domino-api-1.5-rc1.tar.gz | docker load
docker image inspect orpira/domino-api:1.5-rc1 --format '{{.Id}}'
```

Esperado: dos `OK` y el ID `sha256:57cd7d6d0e3e6ff189815ec2490dc5ffc54b1b5b56b05bd197df10cb13880ae0`.

### Bloque 3 — directorio nuevo y configuración (sin corte). En el VPS

```bash
N=/opt/domino-3d-v1.5-rc1
sudo install -d -m 755 "$N"
sudo tar -xzf /tmp/domino-3d-src-v1.5-rc1.tar.gz -C "$N"
sudo cp -p /opt/domino-3d/.env "$N/.env"
sudo sed -i 's/^DOMINO_IMAGE_TAG=.*/DOMINO_IMAGE_TAG=1.5-rc1/' "$N/.env"
sudo grep -q '^DOMINO_IMAGE_TAG=1.5-rc1$' "$N/.env" && echo "etiqueta 1.5-rc1 en .env" || echo "DETENER: falta DOMINO_IMAGE_TAG en .env"
sha256sum "$N/compose.yaml"
cd "$N" && sudo docker compose config | grep -E 'name:|image:|container_name|DOMINO_|NODE_ENV|orpira_domino_data'
sudo docker compose config | grep -E 'AUTOMATIC_DELAY|ROUND_BREAK|CLOCK_TICK' && echo "DETENER" || echo "sin variables de aceleración"
```

Esperado: `compose.yaml` con SHA `9030814824…e441`; proyecto `orpira-domino`; imagen
`orpira/domino-api:1.5-rc1`; volumen `orpira_domino_data`; orígenes sin cambios;
`DOMINO_TRUST_PROXY: "true"`, límites 600/60 y 20/86400; sin variables de aceleración.
Si el `.env` original no tuviera `DOMINO_IMAGE_TAG`, se detiene y se añade a mano tras
consultarlo.

### Bloque 4 — cambio de versión (corte estimado: 10–30 s). En el VPS

```bash
cd /opt/domino-3d-v1.5-rc1
sudo docker compose up -d --no-deps --no-build domino-api
sudo docker compose ps
for i in 1 2 3 4 5 6 7 8; do docker inspect --format '{{.State.Health.Status}}' orpira-domino-api; sleep 5; done
docker inspect orpira-domino-api --format 'imagen={{.Config.Image}} id={{.Image}} directorio={{index .Config.Labels "com.docker.compose.project.working_dir"}}'
docker inspect orpira-domino-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^DOMINO_' | sort
docker logs --since 3m orpira-domino-api
```

Esperado: `healthy`, imagen `1.5-rc1` con ID `57cd7d6d…`, directorio
`/opt/domino-3d-v1.5-rc1`, las variables de la sección 4 y en el registro solo
`Dominó online local: http://0.0.0.0:8787`. Mientras dura el corte, NPM responde 502 y
los clientes reintentan solos.

### Bloque 5 — comprobaciones (desde este equipo; yo pego la salida)

```bash
curl -sS https://api-domino.orpira.es/health
curl -sS https://api-domino.orpira.es/api/simulated-conditions
curl -sS -o /dev/null -D - -X OPTIONS -H 'Origin: https://orpira-domino-3d.vercel.app' -H 'Access-Control-Request-Method: GET' https://api-domino.orpira.es/api/league | grep -i -E '^HTTP|access-control-allow-origin'
node scripts/production-smoke.mjs https://api-domino.orpira.es              # partida con bots (~6–10 min) y liga
node scripts/production-smoke.mjs https://api-domino.orpira.es --rate-limit # 429 y Retry-After; bloquea mi IP ≤ 60 s
```

«Datos anteriores siguen accesibles»: el volumen estaba vacío. Se comprueba que siga
montado y que ahora contenga los archivos que crea la prueba (en el VPS):

```bash
sudo docker run --rm -v orpira_domino_data:/data:ro alpine:3.22 sh -c 'ls -la /data; ls /data/matches | wc -l'
```

### Bloque 6 — web v1.5-rc1 (desde este equipo, ≈ 1 min de build en Vercel)

```bash
git worktree add --detach /tmp/domino-v1.5-rc1 v1.5-rc1 && cd /tmp/domino-v1.5-rc1
vercel link --yes --project orpira-domino-3d
vercel deploy --prod
curl -s https://orpira-domino-3d.vercel.app/ | grep -o 'assets/index-[^"]*'   # distinto de index-B5dFSCIK.js
```

### Bloque 7 — APK y cierre (desde este equipo)

```bash
sha256sum artifacts/domino3d-orpira-1.5-rc1-debug.apk   # f4f2c5d0…bb2
adb install -r artifacts/domino3d-orpira-1.5-rc1-debug.apk
```

Capturas reales de Inicio, Jugar ahora, mesa con reloj, resultado, Liga y Cuenta.
Después actualizo `CURRENT_STATE.md` (versión 1.5-rc1, fecha, etiqueta, rutas y SHA-256
de las copias) y retiras del VPS los archivos temporales:
`rm /tmp/domino-api-1.5-rc1.tar.gz /tmp/domino-3d-src-v1.5-rc1.tar.gz /tmp/vps-inspect.sh`.

## 6. Vuelta atrás

Se aplica si falla cualquier comprobación del bloque 5. Te aviso antes de ejecutarla.

**API** (≈ 10–30 s de corte; no requiere restaurar datos, porque 0.5.0 lee los datos de
1.5). En el VPS:

```bash
cd /opt/domino-3d
sudo docker compose up -d --no-deps --no-build domino-api
docker inspect orpira-domino-api --format 'imagen={{.Config.Image}} directorio={{index .Config.Labels "com.docker.compose.project.working_dir"}} salud={{.State.Health.Status}}'
curl -sS https://api-domino.orpira.es/health
```

Si la imagen 0.5.0 hubiera desaparecido:
`gunzip -c /opt/backups/orpira-domino/domino-api-0.5.0-pre-1.5-rc1-$STAMP.tar.gz | sudo docker load`.

**Datos** (solo si hubiera corrupción). El volumen estaba vacío, así que restaurar
equivale a vaciarlo; antes se guarda lo existente:

```bash
cd /opt/domino-3d && sudo docker compose stop domino-api
sudo docker run --rm -v orpira_domino_data:/data:ro -v /opt/backups/orpira-domino:/backup alpine:3.22 tar -czf /backup/domino-data-failed-1.5-rc1-$(date -u +%Y%m%d-%H%M).tar.gz -C /data .
sudo sh -c "cd /opt/backups/orpira-domino && sha256sum -c SHA256SUMS-$STAMP"
sudo docker run --rm -v orpira_domino_data:/data -v /opt/backups/orpira-domino:/backup:ro alpine:3.22 sh -c "find /data -mindepth 1 -delete && tar -xzf /backup/domino-data-pre-1.5-rc1-$STAMP.tar.gz -C /data"
sudo docker compose up -d --no-deps --no-build domino-api
```

**Web** (desde este equipo):

```bash
vercel promote https://orpira-domino-3d-4j0q5csr2-orpira-7163s-projects.vercel.app --yes
curl -s https://orpira-domino-3d.vercel.app/ | grep -o 'assets/index-[^"]*'   # vuelve a index-B5dFSCIK.js
```

**APK:** la 1.5 se queda instalada; con la API en 0.5.0 muestra «no disponible» en las
funciones nuevas y la mesa entre amigos sigue funcionando.

## 7. Riesgos

1. **`sudo` del usuario `orpira`.** Los bloques 1, 3 y 4 lo necesitan porque
   `/opt/domino-3d` y su `.env` son de `root`. Si no hay `sudo`, paramos antes del bloque 1.
2. **Rastro de QA en producción.** La prueba crea una identidad «QA MM-DD HH:MM», una
   partida pública con tres bots y sus puntos en la liga de octubre (1–10 puntos).
3. **Web fuera de `main`.** Producción quedaría en `v1.5-rc1` y `main` sigue en
   `f0dddf1`: un `push` a `main` antes de la fusión volvería a publicar la web antigua.
4. **Dos directorios de despliegue.** `/opt/domino-3d` (0.5.0) queda como reserva; no hay
   que ejecutar Compose desde él salvo para volver atrás.
5. **Estado en memoria.** Un reinicio vacía la cola de «Jugar ahora» y los contadores de
   límite. Es una sola instancia.
6. **Contraseña SSH.** La ejecución depende de tu sesión; mi equipo no tiene acceso.

## 8. Lo que no puedo verificar

- Que `orpira` tenga `sudo` (se comprueba en el bloque 1).
- El comportamiento con tráfico real de varios usuarios simultáneos.
- La prueba con cuatro dispositivos, que queda para después y antes de fusionar en `main`.
