# Avisos siempre en Xevapp (gratis, una sola vez, ~10 min desde el iPhone)

Para que Xevapp te avise **con la app cerrada** (pagos, rutinas, tareas, eventos, ahorro, investigaciones listas), necesita un pequeño servidor que le "toque la puerta" al iPhone a la hora exacta. Cloudflare lo da gratis.

**Antes:** Xevapp debe estar publicada (GitHub Pages) e **instalada en tu pantalla de inicio**, con iOS 16.4 o superior.

## 1. Crea el servidor
1. Entra a **dash.cloudflare.com** en Safari y crea una cuenta gratis.
2. Menú → **Workers y Pages** → **Crear** → **Crear Worker** → nombre: `xevapp-avisos` → **Implementar**.
3. Toca **Editar código**, borra todo y pega el contenido de `xevapp-avisos-worker.js` → **Implementar**.
   - Opcional: en la línea `CONTACT` pon tu correo (`mailto:tu@correo.com`).

## 2. Dale memoria (KV)
1. Menú → **Almacenamiento y bases de datos → KV** → **Crear** → nombre: `xevapp` → Crear.
2. Vuelve a tu Worker → **Configuración → Enlaces (Bindings)** → **Añadir → Espacio de nombres KV**.
   - Nombre de variable: **`XEVA`** (exacto, en mayúsculas) → elige `xevapp` → Guardar.

## 3. Ponle reloj (Cron)
1. En tu Worker → **Configuración → Desencadenadores (Triggers) → Desencadenadores Cron** → **Añadir**.
2. Expresión: `* * * * *` (cada minuto) → Guardar.

## 4. Conéctalo a Xevapp
1. Copia la dirección del Worker (algo como `https://xevapp-avisos.TU-USUARIO.workers.dev`).
   - Ábrela en Safari: debe decir `{"ok":true,"app":"Xevapp avisos"}`.
2. Abre **Xevapp desde el ícono** → ⚙️ Ajustes → **Avisos siempre** → pega la dirección → **Conectar avisos** → Permitir.
3. Toca **Enviar aviso de prueba**, bloquea el iPhone y espera unos segundos. 🎉

## Qué te avisa
| Qué | Cuándo |
|---|---|
| ☀️ Plan del día (Debo/Debería) | A la hora de "Resumen diario" (7:00 por defecto) |
| 🌱 Rutinas | A su hora de inicio, en sus días |
| 🔔 Recordatorios y 📅 eventos | A su hora; diarios, semanales, mensuales o anuales |
| Tareas con recordatorio | A la hora que pusiste |
| 💳 Pagos | 2 días antes (9:00) y el mismo día (8:00) |
| 💰 Aportes a metas (ej. el Lancer) | El día del mes que elegiste, 9:00 |
| 🔎 Investigaciones | Cuando toca revisarlas |
| 🗓️ Ritual semanal | Domingos 19:00 |

## Bueno saber
- Xevapp envía al servidor los avisos de los **próximos 45 días** cada vez que cambias algo. Si pasas más de 45 días sin abrirla, ábrela una vez para renovarlos.
- Al servidor solo viajan título y texto corto de cada aviso, nunca montos de tus metas ni tu clave de IA.
- Las **investigaciones** se procesan cuando abres Xevapp con internet (el servidor no usa tu clave de IA). Luego te avisa para revisarlas.
- Plan gratuito de Cloudflare: de sobra para uso personal.
- Si cambias de iPhone o reinstalas Xevapp, vuelve a tocar **Conectar avisos**.
