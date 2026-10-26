// 그린라이트 문화콘텐츠 저장소 (Netlify Functions + Netlify Blobs)
// GET  /api/content            → 직접 등록한 콘텐츠 목록 (누구나)
// GET  /api/content?img=키      → 업로드한 이미지
// POST /api/content            → 로그인·저장·삭제 (헤더 x-admin-password 필요)
// Netlify 환경변수 ADMIN_PASSWORD 에 관리자 비밀번호를 넣어 주세요.
import { getStore } from '@netlify/blobs';

// 블롭 저장소에 공지가 한 번도 저장되지 않았을 때 최초 1회 채워 넣는 기본 공지 (data/notices.json 과 동일)
const SEED_NOTICES = [{"id":"n-seed-6","date":"2026-10-25","pinned":true,"title":"🎁 부산 랜덤 체험단 모집!","images":[],"body":"🎁 부산 랜덤 체험 프로젝트!\n🎁 부산 랜덤 체험단 모집!\n\n부산에서 특별한 경험을 함께할 체험단을 모집합니다!\n\n매번 똑같은 데이트, 똑같은 주말이 지루했다면?\n\n부산에서 진행되는 다양한 행사와 체험 프로그램 중 어떤 체험에 참여하게 될지 모르는 랜덤 체험단!\n\n평소 접해보지 못했던 새로운 경험을 특별한 가격으로 즐겨보세요.\n\n🎟️ 체험단 혜택\n- 부산의 다양한 행사 중 1개 랜덤 매칭\n- 일반 참가비보다 할인된 체험단 특별가 제공\n- 새로운 행사와 프로그램을 경험할 기회\n\n📌 모집 안내\n- 모집 대상 : 부산에서 새로운 경험을 해보고 싶은 누구나\n- 체험 장소 : 부산광역시 내 행사 및 체험 공간\n- 체험 비용 : 매칭된 행사에 따라 개별 안내\n- 모집 기간 : [모집 기간 입력]\n- 참여 조건 : 체험 후 간단한 후기 작성\n\n📝 참여 방법\n① 구글 폼을 통해 체험단 신청\n② 신청 조건을 바탕으로 체험 행사 랜덤 매칭\n③ 매칭 결과 및 할인된 체험 비용 개별 안내\n④ 참여 확정 후 행사 체험 및 후기 작성\n\n💌 어떤 경험이 기다리고 있을지는 아무도 모릅니다!\n\n이번 주말, 우연히 만난 특별한 경험이 가장 좋은 추억이 될지도 몰라요.\n\n※ 본 체험단은 무료 체험이 아닌 할인형 체험단입니다.\n※ 매칭 후 행사 내용과 비용을 확인하고 최종 참여 여부를 결정할 수 있습니다.\n※ 신청 인원 및 행사 운영 상황에 따라 매칭되지 않을 수 있습니다.\n\n🔗 체험단 신청하기\nhttps://forms.gle/rg4GJfcv8cibNcgNA"},{"id":"n-seed-5","date":"2026-10-20","pinned":false,"title":"10월 운영시간 변경 안내","images":[],"body":"10월 한 달간 스튜디오 운영시간이 아래와 같이 변경됩니다.\n\n- 평일 : 10:00 ~ 18:00\n- 토요일 : 11:00 ~ 17:00\n- 일요일·공휴일 : 휴무\n\n방문 전 운영시간을 확인해 주세요. 11월부터는 기존 운영시간으로 돌아갑니다."},{"id":"n-seed-4","date":"2026-10-13","pinned":false,"title":"행사 캘린더 기능 오픈","images":[],"body":"부산의 공연·전시·축제 일정을 한 달력에서 볼 수 있는 행사 캘린더가 열렸습니다.\n\n자동으로 모은 부산 문화콘텐츠와 그린라이트가 직접 등록한 행사를 날짜별로 확인할 수 있습니다. 날짜를 누르면 그날의 행사 목록이 표시됩니다."},{"id":"n-seed-3","date":"2026-10-06","pinned":false,"title":"문화콘텐츠 제보를 받습니다","images":[],"body":"부산에서 열리는 공연, 전시, 축제, 교육 프로그램 소식을 제보해 주세요.\n\n제보해 주신 내용은 확인 후 문화콘텐츠 페이지와 행사 캘린더에 등록됩니다.\n\n- 제보 내용 : 행사명, 일시, 장소, 참가 방법, 포스터 이미지\n- 제보 방법 : 홈페이지 하단 이메일로 전송"},{"id":"n-seed-2","date":"2026-09-28","pinned":false,"title":"추석 연휴 운영 안내","images":[],"body":"추석 연휴 기간(9월 24일 ~ 9월 27일) 스튜디오는 휴무입니다.\n\n연휴 동안 접수된 문의와 제보는 9월 28일부터 순차적으로 답변드립니다. 풍성한 한가위 보내세요."},{"id":"n-seed-1","date":"2026-09-15","pinned":false,"title":"그린라이트 스튜디오 홈페이지 오픈","images":[],"body":"그린라이트 스튜디오 홈페이지가 문을 열었습니다.\n\n부산에서 열리는 다양한 문화 소식을 모아 매주 새로 안내합니다. 문화콘텐츠, 행사 캘린더, 공지사항을 통해 새로운 소식을 확인해 주세요."}];

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
    let notices = await store.get('notices', { type: 'json' });
    if (!Array.isArray(notices)) { notices = SEED_NOTICES; await store.setJSON('notices', notices); }
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
