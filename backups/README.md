# Respaldo recuperable de fase 3

`phase3-working-tree-20261011.tar.gz` contiene el árbol completo del proyecto al
cierre de fase 3, excluyendo `.git`, `node_modules`, `dist` y el propio directorio
de respaldos. No contiene variables `.env`, claves ni credenciales.

Para inspeccionarlo sin sobrescribir el proyecto:

```bash
mkdir -p /tmp/domino-phase3-restore
tar -xzf backups/phase3-working-tree-20261011.tar.gz -C /tmp/domino-phase3-restore
cd /tmp/domino-phase3-restore
npm install
npm run check
npm run build
```

La suma SHA-256 se registra después de crear el archivo en la sección siguiente.

## Integridad

```text
f249d9c3f0f49652e85345324b4f8babbc0103fd0f12ccaa46a38c5c98a3abba  phase3-working-tree-20261011.tar.gz
```

## Respaldo posterior de fase 4 local

`phase4-local-working-tree-20261011.tar.gz` contiene además el protocolo y servidor
autoritativo local. Se creó con las mismas exclusiones y se verificó con `gzip -t`.

```text
26d33dfd4f72b0590df09ee185c05be40cc1a2df2f80055fec5ef17c609e805f  phase4-local-working-tree-20261011.tar.gz
```

## Fase 4 local completa

`phase4-complete-local-20261011.tar.gz` añade lobby privado, cliente online 3D,
servidor ejecutable y persistencia local. Excluye `.data/`, por lo que no contiene
sesiones o partidas de prueba, además de las exclusiones anteriores.

```text
3743111ca992a457d2ab79a3723a91eb03a1fdbe83d3149694baf97b06bb1fd1  phase4-complete-local-20261011.tar.gz
```

## Presentación vertical de la mano

`phase4-vertical-hand-20261011.tar.gz` conserva el proyecto después de adaptar las
fichas de la mano en local y online. Mantiene las mismas exclusiones y fue validado
con `gzip -t`.

```text
06f577bbe1eb0ab32d7b1c0e1f295ab2b8a5718b12a263a846dc70ca52744ab9  phase4-vertical-hand-20261011.tar.gz
```

## Corrección de apertura online en móvil

`phase4-online-opening-fix-20261011.tar.gz` incluye la selección explícita del
6–6, el botón de apertura y la compatibilidad con navegadores sin
`crypto.randomUUID()` en HTTP local. Se verificó con `gzip -t`.

```text
abcb3871c25654ebaa98718189396f587a7e7332cd3ee68a9b4d79e30fddb765  phase4-online-opening-fix-20261011.tar.gz
```

## QA online preparado

`phase4-online-qa-prepared-20261011.tar.gz` añade la matriz manual pendiente, el
inventario para una futura prueba privada y la trazabilidad de la regresión de
apertura. Excluye `.git`, dependencias, builds, `.data/`, respaldos y secretos; se
verificó con `gzip -t`.

```text
03c759c1cce469956c00d156d7f8be2ca64e569da0b5a698aa425388dc598092  phase4-online-qa-prepared-20261011.tar.gz
```

## Objetivos y resultados online

`phase4-online-results-ui-20261011.tar.gz` incorpora el objetivo y progreso hacia
100, resúmenes de ronda, final persistente, clasificación con empates y las nuevas
regresiones. Se verificó con `gzip -t` y conserva las exclusiones anteriores.

```text
4cd7e9a5ab7094798cf195471bfe06809ee11ac6f175bcb42c2b49aadc62253b  phase4-online-results-ui-20261011.tar.gz
```

## Colocación simplificada

`phase4-simplified-placement-20261011.tar.gz` contiene la interacción común local
y online basada en `legalActions`, objetivos táctiles de extremo, invalidación por
revisión y bloqueo de doble envío. Se verificó con `gzip -t`.

```text
3ab2d76e10d278a76f30908dc622d019a6241b47f5c5ad4970536d38ad4ca53e  phase4-simplified-placement-20261011.tar.gz
```

## Despliegue y APK preparados

`phase5-deployment-apk-prepared-20261011.tar.gz` conserva fuentes, configuración
Docker/Compose/Vercel, proyecto Capacitor Android y la APK debug en `artifacts/`.
Excluye Git, dependencias, builds intermedios, datos de partidas, secretos y
respaldos anteriores. Incluye únicamente `.env.example` como plantilla pública.

```text
e93fec25ae0b76c8487b4ecf6377e74646b8fe156462ba2719fe62b5122f989f  phase5-deployment-apk-prepared-20261011.tar.gz
```

## Identidad visual y APK 1.1

`domino3d-orpira-identity-android-1.1-20261011.tar.gz` conserva los tres maestros
visuales, recursos web, launchers Android, configuración modificada, documentación y
la APK debug 1.1. No contiene `.git`, dependencias, datos de partidas ni secretos.

```text
dd49d53f41cec7b27abf594a552bcaea667f78a7466b28489b16637e4a32db6c  domino3d-orpira-identity-android-1.1-20261011.tar.gz
```
