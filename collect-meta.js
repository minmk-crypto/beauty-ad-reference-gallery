#!/usr/bin/env node
'use strict';
/*
 * competitor-ad-gallery / collect.js
 * Meta Ad Library 경쟁사 광고 크리에이티브 수집기 (read-only).
 *
 * 수집 방식: 로그인 없이 Ad Library 페이지(view_all_page_id)를 헤드리스 크롬으로 열어
 *   렌더된 DOM에서 "라이브러리 ID:" 앵커 기준으로 카드별 필드를 추출한다.
 *   (GraphQL 인터셉트 대신 DOM — 2026-06-20 recon으로 신뢰성 확정.)
 *
 * 모드:
 *   node collect.js            신규 광고 수집 + 미디어 다운로드 → data/manifest.json
 *   node collect.js --commit   manifest + data/tags.json 을 gallery.json 으로 머지, state 갱신, is_active 재조정
 *
 * 영상: 커버 포스터(썸네일)만 다운로드, 본편은 Ad Library 링크로 연결.
 */

const fs = require('fs');
const path = require('path');

const SKILL_DIR = __dirname;
const DATA_DIR = path.join(SKILL_DIR, 'data');
const CFG = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'config.json'), 'utf8'));
const OUT_DIR = path.join(SKILL_DIR, CFG.output_dir || 'docs');
const ASSETS_DIR = path.join(OUT_DIR, 'assets');

const STATE_PATH = path.join(DATA_DIR, 'state.json');
const GALLERY_PATH = path.join(DATA_DIR, 'gallery.json');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const TAGS_PATH = path.join(DATA_DIR, 'tags.json');

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function nowISO() { return new Date().toISOString(); }

function adLibraryUrl(pageId) {
  const status = CFG.active_only ? 'active' : 'all';
  return `https://www.facebook.com/ads/library/?active_status=${status}&ad_type=all&country=${CFG.country}` +
    `&is_targeted_country=false&media_type=all&search_type=page` +
    `&sort_data%5Bdirection%5D=desc&sort_data%5Bmode%5D=total_impressions&view_all_page_id=${pageId}`;
}
function detailUrl(libId) {
  return `https://www.facebook.com/ads/library/?id=${libId}`;
}

