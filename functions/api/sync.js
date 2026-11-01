/**
 * 理科计算器 · 云同步中继（Cloudflare Pages Function + KV）
 *  GET  /api/sync?op=ping
 *  GET  /api/sync?id=<64hex>        Authorization: Bearer <ah>
 *  PUT  /api/sync  { id, blob, baseTs }   Authorization: Bearer <ah>
 *
 *  - 只存客户端加密后的 blob
 *  - KV 里存的是 SHA-256(ah)，不是 ah 原文
 *  - baseTs 用于乐观并发：与当前 ts 不一致返回 409
 */
const ALLOWED = ['https://xhrm-calc.pages.dev','https://xhrm-wyx.github.io'];
const RL = new Map();               // 简易进程内限流：ip -> {n, t}
const RL_LIMIT = 60, RL_WINDOW = 60 * 1000;
const FAILS = new Map();            // id -> {n, t, until}
const FAIL_LIMIT = 5, FAIL_WINDOW = 15 * 60 * 1000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function cors(origin){
  const ok = ALLOWED.includes(origin) || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin || '');
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}
function json(body, status, origin, extra){
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors(origin), extra || {})
  });
}
const HEX64 = /^[a-f0-9]{64}$/i;
async function sha256hex(s){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function authHash(auth, env){
  if(env && env.SYNC_PEPPER){
    try{
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(env.SYNC_PEPPER)), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(auth));
      return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2,'0')).join('');
    }catch(e){}
  }
  return sha256hex(auth);
}
function matchesAuth(rec, auth, env){
  return sha256hex(auth).then(function(legacy){
    if(rec.ahh === legacy) return 'legacy';
    return authHash(auth, env).then(function(h){ return rec.ahh === h ? 'hmac' : false; });
  });
}
function locked(id){
  const f = FAILS.get(id);
  if(!f) return 0;
  const now = Date.now();
  if(f.until && now < f.until) return Math.ceil((f.until - now) / 1000);
  if(now - f.t > FAIL_WINDOW){ FAILS.delete(id); return 0; }
  return 0;
}
function noteFail(id){
  const now = Date.now();
  const f = FAILS.get(id) || { n: 0, t: now };
  if(now - f.t > FAIL_WINDOW){ f.n = 0; f.t = now; }
  f.n++;
  if(f.n >= FAIL_LIMIT) f.until = now + FAIL_WINDOW;
  FAILS.set(id, f);
}
function limited(ip){
  const now = Date.now();
  const cur = RL.get(ip);
  if(!cur || now - cur.t > RL_WINDOW){ RL.set(ip, { n: 1, t: now }); return false; }
  cur.n++;
  return cur.n > RL_LIMIT;
}

