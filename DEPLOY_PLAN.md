# Plan de despliegue — Domino3D-OrPiRa v1.5-rc1

Estado: **preparado, pendiente de aprobación**. Nada de este documento se ha ejecutado
en el VPS ni en Vercel. Fecha de preparación: 12 de octubre de 2026.

## 0. Bloqueo previo: acceso al VPS

La clave SSH de este equipo (`SHA256:86ZAmZV9NMrcd1FWxIR86uY4bmi57p6D0XotJashbc0`,
ED25519, `~/.ssh/id_ed25519.pub`) es rechazada por `orpira@167.233.139.93` y
`root@167.233.139.93`. Por eso **no se han podido hacer** la copia de los datos reales de
producción (punto 3 de la Parte 1) ni la inspección del VPS (punto 5). Hay dos opciones:

- **A.** Autorizar esa clave pública en el usuario que gestiona Docker en el VPS. Entonces
  ejecuto primero la sección 3 (solo lectura), te entrego la salida y espero de nuevo tu
  aprobación antes de la sección 4.
- **B.** Ejecutas tú las secciones 3 a 7 y me pegas la salida en cada punto de control.

Lo verificado desde fuera, sin acceso:

- `api-domino.orpira.es` resuelve solo a `167.233.139.93`, servido por openresty (Nginx
  Proxy Manager) con certificado Let's Encrypt `CN=api-domino.orpira.es`, válido del 11 de
  octubre de 2026 al 9 de enero de 2027.
- `GET /health` → `{"ok":true}`; `GET /api/simulated-conditions` → 404 `MATCH_NOT_FOUND`.
  Hoy corre el servidor 0.5.0, anterior a la competición. `CURRENT_STATE.md` decía que la
  API no estaba desplegada: era información desactualizada.
- Web: proyecto Vercel `orpira-7163s-projects/orpira-domino-3d`, desplegado
  automáticamente desde `main` (`f0dddf1`). Producción actual:
  `dpl_BQ9kn3vDir7wwwBBN9GpfRY57P4R`,
  `https://orpira-domino-3d-4j0q5csr2-orpira-7163s-projects.vercel.app`, con el alias
  `https://orpira-domino-3d.vercel.app`.

## 1. Artefactos

| Artefacto | Identificación |
| --- | --- |
| Etiqueta | `v1.5-rc1` → commit `2240f70` (rama `feature/league`) |
| Imagen API | `orpira/domino-api:1.5-rc1`, ID `sha256:57cd7d6d0e3e6ff189815ec2490dc5ffc54b1b5b56b05bd197df10cb13880ae0`, 237 MB |
| Imagen exportada | `artifacts/domino-api-1.5-rc1.tar.gz`, 58 MB, SHA-256 `77e3acf0bf4cf9dccd4b86b12db2ababaa5335687f074e03c968e4d286422522` |
| APK debug 1.5 | `artifacts/domino3d-orpira-1.5-rc1-debug.apk`, `versionCode` 6, SHA-256 `f4f2c5d07e7506a1bfdaf2c0959b78635a5b5f40e55242fea2e8997dd9165bb2` |
| `compose.yaml` nuevo | SHA-256 `9030814824def92c4376341009b23b8adf3fedf8452f580760c9d3b57b90e441` |
| `compose.yaml` de 0.5.0 (esperado en el VPS) | SHA-256 `cf62b0bd4679540a50563622ce40f8214dd4bef119e4d9f46aded42394396325` |
| Imagen 0.5.0 local (referencia) | `sha256:4adf38656fd031a22424614a6f87bba4b1e8c7015715393c0891b47e408fc0ff` |

La imagen se construyó con el `Dockerfile` de la etiqueta y se probó en contenedor contra
datos en formato 0.5.0: arranca como `node` (UID 1000), pasa a `healthy` y conserva las
salas. La web la construye Vercel desde la etiqueta (`npm ci` + `npm run build:web`).

## 2. Compatibilidad de datos (probada con datos sintéticos 0.5.0)

