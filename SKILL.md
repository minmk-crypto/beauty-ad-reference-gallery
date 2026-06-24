---
name: beauty-ad-gallery
description: 뷰티(화장품) 경쟁 광고 레퍼런스 갤러리. 두 소스를 합친다 — Meta 광고 라이브러리(지정 광고주: Sephora·Nocibé 등 리테일러 + K뷰티 브랜드, 브랜드별 수집) + TikTok Creative Center Top Ads(뷰티 산업 × EU 지역, 상위 광고 집계). 신규만 미디어 다운로드 → Claude 비전으로 후킹/소구/톤 태깅(뷰티 enum) → 플랫폼·광고주유형·국가·K뷰티 필터 가능한 단일 HTML 갤러리(docs/index.html). 트리거 `/beauty-ad-gallery` 또는 "뷰티 광고 갤러리", "뷰티 광고 레퍼런스".
---

# beauty-ad-gallery 스킬

## 목적
Piyonna(EU·K뷰티 크로스보더)의 뷰티 경쟁 광고를 한 곳에서 훑고 "찾아 쓰기". 두 렌즈:
- **Meta(브랜드별)** — 지정 광고주의 광고를 광고주 단위로 추적(경쟁사 모니터링).
- **TikTok(상위광고)** — Creative Center Top Ads 뷰티 산업 × EU 지역 상위 광고(트렌드·인스피레이션, 광고주 익명일 수 있음).

competitor-ad-gallery(F&B) 의 수집·UI 패턴을 멀티소스·뷰티로 일반화. 산출물 `docs/index.html`.

## 구성 파일
| 파일 | 역할 |
|---|---|
| `config.json` | sources.meta(advertisers: label·page_id·type·kbeauty + advertisers_sheet.url) / sources.tiktok(industry·regions·period) + 뷰티 tag_enums + output_dir |
| `sync-advertisers.js` | 마케터 관리 Google Sheet → config.sources.meta.advertisers 동기화. **어떤 형태 URL 이든**(편집·공유·게시·gviz·ID) 받아 CSV 엔드포인트 자동 도출(export→gviz). URL=env `ADVERTISERS_SHEET_URL` > config.advertisers_sheet.url. **advertisers 배열만 in-place 교체**(diff 최소·멱등). fetch 실패·빈 결과 시 기존 config 유지(fail-safe, exit 0). CI 는 시트가 "링크 뷰어 공개" 여야 읽힘. 갱신 주기 첫 단계 |
| `advertisers-seed.csv` | 현재 광고주 목록 export(시트 최초 생성용 시드) |
| `collect-meta.js` | Meta 광고주별 수집(**country=ALL**) → `data/manifest-meta.json`. dedup 'meta:'+library_id |
| `collect-tiktok.js` | TikTok Creative Center 내부 API(`top_ads/v2/list`, 페이지가 호출하는 응답 인터셉트) region별 수집 → `data/manifest-tiktok.json`. dedup 'tiktok:'+id |
| `commit.js` | 두 manifest + `data/tags.json` → `data/gallery.json`(키 `<source>:<ad_id>`), state.seen·is_active 재조정 |
| `render.js` | gallery.json → `docs/index.html` + assets. 플랫폼/광고주유형/국가/K뷰티 facet + 뷰티 칩 + 인라인 영상 + peek + 라이트/다크 |

## 통합 스키마 (gallery.json ads, 키 `<source>:<ad_id>`)
`source`(meta/tiktok) · `advertiser` · `advertiser_type`(retailer/brand/unknown) · `kbeauty` · `countries`[] · `format` · `started` · `is_active` · `copy` · `cta` · `landing_url` · `video_url` · `detail_url` · `media_rel` · `metrics`(tiktok ctr/like) · `tags`{hook_type,appeal,tone,summary}

## 워크플로
```bash
cd ~/.claude/skills/beauty-ad-gallery
node sync-advertisers.js  # (시트 연결 시) 마케터 관리 시트 → config 광고주 동기화. 미설정이면 자동 생략
node collect-meta.js      # Meta 광고주 신규 → manifest-meta.json (+커버 다운로드)
node collect-tiktok.js    # TikTok 상위광고 신규 → manifest-tiktok.json
#  → 두 manifest 의 new[] 를 청크로 나눠 비전 태깅(아래) → data/tags.json
node commit.js            # gallery.json 머지
node render.js            # docs/index.html 재생성
```
**비전 태깅**: 각 신규 광고의 `media_rel`(docs/ 기준) 커버를 Read 로 판독 + copy 참고 → 아래 enum + summary, `data/tags.json` 에 `"<source>:<ad_id>"` 키로 머지. 대량이면 청크 병렬 subagent. (Piyonna 본인이 Claude Code 로 `/beauty-ad-gallery` 실행 → API 키 불필요.)

뷰티 enum:
- hook_type: 문제제기형 / 효능강조형 / 후기·증언형 / 비교형 / 호기심형 / 정보제공형
- appeal: 효능·기능 / 성분 / 사용감·텍스처 / 결과·비포애프터 / 가격·프로모션 / 트렌드·바이럴 / 브랜드무드 / 안전·저자극
- tone: 정보형 / 감성형 / 유머형 / 미니멀 / 감각·ASMR
- format 은 소스/DOM 에서 자동 판정(태깅 대상 아님).

## 대상 (config.sources)
- **Meta advertisers**: label·page_id·type(retailer/brand)·kbeauty·country. page_id 는 광고주의 **글로벌 페이지 id**(Ad Library URL 의 `view_all_page_id`). 목록의 SSOT 는 **마케터 관리 Google Sheet**(설정 시) — `sync-advertisers.js` 가 갱신 주기마다 시트를 읽어 config.advertisers 를 덮어쓴다. 시트 미연결이면 config 의 목록을 그대로 사용. 컬럼·셋업은 `docs/advertiser-sheet-guide.md`.
- **TikTok**: industry=14000000000(Beauty & Personal Care), regions=EU 20개국, period 30, order_by for_you.

## 주의 / 한계
- **Meta 는 country=ALL 로 수집한다.** 글로벌 광고주 페이지를 특정국(country=FR)으로 보면 광고 대신 "Similar regional ads"(지역 페이지 목록)가 떠 0건. 따라서 **Meta 광고엔 EU 국가별 분기가 없다**(countries 빈 배열). 국가 facet 은 TikTok(region) 에서 동작. 국가별 Meta 가 필요하면 브랜드별 지역 page_id("Sephora France" 등)를 따로 config 에 추가.
- TikTok 상위광고는 `brand_name` 이 "Not Mention"(익명)이면 advertiser='미상', type='unknown'. 경쟁사 모니터링이 아니라 인스피레이션 용도.
- read-only 수집(공개 투명성/인스피레이션 데이터). DOM/엔드포인트 변동 시 추출부 보정.
- 영상=커버썸네일 + video_url(만료 가능) 링크. 인라인 재생은 fresh 일 때, 만료 시 원본 링크 폴백.

## 참조
- 패턴: `competitor-ad-gallery`(F&B, Meta DOM 추출·Linear/Notion UI·인라인 영상)
- memory: `feedback_writing_style`, `feedback_piyonna_france_only_target`(EU 맥락), `project_piyonna_oy_barcode_recovery`(K뷰티 브랜드 맥락)
