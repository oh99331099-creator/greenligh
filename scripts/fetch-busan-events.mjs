// 부산 공공데이터 → data/busan-events.json
// 실행: BUSAN_API_KEY=발급키 node scripts/fetch-busan-events.mjs   (Node 20 이상, 외부 패키지 없음)
import { writeFile, mkdir } from 'node:fs/promises';

const KEY = process.env.BUSAN_API_KEY;
if (!KEY) { console.error('BUSAN_API_KEY 환경변수가 없습니다.'); process.exit(1); }

const DAYS_AHEAD = 61;          // 오늘부터 약 2달 뒤까지
const POSTER_ONLY = false;      // true면 포스터 이미지가 있는 행사만 (문화 공연·전시 API는 이미지 필드가 없어 대부분 빠집니다)
const OUT = 'data/busan-events.json';
const BASE = 'https://apis.data.go.kr/6260000';

// 요청주소는 공공데이터포털 > 마이페이지 > 활용신청 현황 > 각 API 상세의 '요청주소'와 같아야 합니다.
// ✔ = 포털 문서에서 확인됨, ? = 같은 규칙으로 추정 (첫 실행 로그에서 실패하면 요청주소로 바꿔 주세요)
const SOURCES = [
  { name: '부산축제정보', type: 'festival', cat: '행사', url: `${BASE}/FestivalService/getFestivalKr` },                          // ✔
  { name: '문화 기타장르', type: 'culture', cat: '공연', url: `${BASE}/BusanCultureEtcDetailService/getBusanCultureEtcDetail` },    // ✔
  { name: '문화 연극', type: 'culture', cat: '공연', url: `${BASE}/BusanCultureDramaDetailService/getBusanCultureDramaDetail` },    // ?
  { name: '문화 뮤지컬', type: 'culture', cat: '공연', url: `${BASE}/BusanCultureMusicalDetailService/getBusanCultureMusicalDetail` }, // ?
  { name: '문화 클래식', type: 'culture', cat: '공연', url: `${BASE}/BusanCultureClassicDetailService/getBusanCultureClassicDetail` }, // ?
  { name: '문화 전시', type: 'culture', cat: '전시', url: `${BASE}/BusanCultureExhibitDetailService/getBusanCultureExhibitDetail` },  // ?
];

const p2 = n => String(n).padStart(2, '0');
const kst = () => new Date(Date.now() + 9 * 3600e3);
const isoDay = d => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const ymd = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
const today = isoDay(kst());
const until = isoDay(new Date(kst().getTime() + DAYS_AHEAD * 864e5));
const clean = s => (s == null ? '' : String(s)).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').trim();

function findItems(j) {
  let out = null;
  (function walk(o) {
    if (out || !o || typeof o !== 'object') return;
    if (Array.isArray(o)) { if (o.length && typeof o[0] === 'object') { out = o; return; } o.forEach(walk); return; }
    for (const k of Object.keys(o)) {
      if (k === 'item' && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) { out = [o[k]]; return; }
      walk(o[k]);
    }
  })(j);
  return out || [];
}
function findKey(j, key) {
  if (!j || typeof j !== 'object') return undefined;
  if (key in j) return j[key];
  for (const v of Object.values(j)) { const r = findKey(v, key); if (r !== undefined) return r; }
}

async function fetchAll(src) {
  const rows = [];
  for (let page = 1; page <= 50; page++) {
    const q = new URLSearchParams({ serviceKey: KEY, pageNo: page, numOfRows: 100, resultType: 'json' });
    const res = await fetch(`${src.url}?${q}`);
    const text = await res.text();
    let j; try { j = JSON.parse(text); } catch { throw new Error(`JSON 아님 (HTTP ${res.status}): ${text.slice(0, 160)}`); }
    const code = findKey(j, 'resultCode') ?? findKey(j, 'code');
    if (code && !['00', '0', 'INFO-000'].includes(String(code))) throw new Error(`API 오류 ${code}: ${findKey(j, 'resultMsg') ?? findKey(j, 'message') ?? ''}`);
    const items = findItems(j);
    rows.push(...items);
    const total = Number(findKey(j, 'totalCount') || 0);
    if (!items.length || items.length < 100 || (total && rows.length >= total)) break;
  }
  return rows;
}

