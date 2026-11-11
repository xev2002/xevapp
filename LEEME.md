# Xevapp — cómo publicarla gratis desde tu iPhone (GitHub Pages)

1. Descomprime `xevapp.zip` en la app Archivos (tócalo una vez).
2. Crea una cuenta gratis en github.com (en Safari).
3. Toca "+" → **New repository** → nombre: `xevapp` → **Public** → *Create repository*.
4. Toca **uploading an existing file** y sube los 8 archivos:
   `index.html`, `sw.js`, `manifest.webmanifest`, `gsap.min.js`, `Flip.min.js`, `icon-180.png`, `icon-192.png`, `icon-512.png` → **Commit changes**.
5. En el repositorio: **Settings → Pages → Branch: main / (root) → Save**.
6. Espera 1–2 minutos. Tu app queda en `https://TU-USUARIO.github.io/xevapp/`.
7. Ábrela en Safari → Compartir → **Añadir a pantalla de inicio**.
8. Abre Xevapp desde el ícono → Ajustes (engranaje) → pega tu clave gratis de OpenRouter (openrouter.ai → Keys) → **Probar conexión** → Guardar.
9. Para avisos **siempre** (con la app cerrada) sigue `AVISOS.md` una vez (servidor gratis en Cloudflare, ~10 min).

Para actualizar la app más adelante, vuelve a subir `index.html` (y cambia `xevapp-v3` por `xevapp-v4` en `sw.js` para que el iPhone tome la versión nueva).


## Voz y botón de acción

Mira `XEVA_VOZ.md`. Después de subir los archivos, vuelve a pegar `xevapp-avisos-worker.js` en tu Worker de Cloudflare (Edit code → Deploy).