// ---- in-page extractor (runs in browser context) -------------------------
/* eslint-disable */
function PAGE_EXTRACT() {
  const CHROME_LINE = [
    '활성', '비활성', '게재 중', '게재 중단', '플랫폼', '드롭다운 열기',
    '광고 상세 정보 보기', '요약 세부 정보 보기', '여러 버전이 있는 광고입니다',
    '광고', '정보', '이 광고에 대한 정보', '광고주', '신규회원쿠폰까지', '신규회원 쿠폰까지',
  ];
  const CTA_WORDS = [
    'Shop Now', 'Order Now', 'Learn More', 'Sign Up', 'Send Message', 'Subscribe',
    'Get Offer', 'Contact Us', 'Book Now', 'Download', 'Apply Now', 'Watch More',
    'See Menu', 'Get Quote', 'Buy Now', 'Donate Now', 'Get Showtimes',
    '지금 구매하기', '더 알아보기', '주문하기', '문의하기', '지금 신청', '구독하기', '메시지 보내기',
  ];
  const results = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const idNodes = [];
  let tn;
  while ((tn = walker.nextNode())) {
    if (/라이브러리 ID:\s*\d+/.test(tn.textContent)) idNodes.push(tn);
  }
  const seen = new Set();
  for (const idNode of idNodes) {
    const idm = idNode.textContent.match(/라이브러리 ID:\s*(\d+)/);
    if (!idm) continue;
    const libId = idm[1];
    if (seen.has(libId)) continue;
    seen.add(libId);

    // climb to a single-card root that contains the creative media
    let el = idNode.parentElement;
    for (let i = 0; i < 14 && el && el.parentElement; i++) {
      const parent = el.parentElement;
      const idCount = (parent.innerText.match(/라이브러리 ID:/g) || []).length;
      if (idCount > 1) break; // parent would merge a sibling card
      el = parent;
      const hasMedia = el.querySelector('video') ||
        [...el.querySelectorAll('img')].some(im => (im.naturalWidth || 0) > 200);
      if (hasMedia) break;
    }
    const card = el;
    const fullText = card.innerText || '';

    // start date  "2026. 4. 30.에 게재 시작함"
    let started = null;
    const dm = fullText.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
    if (dm) started = `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`;

    const active = /활성|게재 중/.test(fullText) && !/비활성|게재 중단/.test(fullText);

    // collation (multiple versions)
    let collation = 0;
    const cm = fullText.match(/광고\s*(\d+)개에서 이 크리에이티브/);
    if (cm) collation = parseInt(cm[1], 10);
    else if (/여러 버전이 있는 광고입니다/.test(fullText)) collation = 2;

    // media
    const video = card.querySelector('video');
    const creativeImgs = [...card.querySelectorAll('img')]
      .filter(im => (im.naturalWidth || 0) > 200)
      .map(im => im.src)
      .filter(s => s && !s.startsWith('data:'));
    let format, videoUrl = null, posterUrl = null, imageUrls = [];
    if (video) {
      format = '영상';
      videoUrl = video.src || video.currentSrc || null;
      posterUrl = video.poster || creativeImgs[0] || null;
    } else if (creativeImgs.length > 1) {
      format = '카루셀';
      imageUrls = creativeImgs;
    } else {
      format = '단일이미지';
      imageUrls = creativeImgs;
    }
    const thumbUrl = posterUrl || imageUrls[0] || null;

    // landing url (decode l.facebook.com redirect)
    let landing = null;
    for (const a of card.querySelectorAll('a')) {
      const h = a.href || '';
      if (/l\.facebook\.com\/l\.php/.test(h)) {
        try {
          const u = new URL(h).searchParams.get('u');
          if (u) { landing = decodeURIComponent(u); break; }
        } catch {}
      }
      if (!landing && /^https?:\/\//.test(h) && !/facebook\.com|fbcdn|fb\.me/.test(h)) landing = h;
    }

    // CTA
    let cta = null;
    const lines = fullText.split('\n').map(s => s.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
      if (CTA_WORDS.includes(lines[i])) { cta = lines[i]; break; }
    }

    // copy = body lines minus chrome / time / cta / brand label / pure-number lines
    const brandGuess = lines.find(l => /광고$/.test('') ) || null; // placeholder (brand set outside)
    const copyLines = lines.filter(l => {
      if (!l.replace(/[​-‍﻿\s]/g, '')) return false; // zero-width / blank only
      if (CHROME_LINE.includes(l)) return false;
      if (/라이브러리 ID:/.test(l)) return false;
      if (/게재 시작함/.test(l)) return false;
      if (CTA_WORDS.includes(l)) return false;
      if (/^\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}$/.test(l)) return false; // 0:00 / 0:30
      if (/^[\d.,\s]+$/.test(l)) return false;
      return true;
    });
    const copy = copyLines.join('\n').trim();

    results.push({
      library_id: libId, started, active, format, collation,
      video_url: videoUrl, thumb_url: thumbUrl, image_urls: imageUrls,
      landing_url: landing, cta, copy, copy_raw: fullText.trim().slice(0, 4000),
    });
  }
  return results;
}
/* eslint-enable */

// ---- media download -------------------------------------------------------
async function download(url, dest) {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      headers: {
        'referer': 'https://www.facebook.com/',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 512) return false; // likely an error pixel
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return true;
  } catch { return false; }
}

