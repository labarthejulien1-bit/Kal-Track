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
 *   POST /generate -> corps Gemini generateContent (system_instruction, contents, generationConfig)
 */
import { DurableObject } from 'cloudflare:workers';

const MAX_BODY_BYTES = 2_000_000; // ~ image compressée (< 200 Ko) + prompt, avec marge
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Compteur de quotas (un seul objet, stockage SQLite intégré). */
export class QuotaCounter extends DurableObject {
  async fetch(request) {
    const { action, day, code, device, limit, perDevice, globalLimit } = await request.json();
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
    return Response.json({ ok: true, used: used + 1, usedDev: usedDev + 1 });
  }
}

function prevDay(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
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
  async fetch(request, env) {
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
    if (code) {
      entry = codes[await sha256(code)];
      if (!entry) return json({ error: { code: 'bad_code', message: "Code d'accès invalide." } }, 401, cors);
    } else {
      // Accès public inclus dans l'appli : quota par téléphone + plafond total.
      entry = { name: 'Public', daily: Number(env.PUBLIC_DAILY) || 500, perDevice: Number(env.PUBLIC_PER_DEVICE) || 20 };
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
    const headers = { 'Content-Type': 'application/json', ...cors, 'X-Kal-Remaining': String(perDevice ? Math.max(0, perDevice - (taken.usedDev ?? 0)) : Math.max(0, limit - (taken.used ?? 0))) };
    return new Response(text, { status: upstream.status, headers });
  },
};