function parseRange(s) {
  s = clean(s); if (!s) return null;
  const full = [...s.matchAll(/(20\d{2})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/g)];
  if (!full.length) return null;
  const y = +full[0][1], m = +full[0][2], start = ymd(y, m, +full[0][3]);
  let end = start;
  if (full.length > 1) end = ymd(+full[1][1], +full[1][2], +full[1][3]);
  else {
    const rest = s.slice(full[0].index + full[0][0].length);
    const r = rest.match(/^[^~∼–]*?[~∼–]\s*(?:(\d{1,2})\s*[.\/월]\s*)?(\d{1,2})\s*[.일]?/);
    if (r) { const mo = r[1] ? +r[1] : m; end = ymd(mo < m ? y + 1 : y, mo, +r[2]); }
  }
  return { start, end: end < start ? start : end };
}
const firstTimes = s => { const t = [...clean(s).matchAll(/([01]?\d|2[0-3])\s*:\s*([0-5]\d)/g)].map(x => `${p2(x[1])}:${x[2]}`); return [t[0] || '00:00', t[1] || '23:59']; };
function feeOf(s) {
  s = clean(s);
  if (!s) return { fee: '요금 문의', feeText: '' };
  if (/무료/.test(s) && !/유료|\d[\d,]*\s*원/.test(s)) return { fee: '무료', feeText: s === '무료' ? '' : s };
  return { fee: '유료', feeText: s };
}

function fromFestival(r, src) {
  const range = parseRange(r.USAGE_DAY) || parseRange(r.USAGE_DAY_WEEK_AND_TIME) || parseRange(r.TITLE) || parseRange(r.SUBTITLE);
  if (!range) return null;
  const [t0, t1] = firstTimes(r.USAGE_DAY_WEEK_AND_TIME);
  const gugun = clean(r.GUGUN_NM);
  return {
    id: `fes-${r.UC_SEQ}`, src: src.name, cat: src.cat,
    title: clean(r.MAIN_TITLE || r.TITLE), start: `${range.start}T${t0}`, end: `${range.end}T${t1}`,
    place: [gugun, clean(r.MAIN_PLACE || r.PLACE || r.ADDR1)].filter(Boolean).join(' · '), gugun,
    ...feeOf(r.USAGE_AMOUNT), desc: clean(r.ITEMCNTNTS).slice(0, 700),
    poster: r.MAIN_IMG_NORMAL || r.MAIN_IMG_THUMB || null, tel: clean(r.CNTCT_TEL), homepage: clean(r.HOMEPAGE_URL),
  };
}
function fromCulture(r, src) {
  const st = clean(r.op_st_dt).slice(0, 10), ed = clean(r.op_ed_dt).slice(0, 10) || st;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(st)) return null;
  const [t0] = firstTimes(r.showtime);
  const desc = [['관람회차', r.showtime], ['런타임', r.runtime], ['관람연령', r.rating], ['출연', r.casting], ['기획', r.enterprise], ['가격', r.price]]
    .map(([k, v]) => (clean(v) && clean(v) !== 'null' ? `${k}: ${clean(v)}` : '')).filter(Boolean).join('\n');
  return {
    id: `cul-${r.res_no}`, src: src.name, cat: src.cat, title: clean(r.title),
    start: `${st}T${t0}`, end: `${ed}T23:59`, place: clean(r.place_nm), gugun: '',
    ...feeOf(r.price), desc, poster: null, tel: '', homepage: clean(r.dabom_url),
  };
}

const report = [], events = [], seen = new Set();
for (const src of SOURCES) {
  try {
    const rows = await fetchAll(src);
    let n = 0;
    for (const r of rows) {
      const e = src.type === 'festival' ? fromFestival(r, src) : fromCulture(r, src);
      if (!e || !e.title) continue;
      if (e.end.slice(0, 10) < today || e.start.slice(0, 10) > until) continue;
      if (POSTER_ONLY && !e.poster) continue;
      const k = `${e.title}|${e.start.slice(0, 10)}`;
      if (seen.has(k)) continue;
      seen.add(k); events.push(e); n++;
    }
    report.push({ name: src.name, ok: true, fetched: rows.length, kept: n });
    console.log(`✔ ${src.name}: ${rows.length}건 조회 → ${n}건 반영`);
  } catch (err) {
    report.push({ name: src.name, ok: false, error: String(err.message || err) });
    console.warn(`✖ ${src.name}: ${err.message || err}`);
  }
}

if (report.every(r => !r.ok)) { console.error('모든 API 호출이 실패해 기존 파일을 유지합니다.'); process.exit(1); }
events.sort((a, b) => (a.start < b.start ? -1 : 1));
await mkdir('data', { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), range: { from: today, to: until }, sources: report, events }, null, 1));
console.log(`저장: ${OUT} (${events.length}건, ${today} ~ ${until})`);
