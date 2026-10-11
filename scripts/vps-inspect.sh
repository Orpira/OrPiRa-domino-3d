#!/bin/sh
# Inspección de solo lectura del VPS para DEPLOY_PLAN.md (sección 3). No modifica nada.
# Uso en el VPS, con el usuario que gestiona Docker:  sh vps-inspect.sh 2>&1 | tee /tmp/domino-inspect.txt
# No muestra secretos: de .env solo imprime DOMINO_IMAGE_TAG y DOMINO_ALLOWED_ORIGINS.
section() { printf '\n===== %s =====\n' "$1"; }

section "máquina"; whoami; hostname; uptime; date -u
section "contenedores"; docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
section "contenedor domino"
docker inspect orpira-domino-api --format 'imagen={{.Config.Image}} id={{.Image}} usuario={{.Config.User}} salud={{.State.Health.Status}} reinicio={{.HostConfig.RestartPolicy.Name}} inicio={{.State.StartedAt}}'
docker inspect orpira-domino-api --format 'proyecto={{index .Config.Labels "com.docker.compose.project"}} directorio={{index .Config.Labels "com.docker.compose.project.working_dir"}}'
docker inspect orpira-domino-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(DOMINO_|NODE_ENV|HOST|PORT)' | sort
docker inspect orpira-domino-api --format 'redes={{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}} puertos={{json .HostConfig.PortBindings}}'
DEPLOY_DIR="$(docker inspect orpira-domino-api --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')"
section "directorio de despliegue: $DEPLOY_DIR"; ls -la "$DEPLOY_DIR"
sha256sum "$DEPLOY_DIR/compose.yaml" 2>/dev/null
grep -E '^(DOMINO_IMAGE_TAG|DOMINO_ALLOWED_ORIGINS)=' "$DEPLOY_DIR/.env" 2>/dev/null
section "imágenes domino"; docker images orpira/domino-api --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedSince}} {{.Size}}'
section "datos"; docker volume inspect orpira_domino_data --format 'volumen={{.Name}} ruta={{.Mountpoint}}'
docker run --rm -v orpira_domino_data:/data:ro alpine:3.22 sh -c 'du -sh /data; echo "archivos: $(find /data -type f | wc -l)"; ls -la /data; ls /data/matches 2>/dev/null | wc -l'
section "red compartida orpira-network"; docker network inspect orpira-network --format '{{range .Containers}}{{.Name}} {{end}}'
section "puertos en escucha"; ss -lntp 2>/dev/null || ss -lnt
section "disco"; df -h / /var/lib/docker /opt 2>/dev/null
section "respaldos existentes"; ls -la /opt/backups/orpira-domino 2>/dev/null || echo "sin directorio /opt/backups/orpira-domino"
section "Nginx Proxy Manager"
NPM="$(docker ps --format '{{.Names}} {{.Image}}' | grep -i -E 'nginx-proxy-manager|jc21' | head -1 | cut -d' ' -f1)"; echo "contenedor: ${NPM:-no encontrado}"
if [ -n "$NPM" ]; then
  FILE="$(docker exec "$NPM" sh -c 'grep -l "api-domino.orpira.es" /data/nginx/proxy_host/*.conf' 2>/dev/null)"; echo "configuración: ${FILE:-no encontrada}"
  [ -n "$FILE" ] && docker exec "$NPM" sh -c "grep -nE 'server_name|set \\\$server|set \\\$port|set \\\$forward_scheme|include|X-Forwarded-For|ssl_certificate ' $FILE"
  docker exec "$NPM" sh -c 'grep -n "X-Forwarded-For" /etc/nginx/conf.d/include/proxy.conf' 2>/dev/null
fi
section "fin"
