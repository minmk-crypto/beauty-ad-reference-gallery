#!/usr/bin/env node
'use strict';
/*
 * collect-tiktok.js — TikTok Creative Center "Top Ads"(industry × EU region) 수집.
 * 페이지를 한 번 열어 세션 쿠키를 확보한 뒤, 같은 origin 에서 내부 JSON API
 *   /creative_radar_api/v1/top_ads/v2/list 를 region·page 별로 호출한다(로그인 불필요).
 * 출력: data/manifest-tiktok.json (신규 항목 + live_ids). 영상=커버썸네일만 다운로드.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
const TT = CFG.sources.tiktok;
const OUT_DIR = path.join(DIR, CFG.output_dir || 'docs');
const STATE = path.join(DIR, 'data', 'state.json');
const MANIFEST = path.join(DIR, 'data', 'manifest-tiktok.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };

async function download(url, dest) {
  if (!url) return false;
  try {
    const res = await fetch(url, { headers: { referer: 'https://ads.tiktok.com/', 'user-agent': UA } });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 512) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return true;
  } catch { return false; }
}

(async () => {
  const { chromium } = require('playwright');
  const state = readJSON(STATE, { seen: [], last_run: null });
  const seen = new Set(state.seen);

  const ctx = await chromium.launchPersistentContext(path.join(DIR, 'data', '.ttprofile'), {
    headless: CFG.headless !== false, locale: 'en-US', timezoneId: 'Europe/Paris',
    userAgent: UA, viewport: { width: 1366, height: 1000 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(CFG.nav_timeout_ms || 60000);

  const items = {}; // ad_id -> record (dedup across regions, union countries)
  let currentRegion = null;
  const ingest = (mats, region) => {
    for (const m of mats || []) {
      const id = String(m.id);
      if (items[id]) { if (!items[id].countries.includes(region)) items[id].countries.push(region); continue; }
      const vi = m.video_info || {};
      const vurl = vi.video_url ? (vi.video_url['720p'] || Object.values(vi.video_url)[0]) : null;
      items[id] = {
        source: 'tiktok', ad_id: id,
        advertiser: (m.brand_name && m.brand_name !== 'Not Mention') ? m.brand_name : '미상',
        advertiser_type: 'unknown', kbeauty: false,
        countries: [region], format: '영상', started: null, is_active: true, collation: 0,
        copy: m.ad_title || '', cta: null, landing_url: null,
        video_url: vurl || null,
        detail_url: `https://ads.tiktok.com/business/creativecenter/inspiration/detail/pc/en?id=${id}`,
        metrics: { ctr: m.ctr, like: m.like },
        _cover: vi.cover || null, _new: !seen.has(`tiktok:${id}`),
      };
    }
  };
  // 페이지가 스스로 호출하는 top_ads/v2/list 응답을 가로챈다 (수동 fetch 는 서명 누락으로 빈 응답)
  page.on('response', async (res) => {
    if (!/top_ads\/v2\/list/.test(res.url())) return;
    try { const j = await res.json(); ingest((j.data && j.data.materials) || [], currentRegion); } catch {}
  });

  for (const region of TT.regions) {
    currentRegion = region;
    const before = Object.keys(items).length;
    try {
      await page.goto(`https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?period=${TT.period}&industry=14&region=${region}`, { waitUntil: 'domcontentloaded' });
    } catch (e) { process.stderr.write(`  nav fail ${region}: ${e.message}\n`); continue; }
    await page.waitForTimeout(4000);
    // "View More" 버튼/스크롤로 추가 페이지 로드 → 인터셉터가 응답을 수집
    for (let i = 0; i < ((TT.max_pages_per_region || 2) - 1); i++) {
      try {
        const btn = page.getByRole('button', { name: /view more|see more|더 보기/i });
        if (await btn.count()) await btn.first().click({ timeout: 2500 });
        else await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      } catch { try { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); } catch {} }
      await page.waitForTimeout(TT.pause_ms || 2200);
    }
    process.stderr.write(`  ${region} → +${Object.keys(items).length - before} (cumulative ${Object.keys(items).length})\n`);
  }

  const { saveVideo } = require('./lib-media');
  const gallery = readJSON(path.join(DIR, 'data', 'gallery.json'), { ads: {} });
  const allItems = Object.values(items);
  const newItems = allItems.filter(x => x._new);
  let dl = 0, vdl = 0;
  const videoRels = {}; // 'tiktok:id' -> rel  (기존 광고 video_rel 패치용)
  for (const it of allItems) {
    const key = `tiktok:${it.ad_id}`;
    const existing = gallery.ads[key];
    // 커버: 신규만 다운로드
    if (it._new) {
      const rel = path.join('assets', 'tiktok', `${it.ad_id}.jpg`);
      const ok = await download(it._cover, path.join(OUT_DIR, rel));
      it.media_rel = ok ? rel.split(path.sep).join('/') : null;
      if (ok) dl++;
    }
    // 영상: TikTok URL 수시간 만료 → fresh 일 때 즉시 강압축 저장. 신규 또는 기존인데 로컬 영상 없으면 채움.
    const needVideo = it.video_url && (it._new || (existing && !existing.video_rel));
    if (needVideo) {
      const vrel = path.join('assets', 'tiktok', `${it.ad_id}.mp4`);
      const vok = await saveVideo(it.video_url, path.join(OUT_DIR, vrel), { referer: 'https://ads.tiktok.com/', level: 'heavy' });
      if (vok) { const rl = vrel.split(path.sep).join('/'); it.video_rel = rl; videoRels[key] = rl; vdl++; }
    }
  }
  await ctx.close();

  const manifestNew = newItems.map(({ _cover, _new, ...r }) => r);
  writeJSON(MANIFEST, {
    generated_at: new Date().toISOString(), source: 'tiktok',
    new: manifestNew,
    video_rels: videoRels,
    live_ids: Object.keys(items).map(id => `tiktok:${id}`),
  });
  process.stdout.write(JSON.stringify({ unique: Object.keys(items).length, new: newItems.length, downloaded: dl, videos: vdl }, null, 2) + '\n');
})().catch(e => { console.error(e); process.exit(1); });
