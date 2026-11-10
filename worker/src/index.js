/**
 * Kal-Track – serveur relais IA.
 *
 * L'appli envoie la requête Gemini (prompt + image) avec un code d'accès.
 * Le relais vérifie le code et le quota du jour, choisit le modèle,
 * ajoute la clé secrète et transmet à Google. La clé ne quitte jamais le serveur.
 *
 * Routes :
 *   GET  /ticket   -> « ticket fondateur » : date du jour signée (preuve d'utilisation précoce, rien n'est stocké)
 *   GET  /status   -> état du code (nom, quota utilisé / restant)
 *   GET  /stats    -> coût réel de l'IA (jour / mois), réservé au code administrateur
 *   POST /generate -> corps Gemini generateContent (system_instruction, contents, generationConfig)
 */
import { DurableObject } from 'cloudflare:workers';

const MAX_BODY_BYTES = 2_000_000; // ~ image compressée (< 200 Ko) + prompt, avec marge
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Compteur de quotas (un seul objet, stockage SQLite intégré). */
export class QuotaCounter extends DurableObject {
  async fetch(request) {
    const { action, day, code, device, limit, perDevice, globalLimit, usage = {} } = await request.json();
    // Statistiques de coût (objet « stats » séparé, conservées 400 jours).
    if (action === 'usage') {
      const k = `u:${day}`;
      const cur = (await this.ctx.storage.get(k)) ?? { n: 0, in: 0, out: 0, img: 0 };
      cur.n += 1;
      cur.in += usage.in || 0;
      cur.out += usage.out || 0;
      cur.img += usage.img ? 1 : 0;
      await this.ctx.storage.put(k, cur);
      return Response.json({ ok: true });
    }
    if (action === 'report') {
      const rows = await this.ctx.storage.list({ prefix: 'u:' });
      const days = {};
      for (const [k, v] of rows) days[k.slice(2)] = v;
      if (Math.random() < 0.05) {
        const old = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
        for (const k of rows.keys()) if (k.slice(2) < old) await this.ctx.storage.delete(k);
      }
      return Response.json({ days });
    }
    // Clé secrète de signature des tickets (générée une seule fois, jamais transmise).
    if (action === 'key') {
      let key = await this.ctx.storage.get('ticket-key');
      if (!key) {
        key = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
        await this.ctx.storage.put('ticket-key', key);
      }
      return Response.json({ key });
    }
    const kCode = `${day}:${code}`;
    const kDev = device ? `${day}:${code}:${device}` : null;
    const kAll = `${day}:__all__`;
    const used = (await this.ctx.storage.get(kCode)) ?? 0;
    const usedDev = kDev ? ((await this.ctx.storage.get(kDev)) ?? 0) : 0;
    const usedAll = (await this.ctx.storage.get(kAll)) ?? 0;
    if (action === 'peek') return Response.json({ used, usedDev, usedAll });
    if (action === 'refund') {
      await this.ctx.storage.put(kCode, Math.max(0, used - 1));
      if (kDev) await this.ctx.storage.put(kDev, Math.max(0, usedDev - 1));
      await this.ctx.storage.put(kAll, Math.max(0, usedAll - 1));
      return Response.json({ ok: true });
    }
    // action === 'take'
    if (kDev && perDevice && usedDev >= perDevice) return Response.json({ ok: false, reason: 'device', used, usedDev });
    if (used >= limit) return Response.json({ ok: false, reason: 'user', used, usedDev });
    if (usedAll >= globalLimit) return Response.json({ ok: false, reason: 'global', used, usedDev });
    await this.ctx.storage.put(kCode, used + 1);
    if (kDev) await this.ctx.storage.put(kDev, usedDev + 1);
    await this.ctx.storage.put(kAll, usedAll + 1);
    // Ménage : on ne garde que quelques jours d'historique.
    if (Math.random() < 0.02) {
      const all = await this.ctx.storage.list();
      const keep = new Set([day, prevDay(day)]);
      for (const k of all.keys()) if (!keep.has(k.split(':')[0])) await this.ctx.storage.delete(k);
    }
    return Response.json({ ok: true, used: used + 1, usedDev: usedDev + 1, usedAll: usedAll + 1 });
  }
}

