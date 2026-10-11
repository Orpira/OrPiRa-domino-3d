# Estado actual

Fecha: 11 de octubre de 2026. Fase 2 completada.

## Implementado

- Motor TypeScript puro en `packages/rules`.
- Perfil confirmado, set doble seis, reparto aleatorio inyectable y reparto explícito.
- Inicio/nueva ronda, colocación, pase, dominada, cierre, puntuación y final de partida.
- Estados inmutables, revisión optimista, errores tipados y eventos ordenados.
- Consultas de acciones legales, resultado y vista privada.
- Suite de aceptación, prueba generativa y replay completo hasta 100.
- Cliente React/Vite responsive para un humano y tres bots.
- Selección de ficha/extremo, pase legal, cadena, marcador, resultados, rondas y reinicio.
- Bots deterministas limitados a su `PlayerView` y acciones legales.
- Control de turnos de bots sin acciones simultáneas o duplicadas.

## Comprobación reproducible

```bash
npm install
npm run check
npm run build
npm run replay
```

Resultado de referencia: 32 pruebas aprobadas, 0 fallos; TypeScript sin errores;
build de producción correcto; replay con P0 campeón, marcador final P0=100 y resto=0.

## Límites deliberados

No se han iniciado las fases 3–6. No existen aún mesa 3D, relevo para cuatro humanos,
servidor, idempotencia por `commandId`, persistencia/checkpoint ni aplicaciones
móviles. La partida se conserva únicamente mientras la pestaña permanece abierta.
El entorno no ofrecía una herramienta de navegador controlable, por lo que la UI
se validó mediante tipos, integración del controlador y build de producción, no con
una sesión visual automatizada.

No había repositorio Git válido. El entorno mantiene `.git` como montaje especial
de solo lectura y bloqueó `git init`; las exclusiones de dependencias, builds,
credenciales y claves sí están preparadas en `.gitignore`. En un checkout normal:

```bash
rm -rf .git # solo si sigue siendo el directorio vacío heredado
git init -b main
git add . && git commit -m "feat: complete local game phase 2"
```

## Siguiente tarea autorizable

Fase 3: cliente 3D responsive y relevo local, manteniendo este mismo controlador y
motor. Validar en navegador móvil y escritorio antes de empaquetar.
