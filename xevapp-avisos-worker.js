/* =========================================================
   Xevapp · Servidor de avisos (Cloudflare Worker, plan gratuito)
   - Guarda tu suscripción push y la lista de avisos programados.
   - Cada minuto (Cron Trigger) envía los avisos que tocan.
   - Genera sus propias claves VAPID la primera vez.
   Requisitos: un KV namespace enlazado con el nombre XEVA
               y un Cron Trigger "* * * * *".
   ========================================================= */

const CONTACT = "mailto:xevapp@example.com"; // puedes poner tu correo: "mailto:tu@correo.com"
const MAX_ITEMS = 500;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...cors } });

/* ---------- base64url ---------- */
const b64u = (bytes) => {
  let s = "";
  new Uint8Array(bytes).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64uText = (t) => b64u(new TextEncoder().encode(t));

/* ---------- claves VAPID (se crean una vez y quedan en KV) ---------- */
async function getVapid(env) {
  const saved = await env.XEVA.get("vapid", "json");
  if (saved) return saved;
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
  const keys = { priv, pub };
  await env.XEVA.put("vapid", JSON.stringify(keys));
  return keys;
}

async function vapidAuth(endpoint, keys) {
  const aud = new URL(endpoint).origin;
  const header = b64uText(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = b64uText(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT }));
  const key = await crypto.subtle.importKey("jwk", keys.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(header + "." + payload));
  return `vapid t=${header}.${payload}.${b64u(sig)}, k=${keys.pub}`;
}

/* Push sin contenido: el iPhone despierta a Xevapp y esta pide /inbox */
async function sendPush(sub, env) {
  const keys = await getVapid(env);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidAuth(sub.endpoint, keys), TTL: "86400", Urgency: "high", "Content-Length": "0" },
  });
  return res.status;
}

/* ---------- datos ---------- */
const userKey = (id) => "u:" + id;
const validId = (id) => typeof id === "string" && /^[\w-]{8,64}$/.test(id);
async function getUser(env, id) {
  return (await env.XEVA.get(userKey(id), "json")) || { sub: null, items: [], inbox: [] };
}
async function putUser(env, id, u) {
  await env.XEVA.put(userKey(id), JSON.stringify(u));
  const idx = (await env.XEVA.get("users", "json")) || [];
  if (!idx.includes(id)) { idx.push(id); await env.XEVA.put("users", JSON.stringify(idx)); }
}
const clean = (it) => ({
  id: String(it.id || "").slice(0, 80),
  at: Number(it.at) || 0,
  title: String(it.title || "Xevapp").slice(0, 80),
  body: String(it.body || "").slice(0, 180),
});

/* ---------- envío de lo que toca ---------- */
async function deliverDue(env, id, u, now) {
  const due = u.items.filter((i) => i.at <= now);
  if (!due.length) return false;
  u.items = u.items.filter((i) => i.at > now);
  // avisos de más de 6 horas de atraso se descartan (por ejemplo si el servidor estuvo apagado)
  u.inbox = [...(u.inbox || []), ...due.filter((i) => now - i.at < 6 * 36e5)].slice(-20);
  if (u.sub && u.inbox.length) {
    const st = await sendPush(u.sub, env).catch(() => 0);
    if (st === 404 || st === 410) u.sub = null; // suscripción vencida
  }
  await env.XEVA.put(userKey(id), JSON.stringify(u));
  return true;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    try {
      if (url.pathname === "/" || url.pathname === "/estado") return json({ ok: true, app: "Xevapp avisos" });
      if (url.pathname === "/vapid") return json({ publicKey: (await getVapid(env)).pub });

      if (url.pathname === "/inbox") {
        const id = url.searchParams.get("id");
        if (!validId(id)) return json({ error: "id" }, 400);
        const u = await getUser(env, id);
        const items = u.inbox || [];
        if (items.length) { u.inbox = []; await env.XEVA.put(userKey(id), JSON.stringify(u)); }
        return json({ items });
      }

      if (req.method !== "POST") return json({ error: "método" }, 405);
      const body = await req.json().catch(() => ({}));
      if (!validId(body.id)) return json({ error: "id" }, 400);
      const u = await getUser(env, body.id);

      if (url.pathname === "/register") {
        if (!body.sub || !/^https:\/\//.test(body.sub.endpoint || "")) return json({ error: "sub" }, 400);
        u.sub = { endpoint: body.sub.endpoint };
        await putUser(env, body.id, u);
        return json({ ok: true });
      }
      if (url.pathname === "/sync") {
        const now = Date.now();
        u.items = (Array.isArray(body.items) ? body.items : [])
          .map(clean).filter((i) => i.id && i.at > now - 60e3)
          .sort((a, b) => a.at - b.at).slice(0, MAX_ITEMS);
        await putUser(env, body.id, u);
        return json({ ok: true, count: u.items.length, next: u.items[0]?.at || null });
      }
      if (url.pathname === "/test") {
        if (!u.sub) return json({ error: "Sin suscripción. Activa los avisos desde Xevapp." }, 400);
        u.inbox = [...(u.inbox || []), { id: "test-" + Date.now(), at: Date.now(), title: "Xevapp", body: "¡Funciona! Así te llegarán tus avisos, incluso con la app cerrada." }];
        await env.XEVA.put(userKey(body.id), JSON.stringify(u));
        const st = await sendPush(u.sub, env);
        return json({ ok: st >= 200 && st < 300, status: st });
      }
      return json({ error: "ruta" }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },

  async scheduled(_event, env) {
    const now = Date.now();
    const idx = (await env.XEVA.get("users", "json")) || [];
    for (const id of idx) {
      const u = await env.XEVA.get(userKey(id), "json");
      if (u && u.items && u.items.length && u.items[0].at <= now) await deliverDue(env, id, u, now);
    }
  },
};