function prevDay(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function prevDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function today() {
  // Jour calendaire en heure de Paris (remise à zéro des quotas à minuit).
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

async function hmac(keyHex, text) {
  const raw = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** E-mail d'alerte (Resend) : nombre d'analyses du jour et coût réel. Sans clé configurée, rien n'est envoyé. */
async function sendAlert(env, day, count) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) return;
  try {
    const { days } = await statsStub(env)
      .fetch('https://stats/', { method: 'POST', body: JSON.stringify({ action: 'report' }) })
      .then((r) => r.json());
    const sum = (pred) => {
      const t = { n: 0, in: 0, out: 0 };
      for (const [d, v] of Object.entries(days)) if (pred(d)) for (const k of Object.keys(t)) t[k] += v[k] || 0;
      return t;
    };
    const today = sum((d) => d === day);
    const month = sum((d) => d.startsWith(day.slice(0, 7)));
    const usd = (t) => costOf(t, env).toFixed(2);
    const limit = Number(env.GLOBAL_DAILY_LIMIT) || 1000;
    const text = [
      `Kal-Track : ${count} analyses IA aujourd'hui (${day}).`,
      '',
      `Aujourd'hui : ${today.n} analyses · ${usd(today)} $`,
      `Ce mois-ci : ${month.n} analyses · ${usd(month)} $`,
      `Plafond global : ${limit} analyses / jour · ${env.PUBLIC_PER_DEVICE || 10} par téléphone`,
      `Modèle : ${env.MODEL || 'gemini-3.5-flash-lite'}`,
    ].join('\n');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Kal-Track <onboarding@resend.dev>', to: [env.ALERT_EMAIL], subject: `Kal-Track : ${count} analyses IA aujourd'hui`, text }),
    });
  } catch {
    /* une alerte ne doit jamais bloquer le service */
  }
}

function statsStub(env) {
  return env.QUOTA.get(env.QUOTA.idFromName('stats'));
}

/** Coût en dollars à partir des jetons (tarifs du modèle, en $ par million de jetons). */
function costOf(t, env) {
  const pin = Number(env.PRICE_IN_PER_M) || 0.3;
  const pout = Number(env.PRICE_OUT_PER_M) || 2.5;
  return (t.in * pin + t.out * pout) / 1e6;
}

async function ticketKey(env) {
  // Objet séparé du compteur de quotas (dont le ménage efface les anciennes clés).
  const stub = env.QUOTA.get(env.QUOTA.idFromName('tickets'));
  const { key } = await stub.fetch('https://tickets/', { method: 'POST', body: JSON.stringify({ action: 'key' }) }).then((r) => r.json());
  return key;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Kal-Code, X-Kal-Device',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, service: 'kal-track-ai' }, 200, cors);
    }

    // Ticket fondateur : prouve que l'appli était utilisée à cette date (avantages des premiers utilisateurs).
    // Rien n'est enregistré : le serveur signe simplement la date du jour.
    if (url.pathname === '/ticket' && request.method === 'GET') {
      const since = today();
      return json({ since, sig: await hmac(await ticketKey(env), `founder:${since}`) }, 200, cors);
    }
    if (url.pathname === '/ticket/verify' && request.method === 'POST') {
      const { since, sig } = await request.json().catch(() => ({}));
      const ok = typeof since === 'string' && typeof sig === 'string' && sig === (await hmac(await ticketKey(env), `founder:${since}`));
      return json({ ok, since: ok ? since : null }, 200, cors);
    }

    // --- Vérification du code d'accès ---
    const code = (request.headers.get('X-Kal-Code') || '').trim().toUpperCase();
    let codes = {};
    try {
      codes = JSON.parse(env.ACCESS_CODES || '{}');
    } catch {
      /* configuration invalide */
    }
    let entry;
    const publicEntry = { name: 'Public', daily: Number(env.PUBLIC_DAILY) || 1000, perDevice: Number(env.PUBLIC_PER_DEVICE) || 10 };
    if (code) {
      entry = codes[await sha256(code)];
      if (!entry) return json({ error: { code: 'bad_code', message: "Code d'accès invalide." } }, 401, cors);
      // Code administrateur : ouvre les statistiques, mais l'IA reste au quota public comme tout le monde.
      if (entry.adminOnly && url.pathname !== '/stats') entry = publicEntry;
    } else {
      // Accès public inclus dans l'appli : quota par téléphone + plafond total.
      entry = publicEntry;
    }

    const day = today();
    const limit = Number(entry.daily) || 50;
    const perDevice = Number(entry.perDevice) || 0;
    // Identifiant anonyme du téléphone (aucune donnée personnelle).
    const rawDevice = (request.headers.get('X-Kal-Device') || '').trim();
    const device = /^[A-Za-z0-9-]{8,64}$/.test(rawDevice) ? rawDevice : '';
    if (perDevice && !device) {
      return json({ error: { code: 'update_app', message: "Mets à jour Kal-Track (ferme puis rouvre l'appli) pour utiliser ce code." } }, 400, cors);
    }
    const globalLimit = Number(env.GLOBAL_DAILY_LIMIT) || 1000;
    const quota = env.QUOTA.get(env.QUOTA.idFromName('global'));
    const callQuota = (action) =>
      quota.fetch('https://quota/', { method: 'POST', body: JSON.stringify({ action, day, code: entry.name, device: perDevice ? device : '', limit, perDevice, globalLimit }) }).then((r) => r.json());

    // Coût réel de l'IA (réservé aux codes « admin »).
    if (url.pathname === '/stats' && request.method === 'GET') {
      if (!entry.admin) return json({ error: { code: 'forbidden', message: 'Réservé à l’administrateur.' } }, 403, cors);
      const { days } = await statsStub(env)
        .fetch('https://stats/', { method: 'POST', body: JSON.stringify({ action: 'report' }) })
        .then((r) => r.json());
      const month = day.slice(0, 7);
      const sum = (pred) => {
        const t = { n: 0, in: 0, out: 0, img: 0 };
        for (const [d, v] of Object.entries(days)) if (pred(d)) for (const k of Object.keys(t)) t[k] += v[k] || 0;
        return { ...t, usd: Number(costOf(t, env).toFixed(4)) };
      };
      const today_ = sum((d) => d === day);
      const monthT = sum((d) => d.startsWith(month));
      const last30 = sum((d) => d > prevDays(day, 30));
      const dayOfMonth = Number(day.slice(8, 10));
      return json(
        {
          model: env.MODEL || 'gemini-3.5-flash-lite',
          prices: { inPerM: Number(env.PRICE_IN_PER_M) || 0.3, outPerM: Number(env.PRICE_OUT_PER_M) || 2.5 },
          today: today_,
          month: monthT,
          last30,
          perAnalysisUsd: last30.n ? Number((last30.usd / last30.n).toFixed(5)) : null,
          monthForecastUsd: Number(((monthT.usd / Math.max(1, dayOfMonth)) * 30).toFixed(2)),
          maxMonthUsd: last30.n ? Number(((last30.usd / last30.n) * (Number(env.GLOBAL_DAILY_LIMIT) || 1000) * 30).toFixed(2)) : null,
          days: Object.fromEntries(Object.entries(days).filter(([d]) => d > prevDays(day, 31)).map(([d, v]) => [d, { ...v, usd: Number(costOf(v, env).toFixed(4)) }])),
        },
        200,
        cors,
      );
    }

    if (url.pathname === '/status' && request.method === 'GET') {
      const { used, usedDev } = await callQuota('peek');
      const groupLeft = Math.max(0, limit - used);
      if (perDevice) {
        const devLeft = Math.max(0, perDevice - usedDev);
        return json({ ok: true, name: entry.name, perDevice: true, used: usedDev, limit: perDevice, remaining: Math.min(devLeft, groupLeft), groupRemaining: groupLeft }, 200, cors);
      }
      return json({ ok: true, name: entry.name, used, limit, remaining: groupLeft }, 200, cors);
    }

    if (url.pathname !== '/generate' || request.method !== 'POST') {
      return json({ error: { code: 'not_found', message: 'Route inconnue.' } }, 404, cors);
    }

    if (!env.GEMINI_API_KEY) return json({ error: { code: 'server', message: 'Clé IA non configurée sur le serveur.' } }, 500, cors);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: { code: 'too_big', message: 'Image trop volumineuse.' } }, 413, cors);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: { code: 'bad_request', message: 'Requête invalide.' } }, 400, cors);
    }
    // Seuls les champs utiles sont transmis (pas d'outils, pas d'options exotiques).
    const payload = {
      system_instruction: body.system_instruction,
      contents: body.contents,
      generationConfig: body.generationConfig,
    };

    const taken = await callQuota('take');
    if (!taken.ok) {
      const message =
        taken.reason === 'global'
          ? 'Le service IA a atteint sa limite du jour. Réessaie demain.'
          : taken.reason === 'device'
            ? `Tu as utilisé tes ${perDevice} analyses IA du jour sur ce téléphone. Réessaie demain.`
            : perDevice
              ? 'Le quota du jour de ce code est épuisé. Réessaie demain.'
              : `Tu as utilisé tes ${limit} analyses IA du jour. Réessaie demain.`;
      const reason = taken.reason === 'user' && perDevice ? 'group' : taken.reason;
      return json({ error: { code: 'quota', reason, limit: reason === 'device' ? perDevice : limit, message } }, 429, cors);
    }

    const model = env.MODEL || 'gemini-3.5-flash-lite';
    const upstream = await fetch(`${env.GEMINI_BASE_OVERRIDE || GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    // En cas d'échec côté Google, l'analyse n'est pas décomptée.
    if (!upstream.ok) await callQuota('refund');
    else {
      // Mesure du coût réel : jetons facturés renvoyés par Gemini (sortie = réponse + réflexion éventuelle).
      try {
        const u = JSON.parse(text).usageMetadata || {};
        const usage = {
          in: u.promptTokenCount || 0,
          out: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
          img: JSON.stringify(payload.contents || '').includes('inline_data'),
        };
        await statsStub(env).fetch('https://stats/', { method: 'POST', body: JSON.stringify({ action: 'usage', day, usage }) });
        const every = Number(env.ALERT_EVERY) || 0;
        if (every && taken.usedAll && taken.usedAll % every === 0) ctx.waitUntil(sendAlert(env, day, taken.usedAll));
      } catch {
        /* la mesure ne doit jamais bloquer une analyse */
      }
    }
    const headers = { 'Content-Type': 'application/json', ...cors, 'X-Kal-Remaining': String(perDevice ? Math.max(0, perDevice - (taken.usedDev ?? 0)) : Math.max(0, limit - (taken.used ?? 0))) };
    return new Response(text, { status: upstream.status, headers });
  },
};
