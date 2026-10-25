# 부산 행사 자동 업데이트 설정

이 설정을 마치면 매주 일요일 06:00(한국시간)에 부산 공공데이터를 불러옵니다. 오늘부터 약 2달 뒤까지 열리는 행사만 `data/busan-events.json` 파일에 저장되고, 사이트는 이 파일을 읽어서 보여 줍니다.

## 1. 저장소에 올리기
프로젝트 전체를 GitHub 저장소에 올립니다. 아래 파일이 모두 포함되어야 합니다.
- `greenlight.dc.html`, `support.js`, `assets/`, `data/`
- `scripts/`, `.github/`

그다음 **Settings → Pages**에서 브랜치를 선택해 GitHub Pages를 켭니다.

## 2. 인증키 등록 (코드에 직접 넣지 마세요)
**Settings → Secrets and variables → Actions → New repository secret**
- Name: `BUSAN_API_KEY`
- Value: 공공데이터포털에서 받은 인증키

## 3. 첫 실행
1. **Actions → 부산 행사 업데이트 → Run workflow**를 누릅니다.
2. 실행 로그에서 API별 결과를 확인합니다.
   - `✔ 부산축제정보: 00건 조회 → 00건 반영` 같은 줄이 보이면 성공입니다.
   - `✖`가 보이면 `scripts/fetch-busan-events.mjs`의 `SOURCES`에 적힌 요청주소를 고쳐야 합니다. 공공데이터포털 **마이페이지 → 활용신청 현황**에서 해당 API의 '요청주소'를 확인해 그대로 넣어 주세요.

## 4. 사이트 미리보기
- 기본 상태에서는 실제 데이터(`data/busan-events.json`)를 보여 줍니다. 첫 수집 전에는 행사 목록이 비어 있습니다.
- 디자인 편집기의 Tweaks 패널에서 `sampleData`를 켜면 샘플 행사 4건으로 화면을 확인할 수 있습니다.

## 옵션 (`scripts/fetch-busan-events.mjs` 맨 위)
- `DAYS_AHEAD`: 며칠 뒤 행사까지 가져올지 정합니다. 기본값은 61일입니다.
- `POSTER_ONLY`: `true`로 바꾸면 포스터가 있는 행사만 가져옵니다. 문화 공연·전시 API에는 이미지 정보가 없어서, 켜면 축제만 남습니다.
