// 한국문화정보원 '한눈에보는문화정보조회서비스' + 한국관광공사 '국문 관광정보 서비스_GW' → data/busan-events.json (부산 지역만)
// 실행: BUSAN_API_KEY=발급키 node scripts/fetch-busan-events.mjs   (Node 20 이상, 외부 패키지 없음)
import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';

const KEY = (process.env.BUSAN_API_KEY || '').trim().replace(/^["']|["']$/g, '');
if (!KEY) { console.error('BUSAN_API_KEY 환경변수가 없습니다.'); process.exit(1); }
console.log(`인증키 확인: 길이 ${KEY.length}자, 앞 4자리 ${KEY.slice(0, 4)}…, 끝 4자리 …${KEY.slice(-4)}`);

const DAYS_AHEAD = 61;        // 오늘부터 약 2달 뒤까지
const POSTER_ONLY = false;    // true면 포스터 이미지가 있는 행사만
const WITH_DETAIL = true;     // 행사별 상세(요금·문의처·소개) 추가 조회
const BASE = 'https://apis.data.go.kr/B553457/cultureinfo';
const OUT = 'data/busan-events.json';
const SERVICE_TYPES = { A: '공연/전시', B: '행사/축제', C: '교육/체험' };

const p2 = n => String(n).padStart(2, '0');
const kst = (add = 0) => new Date(Date.now() + 9 * 3600e3 + add * 864e5);
const ymd = d => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
const dash = s => (s && s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '');
const FROM = ymd(kst()), TO = ymd(kst(DAYS_AHEAD));
let usedBase = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]).trim() : ''; };
const pick = (xml, ...names) => { for (const n of names) { const v = tag(xml, n); if (v) return v; } return ''; };
const clean = s => decode(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

function curl(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-sS', '-L', '--max-time', '30', '--retry', '2', '--retry-delay', '2', '-A', 'Mozilla/5.0 (greenlight-busan-bot)', '-H', 'Accept: application/xml,text/xml,*/*', '-w', '\n__HTTP__%{http_code}', url],
      { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message).trim().slice(0, 200)));
        const k = stdout.lastIndexOf('\n__HTTP__');
        resolve({ status: Number(stdout.slice(k + 9)), text: stdout.slice(0, k) });
      });
  });
}
async function get(url) {
  try { return await curl(url); }
  catch (e1) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); return { status: r.status, text: await r.text() }; }
    catch (e2) { throw new Error(`curl: ${e1.message} / fetch: ${e2.message} ${e2.cause?.code || ''}`.trim()); }
  }
}
async function call(op, params) {
  const q = new URLSearchParams({ serviceKey: KEY, ...params });
  let r = null; const errs = [];
  for (const base of [BASE, BASE.replace('https://', 'http://')]) {
    try { r = await get(`${base}/${op}?${q}`); if (!usedBase) { usedBase = base; console.log(`  (연결 성공: ${base.split('://')[0]})`); } break; }
    catch (e) { errs.push(`${base.split('://')[0]} → ${e.message}`); }
  }
  if (!r) throw new Error('연결 실패 | ' + errs.join(' | '));
  const res = { ok: r.status >= 200 && r.status < 300, status: r.status }, text = r.text;
  const gw = text.match(/"errMsg"\s*:\s*"([^"]+)"/) || text.match(/<errMsg>([^<]+)<\/errMsg>/);
  if (gw) throw new Error(`${gw[1]} ${(text.match(/returnAuthMsg"?\s*[:>]\s*"?([^"<]+)/) || [])[1] || ''}`.trim());
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
  const code = tag(text, 'resultCode');
  if (code && !['00', '0000', '0'].includes(code)) throw new Error(`API 오류 ${code}: ${tag(text, 'resultMsg')}`);
  return text;
}

async function listArea(tp) {
  const rows = [];
  for (let page = 1; page <= 30; page++) {
    const xml = await call('area2', { PageNo: page, numOfrows: 100, sido: '부산', from: FROM, to: TO, serviceTp: tp, sortStdr: 1 });
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    if (page === 1 && !items.length) console.log(`  ↳ ${SERVICE_TYPES[tp]} 응답: ${xml.replace(/\s+/g, ' ').slice(0, 300)}`);
    rows.push(...items);
    const total = Number(tag(xml, 'totalCount') || 0);
    if (items.length < 100 || (total && rows.length >= total)) break;
    await sleep(150);
  }
  return rows;
}

function catOf(realm, tp) {
  if (/전시/.test(realm)) return '전시';
  if (/교육|체험/.test(realm) || tp === 'C') return '교육';
  if (/행사|축제/.test(realm) || tp === 'B') return '행사';
  return '공연';
}
function feeOf(s) {
  s = clean(s);
  if (!s) return { fee: '요금 문의', feeText: '' };
  if (/무료/.test(s) && !/유료|\d[\d,]*\s*원/.test(s)) return { fee: '무료', feeText: s === '무료' ? '' : s };
  return { fee: '유료', feeText: s };
}

const seen = new Map(), report = [];
for (const tp of Object.keys(SERVICE_TYPES)) {
  try {
    const rows = await listArea(tp);
    let n = 0;
    for (const x of rows) {
      const seq = pick(x, 'seq');
      const area = pick(x, 'area', 'sido');
      if (!seq || seen.has(seq) || (area && !/부산/.test(area))) continue;
      const st = dash(pick(x, 'startDate')), ed = dash(pick(x, 'endDate')) || st;
      if (!st || ed < dash(FROM) || st > dash(TO)) continue;
      const realm = pick(x, 'realmName');
      const gugun = pick(x, 'sigungu');
      seen.set(seq, {
        id: `kcis-${seq}`, seq, src: '한국문화정보원 문화포털', cat: catOf(realm, tp), realm,
        title: pick(x, 'title'), start: `${st}T00:00`, end: `${ed}T23:59`,
        place: [gugun, pick(x, 'place')].filter(Boolean).join(' · '), gugun,
        fee: '요금 문의', feeText: '', desc: '', poster: pick(x, 'thumbnail', 'imgUrl') || null, tel: '', homepage: '',
      });
      n++;
    }
    report.push({ name: SERVICE_TYPES[tp], ok: true, fetched: rows.length, kept: n });
    console.log(`✔ ${SERVICE_TYPES[tp]}: ${rows.length}건 조회 → ${n}건 반영`);
  } catch (err) {
    report.push({ name: SERVICE_TYPES[tp], ok: false, error: String(err.message || err) });
    console.warn(`✖ ${SERVICE_TYPES[tp]}: ${err.message || err}`);
  }
}

let events = [...seen.values()];
if (WITH_DETAIL) {
  let ok = 0, fail = 0;
  for (const e of events.slice(0, 800)) {
    try {
      const xml = await call('detail2', { seq: e.seq });
      const it = (xml.match(/<item>[\s\S]*?<\/item>/) || [xml])[0];
      Object.assign(e, feeOf(pick(it, 'price')));
      e.desc = clean(pick(it, 'contents1', 'contents')).slice(0, 700);
      e.tel = pick(it, 'phone');
      e.homepage = pick(it, 'url', 'placeUrl');
      e.poster = e.poster || pick(it, 'imgUrl', 'thumbnail') || null;
      const addr = pick(it, 'placeAddr');
      if (addr && !e.gugun) e.place = e.place ? `${e.place}\n${addr}` : addr;
      ok++;
    } catch { fail++; }
    await sleep(80);
  }
  console.log(`상세 조회: ${ok}건 성공, ${fail}건 실패`);
}

// ── 한국관광공사 국문 관광정보 서비스_GW: 행사·축제 (부산 lDongRegnCd=26) ──
const KTO = 'https://apis.data.go.kr/B551011/KorService2';
async function kto(op, params) {
  const q = new URLSearchParams({ serviceKey: KEY, MobileOS: 'WEB', MobileApp: 'greenlight', _type: 'json', ...params });
  const r = await get(`${KTO}/${op}?${q}`);
  const gw = r.text.match(/"errMsg"\s*:\s*"([^"]+)"/) || r.text.match(/<errMsg>([^<]+)<\/errMsg>/) || r.text.match(/<returnAuthMsg>([^<]+)</);
  if (gw) throw new Error(gw[1]);
  let j; try { j = JSON.parse(r.text); } catch { throw new Error(`HTTP ${r.status}: ${r.text.replace(/\s+/g, ' ').slice(0, 200)}`); }
  const h = (j.response && j.response.header) || {};
  if (h.resultCode && h.resultCode !== '0000') throw new Error(`API 오류 ${h.resultCode}: ${h.resultMsg}`);
  const b = (j.response && j.response.body) || {};
  const it = b.items && b.items.item;
  return { items: Array.isArray(it) ? it : it ? [it] : [], total: Number(b.totalCount || 0) };
}
const ktoEvents = [];
try {
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const { items, total } = await kto('searchFestival2', { numOfRows: 100, pageNo: page, arrange: 'A', eventStartDate: FROM, eventEndDate: TO, lDongRegnCd: '26' });
    rows.push(...items);
    if (items.length < 100 || rows.length >= total) break;
    await sleep(150);
  }
  for (const x of rows) {
    const st = dash(String(x.eventstartdate || '')), ed = dash(String(x.eventenddate || '')) || st;
    if (!st || ed < dash(FROM) || st > dash(TO)) continue;
    const addr = clean(x.addr1);
    if (addr && !/부산/.test(addr)) continue;
    const gugun = (addr.match(/부산(?:광역시)?\s+(\S+?[구군])(?:\s|$)/) || [])[1] || '';
    ktoEvents.push({ id: `kto-${x.contentid}`, cid: x.contentid, src: '한국관광공사', cat: '행사', realm: '축제',
      title: clean(x.title), start: `${st}T00:00`, end: `${ed}T23:59`,
      place: addr.replace(/^부산(광역시)?\s*/, ''), gugun, fee: '요금 문의', feeText: '', desc: '',
      poster: x.firstimage || x.firstimage2 || null, tel: clean(x.tel), homepage: '' });
  }
  let ok = 0;
  for (const e of ktoEvents.slice(0, 150)) {   // 개발계정 하루 1,000회 제한 → 상세는 최대 150건
    try {
      const a = (await kto('detailIntro2', { contentId: e.cid, contentTypeId: 15 })).items[0] || {};
      Object.assign(e, feeOf(a.usetimefestival));
      if (clean(a.eventplace)) e.place = [e.gugun, clean(a.eventplace)].filter(Boolean).join(' · ');
      const t = clean(a.playtime).match(/([01]?\d|2[0-3])\s*:\s*([0-5]\d)/);
      if (t) e.start = `${e.start.slice(0, 11)}${p2(t[1])}:${t[2]}`;
      e.tel = e.tel || clean(a.sponsor1tel);
      const c = (await kto('detailCommon2', { contentId: e.cid })).items[0] || {};
      e.desc = clean(c.overview).slice(0, 700);
      e.homepage = (String(c.homepage || '').match(/https?:\/\/[^\s"'<>]+/) || [])[0] || '';
      ok++;
    } catch {}
    await sleep(80);
  }
  report.push({ name: '한국관광공사 행사·축제', ok: true, fetched: rows.length, kept: ktoEvents.length });
  console.log(`✔ 한국관광공사 행사·축제: ${rows.length}건 조회 → ${ktoEvents.length}건 (상세 ${ok}건)`);
} catch (err) {
  report.push({ name: '한국관광공사 행사·축제', ok: false, error: String(err.message || err) });
  console.warn(`✖ 한국관광공사 행사·축제: ${err.message || err}  ← 활용신청 승인 전이면 정상입니다. 나머지 데이터는 그대로 저장됩니다.`);
}
// 같은 행사 합치기 (제목이 같고 기간이 겹치면 하나로, 빈 정보는 서로 채움)
const norm = t => (t || '').replace(/\[[^\]]*\]|\([^)]*\)|[\s\p{P}\p{S}]/gu, '').toLowerCase();
let merged = 0;
for (const k of ktoEvents) {
  const nk = norm(k.title);
  const dup = nk.length >= 4 && events.find(e => { const ne = norm(e.title); return ne.length >= 4 && (ne === nk || ne.includes(nk) || nk.includes(ne)) && e.start.slice(0, 10) <= k.end.slice(0, 10) && k.start.slice(0, 10) <= e.end.slice(0, 10); });
  if (dup) { for (const f of ['poster', 'desc', 'tel', 'homepage', 'feeText']) if (!dup[f] && k[f]) dup[f] = k[f]; if (dup.fee === '요금 문의' && k.fee !== '요금 문의') dup.fee = k.fee; merged++; }
  else { delete k.cid; events.push(k); }
}
if (merged) console.log(`중복 합침: ${merged}건`);
if (report.every(r => !r.ok)) { console.error('모든 API 호출이 실패해 기존 파일을 유지합니다.'); process.exit(1); }
if (POSTER_ONLY) events = events.filter(e => e.poster);
events.sort((a, b) => (a.start < b.start ? -1 : 1));
events.forEach(e => delete e.seq);

await mkdir('data', { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), range: { from: dash(FROM), to: dash(TO) }, sources: report, events }, null, 1));
console.log(`저장: ${OUT} (${events.length}건, ${dash(FROM)} ~ ${dash(TO)})`);
// END OF FILE — 이 줄이 보이면 전체가 제대로 붙여 넣어진 것입니다.
