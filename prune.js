#!/usr/bin/env node
'use strict';
/*
 * prune.js — 용량 목표 자동 정리. docs/assets 가 cap_mb 초과 시 target_mb 아래로 되돌린다.
 * 우선순위(가치 낮은 것부터): ① 비활성 광고의 영상(커버·메타·태그 보존) → ② 비활성 광고 통째(커버까지)
 * 활성(게재 중) 광고는 건드리지 않는다. 오래된 것(last_seen 오름차순)부터.
 * 1GB Pages 한계 아래 유지가 목적. seen 은 유지(삭제해도 재수집 폭주 방지).
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
const OUT_DIR = path.join(DIR, CFG.output_dir || 'docs');
const ASSETS = path.join(OUT_DIR, 'assets');
const GP = path.join(DIR, 'data', 'gallery.json');
const CAP = (CFG.prune && CFG.prune.cap_mb || 800) * 1048576;
const TARGET = (CFG.prune && CFG.prune.target_mb || 720) * 1048576;

function dirSize(d) {
  let total = 0;
  const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); if (e.isDirectory()) walk(f); else try { total += fs.statSync(f).size; } catch {} } };
  if (fs.existsSync(d)) walk(d);
  return total;
}
const rmFile = (rel) => { if (!rel) return 0; const f = path.join(OUT_DIR, rel); try { const s = fs.statSync(f).size; fs.unlinkSync(f); return s; } catch { return 0; } };
const ageKey = (a) => a.last_seen || a.first_seen || '';

(async () => {
  let size = dirSize(ASSETS);
  const startMB = Math.round(size / 1048576);
  if (size <= CAP) { console.log(JSON.stringify({ assets_mb: startMB, cap_mb: CAP / 1048576, action: 'none (캡 이하)' })); return; }

  const g = JSON.parse(fs.readFileSync(GP, 'utf8'));
  // 비활성 광고만, 오래된 것부터
  const inactive = Object.entries(g.ads).filter(([, a]) => !a.is_active).sort((x, y) => (ageKey(x[1]) < ageKey(y[1]) ? -1 : 1));

  let freedVideos = 0, removedAds = 0;
  // ① 비활성 광고 영상 삭제(커버 유지)
  for (const [, a] of inactive) {
    if (size <= TARGET) break;
    if (a.video_rel) { size -= rmFile(a.video_rel); a.video_rel = null; a.video_url = null; freedVideos++; }
  }
  // ② 그래도 초과면 비활성 광고 통째 삭제(커버 포함, gallery 에서 제거)
  if (size > TARGET) {
    for (const [key, a] of inactive) {
      if (size <= TARGET) break;
      size -= rmFile(a.media_rel);
      if (a.video_rel) size -= rmFile(a.video_rel);
      delete g.ads[key]; removedAds++;
    }
  }

  g.updated_at = new Date().toISOString();
  fs.writeFileSync(GP, JSON.stringify(g, null, 2));
  const endMB = Math.round(dirSize(ASSETS) / 1048576);
  const note = size > TARGET ? '주의: 비활성 소진 후에도 target 초과(활성 광고만 남음) — cap 상향 또는 TikTok 링크화 검토' : 'ok';
  console.log(JSON.stringify({ before_mb: startMB, after_mb: endMB, target_mb: TARGET / 1048576, freed_videos: freedVideos, removed_ads: removedAds, note }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
