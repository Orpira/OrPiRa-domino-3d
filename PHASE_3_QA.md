# Cierre y QA de fase 3

Fecha: 11 de octubre de 2026. No se ha iniciado multijugador online.

## Comprobaciones ejecutadas

- `npm run typecheck`: TypeScript estricto sin errores.
- `npm test`: 36 pruebas aprobadas, 0 fallos.
- `npm run build`: build Vite/React/Three.js correcto y sin aviso de tamaño.
- `npm run replay`: partida determinista de cinco dominadas hasta 100.
- `npm audit --audit-level=high`: 0 vulnerabilidades.
- 500 partidas legales generadas conservan las 28 identidades, conexiones y puntos.
- Integración completa hasta 100 en modalidad humano + bots.
- Integración completa hasta 100 en modalidad de cuatro humanos, sin activar bots.
- Checkpoint: serialización, restauración exacta, eliminación y rechazo de corrupción.
- Revisión estática responsive: breakpoints a 600 px, mesa de altura adaptable,
  mano con salto de línea, marcador 2×2 móvil y controles táctiles grandes.
- Revisión de privacidad: durante el relevo la mano no se renderiza; solo permanecen
  mesa, marcador y cantidades públicas. El botón de confirmación recibe foco.
- Revisión de interacción: `Pasar` depende de `legalActions`, los turnos de bots se
  serializan, cambiar de modalidad pide confirmación si la partida ya avanzó y el
  modo de movimiento reducido elimina la animación ambiental.
- Revisión 3D estática: la escena usa la cadena confirmada del motor, libera texturas,
  materiales, geometrías, observador y animación al desmontarse; WebGL tiene fallback.

## QA visual manual

El 11 de octubre de 2026 el responsable del producto confirmó: «todo probado ok sin
novedades» tras probar la aplicación. Con esa evidencia, la fase 3 queda aceptada
manualmente sin defectos visuales o de interacción comunicados.

No hubo herramienta de navegador controlable disponible para recopilar capturas o
mediciones automatizadas. Las siguientes comprobaciones siguen siendo regresiones
recomendadas para futuras versiones, no bloqueos de fase 3:

1. Chrome/Firefox/Safari de escritorio: proporciones, sombras, legibilidad de pintas
   y cadena completa de hasta 28 fichas.
2. Android Chrome e iPhone Safari: orientación vertical/horizontal, áreas táctiles,
   safe areas, teclado/zoom y rendimiento WebGL.
3. Flujo de relevo: que ninguna mano anterior sea visible durante la entrega física.
4. Recarga/cierre de pestaña en mitad de turno, durante relevo y al terminar ronda.
5. WebGL desactivado o dispositivo limitado: claridad del fallback accesible.
6. Preferencia del sistema `prefers-reduced-motion` y control manual de movimiento.

Cuando se comunique un defecto futuro, debe registrarse aquí con dispositivo,
navegador, pasos y resultado esperado.

## Regresión de cadena serpenteante — 11 de octubre de 2026

- Prueba pura de geometría en escritorio y móvil: 6–6 exactamente en `(0, 0)`,
  vertical y estable; crecimiento LEFT/RIGHT independiente sin mover posiciones
  anteriores; 28 fichas con posiciones únicas; dobles perpendiculares al tramo.
- Captura automatizada con Chrome nativo y la mesa 3D real, cadena legal completa:
  `assets/qa/serpentine-desktop.png` y `assets/qa/serpentine-mobile.png`.
- Los blancos táctiles de extremos proceden de la proyección de las posiciones 3D;
  los botones accesibles permanecen disponibles. La legalidad sigue procediendo
  exclusivamente de `legalActions`.
- Verificados TypeScript, 59 pruebas y build web de producción.

Pendiente de comprobación manual, sin marcar como aprobado: fluidez temporal de la
animación en un dispositivo móvil real, toque sobre ambos blancos durante una
elección y WebGL en Safari/iOS. Las capturas automatizadas validan composición,
anclaje, escala y ausencia visual de recortes, pero no sustituyen esas interacciones.

Tras la revisión visual del usuario se compactó la separación: cada posición queda
a menos de 1,35 longitudes escaladas de la anterior y la llegada comienza sobre la
ficha vecina interior. La animación dura 520 ms y conserva inmóviles las fichas ya
confirmadas.

## Bloqueo de Git y recuperación

`findmnt -T .git` confirma que `.git` es un punto de montaje independiente `ext4`
con opciones `ro,nosuid,nodev,relatime,errors=remount-ro`. `stat`, `namei`, `lsattr`
y `getfacl` muestran propietario y permisos de escritura normales, sin atributo
inmutable ni ACL restrictiva. El bloqueo procede del montaje de solo lectura.

El historial no fue borrado ni reconstruido. `HEAD` sigue en `d7726a9` sobre `main`.
Para registrar fase 3, el responsable del entorno debe volver a montar ese punto
como escribible o trabajar sobre una copia normal del repositorio. Después:

```bash
git add README.md ACCEPTANCE_TESTS.md CURRENT_STATE.md PHASE_3_QA.md package.json package-lock.json apps/client
git commit -m "feat: close persistent local 3d phase"
```

Antes de hacerlo, comparar el respaldo indicado en `CURRENT_STATE.md` con el árbol
de trabajo y volver a ejecutar `npm run check && npm run build`.