Sin acceso a los datos reales, los generé con el servidor de `f0dddf1`, idéntico en
`apps/server` y `packages` a la imagen 0.5.0: una sala terminada, otra a mitad de partida
y otra en espera con dos jugadores. Los marqué como solo lectura (`chmod -R a-w`) y
arranqué el servidor de `v1.5-rc1` sobre una copia.

| Comprobación | Resultado |
| --- | --- |
| Arranque y `/health` | Correcto, local y en contenedor |
| Sala terminada | `ENDED`, marcador 80/80/40/100 intacto; las cuatro sesiones antiguas siguen válidas y conservan su asiento |
| Sala a mitad | `PLAYING`, misma revisión (24); acepta la jugada siguiente (revisión 25) |
| Idempotencia | Reenviar el último sobre guardado por 0.5.0 devuelve la respuesta almacenada idéntica (ambas partidas) |
| Sala en espera | `WAITING` con 2; al completarse arranca con reloj |
| Copia de solo lectura | Sin cambios (SHA-256 idénticos) |
| Vuelta atrás | El servidor 0.5.0 arranca sobre los datos ya escritos por 1.5 y sirve las tres salas |

Cambios de formato, todos compatibles hacia atrás y sin migración previa:

- `matches/*.json`: campo nuevo opcional `control` (reloj, asientos automáticos, jugadas
  automáticas). Se añade la primera vez que la partida vuelve a guardarse; 0.5.0 lo ignora.
- `lobbies.json`: sin cambios.
- Archivos nuevos, creados solo al usarse: `simulated-competition.json`,
  `quick-play.json` y `league.json`. 0.5.0 los ignora.

**Cambio de comportamiento a tener en cuenta:** las partidas en curso de 0.5.0 pasan a
tener reloj de turno al restaurarse. Si sus jugadores no vuelven, el servidor juega por
ellos y la partida termina sola. Es la regla aprobada en la fase «Jugar ahora».

## 3. Inspección del VPS, solo lectura (primer paso de la Parte 2)

Ningún comando de esta sección modifica nada. **Punto de control:** si algún resultado
difiere de lo esperado, me detengo y te pregunto.

```bash
whoami; hostname; uptime
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker inspect orpira-domino-api --format '{{.Config.Image}} {{.Image}} {{.Config.User}} {{.State.Health.Status}} {{.HostConfig.RestartPolicy.Name}}'
docker inspect orpira-domino-api --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}} {{index .Config.Labels "com.docker.compose.project"}}'
DEPLOY_DIR="$(docker inspect orpira-domino-api --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')"; echo "$DEPLOY_DIR"
ls -la "$DEPLOY_DIR"; sha256sum "$DEPLOY_DIR/compose.yaml"
grep -E '^(DOMINO_IMAGE_TAG|DOMINO_ALLOWED_ORIGINS)=' "$DEPLOY_DIR/.env"
docker inspect orpira-domino-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(DOMINO_|NODE_ENV|HOST|PORT)' | sort
docker volume inspect orpira_domino_data --format '{{.Mountpoint}}'
docker run --rm -v orpira_domino_data:/data:ro alpine:3.22 sh -c 'du -sh /data; find /data -type f | wc -l; ls -la /data'
docker network inspect orpira-network --format '{{range .Containers}}{{.Name}} {{end}}'
docker ps --format '{{.Names}}' | sort
ss -lntp
df -h / /var/lib/docker /opt 2>/dev/null
ls -la /opt/backups/orpira-domino 2>/dev/null || echo "sin directorio de respaldos"
NPM="$(docker ps --format '{{.Names}}' | grep -i -E 'nginx|npm|proxy' | head -1)"; echo "$NPM"
docker exec "$NPM" sh -c 'grep -l "api-domino.orpira.es" /data/nginx/proxy_host/*.conf' 2>/dev/null
docker exec "$NPM" sh -c 'f=$(grep -l "api-domino.orpira.es" /data/nginx/proxy_host/*.conf); grep -nE "server_name|set \$server|set \$port|include|X-Forwarded-For|ssl_certificate" $f' 2>/dev/null
```

Lo esperado según el repositorio, que el paso 3 debe confirmar:

- Contenedor `orpira-domino-api` con imagen `orpira/domino-api:0.5.0`, usuario `node`,
  `unless-stopped`, sin puertos publicados y en la red `orpira-network`.
