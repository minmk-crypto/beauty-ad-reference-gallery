#!/usr/bin/env node
'use strict';
/*
 * backfill-video.js — 기존 gallery.json 광고의 영상을 로컬 파일로 저장(만료 방지).
 *   video_url 이 살아있는 것만 성공(Meta 며칠 유효). TikTok 은 수시간 만료라 대부분 실패 → 재수집 필요.
 *   성공 시 video_rel 부여. 이미 video_rel 있으면 건너뜀.
 */
const fs = require('fs');
const path = require('path');
const { saveVideo } = require('./lib-media');

const DIR = __dirname;
const OUT_DIR = path.join(DIR, require('./config.json').output_dir || 'docs');
const GP = path.join(DIR, 'data', 'gallery.json');
const g = JSON.parse(fs.readFileSync(GP, 'utf8'));

(async () => {
  let ok = 0, fail = 0, skip = 0;
  const ents = Object.entries(g.ads);
  for (const [key, a] of ents) {
    if (!a.video_url) { continue; }
    if (a.video_rel) { skip++; continue; }
    const ref = a.source === 'tiktok' ? 'https://ads.tiktok.com/' : 'https://www.facebook.com/';
    const level = a.source === 'tiktok' ? 'heavy' : 'raw';
    // mp4 경로는 커버(media_rel) 경로에서 파생. media_rel 없으면 소스별 기본 경로.
    const rel = a.media_rel ? a.media_rel.replace(/\.jpg$/i, '.mp4')
      : path.posix.join('assets', a.source, `${a.ad_id}.mp4`);
    const dest = path.join(OUT_DIR, rel);
    const r = await saveVideo(a.video_url, dest, { referer: ref, level });
    if (r) { a.video_rel = rel.split(path.sep).join('/'); ok++; process.stderr.write(`  ✓ ${key} (${Math.round(fs.statSync(dest).size/1024)}KB)\n`); }
    else { fail++; process.stderr.write(`  ✗ ${key} (만료/실패)\n`); }
  }
  g.updated_at = new Date().toISOString();
  fs.writeFileSync(GP, JSON.stringify(g, null, 2));
  process.stdout.write(JSON.stringify({ saved: ok, failed: fail, skipped: skip }, null, 2) + '\n');
})().catch(e => { console.error(e); process.exit(1); });
