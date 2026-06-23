#!/usr/bin/env node
'use strict';
/*
 * commit.js — 두 소스 manifest(manifest-meta/manifest-tiktok) + data/tags.json 을
 * data/gallery.json 으로 머지한다. ads 키 = '<source>:<ad_id>'.
 * - 신규 항목에 비전 태그(tags['<source>:<ad_id>']) 부착, first_seen/last_seen 기록.
 * - 소스별 live_ids 로 is_active 재조정(없어진 광고는 비활성 마킹, 삭제 X).
 * - state.json.seen 갱신.
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const D = path.join(DIR, 'data');
const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };

const manifests = [
  readJSON(path.join(D, 'manifest-meta.json'), null),
  readJSON(path.join(D, 'manifest-tiktok.json'), null),
].filter(Boolean);
if (!manifests.length) { console.error('manifest-meta.json / manifest-tiktok.json 둘 다 없습니다 — collect 먼저 실행'); process.exit(1); }

const tags = readJSON(path.join(D, 'tags.json'), {});
const gallery = readJSON(path.join(D, 'gallery.json'), { ads: {}, updated_at: null });
const state = readJSON(path.join(D, 'state.json'), { seen: [], last_run: null });
const seen = new Set(state.seen);
const ts = new Date().toISOString();

// config 의 page_id → {label, country, type, kbeauty} 매핑(Meta 광고주 정규화용).
// 지역 페이지를 베이스 브랜드로 묶고 국가를 부여한다. stale manifest 등으로 라벨이 어긋나도 매 commit 시 교정.
const CFG = readJSON(path.join(DIR, 'config.json'), { sources: { meta: { advertisers: [] } } });
const PMAP = {};
for (const a of (CFG.sources.meta.advertisers || [])) PMAP[a.page_id] = { label: a.label, country: a.country || '', type: a.type || 'brand', kbeauty: !!a.kbeauty };
const pageIdOf = (a) => { const m = /assets\/meta\/(\d+)\//.exec(a.media_rel || a.video_rel || ''); return m ? m[1] : null; };

let added = 0;
for (const man of manifests) {
  const src = man.source;
  const live = new Set(man.live_ids || []);
  // 같은 소스의 기존 광고 is_active 재조정
  for (const [key, ad] of Object.entries(gallery.ads)) {
    if (ad.source !== src) continue;
    if (live.has(key)) { ad.is_active = true; ad.last_seen = ts; }
    else if (ad.is_active) ad.is_active = false;
  }
  // 기존 광고 video_rel 패치(fresh URL 로 만료 영상 채움)
  if (man.video_rels) for (const [key, rel] of Object.entries(man.video_rels)) { if (gallery.ads[key] && !gallery.ads[key].video_rel) gallery.ads[key].video_rel = rel; }
  // 신규 추가
  for (const rec of (man.new || [])) {
    const key = `${rec.source}:${rec.ad_id}`;
    const t = tags[key] || {};
    gallery.ads[key] = {
      ...rec,
      tags: { hook_type: t.hook_type || null, appeal: t.appeal || null, tone: t.tone || null, summary: t.summary || null },
      first_seen: ts, last_seen: ts,
    };
    seen.add(key);
    added++;
  }
}
// Meta 광고주 정규화: page_id 로 config 의 베이스 라벨·국가·유형을 다시 입혀 라벨 drift 차단
let normalized = 0;
for (const a of Object.values(gallery.ads)) {
  if (a.source !== 'meta') continue;
  const pid = pageIdOf(a); const c = pid && PMAP[pid];
  if (!c) continue;
  const ctries = c.country ? [c.country] : (a.countries || []);
  if (a.advertiser !== c.label || a.advertiser_type !== c.type || a.kbeauty !== c.kbeauty || JSON.stringify(a.countries || []) !== JSON.stringify(ctries)) {
    a.advertiser = c.label; a.advertiser_type = c.type; a.kbeauty = c.kbeauty; a.countries = ctries; normalized++;
  }
}

// tags.json → gallery 동기화: 무태그 광고에 태그가 생겼으면 반영(자가 치유)
let synced = 0;
for (const [key, a] of Object.entries(gallery.ads)) {
  if ((a.tags && a.tags.summary) || !tags[key] || !tags[key].summary) continue;
  const t = tags[key];
  a.tags = { hook_type: t.hook_type || null, appeal: t.appeal || null, tone: t.tone || null, summary: t.summary };
  synced++;
}
gallery.updated_at = ts;
writeJSON(path.join(D, 'gallery.json'), gallery);
state.seen = [...seen]; state.last_run = ts;
writeJSON(path.join(D, 'state.json'), state);
console.log(JSON.stringify({ committed: added, normalized, tags_synced: synced, total_in_gallery: Object.keys(gallery.ads).length }, null, 2));