- Proyecto Compose `orpira-domino`, con `compose.yaml` igual al SHA de 0.5.0 de la tabla
  anterior.
- Volumen `orpira_domino_data` en `/app/data`.
- Proxy Host de NPM hacia `orpira-domino-api:8787`, que incluye `proxy.conf`, donde se
  añade `X-Forwarded-For`. Sin esa cabecera no se activa `DOMINO_TRUST_PROXY=true` (riesgo 2).
- Respondo con datos los puntos 5 de tu Parte 1: gestor de procesos, usuario, directorio,
  proxy, certificado, tamaño de los datos y servicios vecinos. Los servicios vecinos se
  listan solo para no tocarlos.

Copia de los datos reales a este equipo, en solo lectura, y prueba local antes de
desplegar:

```bash
# En el VPS
docker run --rm -v orpira_domino_data:/data:ro alpine:3.22 tar -cz -C /data . > /tmp/domino-prod-data-$(date +%Y%m%d-%H%M).tar.gz
sha256sum /tmp/domino-prod-data-*.tar.gz
# En este equipo
scp USUARIO@167.233.139.93:/tmp/domino-prod-data-AAAAMMDD-HHMM.tar.gz ~/domino-prod-data/ && sha256sum ~/domino-prod-data/*.tar.gz
mkdir -p ~/domino-prod-data/ro && tar -xzf ~/domino-prod-data/domino-prod-data-*.tar.gz -C ~/domino-prod-data/ro && chmod -R a-w ~/domino-prod-data/ro
cp -r ~/domino-prod-data/ro ~/domino-prod-data/rw && chmod -R u+w ~/domino-prod-data/rw
docker run --rm -d --name domino-prod-copy -p 127.0.0.1:8791:8787 -v ~/domino-prod-data/rw:/app/data -e DOMINO_ALLOWED_ORIGINS=https://orpira-domino-3d.vercel.app,https://localhost orpira/domino-api:1.5-rc1
# Comprobar /health, número de salas en lobbies.json y que cada matches/*.json se restaura (logs sin errores); después:
docker stop domino-prod-copy
rm /tmp/domino-prod-data-*.tar.gz   # en el VPS, al terminar
```

## 4. Configuración de producción

Variables que lee el servidor nuevo (`apps/server/src/main.ts`) y valor propuesto. Compose
solo pasa al contenedor las que declara `compose.yaml`; el `.env` del VPS sirve únicamente
para la sustitución.

| Variable | Propuesta | Origen |
| --- | --- | --- |
| `NODE_ENV` | `production` | `compose.yaml` |
| `HOST` / `PORT` | `0.0.0.0` / `8787` | `compose.yaml` |
| `DOMINO_DATA_DIR` | `/app/data` | `compose.yaml` |
| `DOMINO_ALLOWED_ORIGINS` | Se conserva el valor actual del `.env`; debe contener `https://orpira-domino-3d.vercel.app` y `https://localhost` (APK) | `.env` |
| `DOMINO_IMAGE_TAG` | `1.5-rc1` | `.env` |
| `DOMINO_TRUST_PROXY` | `true` (solo si el paso 3 confirma `X-Forwarded-For` en NPM) | `compose.yaml` |
| `DOMINO_RATE_LIMIT_MAX` / `_WINDOW_SECONDS` | `600` / `60` | `compose.yaml` |
| `DOMINO_IDENTITY_LIMIT_MAX` / `_WINDOW_SECONDS` | `20` / `86400` | `compose.yaml` |
| `DOMINO_TURN_SECONDS` | sin definir (30 s) | — |
| `DOMINO_QUICK_PLAY_FILL_SECONDS` | sin definir (45 s) | — |
| `DOMINO_LEAGUE_POSITION_POINTS` | sin definir (`40,20,10,4`) | — |
| `DOMINO_LEAGUE_RANK_THRESHOLDS` | sin definir (`0,40,120,250,450,700,1000`) | — |
| `DOMINO_LEAGUE_TIME_ZONE` | sin definir (`America/Bogota`) | — |
| `DOMINO_AUTOMATIC_DELAY_SECONDS` | **sin definir** (1,2 s); variable de aceleración de pruebas | — |
| `DOMINO_ROUND_BREAK_SECONDS` | **sin definir** (10 s); variable de aceleración de pruebas | — |
| `DOMINO_CLOCK_TICK_MS` | **sin definir** (500 ms); variable de aceleración de pruebas | — |

