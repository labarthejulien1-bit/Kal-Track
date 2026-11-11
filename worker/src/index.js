/**
 * Kal-Track – serveur relais IA.
 *
 * L'appli envoie la requête Gemini (prompt + image) avec un code d'accès.
 * Le relais vérifie le code et le quota du jour, choisit le modèle,
 * ajoute la clé secrète et transmet à Google. La clé ne quitte jamais le serveur.
 *
 * Routes :
 *   GET  /ticket   -> « ticket fondateur » : date du jour signée (preuve d'utilisation précoce, rien n'est stocké)
 *   GET  /status   -> état du code (nom, formule, quota utilisé / restant)
 *
 * Formules (accès public) : gratuit (FREE_PER_DEVICE / jour), Kal-Track Plus et fondateurs (PLUS_PER_DEVICE / jour).
 *   - Fondateur : en-tête X-Kal-Founder = « date.signature » d'un ticket émis au plus tard le FOUNDER_UNTIL.
 *     Tant que FOUNDER_UNTIL est vide (avant le lancement de l'abonnement), tout le monde est fondateur.
 *   - Plus : en-tête X-Kal-Plus = jeton d'achat Google Play, vérifié auprès de Google (résultat mis en cache).
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
    // Cache des vérifications d'abonnement (objet « plus » séparé).
    if (action === 'plusGet') return Response.json({ value: (await this.ctx.storage.get(`p:${code}`)) ?? null });
    if (action === 'plusPut') {
      await this.ctx.storage.put(`p:${code}`, usage);
      return Response.json({ ok: true });
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
async function sendAlert(env, day, count, test = false) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) return { ok: false, reason: 'no_key' };
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
      test ? `Kal-Track : e-mail de test, les alertes fonctionnent ✔ (${day}).` : `Kal-Track : ${count} analyses IA aujourd'hui (${day}).`,
      '',
      `Aujourd'hui : ${today.n} analyses · ${usd(today)} $`,
      `Ce mois-ci : ${month.n} analyses · ${usd(month)} $`,
      `Plafond global : ${limit} analyses / jour · ${env.FREE_PER_DEVICE || 2} par téléphone (gratuit), ${env.PLUS_PER_DEVICE || 20} (Plus / fondateurs)`,
      `Modèle : ${env.MODEL || 'gemini-3.5-flash-lite'}`,
    ].join('\n');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Kal-Track <onboarding@resend.dev>', to: [env.ALERT_EMAIL], subject: test ? 'Kal-Track : test des alertes ✔' : `Kal-Track : ${count} analyses IA aujourd'hui`, text }),
    });
    return { ok: res.ok, status: res.status, detail: res.ok ? undefined : (await res.text()).slice(0, 300) };
  } catch (e) {
    /* une alerte ne doit jamais bloquer le service */
    return { ok: false, reason: String(e) };
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

// ---------- Kal-Track Plus et fondateurs ----------
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (text) => b64url(new TextEncoder().encode(text));

/** Ticket fondateur valide : signature du serveur et date au plus tard FOUNDER_UNTIL. */
async function founderValid(env, header) {
  const m = /^(\d{4}-\d{2}-\d{2})\.([0-9a-f]{64})$/.exec(header || '');
  if (!m) return false;
  if (env.FOUNDER_UNTIL && m[1] > env.FOUNDER_UNTIL) return false;
  return m[2] === (await hmac(await ticketKey(env), `founder:${m[1]}`));
}

