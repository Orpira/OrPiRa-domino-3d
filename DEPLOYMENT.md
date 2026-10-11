# Despliegue preparado: web, API y Android

Estado al 11 de octubre de 2026: archivos y artefactos locales preparados. No se ha
modificado el VPS, Vercel ni DNS. El online no se considera habilitado hasta validar
HTTPS y una partida entre cuatro clientes externos.

## Arquitectura prevista

- Web estática React/Vite en Vercel.
- API autoritativa única en `https://api-domino.orpira.es`.
- Contenedor `orpira-domino-api`, sin puertos publicados al host, conectado a la red
  Docker externa `orpira-network` que comparte Nginx Proxy Manager.
- Volumen exclusivo `orpira_domino_data` montado en `/app/data` para salas, sesiones,
  snapshots e idempotencia.
- Una sola réplica mientras la cola y el registro de salas permanezcan en memoria.
- APK Capacitor con los recursos web incluidos; no carga la aplicación desde una URL
  remota. Solo consulta la API por HTTPS.

## DNS requerido

Crear un único registro:

```text
Tipo: A
Nombre: api-domino
Destino: 167.233.139.93
TTL: 300 durante la puesta en marcha; después puede aumentarse
Proxy/CDN: desactivado durante la primera validación
```

La comprobación del 11 de octubre de 2026 encontró dos respuestas A actuales,
`64.29.17.65` y `64.29.17.1`; deben eliminarse o sustituirse. No solicitar el
certificado hasta que todos los resolutores devuelvan `167.233.139.93`.

## Vercel

El proyecto `orpira-domino-3d` está conectado al repositorio privado
`Orpira/OrPiRa-domino-3d` y publicado en:

```text
https://orpira-domino-3d.vercel.app
```

Usa la raíz del monorepo, no `apps/client`, porque el cliente importa
`packages/rules` y `packages/protocol`.
`vercel.json` deja fijados:

```text
Install Command: npm ci
Build Command: npm run build:web
Output Directory: dist/client
```

El build incrusta `https://api-domino.orpira.es`. Configurar el backend con
`DOMINO_ALLOWED_ORIGINS=https://orpira-domino-3d.vercel.app,https://localhost`.
No autorizar `*.vercel.app`: cada preview que vaya a probarse se añade explícitamente
o se prueba desde el dominio estable elegido.

## Preparación en el VPS

Falta acceso SSH autorizado para confirmar la ruta. Propuesta reversible:
`/opt/orpira/domino-3d`. Antes de copiar archivos, inspeccionar sin cambios:

```bash
docker network inspect orpira-network
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
ss -lntp
df -h /opt
```

Después de confirmar la ruta y realizar un respaldo del árbol anterior si existiera:

```bash
cd /opt/orpira/domino-3d
cp .env.example .env
chmod 600 .env
```

Editar `.env` localmente en el VPS, sin enviarlo al chat:

```text
DOMINO_IMAGE_TAG=0.5.0
DOMINO_ALLOWED_ORIGINS=https://DOMINIO-REAL-DE-VERCEL,https://localhost
```

Construir e iniciar únicamente este proyecto:

```bash
docker compose config
docker compose build --pull domino-api
docker compose up -d --no-deps domino-api
docker compose ps
docker inspect --format '{{json .State.Health}}' orpira-domino-api
```

No usar `docker compose down` sobre otros proyectos, no publicar `8787:8787` y no
conectar el servicio a PostgreSQL o Redis existentes.

## Nginx Proxy Manager

Crear un **Proxy Host** con estos valores exactos después de corregir DNS:

```text
Domain Names: api-domino.orpira.es
Scheme: http
Forward Hostname / IP: orpira-domino-api
Forward Port: 8787
Cache Assets: off
Block Common Exploits: on
Websockets Support: off (el transporte actual es HTTP con polling)
Access List: Publicly Accessible para la prueba externa
```

En SSL:

```text
SSL Certificate: Request a new SSL Certificate (Let's Encrypt)
Force SSL: on
HTTP/2 Support: on
HSTS Enabled: on
HSTS Subdomains: off, salvo que todos los subdominios estén preparados
```

Nginx Proxy Manager y `orpira-domino-api` deben compartir `orpira-network`. No crear
otro proxy y no exponer el puerto interno. Validación posterior:

```bash
curl --fail --silent --show-error https://api-domino.orpira.es/health
```

Debe devolver `{"ok":true}`. Verificar además un preflight desde cada origen permitido.

## Respaldo

Crear el directorio de respaldos con permisos administrativos y ejecutar antes de
cada actualización:

```bash
sudo install -d -m 700 /opt/backups/orpira-domino
docker run --rm \
  -v orpira_domino_data:/data:ro \
  -v /opt/backups/orpira-domino:/backup \
  alpine:3.22 tar -czf /backup/domino-data-AAAA-MM-DD-HHMM.tar.gz -C /data .
sha256sum /opt/backups/orpira-domino/domino-data-AAAA-MM-DD-HHMM.tar.gz
```

Guardar también el archivo fuente o la referencia exacta de la versión desplegada.
Los respaldos no deben copiarse dentro de la imagen ni subirse a Vercel.

## Reversión

Para volver al contenedor anterior sin tocar datos, fijar su etiqueta en `.env`:

```text
DOMINO_IMAGE_TAG=ETIQUETA_ANTERIOR
```

Después:

```bash
docker compose up -d --no-deps domino-api
docker compose ps
```

Si también hay que restaurar datos, detener solo el backend, respaldar primero el
estado actual y restaurar el archivo elegido:

```bash
docker compose stop domino-api
docker run --rm \
  -v orpira_domino_data:/data \
  -v /opt/backups/orpira-domino:/backup:ro \
  alpine:3.22 sh -c 'find /data -mindepth 1 -delete && tar -xzf /backup/ARCHIVO.tar.gz -C /data'
docker compose up -d --no-deps domino-api
```

La restauración de datos es destructiva para el contenido actual del volumen; debe
usarse solo con el respaldo actual ya comprobado y el nombre de archivo resuelto.

## APK de prueba

Construcción reproducible:

```bash
npm ci
npm run android:apk
```

Salida de entrega: `artifacts/domino-3d-0.5.0-debug.apk`.

```text
SHA-256: 5f89c0812e10dbf12bda97913d5db467cb68f8a2a1100f70d26d2b5de44abfce
Firma: Android Debug, APK Signature Scheme v2 verificada
```

También se genera en `android/app/build/outputs/apk/debug/app-debug.apk`. Es una APK
debug, no una versión publicable. Para instalar con un dispositivo autorizado por ADB:

```bash
adb devices -l
adb install -r artifacts/domino-3d-0.5.0-debug.apk
```

La sesión online usa almacenamiento local dentro de la aplicación nativa para poder
recuperar el asiento tras cerrar y abrir. En web continúa usando `sessionStorage` para
mantener independientes cuatro ventanas o perfiles.

## Criterio de habilitación

No declarar online habilitado hasta completar, desde redes externas distintas:

1. DNS único y certificado válido.
2. `/health` por HTTPS y CORS desde Vercel y Android.
3. Cuatro sesiones independientes hasta 100.
4. Privacidad de manos, recarga, desconexión y reconexión sin pases ni puntos.
5. Reinicio controlado del contenedor y recuperación del estado final.
