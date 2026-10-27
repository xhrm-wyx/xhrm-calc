/**
 * 理科计算器 · 云同步中继（Cloudflare Pages Function + KV）
 * GET  /api/sync?op=ping
 * GET  /api/sync?id=<64hex>&ah=<64hex>
 * PUT  /api/sync  { id, ah, blob }
 */
const ALLOWED = ['https://xhrm-calc.pages.dev','https://xhrm-wyx.github.io'];
function corsHeaders(origin){
  const ok = ALLOWED.includes(origin) || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin || '');
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}
function json(body, status, origin){
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(origin))
  });
}
const HEX64 = /^[a-f0-9]{64}$/i;

export async function onRequest(context){
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  if(request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if(!env || !env.SCI_KV) return json({ error: 'kv-not-bound' }, 500, origin);

  const op = url.searchParams.get('op') || '';
  if(op === 'ping') return json({ ok: true, t: Date.now(), kv: true }, 200, origin);

  if(request.method === 'GET'){
    const id = (url.searchParams.get('id') || '').toLowerCase();
    const ah = (url.searchParams.get('ah') || '').toLowerCase();
    if(!HEX64.test(id) || !HEX64.test(ah)) return json({ error: 'bad id' }, 400, origin);
    const rec = await env.SCI_KV.get('b:' + id, 'json');
    if(!rec) return json({ error: 'empty' }, 404, origin);
    if(String(rec.ah) !== ah) return json({ error: 'auth' }, 403, origin);
    return json({ blob: rec.blob, ts: rec.ts }, 200, origin);
  }

  if(request.method === 'PUT'){
    let body;
    try{ body = await request.json(); }catch(e){ return json({ error: 'bad json' }, 400, origin); }
    const id = String((body && body.id) || '').toLowerCase();
    const ah = String((body && body.ah) || '').toLowerCase();
    const blob = String((body && body.blob) || '');
    if(!HEX64.test(id) || !HEX64.test(ah)) return json({ error: 'bad id' }, 400, origin);
    if(!blob || blob.length > 2 * 1024 * 1024) return json({ error: 'bad blob' }, 400, origin);
    const key = 'b:' + id;
    const cur = await env.SCI_KV.get(key, 'json');
    if(cur && String(cur.ah) !== ah) return json({ error: 'auth' }, 403, origin);
    const rec = { ah: ah, blob: blob, ts: Date.now() };
    await env.SCI_KV.put(key, JSON.stringify(rec));
    return json({ ok: true, ts: rec.ts }, 200, origin);
  }

  return json({ error: 'method' }, 405, origin);
}