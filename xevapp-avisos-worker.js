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

/* ---- Xeva voz: lenguaje natural simple (el mismo código corre en la app y en el servidor) ---- */
const XV = (() => {
  const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const fold = (s) => String(s).replace(/[áàäÁ]/g, "a").replace(/[éèëÉ]/g, "e").replace(/[íìïÍ]/g, "i")
    .replace(/[óòöÓ]/g, "o").replace(/[úùüÚ]/g, "u").replace(/[ñÑ]/g, "n").toLowerCase();
  function parts(ts, tz) {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const o = {}; f.formatToParts(new Date(ts)).forEach((p) => (o[p.type] = p.value));
    return { ds: `${o.year}-${o.month}-${o.day}`, h: +o.hour, m: +o.minute };
  }
  function offsetMs(ts, tz) {
    const p = parts(ts, tz), [y, mo, d] = p.ds.split("-").map(Number);
    return Date.UTC(y, mo - 1, d, p.h, p.m) - Math.floor(ts / 60000) * 60000;
  }
  function toTs(ds, h, m, tz) {
    const [y, mo, d] = ds.split("-").map(Number), g = Date.UTC(y, mo - 1, d, h, m);
    return g - offsetMs(g, tz);
  }
  const addD = (ds, n) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const dowOf = (ds) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const nextDow = (today, dow) => { let n = (dow - dowOf(today) + 7) % 7; if (n === 0) n = 7; return addD(today, n); };
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS_T = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const dayName = (ds, today) => ds === today ? "hoy" : ds === addD(today, 1) ? "mañana"
    : `el ${DIAS_T[dowOf(ds)]} ${+ds.slice(8)} de ${MESES[+ds.slice(5, 7) - 1]}`;
  const say = (h, m) => {
    const h12 = h % 12 === 0 ? 12 : h % 12, per = h < 12 ? "de la mañana" : h < 19 ? "de la tarde" : "de la noche";
    return `${h12 === 1 && !m ? "la una" : "las " + h12}${m ? ":" + String(m).padStart(2, "0") : ""} ${per}`;
  };

  const ADD_RE = /^\s*(?:por favor[, ]*)?(?:xeva[, ]*)?(?:(recuerdame|recordarme|recuerda|anota|anotar|agrega|agregar|anade|anadir|apunta|apuntar|guarda|guardar|guardame|crea|crear|programa|programar|no olvides|tengo que|debo|deberia)\b)[:,]?\s*(?:que\s+|una?\s+(?:tarea|recordatorio)\s+(?:de\s+|para\s+)?)?/;
  const isAdd = (q) => ADD_RE.test(fold(q));

  function parseAdd(text, now, tz) {
    let raw = String(text || "").trim(), f = fold(raw);
    const today = parts(now, tz).ds;
    const cut = (re) => { const m = f.match(re); if (!m) return null; raw = raw.slice(0, m.index) + " " + raw.slice(m.index + m[0].length); f = fold(raw); return m; };
    let kind = "debo";
    const v = cut(ADD_RE); if (v && v[1] === "deberia") kind = "deberia";
    let ap = null, ds = null;
    let m1 = cut(/\b(?:por |en |de |esta )?la manana\b|\besta manana\b/); if (m1) { ap = "am"; if (/esta/.test(m1[0])) ds = today; }
    let m2 = cut(/\b(?:por |en |de |esta )?la (?:tarde|noche)\b|\besta (?:tarde|noche)\b/); if (m2) { ap = "pm"; if (/esta/.test(m2[0])) ds = ds || today; }
    if (cut(/\bpasado manana\b/)) ds = addD(today, 2);
    else if (cut(/\bhoy\b/)) ds = today;
    else if (cut(/\bmanana\b/)) ds = addD(today, 1);
    else { const w = cut(/\b(?:el |este |proximo )?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/); if (w) ds = nextDow(today, DIAS.indexOf(w[1])); }
    // hora
    let h = null, mi = 0, ap2 = null, mm;
    if ((mm = cut(/\b(?:a|para|sobre) la una(?: y (media|cuarto))?\b/))) { h = 1; mi = mm[1] === "media" ? 30 : mm[1] === "cuarto" ? 15 : 0; }
    else if ((mm = cut(/\b(?:a|para|sobre) las?\s+(\d{1,2})(?:[:.h](\d{2}))?(?:\s*(a\.? ?m\.?|p\.? ?m\.?))?(?:\s+y\s+(media|cuarto))?/))) {
      h = +mm[1]; mi = mm[2] ? +mm[2] : mm[4] === "media" ? 30 : mm[4] === "cuarto" ? 15 : 0; if (mm[3]) ap2 = /^p/.test(mm[3]) ? "pm" : "am";
    } else if ((mm = cut(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.? ?m\.?|p\.? ?m\.?)(?=\s|$)/))) {
      h = +mm[1]; mi = mm[2] ? +mm[2] : 0; ap2 = /^p/.test(mm[3]) ? "pm" : "am";
    }
    let time = null;
    if (h !== null && h <= 24 && mi < 60) {
      const mk = ap2 || ap;
      if (mk === "pm" && h < 12) h += 12;
      else if (mk === "am" && h === 12) h = 0;
      else if (!mk && h >= 1 && h <= 6) h += 12;
      time = { h: h % 24, m: mi };
    }
    let title = raw.replace(/\s+/g, " ").trim();
    for (let i = 0; i < 3; i++) title = title.replace(/^(?:que|de|para|a|el|la|me|mi)\s+/i, "").replace(/\s+(?:el|para|a|de|en|que|por|y|este|esta)$/i, "").trim();
    title = title.replace(/^[,.:;\s]+|[,.:;\s]+$/g, "");
    if (!title) return null;
    title = title.charAt(0).toUpperCase() + title.slice(1);
    if (time && !ds) { const nowP = parts(now, tz); ds = (time.h * 60 + time.m > nowP.h * 60 + nowP.m) ? today : addD(today, 1); }
    return { title, ds: ds || "", time, kind, today, at: time ? toTs(ds, time.h, time.m, tz) : null };
  }
  function confirmAdd(p) {
    if (p.time) return `Listo. Te aviso ${dayName(p.ds, p.today)} a ${say(p.time.h, p.time.m)}: ${p.title}.`;
    if (p.ds) return `Anotado para ${dayName(p.ds, p.today)}: ${p.title}.`;
    return `Anotado: ${p.title}.`;
  }

  // ¿de qué momento hablan?
  function when(q, now, tz) {
    let f = fold(q), today = parts(now, tz).ds, per = null, ds = today, span = 1, lab = "hoy";
    const rm = (re) => { const m = f.match(re); if (m) f = f.replace(re, " "); return m; };
    if (rm(/\b(?:por |en |de |esta )?la manana\b|\besta manana\b/)) per = "am";
    else if (rm(/\b(?:por |en |de |esta )?la tarde\b|\besta tarde\b/)) per = "tarde";
    else if (rm(/\b(?:por |en |de |esta )?la noche\b|\besta noche\b/)) per = "noche";
    if (rm(/\bpasado manana\b/)) { ds = addD(today, 2); lab = "pasado mañana"; }
    else if (rm(/\bmanana\b/)) { ds = addD(today, 1); lab = "mañana"; }
    else if (/\b(?:esta |la |proxima )?semana\b/.test(f)) { span = 7; lab = "esta semana"; }
    else { const w = f.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/); if (w) { ds = nextDow(today, DIAS.indexOf(w[1])); lab = dayName(ds, today); } }
    const H = { am: [5, 12], tarde: [12, 19], noche: [19, 24] }[per] || [0, 24];
    const from = toTs(ds, H[0], 0, tz), to = span > 1 ? toTs(addD(ds, span), 0, 0, tz) : toTs(H[1] === 24 ? addD(ds, 1) : ds, H[1] === 24 ? 0 : H[1], 0, tz);
    return { ds, span, per, lab, from, to, today };
  }
  const isAsk = (q) => /\b(toca|tengo|pendiente|agenda|programad|que hay|que sigue|cuando|plan|hacer|pagos?|pagar|recordator|eventos?|rutina|reunion)/.test(fold(q));

  // respuesta hablada con la agenda. items: [{id,at,title,body}], tasks: [{title,due,kind}]
  function answer(q, now, tz, items, tasks) {
    const w = when(q, now, tz), dates = []; for (let i = 0; i < w.span; i++) dates.push(addD(w.ds, i));
    const lo = Math.max(w.from, now);
    const ev = (items || []).filter((i) => i.at >= lo && i.at < w.to && !/^(dg|rit):/.test(i.id || "")).sort((a, b) => a.at - b.at);
    const tk = (tasks || []).filter((t) => t.due && dates.includes(t.due));
    const clean = (s) => String(s || "").replace(/^Xevapp\s*·\s*/, "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
    const where = w.per ? `${w.lab} ${w.per === "am" ? "por la mañana" : w.per === "tarde" ? "por la tarde" : "por la noche"}` : w.lab;
    const bits = ev.slice(0, 6).map((i) => { const p = parts(i.at, tz); const pre = w.span > 1 ? dayName(p.ds, w.today) + " " : ""; return `${pre}a ${say(p.h, p.m)}, ${clean(i.title)}`; });
    let out = "";
    if (bits.length) out += `${where[0].toUpperCase() + where.slice(1)} te toca: ${bits.join("; ")}.`;
    if (tk.length) out += `${out ? " " : (where[0].toUpperCase() + where.slice(1) + " tienes: ")}${out ? "Y sin hora fija: " : ""}${tk.slice(0, 6).map((t) => t.title).join(", ")}.`;
    if (!out) out = `${where[0].toUpperCase() + where.slice(1)} no tienes nada programado.`;
    return { text: out, count: bits.length + tk.length };
  }
  return { fold, parts, toTs, addD, isAdd, isAsk, parseAdd, confirmAdd, answer, when, dayName, say };
})();
/* ---- fin Xeva voz ---- */