let googleToken = { value: '', exp: 0 };
/** Jeton d'accès à l'API Google Play (compte de service, secret PLAY_SERVICE_ACCOUNT). */
async function googleAccessToken(env) {
  if (googleToken.value && googleToken.exp > Date.now() + 60_000) return googleToken.value;
  const sa = JSON.parse(env.PLAY_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64urlText(
    JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }),
  )}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${b64url(sig)}`,
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('google_auth');
  googleToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return googleToken.value;
}

/**
 * Abonnement Plus actif ? Vérifié auprès de Google Play (API subscriptionsv2),
 * résultat gardé en cache : jusqu'à 6 h si actif (sans dépasser l'échéance), 1 h sinon.
 */
async function plusActive(env, purchaseToken) {
  if (!purchaseToken || purchaseToken.length > 512 || !env.PLAY_SERVICE_ACCOUNT) return false;
  const id = await sha256(purchaseToken);
  const stub = env.QUOTA.get(env.QUOTA.idFromName('plus'));
  const call = (action, value) => stub.fetch('https://plus/', { method: 'POST', body: JSON.stringify({ action, code: id, usage: value }) }).then((r) => r.json());
  const cached = (await call('plusGet')).value;
  if (cached && cached.until > Date.now()) return cached.active;
  let active = false;
  let expiry = 0;
  try {
    const pkg = env.PLAY_PACKAGE || 'com.kaltrack.app';
    const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
      headers: { Authorization: `Bearer ${await googleAccessToken(env)}` },
    });
    if (res.ok) {
      const sub = await res.json();
      expiry = Math.max(0, ...(sub.lineItems || []).map((l) => Date.parse(l.expiryTime) || 0));
      // Résilié mais payé jusqu'à l'échéance = encore actif ; période de grâce = actif.
      active = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(sub.subscriptionState) && expiry > Date.now();
    } else if (res.status >= 500) {
      return cached?.active ?? false; // Google indisponible : on garde le dernier état connu
    }
  } catch {
    return cached?.active ?? false;
  }
  const until = active ? Math.min(expiry, Date.now() + 6 * 3600_000) : Date.now() + 3600_000;
  await call('plusPut', { active, until });
  return active;
}

/** Formule de l'utilisateur (accès public) : 'plus', 'founder' ou 'free'. */
async function resolveTier(env, request) {
  if (!env.FOUNDER_UNTIL) return 'founder'; // avant le lancement : tout le monde a les avantages
  if (await plusActive(env, (request.headers.get('X-Kal-Plus') || '').trim())) return 'plus';
  if (await founderValid(env, (request.headers.get('X-Kal-Founder') || '').trim())) return 'founder';
  return 'free';
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
    'Access-Control-Allow-Headers': 'Content-Type, X-Kal-Code, X-Kal-Device, X-Kal-Model',
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
      // Après le lancement de l'abonnement, plus de nouveaux fondateurs.
      if (env.FOUNDER_UNTIL && since > env.FOUNDER_UNTIL) return json({ closed: true }, 200, cors);
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
    let isAdmin = false;
    // Formule (gratuit / Plus / fondateur) : uniquement pour l'IA et l'état du quota.
    const tier = ['/generate', '/status'].includes(url.pathname) ? await resolveTier(env, request) : 'free';
    const tierPerDevice = tier === 'free' ? Number(env.FREE_PER_DEVICE) || 2 : Number(env.PLUS_PER_DEVICE) || 20;
    const publicEntry = { name: 'Public', daily: Number(env.PUBLIC_DAILY) || 1000, perDevice: tierPerDevice, tier };
    if (code) {
      entry = codes[await sha256(code)];
      if (!entry) return json({ error: { code: 'bad_code', message: "Code d'accès invalide." } }, 401, cors);
      isAdmin = !!entry.admin;
      // Code administrateur : ouvre les statistiques, mais l'IA reste au quota public comme tout le monde.
      if (entry.adminOnly && !['/stats', '/alert/test'].includes(url.pathname)) entry = publicEntry;
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

    // E-mail d'alerte de test (réservé aux codes « admin »).
    if (url.pathname === '/alert/test' && request.method === 'POST') {
      if (!entry.admin) return json({ error: { code: 'forbidden', message: 'Réservé à l’administrateur.' } }, 403, cors);
      const r = await sendAlert(env, today(), 0, true);
      return json(r, 200, cors);
    }

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
        return json({ ok: true, name: entry.name, tier: entry.tier || 'code', perDevice: true, used: usedDev, limit: perDevice, remaining: Math.min(devLeft, groupLeft), groupRemaining: groupLeft }, 200, cors);
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
      return json({ error: { code: 'quota', reason, tier: entry.tier || 'code', limit: reason === 'device' ? perDevice : limit, message } }, 429, cors);
    }

    // Tests comparatifs : la clé administrateur peut choisir un modèle parmi une liste autorisée.
    const TEST_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
    const asked = (request.headers.get('X-Kal-Model') || '').trim();
    const model = isAdmin && TEST_MODELS.includes(asked) ? asked : env.MODEL || 'gemini-3.5-flash-lite';
    let upstream;
    try {
      upstream = await fetch(`${env.GEMINI_BASE_OVERRIDE || GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(payload),
      });
    } catch {
      // Google injoignable : l'analyse n'est pas décomptée.
      await callQuota('refund');
      return json({ error: { code: 'server', message: 'Service IA momentanément indisponible. Réessaie dans un instant.' } }, 502, cors);
    }
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
    const headers = { 'Content-Type': 'application/json', ...cors, 'X-Kal-Model': model, 'X-Kal-Remaining': String(perDevice ? Math.max(0, perDevice - (taken.usedDev ?? 0)) : Math.max(0, limit - (taken.used ?? 0))) };
    return new Response(text, { status: upstream.status, headers });
  },
};
