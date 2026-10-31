# Liga Fitboxers

Extensión de Chrome que lee las clases de la app del club (myh4c.brooklynfitzone.com),
calcula los puntos de la liga y publica los resultados en GitHub Pages.

## Cómo funciona
1. Tienes la app del club abierta en Chrome con la sesión iniciada.
2. En la extensión eliges el día y pulsas **Publicar resultados del día**. La extensión pide a la app las clases terminadas de ese día, sus asistentes y la ficha de cada asistente (su historial de entrenamientos), con tu misma sesión. No guarda contraseñas, cookies, correos, teléfonos ni pagos.
3. El motor de reglas (`extension/engine/`) recalcula todos los puntos. Procesar dos veces lo mismo no duplica nada, y las correcciones quedan en el historial.
4. Se suben en un único commit `data/league.json` (clasificación) y `data/days/AAAA-MM-DD.json` (resultados del día). Solo nombre e inicial del apellido.
5. La GitHub Action `.github/workflows/pages.yml` construye la web (`site/build.mjs`) y la publica en GitHub Pages.

Los datos completos se guardan solo en tu navegador (IndexedDB). Desde Opciones puedes exportar una copia de seguridad.

## Puesta en marcha
1. Chrome → `chrome://extensions` → activa "Modo desarrollador" → "Cargar descomprimida" → carpeta `extension/`.
2. En GitHub, en el repo: Settings → Pages → Source: **GitHub Actions**.
3. Crea un token fine-grained (GitHub → Settings → Developer settings → Fine-grained tokens) solo para este repo con permiso **Contents: Read and write**, y pégalo en las Opciones de la extensión. El token se queda en tu navegador.

## Desarrollo
```
npm test          # tests del motor, lectura de la app y publicación
npm run build     # genera la web en _site/ a partir de data/
```

## Referidos
La app no guarda quién recomendó a quién. Se apunta a mano en Opciones → Referidos, y los
puntos se dan con las fechas reales de la clase de iniciación y del alta que aparecen en la
ficha del fitboxer.