const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const plain = (t, status = 200) =>
  new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...cors } });
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
  return (await env.XEVA.get(userKey(id), "json")) || { sub: null, items: [], inbox: [], pending: [], tasks: [] };
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

      /* ---- voz: el atajo del botón de acción llama aquí ---- */
      if (url.pathname === "/ask" || url.pathname === "/add" || url.pathname === "/pending") {
        let q = url.searchParams.get("q") || "", id = url.searchParams.get("id"), tz = url.searchParams.get("tz") || env.TZ || "America/Bogota";
        if (req.method === "POST") { const b = await req.json().catch(() => ({})); q = b.q || q; id = b.id || id; tz = b.tz || tz; }
        if (!validId(id)) return plain("Falta tu código de Xevapp en el atajo.", 400);
        try { new Intl.DateTimeFormat("es", { timeZone: tz }); } catch { tz = "America/Bogota"; }
        const u = await getUser(env, id);
        if (url.pathname === "/pending") {
          const items = u.pending || [];
          if (items.length) { u.pending = []; await env.XEVA.put(userKey(id), JSON.stringify(u)); }
          return json({ items });
        }
        const now = Date.now();
        q = String(q).trim().slice(0, 400);
        if (!q) return plain("No te escuché. Intenta otra vez.");
        if (XV.isAdd(q)) {
          const p = XV.parseAdd(q, now, tz);
          if (!p) return plain("No entendí qué anotar. Dime por ejemplo: recuérdame mañana a las 3 pagar el arriendo.");
          const hm = p.time ? String(p.time.h).padStart(2, "0") + ":" + String(p.time.m).padStart(2, "0") : "";
          u.pending = [...(u.pending || []), { title: p.title, ds: p.ds, hm, kind: p.kind, ts: now }].slice(-50);
          if (p.at && p.at > now) u.items = [...(u.items || []), { id: "v:" + now, at: p.at, title: "Xevapp · 🔔 " + p.title, body: "Recordatorio por voz" }].sort((a, b) => a.at - b.at).slice(0, MAX_ITEMS);
          else if (p.ds) u.tasks = [...(u.tasks || []), { title: p.title, due: p.ds, kind: p.kind }].slice(-150);
          await putUser(env, id, u);
          return plain(XV.confirmAdd(p));
        }
        if (XV.isAsk(q)) return plain(XV.answer(q, now, tz, u.items || [], u.tasks || []).text);
        return plain("Eso es una pregunta abierta. Ábrela en Xevapp, en la pestaña Asistente. Aquí puedo anotar cosas y decirte qué te toca.");
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
        if (Array.isArray(body.tasks)) u.tasks = body.tasks.slice(0, 150).map((t) => ({ title: String(t.title || "").slice(0, 80), due: String(t.due || "").slice(0, 10), kind: t.kind === "deberia" ? "deberia" : "debo" }));
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