`compose.yaml` de `v1.5-rc1` no declara ninguna de las tres variables de aceleración, así
que no pueden llegar al contenedor aunque aparezcan en `.env`. Se comprueba en el paso 5.4.

## 5. Ejecución (solo tras «aprobado»)

Se usa `DEPLOY_DIR` y `NPM` obtenidos en la sección 3. `STAMP` fija un único sello de
tiempo para todos los archivos.

### 5.1 Copias de seguridad (≈ 2 min, sin corte)

```bash
STAMP=$(date +%Y%m%d-%H%M); B=/opt/backups/orpira-domino; sudo install -d -m 700 "$B"
# Datos (volumen completo, en caliente; las escrituras son atómicas por archivo)
docker run --rm -v orpira_domino_data:/data:ro -v "$B":/backup alpine:3.22 tar -czf /backup/domino-data-pre-1.5-rc1-$STAMP.tar.gz -C /data .
# Build actual: imagen en ejecución, compose.yaml y .env
docker image save "$(docker inspect orpira-domino-api --format '{{.Image}}')" | gzip > "$B/domino-api-0.5.0-pre-1.5-rc1-$STAMP.tar.gz"
sudo cp -p "$DEPLOY_DIR/compose.yaml" "$B/compose.yaml-pre-1.5-rc1-$STAMP"; sudo cp -p "$DEPLOY_DIR/.env" "$B/env-pre-1.5-rc1-$STAMP"; sudo chmod 600 "$B"/env-*
sha256sum "$B"/*-$STAMP* | tee "$B/SHA256SUMS-$STAMP"
tar -tzf "$B/domino-data-pre-1.5-rc1-$STAMP.tar.gz" | head    # el archivo se puede leer
```

Rutas y sumas que quedarán registradas en `CURRENT_STATE.md`:
`/opt/backups/orpira-domino/domino-data-pre-1.5-rc1-<STAMP>.tar.gz`,
`domino-api-0.5.0-pre-1.5-rc1-<STAMP>.tar.gz`, `compose.yaml-pre-…`, `env-pre-…` y
`SHA256SUMS-<STAMP>`. Además, la etiqueta de la imagen anterior (`orpira/domino-api:0.5.0`)
sigue cargada en Docker.

### 5.2 Transferencia de la imagen (≈ 1–3 min, sin corte)

```bash
# En este equipo
scp artifacts/domino-api-1.5-rc1.tar.gz USUARIO@167.233.139.93:/tmp/
git show v1.5-rc1:compose.yaml > /tmp/compose.yaml-1.5-rc1 && scp /tmp/compose.yaml-1.5-rc1 USUARIO@167.233.139.93:/tmp/
# En el VPS
echo "77e3acf0bf4cf9dccd4b86b12db2ababaa5335687f074e03c968e4d286422522  /tmp/domino-api-1.5-rc1.tar.gz" | sha256sum -c -
echo "9030814824def92c4376341009b23b8adf3fedf8452f580760c9d3b57b90e441  /tmp/compose.yaml-1.5-rc1" | sha256sum -c -
gunzip -c /tmp/domino-api-1.5-rc1.tar.gz | docker load
docker image inspect orpira/domino-api:1.5-rc1 --format '{{.Id}}'   # debe ser sha256:57cd7d6d…80ae0
```

### 5.3 Configuración (sin corte)

```bash
cd "$DEPLOY_DIR"
sudo cp /tmp/compose.yaml-1.5-rc1 compose.yaml
sudo sed -i 's/^DOMINO_IMAGE_TAG=.*/DOMINO_IMAGE_TAG=1.5-rc1/' .env
grep -E '^DOMINO_IMAGE_TAG=' .env
```

### 5.4 Comprobación de la configuración (sin corte)

