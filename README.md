# Beauty Ad Reference Gallery

유럽 시장의 뷰티(화장품) 경쟁 광고를 한곳에 모아 훑고 "찾아 쓰는" 레퍼런스 갤러리입니다. 두 개의 공개 소스를 수집해 Claude 비전으로 후킹·소구·톤을 태깅하고, 필터 가능한 단일 HTML 페이지로 렌더링합니다.

**갤러리 보기 → https://minmk-crypto.github.io/beauty-ad-reference-gallery/**

매주 월·수·금 03:00 KST에 GitHub Actions가 자동으로 신규 광고를 수집·태깅·배포합니다.

## 수집 소스

| 소스 | 렌즈 | 대상 |
|---|---|---|
| **Meta 광고 라이브러리** | 광고주별 추적 (경쟁사 모니터링) | 지정 광고주 — Sephora·Nocibé·Notino·Douglas 등 EU 리테일러 + COSRX·Anua·Beauty of Joseon 등 K뷰티 브랜드 |
| **TikTok Creative Center** | 상위 광고 집계 (트렌드·인스피레이션) | Beauty & Personal Care 산업 × EU 20개국 Top Ads |

현재 약 1,000건 이상의 활성 광고가 적재되어 있습니다 (Meta 930 / TikTok 155, K뷰티 437건).

## 동작 방식

```
sync-advertisers.js Meta 추적 광고주를 마케터 관리 시트(CSV)에서 동기화 → config.json
collect-meta.js     Meta 광고주별 신규 수집 (country=ALL) → data/manifest-meta.json
collect-tiktok.js   TikTok 상위 광고 신규 수집 → data/manifest-tiktok.json
   ↓ 신규 광고 커버를 Claude 비전으로 판독 → data/tags.json
commit.js           두 manifest + tags → data/gallery.json 머지, 활성 상태 재조정
prune.js            용량 목표(GitHub Pages 한계) 유지를 위한 자동 정리
render.js           docs/index.html + assets 재생성
```

신규로 발견된 광고만 미디어를 다운로드하고 비전 태깅합니다. 비전 태깅은 별도 API 키 없이 Claude Code OAuth(`/beauty-ad-gallery` 실행) 또는 CI의 `CLAUDE_CODE_OAUTH_TOKEN`으로 수행합니다.

### 비전 태깅 enum

- **hook_type**: 문제제기형 / 효능강조형 / 후기·증언형 / 비교형 / 호기심형 / 정보제공형
- **appeal**: 효능·기능 / 성분 / 사용감·텍스처 / 결과·비포애프터 / 가격·프로모션 / 트렌드·바이럴 / 브랜드무드 / 안전·저자극
- **tone**: 정보형 / 감성형 / 유머형 / 미니멀 / 감각·ASMR

`format`(영상/이미지/캐러셀)은 소스 DOM에서 자동 판정하며 태깅 대상이 아닙니다.

## 광고주 관리 시트 (마케터용)

Meta 추적 대상(광고주 목록)은 마케터가 직접 관리하는 **Google Sheet** 한 곳에서 정합니다. 시트를 고치면 다음 갱신 주기(월·수·금 03:00 KST)에 `sync-advertisers.js`가 시트를 읽어 `config.json`의 광고주 목록을 맞춥니다. 코드 수정이 필요 없습니다.

- 인증/시크릿 없이 동작합니다 — 시트를 "웹에 게시(CSV)" 하거나 "링크 보기 공유" 상태로 두면 됩니다(추적 대상은 공개 경쟁사 페이지 ID라 민감정보가 아님).
- 시트가 비었거나 접근 불가·CSV 깨짐이면 **직전 목록을 그대로 유지**합니다(빈 목록 사고 방지).
- 시트 URL은 `config.json`의 `sources.meta.advertisers_sheet.csv_url` 또는 `ADVERTISERS_SHEET_CSV_URL` 시크릿으로 등록합니다(시크릿 우선).
- 현재 추적 중인 광고주 전체는 [`advertisers-seed.csv`](advertisers-seed.csv)로 export되어 있어 시트 최초 생성 시 그대로 가져오면 됩니다.

컬럼 설명·페이지 ID 찾는 법·최초 셋업은 **[docs/advertiser-sheet-guide.md](docs/advertiser-sheet-guide.md)** 참고.

## 갤러리 기능

- 플랫폼(Meta/TikTok) · 광고주 유형(리테일러/브랜드) · 국가 · K뷰티 facet 필터
- 후킹/소구/톤 태그 칩 필터
- 인라인 영상 재생 (커버 썸네일 → fresh일 때 재생, 만료 시 원본 링크 폴백)
- peek 다운로드 — 맘에 드는 소재를 로컬로 저장
- 라이트/다크 테마

## 구성 파일

