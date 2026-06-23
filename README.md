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

## 갤러리 기능

- 플랫폼(Meta/TikTok) · 광고주 유형(리테일러/브랜드) · 국가 · K뷰티 facet 필터
- 후킹/소구/톤 태그 칩 필터
- 인라인 영상 재생 (커버 썸네일 → fresh일 때 재생, 만료 시 원본 링크 폴백)
- peek 다운로드 — 맘에 드는 소재를 로컬로 저장
- 라이트/다크 테마

## 구성 파일

| 파일 | 역할 |
|---|---|
| `config.json` | 수집 대상(Meta 광고주 목록·TikTok 산업/지역) + 태그 enum + 출력 설정 |
| `collect-meta.js` | Meta 광고 라이브러리 수집 |
| `collect-tiktok.js` | TikTok Creative Center 내부 API 수집 |
| `commit.js` | 통합 스키마(`gallery.json`)로 머지 |
| `prune.js` | 용량 관리 |
| `render.js` | HTML 갤러리 렌더링 |
| `.github/workflows/refresh.yml` | 주 3회 자동 갱신 파이프라인 |

### 통합 스키마 (`gallery.json`, 키 `<source>:<ad_id>`)

`source` · `advertiser` · `advertiser_type` · `kbeauty` · `countries[]` · `format` · `started` · `is_active` · `copy` · `cta` · `landing_url` · `video_url` · `detail_url` · `media_rel` · `metrics`(TikTok ctr/like) · `tags`{hook_type, appeal, tone, summary}

## 로컬 실행

```bash
npm install
npx playwright install chromium

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
