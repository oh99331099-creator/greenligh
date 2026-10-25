// 그린라이트 문화콘텐츠 저장소 (Netlify Functions + Netlify Blobs)
// GET  /api/content            → 직접 등록한 콘텐츠 목록 (누구나)
// GET  /api/content?img=키      → 업로드한 이미지
// POST /api/content            → 로그인·저장·삭제 (헤더 x-admin-password 필요)
// Netlify 환경변수 ADMIN_PASSWORD 에 관리자 비밀번호를 넣어 주세요.
import { getStore } from '@netlify/blobs';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default async (req) => {
  const store = getStore({ name: 'greenlight', consistency: 'strong' });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const img = url.searchParams.get('img');
    if (img) {
      const hit = await store.getWithMetadata('img/' + img, { type: 'arrayBuffer' });
      if (!hit) return new Response('not found', { status: 404 });
      return new Response(hit.data, { headers: { 'content-type': (hit.metadata && hit.metadata.type) || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
    }
    const events = (await store.get('events', { type: 'json' })) || [];
    const settings = (await store.get('settings', { type: 'json' })) || null;
    const notices = (await store.get('notices', { type: 'json' })) || [];
    return json({ events, settings, notices });
  }

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!process.env.ADMIN_PASSWORD) return json({ error: 'Netlify 환경변수 ADMIN_PASSWORD가 설정되지 않았습니다.' }, 500);
  if ((req.headers.get('x-admin-password') || '') !== process.env.ADMIN_PASSWORD) return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);

  const body = await req.json().catch(() => ({}));
  let events = (await store.get('events', { type: 'json' })) || [];

  const saveImg = async (d) => {
    if (typeof d !== 'string' || !d.startsWith('data:')) return d || null;
    const m = d.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return null;
    const key = crypto.randomUUID();
    await store.set('img/' + key, new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), { metadata: { type: m[1] } });
    return '/api/content?img=' + key;
  };

  if (body.action === 'login') return json({ ok: true });

  if (body.action === 'saveNotice') {
    let notices = (await store.get('notices', { type: 'json' })) || [];
    const n = { ...(body.notice || {}) };
    n.images = (await Promise.all((n.images || []).slice(0, 6).map(saveImg))).filter(Boolean);
    if (!n.id) n.id = 'n-' + Date.now().toString(36);
    if (!n.date) n.date = new Date().toISOString().slice(0, 10);
    n.updatedAt = new Date().toISOString();
    notices = notices.some(x => x.id === n.id) ? notices.map(x => (x.id === n.id ? n : x)) : [n, ...notices];
    await store.setJSON('notices', notices);
    return json({ ok: true, notices });
  }

  if (body.action === 'deleteNotice') {
    let notices = (await store.get('notices', { type: 'json' })) || [];
    const gone = notices.find(x => x.id === body.id);
    notices = notices.filter(x => x.id !== body.id);
    await store.setJSON('notices', notices);
    if (gone) for (const u of gone.images || []) { const k = String(u || '').split('img=')[1]; if (k) await store.delete('img/' + k); }
    return json({ ok: true, notices });
  }

  if (body.action === 'settings') {
    const s = body.settings || {};
    const slides = await Promise.all((s.slides || []).slice(0, 10).map(async x => ({ ...x, img: await saveImg(x.img) })));
    const L = s.links || {}; const clean = v => String(v || '').trim().slice(0, 300);
    const settings = { order: Array.isArray(s.order) ? s.order : ['events', 'calendar', 'notice'], autoSlides: s.autoSlides !== false, slides, links: { email: clean(L.email), instagram: clean(L.instagram), kakao: clean(L.kakao) }, updatedAt: new Date().toISOString() };
    await store.setJSON('settings', settings);
    return json({ ok: true, settings });
  }

  if (body.action === 'save') {
    const e = { ...(body.event || {}) };
    e.poster = await saveImg(e.poster);
    e.images = (await Promise.all((e.images || []).slice(0, 4).map(saveImg))).filter(Boolean);
    if (!e.id) e.id = 'm-' + Date.now().toString(36);
    e.updatedAt = new Date().toISOString();
    events = events.some(x => x.id === e.id) ? events.map(x => (x.id === e.id ? e : x)) : [...events, e];
    await store.setJSON('events', events);
    return json({ ok: true, event: e, events });
  }

  if (body.action === 'delete') {
    const gone = events.find(x => x.id === body.id);
    events = events.filter(x => x.id !== body.id);
    await store.setJSON('events', events);
    if (gone) for (const u of [gone.poster, ...(gone.images || [])]) { const k = String(u || '').split('img=')[1]; if (k) await store.delete('img/' + k); }
    return json({ ok: true, events });
  }

  return json({ error: 'unknown action' }, 400);
};

export const config = { path: '/api/content' };