```bash
docker compose config | grep -E 'image:|DOMINO_|NODE_ENV'
docker compose config | grep -E 'AUTOMATIC_DELAY|ROUND_BREAK|CLOCK_TICK' && echo "DETENER: variable de aceleración presente" || echo "sin variables de aceleración"
```

### 5.5 Cambio de versión (corte estimado: 10–30 s)

```bash
docker compose up -d --no-deps domino-api
docker compose ps
for i in $(seq 1 12); do docker inspect --format '{{.State.Health.Status}}' orpira-domino-api; sleep 5; done
docker logs --since 2m orpira-domino-api
docker inspect orpira-domino-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'AUTOMATIC_DELAY|ROUND_BREAK|CLOCK_TICK' || echo "contenedor sin variables de aceleración"
```

Durante el corte, NPM devuelve 502 y los clientes reintentan solos; las sesiones y las
partidas se recuperan del volumen. La cola de «Jugar ahora» estaba vacía, porque la
función aún no existe en producción.

### 5.6 Comprobaciones posteriores (pegaré la salida)

```bash
# Desde este equipo
curl -sS https://api-domino.orpira.es/health
curl -sS https://api-domino.orpira.es/api/simulated-conditions
curl -sS -o /dev/null -w '%{http_code}\n' -X OPTIONS -H 'Origin: https://orpira-domino-3d.vercel.app' -H 'Access-Control-Request-Method: GET' https://api-domino.orpira.es/api/league
# Datos anteriores: mismo número de salas y partidas, todas restaurables (en el VPS)
docker run --rm -v orpira_domino_data:/data:ro alpine:3.22 sh -c 'ls /data/matches | wc -l; wc -c /data/lobbies.json'
docker exec orpira-domino-api node -e 'const fs=require("fs");const l=JSON.parse(fs.readFileSync("/app/data/lobbies.json")).lobbies;let ok=0;for(const x of l){if(!x.started){ok++;continue}const m=JSON.parse(fs.readFileSync("/app/data/matches/"+x.matchId+".json"));if(m.state&&m.sessions)ok++}console.log("salas",l.length,"válidas",ok)'
# Partida completa de Jugar ahora con bots (~6–10 min) y concesión única de liga
node scripts/production-smoke.mjs https://api-domino.orpira.es
# Límite de peticiones (bloquea esta IP como mucho 60 s)
node scripts/production-smoke.mjs https://api-domino.orpira.es --rate-limit
```

El número de salas y partidas debe coincidir con el inventario de la sección 3. La prueba
de humo crea en producción una identidad «QA MM-DD HH:MM» y una partida pública con
tres bots, que quedarán en la liga de octubre con 1–10 puntos. Si prefieres no dejar
rastro, puedo excluir ese alias a mano después, con tu aprobación.

### 5.7 Web v1.5-rc1 (≈ 1 min de build en Vercel; sin corte)

```bash
git worktree add --detach /tmp/domino-v1.5-rc1 v1.5-rc1 && cd /tmp/domino-v1.5-rc1
vercel link --yes --project orpira-domino-3d
vercel deploy --prod
curl -s https://orpira-domino-3d.vercel.app/ | grep -o 'assets/index-[^"]*'   # debe cambiar respecto a index-B5dFSCIK.js
```

La web se publica **después** de la API: la web antigua es compatible con la API nueva,
porque las rutas de salas no cambian. Nota: un `push` posterior a `main` volverá a
publicar `main` automáticamente.

### 5.8 APK en el Samsung y capturas

```bash
sha256sum artifacts/domino3d-orpira-1.5-rc1-debug.apk   # f4f2c5d0…bb2
adb install -r artifacts/domino3d-orpira-1.5-rc1-debug.apk
```

Capturas reales de Inicio, Jugar ahora, mesa con reloj, resultado, Liga y Cuenta contra
producción. Al final, actualizo `CURRENT_STATE.md` con la versión, la fecha, la etiqueta y
las rutas y SHA-256 de las copias.

## 6. Vuelta atrás

Se aplica si cualquier comprobación de 5.6 falla. Te aviso en cuanto la ejecute.