export async function onRequest(context){
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  if(request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  if(limited(ip)) return json({ error: 'rate' }, 429, origin, { 'Retry-After': '60' });

  if(!env || !env.SCI_KV) return json({ error: 'kv-not-bound' }, 500, origin);

  const op = url.searchParams.get('op') || '';
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim().toLowerCase();
  if(op === 'ping') return json({ ok: true, t: Date.now(), kv: true }, 200, origin);

  /* [SEC-FIX] 每用户随机盐：让同步密钥无法被纯离线推导（客户端 v3.5.0 起使用）。
     设计上同 Bitwarden：盐本身可公开，靠 PBKDF2 310k 迭代 + 本接口的 IP 限流来防滥用。
     首次请求即生成并存入 KV，之后恒定不变，保证 CF 与 GitHub Pages 两站拿到同一份盐。 */
  if(op === 'salt'){
    const u = String(url.searchParams.get('u') || '').slice(0, 64);
    if(!u) return json({ error: 'bad u' }, 400, origin);
    const sKey = 's:' + u;
    let salt = await env.SCI_KV.get(sKey);
    if(!salt){
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      salt = btoa(String.fromCharCode.apply(null, b));
      await env.SCI_KV.put(sKey, salt);
    }
    return json({ salt: salt }, 200, origin);
  }

  if(request.method === 'GET'){
    const id = (url.searchParams.get('id') || '').toLowerCase();
    if(!HEX64.test(id)) return json({ error: 'bad id' }, 400, origin);
    if(!HEX64.test(auth)) return json({ error: 'no auth' }, 401, origin);
    const wait = locked(id);
    if(wait) return json({ error: 'locked', retryAfter: wait }, 429, origin, { 'Retry-After': String(wait) });
    const key = 'b:' + id;
    const rec = await env.SCI_KV.get(key, 'json');
    if(!rec) return json({ error: 'empty' }, 404, origin);
    /* 保留期已过：真正删除 */
    if(rec.deletedAt && Date.now() - Number(rec.deletedAt) > RETENTION_MS){
      await env.SCI_KV.delete(key);
      return json({ error: 'empty' }, 404, origin);
    }
    const m = await matchesAuth(rec, auth, env);
    if(!m){ noteFail(id); return json({ error: 'auth' }, 403, origin); }
    if(m === 'legacy' && env.SYNC_PEPPER){
      try{ rec.ahh = await authHash(auth, env); await env.SCI_KV.put(key, JSON.stringify(rec)); }catch(e){}
    }
    return json({ blob: rec.blob, ts: rec.ts, deleted: !!rec.deletedAt, deletedAt: rec.deletedAt || null }, 200, origin);
  }

  if(request.method === 'PUT'){
    if(!HEX64.test(auth)) return json({ error: 'no auth' }, 401, origin);
    let body;
    try{ body = await request.json(); }catch(e){ return json({ error: 'bad json' }, 400, origin); }
    const id = String((body && body.id) || '').toLowerCase();
    const blob = String((body && body.blob) || '');
    const baseTs = (body && typeof body.baseTs === 'number') ? body.baseTs : null;
    if(!HEX64.test(id)) return json({ error: 'bad id' }, 400, origin);
    if(!blob || blob.length > 2 * 1024 * 1024) return json({ error: 'bad blob' }, 400, origin);

    const key = 'b:' + id;
    const waitP = locked(id);
    if(waitP) return json({ error: 'locked', retryAfter: waitP }, 429, origin, { 'Retry-After': String(waitP) });
    const cur = await env.SCI_KV.get(key, 'json');
    const ahh = await authHash(auth, env);
    if(cur){
      const m2 = await matchesAuth(cur, auth, env);
      if(!m2){ noteFail(id); return json({ error: 'auth' }, 403, origin); }
      /* 已存在记录却未携带 baseTs：说明客户端没见过当前版本，强制先读 */
      if(baseTs === null && !cur.deletedAt) return json({ error: 'conflict', ts: cur.ts, need: 'read-first' }, 409, origin);
      if(baseTs !== null && Number(cur.ts) !== Number(baseTs) && !cur.deletedAt) return json({ error: 'conflict', ts: cur.ts }, 409, origin);
    }
    /* 每账号最小写入间隔：同一记录里带 ts，客户端必须先读后写，能有效挡住连发 */
    const now = Date.now();
    const MIN_GAP_MS = 2000;
    if(cur && (now - Number(cur.ts || 0)) < MIN_GAP_MS){
      return json({ error: 'rate', scope: 'gap', gapMs: MIN_GAP_MS }, 429, origin, { 'Retry-After': '2' });
    }
    /* 每账号每小时写入配额（同一 KV 记录里顺带计数，不额外写） */
    const HOUR = 3600 * 1000, WRITE_LIMIT = 120;
    let wr = now, wc = 1;
    if(cur && (now - Number(cur.wr || 0)) < HOUR){
      wr = Number(cur.wr);
      wc = Number(cur.wc || 0) + 1;
      if(wc > WRITE_LIMIT){
        return json({ error: 'rate', scope: 'write', limit: WRITE_LIMIT }, 429, origin, { 'Retry-After': '600' });
      }
    }
    const rec = { ahh: ahh, blob: blob, ts: now, wr: wr, wc: wc };
    await env.SCI_KV.put(key, JSON.stringify(rec));
    return json({ ok: true, ts: rec.ts }, 200, origin);
  }

  if(request.method === 'DELETE'){
    const id = (url.searchParams.get('id') || '').toLowerCase();
    if(!HEX64.test(id)) return json({ error: 'bad id' }, 400, origin);
    if(!HEX64.test(auth)) return json({ error: 'no auth' }, 401, origin);
    const waitD = locked(id);
    if(waitD) return json({ error: 'locked', retryAfter: waitD }, 429, origin, { 'Retry-After': String(waitD) });
    const key = 'b:' + id;
    const rec = await env.SCI_KV.get(key, 'json');
    if(!rec) return json({ ok: true, missing: true }, 200, origin);
    const m3 = await matchesAuth(rec, auth, env);
    if(!m3){ noteFail(id); return json({ error: 'auth' }, 403, origin); }
    /* 软删除：保留 30 天，期间同账号读取仍可看到 deleted 标记并可覆盖恢复 */
    rec.deletedAt = Date.now();
    rec.ahh = await authHash(auth, env);
    await env.SCI_KV.put(key, JSON.stringify(rec));
    return json({ ok: true, soft: true, deletedAt: rec.deletedAt, retainDays: 30 }, 200, origin);
  }

  return json({ error: 'method' }, 405, origin);
}