// ---- collect --------------------------------------------------------------
async function collect() {
  const { chromium } = require('playwright');
  const state = readJSON(STATE_PATH, { seen_library_ids: [], last_run: null });
  const seen = new Set(state.seen_library_ids);

  const ctx = await chromium.launchPersistentContext(path.join(DATA_DIR, '.pwprofile'), {
    headless: CFG.headless !== false,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1366, height: 1000 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(CFG.nav_timeout_ms);

  const manifest = { generated_at: nowISO(), brands: [], new_count: 0 };

  for (const brand of CFG.brands) {
    process.stderr.write(`\n[collect] ${brand.label} (${brand.page_id})\n`);
    try {
      await page.goto(adLibraryUrl(brand.page_id), { waitUntil: 'domcontentloaded' });
    } catch (e) {
      process.stderr.write(`  nav error: ${e.message}\n`);
      manifest.brands.push({ label: brand.label, page_id: brand.page_id, error: e.message, live_ids: [], new_ads: [] });
      continue;
    }
    // dismiss cookie/consent banners best-effort
    await page.waitForTimeout(2500);
    for (const label of ['모든 쿠키 허용', '필수 쿠키만 허용', 'Allow all cookies', 'Only allow essential cookies']) {
      try { const b = page.getByRole('button', { name: label }); if (await b.count()) { await b.first().click({ timeout: 1500 }); break; } } catch {}
    }
    try { await page.getByText(/라이브러리 ID:/).first().waitFor({ timeout: 20000 }); } catch {}

    // scroll until card count stabilises
    const idle = CFG.scroll_idle_rounds || 3;
    let stable = 0, last = -1;
    const countCards = async () => page.evaluate(() => (document.body.innerText.match(/라이브러리 ID:/g) || []).length);
    while (stable < idle) {
      const c = await countCards();
      if (c >= (CFG.max_ads_per_brand || 300)) break;
      if (c === last) stable++; else { stable = 0; last = c; }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(CFG.scroll_pause_ms || 1500);
    }

    const ads = await page.evaluate(PAGE_EXTRACT);
    const liveIds = ads.map(a => a.library_id);
    process.stderr.write(`  live ads: ${ads.length}\n`);

    const newAds = [];
    const refresh = []; // 이미 본 광고 중 아직 live → video_url 갱신 (fbcdn 서명 URL 만료 대비)
    for (const ad of ads) {
      if (seen.has(ad.library_id)) {
        if (ad.video_url) refresh.push({ library_id: ad.library_id, video_url: ad.video_url });
        continue;
      }
      const rel = path.join('assets', String(brand.page_id), `${ad.library_id}.jpg`);
      const abs = path.join(OUT_DIR, rel);
      const ok = await download(ad.thumb_url, abs);
      const copy = (ad.copy || '').split('\n')
        .filter(l => l.trim() !== brand.label && l.trim() !== '광고' && l.trim() !== 'Sponsored')
        .join('\n').trim();
      newAds.push({
        ...ad,
        copy,
        brand_label: brand.label,
        page_id: brand.page_id,
        detail_url: detailUrl(ad.library_id),
        media_rel: ok ? rel.split(path.sep).join('/') : null,
        media_abs: ok ? abs : null,
      });
    }
    process.stderr.write(`  new ads: ${newAds.length}\n`);
    manifest.brands.push({ label: brand.label, page_id: brand.page_id, live_ids: liveIds, new_ads: newAds, refresh });
    manifest.new_count += newAds.length;
  }

  await ctx.close();
  writeJSON(MANIFEST_PATH, manifest);
  process.stdout.write(JSON.stringify({ new_count: manifest.new_count, brands: manifest.brands.map(b => ({ label: b.label, live: b.live_ids.length, new: b.new_ads.length, error: b.error || null })) }, null, 2) + '\n');
}

// ---- commit ---------------------------------------------------------------
function commit() {
  const manifest = readJSON(MANIFEST_PATH, null);
  if (!manifest) { console.error('no manifest.json — run collect first'); process.exit(1); }
  const tags = readJSON(TAGS_PATH, {});
  const gallery = readJSON(GALLERY_PATH, { ads: {}, updated_at: null });
  const state = readJSON(STATE_PATH, { seen_library_ids: [], last_run: null });
  const seen = new Set(state.seen_library_ids);
  const ts = nowISO();

  let added = 0;
  for (const b of manifest.brands) {
    const live = new Set(b.live_ids);
    // reconcile is_active for this brand's existing ads
    for (const [lid, ad] of Object.entries(gallery.ads)) {
      if (ad.page_id !== b.page_id) continue;
      if (live.has(lid)) { ad.is_active = true; ad.last_seen = ts; }
      else if (ad.is_active) { ad.is_active = false; }
    }
    // refresh video_url for still-live existing ads (fbcdn 서명 URL 만료 대비)
    for (const r of (b.refresh || [])) {
      const ad = gallery.ads[r.library_id];
      if (ad && r.video_url) ad.video_url = r.video_url;
    }
    // add new ads
    for (const ad of b.new_ads) {
      const t = tags[ad.library_id] || {};
      gallery.ads[ad.library_id] = {
        library_id: ad.library_id,
        brand_label: ad.brand_label,
        page_id: ad.page_id,
        format: ad.format,
        started: ad.started,
        is_active: true,
        collation: ad.collation,
        copy: ad.copy,
        cta: ad.cta,
        landing_url: ad.landing_url,
        video_url: ad.video_url,
        detail_url: ad.detail_url,
        media_rel: ad.media_rel,
        tags: {
          hook_type: t.hook_type || null,
          appeal: t.appeal || null,
          tone: t.tone || null,
          summary: t.summary || null,
        },
        first_seen: ts,
        last_seen: ts,
      };
      seen.add(ad.library_id);
      added++;
    }
  }
  gallery.updated_at = ts;
  writeJSON(GALLERY_PATH, gallery);
  state.seen_library_ids = [...seen];
  state.last_run = ts;
  writeJSON(STATE_PATH, state);
  console.log(JSON.stringify({ committed: added, total_in_gallery: Object.keys(gallery.ads).length }, null, 2));
}

const mode = process.argv[2];
if (mode === '--commit') commit();
else collect().catch(e => { console.error(e); process.exit(1); });