| 파일 | 역할 |
|---|---|
| `config.json` | 수집 대상(Meta 광고주 목록·TikTok 산업/지역) + 광고주 시트 URL + 태그 enum + 출력 설정 |
| `sync-advertisers.js` | 마케터 관리 시트(CSV) → `config.json` 광고주 목록 동기화 (fail-safe) |
| `advertisers-seed.csv` | 현재 광고주 목록 export (시트 최초 생성용 시드) |
| `collect-meta.js` | Meta 광고 라이브러리 수집 |
| `collect-tiktok.js` | TikTok Creative Center 내부 API 수집 |
| `commit.js` | 통합 스키마(`gallery.json`)로 머지 |
| `prune.js` | 용량 관리 |
| `render.js` | HTML 갤러리 렌더링 |
| `.github/workflows/refresh.yml` | 주 3회 자동 갱신 파이프라인 |

### 통합 스키마 (`gallery.json`, 키 `<source>:<ad_id>`)

`source` · `advertiser` · `advertiser_type` · `kbeauty` · `countries[]` · `format` · `started` · `is_active` · `copy` · `cta` · `landing_url` · `video_url` · `detail_url` · `media_rel` · `metrics`(TikTok ctr/like) · `tags`{hook_type, appeal, tone, summary}

## 데이터 저장 구조

메타데이터는 JSON, 이미지·영상 파일은 실제 파일로 디스크에 저장하는 하이브리드 구조입니다. JSON에는 미디어를 base64로 넣지 않고 파일을 가리키는 **상대경로**만 담습니다. `gallery.json`이 카탈로그(색인), `docs/assets/`가 실물 보관소 역할을 하며 `media_rel` 경로로 둘을 잇습니다.

**메타데이터 → `data/`**

| 파일 | 내용 | 커밋 |
|---|---|---|
| `gallery.json` | 통합 본체 — 광고주·카피·태그·국가·포맷 + 미디어 경로(`media_rel`)·영상 URL | O |
| `tags.json` | 비전 태깅 결과 (hook/appeal/tone/summary) | O |
| `state.json` | 신규 감지·활성 상태 추적 | O |
| `manifest-meta.json` / `manifest-tiktok.json` | 수집 중간 산출물 | X (gitignore) |
| `.pwprofile` / `.ttprofile` | 브라우저 프로파일 | X (gitignore) |

**미디어 파일 → `docs/assets/`**

- 이미지·영상 커버·압축 영상을 실제 파일로 다운로드해 저장합니다.
- Meta는 광고주 page_id별 하위 폴더 — `assets/meta/<page_id>/<ad_id>.jpg`
- TikTok은 ad_id별 커버 `.jpg` + 압축 영상 `.mp4` 쌍 — `assets/tiktok/<ad_id>.jpg`

```
gallery.json 의 한 항목
  media_rel: "assets/meta/16453004404/1738577247511359.jpg"   ← 로컬 파일 경로
  video_url: "https://...tiktokcdn.com/..."                   ← 원본 CDN (만료 가능)
```

`render.js`가 `gallery.json`을 읽어 `media_rel` 경로로 `<img>`/`<video>` 태그를 만들고, 브라우저는 같은 `docs/` 안의 파일을 로드합니다. 영상은 로컬 `.mp4`가 있으면 인라인 재생, prune되거나 없으면 `video_url`(CDN)로, 그마저 만료되면 원본 링크로 폴백합니다.

미디어가 실파일이므로 `docs/`는 수백 MB 규모로 커집니다. `state.json`으로 이미 본 광고를 걸러 신규 미디어만 받고, `prune.js`가 GitHub Pages 용량 한계(약 1GB) 안에서 자동 정리합니다.

## 로컬 실행

```bash
npm install
npx playwright install chromium

node sync-advertisers.js   # (시트 연결 시) 광고주 목록 동기화 — 미설정이면 자동 생략
node collect-meta.js
node collect-tiktok.js
# → 신규 광고 비전 태깅 (data/tags.json)
node commit.js
node prune.js
node render.js
# docs/index.html 을 브라우저로 열어 확인
```

## 한계

- **Meta는 `country=ALL`로 수집합니다.** 글로벌 광고주 페이지를 특정국으로 조회하면 광고 대신 "Similar regional ads" 목록이 떠 0건이 되기 때문입니다. 따라서 Meta 광고에는 EU 국가별 분기가 없으며, 국가 facet은 TikTok(region)에서 동작합니다. 국가별 Meta가 필요하면 지역 page_id를 별도로 등록합니다.
- TikTok 상위 광고는 광고주명이 익명(`Not Mention`)일 수 있어 경쟁사 모니터링이 아닌 인스피레이션 용도입니다.
- 공개 투명성·인스피레이션 데이터의 read-only 수집입니다. 소스 DOM/엔드포인트 변동 시 추출부 보정이 필요합니다.
- 영상 `video_url`은 만료될 수 있으며, 만료 시 원본 링크로 폴백합니다.

## 라이선스

MIT
