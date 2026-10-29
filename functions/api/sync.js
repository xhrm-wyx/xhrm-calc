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

  if(request.method === 'GET'){
    const id = (url.searchParams.get('id') || '').toLowerCase();
    if(!HEX64.test(id)) return json({ error: 'bad id' }, 400, origin);
    if(!HEX64.test(auth)) return json({ error: 'no auth' }, 401, origin);
    const rec = await env.SCI_KV.get('b:' + id, 'json');
    if(!rec) return json({ error: 'empty' }, 404, origin);
    if(rec.ahh !== await sha256hex(auth)) return json({ error: 'auth' }, 403, origin);
    return json({ blob: rec.blob, ts: rec.ts }, 200, origin);
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
    const cur = await env.SCI_KV.get(key, 'json');
    const ahh = await sha256hex(auth);
    if(cur){
      if(cur.ahh !== ahh) return json({ error: 'auth' }, 403, origin);
      /* 已存在记录却未携带 baseTs：说明客户端没见过当前版本，强制先读 */
      if(baseTs === null) return json({ error: 'conflict', ts: cur.ts, need: 'read-first' }, 409, origin);
      if(Number(cur.ts) !== Number(baseTs)) return json({ error: 'conflict', ts: cur.ts }, 409, origin);
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
    return json({ ok: true, ts: rec.ts, wc: wc }, 200, origin);
  }

  if(request.method === 'DELETE'){
    const id = (url.searchParams.get('id') || '').toLowerCase();
    if(!HEX64.test(id)) return json({ error: 'bad id' }, 400, origin);
    if(!HEX64.test(auth)) return json({ error: 'no auth' }, 401, origin);
    const key = 'b:' + id;
    const rec = await env.SCI_KV.get(key, 'json');
    if(!rec) return json({ ok: true, missing: true }, 200, origin);
    if(rec.ahh !== await sha256hex(auth)) return json({ error: 'auth' }, 403, origin);
    await env.SCI_KV.delete(key);
    return json({ ok: true }, 200, origin);
  }

  return json({ error: 'method' }, 405, origin);
}