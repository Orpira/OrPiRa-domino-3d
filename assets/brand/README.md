# Identidad visual Domino3D-OrPiRa

## Maestros

- `domino3d-orpira-master.png`: original entregado por el titular, sin cambios.
- `domino3d-orpira-icon-master.png`: variante simplificada para tamaños pequeños;
  conserva dos fichas, órbita dorada, destellos y π, y omite el nombre ilegible.
- `domino3d-orpira-foreground-master.png`: primer plano transparente para el icono
  adaptativo Android.

Los archivos de `previews/` muestran los recortes rectangular redondeado, circular y
adaptativo circular usados para QA. No son recursos cargados por la aplicación.

## Generación

Las dos variantes se generaron con la herramienta integrada de edición de imágenes,
usando el original como referencia. El prompt de la variante pequeña pidió conservar
el estilo 3D marfil, dorado y esmeralda, centrar las dos fichas y π dentro de la zona
segura y omitir solamente el nombre. El segundo prompt eliminó el fondo para obtener
un primer plano transparente, sin rediseñar los elementos.

Los tamaños finales se derivan con FFmpeg mediante escala proporcional. Los launchers
clásicos usan máscaras alfa redondeada y circular; el primer plano adaptativo ocupa el
61 % del lienzo de 108 dp y se combina con `#006B4F`.
