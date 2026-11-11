# Xeva por voz: botón de acción, Siri y mensaje flotante

Todo vive en Xevapp. Tus recordatorios, eventos, rutinas y pagos **no pasan por el Calendario ni por Recordatorios del iPhone**: los avisa el servidor de Xevapp (Cloudflare, gratis) como notificaciones push.

## Qué vas a poder hacer

| Dices | Xeva hace |
|---|---|
| "Recuérdame mañana a las 3 de la tarde pagar el arriendo" | Crea el recordatorio y te avisa a esa hora con la app cerrada. |
| "Anota comprar leche" / "Agrega llamar a mamá hoy a las 8 pm" | Crea la tarea (con fecha si la dices). |
| "¿Qué me toca hoy por la tarde?" | Te responde **en voz alta** y con un **mensaje flotante**. |
| "¿Qué tengo mañana?" / "…esta noche" / "…esta semana" / "…el viernes" | Igual, con ese momento. |

Pregúntale por lo que ya está en Xevapp: recordatorios, eventos, rutinas, pagos y tareas con fecha.

## Lo que sí y lo que no se puede (verdad corta)

- **Controles del iPhone:** una web app (PWA) **no puede aparecer sola** en la lista de Controles; eso solo lo hacen las apps nativas (requieren Mac y Xcode). Lo que sí funciona, sin Mac: un **Atajo** llamado "Xeva". Ese atajo se puede poner en el **botón de acción**, como **Control** en el Centro de control y se activa con **"Oye Siri, Xeva"**.
- El atajo habla con tu servidor de avisos, **sin abrir la app**. Por eso Xeva responde rápido y en voz alta.
- Preguntas abiertas ("dame ideas de negocio") no las responde el atajo: eso se hace dentro de Xevapp, con el botón 🎙️ o en la pestaña Asistente.
- Xeva solo conoce lo que Xevapp **ya sincronizó**. Abre Xevapp de vez en cuando (cada cambio se sincroniza solo).
- Esto está probado en simulación; falta que lo pruebes en tu iPhone real.

## Paso 0 · Actualiza el servidor (una sola vez)

El servidor necesita el código nuevo.
1. Cloudflare → **Workers & Pages** → tu worker de avisos → **Edit code**.
2. Borra todo, pega el contenido de `xevapp-avisos-worker.js` y toca **Deploy**.
3. En Xevapp → Ajustes → **Avisos siempre**, toca **Sincronizar ahora**.

(Si aún no creaste el servidor, sigue primero `AVISOS.md`.)

## Paso 1 · Copia los datos del atajo

Xevapp → **Ajustes** → **Botón de acción · voz** → **Copiar datos del atajo**. Copia tres líneas: la dirección, tu `id` y tu zona horaria. Tu `id` es como una contraseña: no compartas el atajo con nadie.

## Paso 2 · Crea el atajo "Xeva"

En la app **Atajos** → **+** → nómbralo exactamente **Xeva**. Agrega estas acciones en orden:

1. **Dictar texto** · idioma *Español (Colombia)* · detener: *Después de una pausa*.
2. **Obtener contenido de URL**
   - URL: la dirección que copiaste (termina en `/ask`).
   - Método: **POST**.
   - Cuerpo de la solicitud: **JSON**. Agrega tres campos de tipo texto:
     - `id` → tu id.
     - `tz` → tu zona horaria (por ejemplo `America/Bogota`).
     - `q` → toca la variable **Texto dictado**.
3. **Pronunciar texto** → variable **Contenido de URL** · idioma *Español*.
4. **Mostrar notificación** → variable **Contenido de URL** (es el mensaje flotante). Título: "Xeva".

Opcional: quita el 4 si prefieres solo la voz, o cambia el 4 por **Mostrar resultado** si quieres una tarjeta que se quede hasta que la cierres.

## Paso 3 · Asigna el botón de acción del iPhone 17 Pro Max

**Ajustes → Botón de acción** → desliza hasta **Atajo** → **Elegir un atajo** → **Xeva**.
Si tu versión de iOS ofrece **Controles**, también sirve: elige el control de **Atajos** y tu atajo **Xeva**.

Extra, con el mismo atajo:
- **Centro de control:** deslizar desde arriba a la derecha → **+** → **Añadir un control** → **Atajos** → **Xeva**.
- **Siri:** di **"Oye Siri, Xeva"** (el nombre del atajo es la frase).
- **Pantalla bloqueada:** en iOS 18 o superior puedes cambiar un botón inferior por el control de Xeva.

## Dentro de la app

Hay un botón **🎙️** justo encima del "+". Abre el panel de Xeva: hablas o escribes, responde en voz alta y en un mensaje, y puedes **Deshacer** lo que anotó. Aquí sí funcionan las preguntas abiertas (usan la IA gratuita que configuraste).
También funcionan estas direcciones: `…/xevapp/?voz=1` (abre escuchando) y `…/xevapp/?q=qué me toca hoy`.

## Cómo llegan las cosas que anotas por atajo

1. El servidor las guarda al instante y, si tienen hora, **te avisa a esa hora** aunque no abras la app.
2. La próxima vez que abras Xevapp, se **importan** como recordatorio o tarea y verás un aviso "1 cosa anotada por voz ✓".

## Frases que entiende

- Para anotar empieza con: *recuérdame, anota, agrega, añade, apunta, programa, tengo que, no olvides*.
- Cuándo: *hoy, mañana, pasado mañana, el lunes…el domingo, esta tarde, esta noche*.
- Hora: *a las 3, a las 3:30, a las 8 pm, a las 10 de la mañana, a las 5 y media*. Sin am/pm, de 1 a 6 asume tarde y de 7 a 11 asume mañana.
- Para preguntar usa: *qué me toca, qué tengo, qué hay, mi agenda, pendientes…* + *hoy / mañana / esta semana / por la tarde / esta noche*.

## Si algo falla

| Síntoma | Qué hacer |
|---|---|
| Responde "Falta tu código de Xevapp" | El campo `id` del atajo está vacío o mal copiado. |
| No pasa nada al pulsar el botón | Revisa que el atajo se llame Xeva y que en Ajustes → Botón de acción diga Atajo → Xeva. |
| "Hoy no tienes nada programado" y sí tienes | Abre Xevapp y toca Ajustes → Sincronizar ahora. |
| Dictado en otro idioma | En la acción Dictar texto, elige Español (Colombia). |
| No escucha el micrófono dentro de la app | Ajustes del iPhone → Safari/Xevapp → Micrófono → Permitir. |