**API, solo código (preferente; los datos de 1.5 son legibles por 0.5.0, probado):**

```bash
cd "$DEPLOY_DIR"
sudo cp "/opt/backups/orpira-domino/compose.yaml-pre-1.5-rc1-$STAMP" compose.yaml
sudo cp "/opt/backups/orpira-domino/env-pre-1.5-rc1-$STAMP" .env && sudo chmod 600 .env
docker image inspect orpira/domino-api:0.5.0 >/dev/null 2>&1 || gunzip -c "/opt/backups/orpira-domino/domino-api-0.5.0-pre-1.5-rc1-$STAMP.tar.gz" | docker load
docker compose up -d --no-deps domino-api
docker compose ps; curl -sS https://api-domino.orpira.es/health
```

**Datos, solo si se detecta corrupción.** Destructivo para lo escrito desde la copia:

```bash
docker compose stop domino-api
docker run --rm -v orpira_domino_data:/data:ro -v /opt/backups/orpira-domino:/backup alpine:3.22 tar -czf /backup/domino-data-failed-1.5-rc1-$(date +%Y%m%d-%H%M).tar.gz -C /data .
echo "<SHA de SHA256SUMS-$STAMP>  /opt/backups/orpira-domino/domino-data-pre-1.5-rc1-$STAMP.tar.gz" | sha256sum -c -
docker run --rm -v orpira_domino_data:/data -v /opt/backups/orpira-domino:/backup:ro alpine:3.22 sh -c "find /data -mindepth 1 -delete && tar -xzf /backup/domino-data-pre-1.5-rc1-$STAMP.tar.gz -C /data"
docker compose up -d --no-deps domino-api
```

**Web:**

```bash
vercel promote https://orpira-domino-3d-4j0q5csr2-orpira-7163s-projects.vercel.app --yes
curl -s https://orpira-domino-3d.vercel.app/ | grep -o 'assets/index-[^"]*'   # vuelve a index-B5dFSCIK.js
```

**APK:** la 1.4 no se puede reinstalar encima de la 1.5 sin desinstalar, por el
`versionCode` menor. Con la API vuelta a 0.5.0, la APK 1.5 muestra «no disponible» en las
funciones nuevas y la mesa entre amigos sigue funcionando.

## 7. Riesgos

1. **Acceso SSH (bloqueante).** Sin él, no hay inspección, copia real ni ejecución por mi parte.
2. **`X-Forwarded-For` en NPM.** Si el Proxy Host no lo añade, con `DOMINO_TRUST_PROXY=true`
   el cliente podría elegir su clave de límite; con `false`, todos los usuarios
   compartirían la IP del proxy y el límite de 600/min sería global. Se confirma en la
   sección 3; si falta, me detengo.
3. **Partidas 0.5.0 en curso.** Pasan a tener reloj y pueden terminar con jugadas
   automáticas si sus jugadores no vuelven (regla aprobada, pero es un cambio visible).
4. **Datos reales no probados.** La compatibilidad se probó con datos sintéticos
   generados por el mismo código 0.5.0. La copia real de la sección 3 lo confirmará antes
   del cambio.
5. **Identidad y límites en memoria.** Un reinicio vacía la cola de «Jugar ahora» y
   reinicia los contadores de límite. Es una sola instancia y no escala horizontalmente.
6. **Rastro de QA en producción.** Una identidad y una partida de prueba quedan en la liga
   y el historial públicos.
7. **Web fuera de `main`.** Producción quedaría en `v1.5-rc1` mientras `main` sigue en
   `f0dddf1`; un `push` a `main` antes de la fusión revertiría la web.
8. **Espacio en disco.** La imagen nueva ocupa 237 MB más las copias; se comprueba con
   `df -h` en la sección 3.

## 8. Lo que no puedo verificar ahora

- El estado real del VPS: directorio, `.env`, usuario, versión exacta en ejecución,
  configuración de NPM y servicios vecinos.
- El tamaño y el contenido de los datos de producción, y su compatibilidad real.
- La CORS de producción con los orígenes actuales de `.env`.
- El comportamiento bajo tráfico real de varios usuarios tras el mismo NAT.
