#!/usr/bin/env node
'use strict';
/*
 * collect-meta.js — Meta 광고 라이브러리: 지정 광고주 × EU 국가 수집.
 * 각 (page_id, country) 의 view_all_page_id 페이지를 렌더된 DOM에서 카드별로 추출(로그인 불필요).
 * 동일 library_id 가 여러 국가에서 나오면 countries union. 통합 스키마로 data/manifest-meta.json 작성.
 * dedup 키 = 'meta:'+library_id, state.json.seen 공유. 영상=커버썸네일만 다운로드.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
const M = CFG.sources.meta;
const OUT_DIR = path.join(DIR, CFG.output_dir || 'docs');
const STATE = path.join(DIR, 'data', 'state.json');
const MANIFEST = path.join(DIR, 'data', 'manifest-meta.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };

function adLibraryUrl(pageId, country) {
  const status = CFG.active_only ? 'active' : 'all';
  return `https://www.facebook.com/ads/library/?active_status=${status}&ad_type=${M.ad_type || 'all'}&country=${country}` +
    `&is_targeted_country=false&media_type=all&search_type=page` +
    `&sort_data%5Bdirection%5D=desc&sort_data%5Bmode%5D=total_impressions&view_all_page_id=${pageId}`;
}
const detailUrl = (id) => `https://www.facebook.com/ads/library/?id=${id}`;

/* in-page DOM extractor (앵커 '라이브러리 ID:'/'Library ID:' 기준) */
/* eslint-disable */
function PAGE_EXTRACT() {
  const CHROME_LINE = ['활성','비활성','게재 중','게재 중단','플랫폼','드롭다운 열기','광고 상세 정보 보기','요약 세부 정보 보기','여러 버전이 있는 광고입니다','광고','정보','이 광고에 대한 정보','광고주','신규회원쿠폰까지','신규회원 쿠폰까지','Active','Inactive','Platforms','Open Drop-down','See ad details','See summary details','This ad has multiple versions','Sponsored'];
  const CTA_WORDS = ['Shop Now','Order Now','Learn More','Sign Up','Send Message','Subscribe','Get Offer','Contact Us','Book Now','Download','Apply Now','Watch More','See Menu','Get Quote','Buy Now','Donate Now','Get Showtimes','지금 구매하기','더 알아보기','주문하기','문의하기','지금 신청','구독하기','메시지 보내기','자세히 보기'];
  const results = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const idNodes = []; let tn;
  while ((tn = walker.nextNode())) { if (/(라이브러리 ID|Library ID):\s*\d+/.test(tn.textContent)) idNodes.push(tn); }
  const seen = new Set();
  for (const idNode of idNodes) {
    const idm = idNode.textContent.match(/(?:라이브러리 ID|Library ID):\s*(\d+)/);
    if (!idm) continue; const libId = idm[1]; if (seen.has(libId)) continue; seen.add(libId);
    let el = idNode.parentElement;
    for (let i = 0; i < 14 && el && el.parentElement; i++) {
      const parent = el.parentElement;
      const idCount = (parent.innerText.match(/(?:라이브러리 ID|Library ID):/g) || []).length;
      if (idCount > 1) break; el = parent;
      const hasMedia = el.querySelector('video') || [...el.querySelectorAll('img')].some(im => (im.naturalWidth || 0) > 200);
      if (hasMedia) break;
    }
    const card = el; const fullText = card.innerText || '';
    let started = null;
    const dm = fullText.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
    if (dm) started = `${dm[1]}-${String(dm[2]).padStart(2,'0')}-${String(dm[3]).padStart(2,'0')}`;
    else {
      const em = fullText.match(/Started running on\s+([A-Z][a-z]{2})[a-z]*\s+(\d{1,2}),?\s*(\d{4})/);
      if (em) { const MO = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }[em[1]]; if (MO) started = `${em[3]}-${MO}-${String(em[2]).padStart(2,'0')}`; }
    }
    const active = /활성|게재 중|Active/.test(fullText) && !/비활성|게재 중단|Inactive/.test(fullText);
    let collation = 0;
    const cm = fullText.match(/광고\s*(\d+)개에서 이 크리에이티브|(\d+)\s*ads use this creative/);
    if (cm) collation = parseInt(cm[1] || cm[2], 10); else if (/여러 버전이 있는 광고입니다|This ad has multiple versions/.test(fullText)) collation = 2;
    const video = card.querySelector('video');
    const creativeImgs = [...card.querySelectorAll('img')].filter(im => (im.naturalWidth || 0) > 200).map(im => im.src).filter(s => s && !s.startsWith('data:'));
    let format, videoUrl = null, posterUrl = null, imageUrls = [];
    if (video) { format = '영상'; videoUrl = video.src || video.currentSrc || null; posterUrl = video.poster || creativeImgs[0] || null; }
    else if (creativeImgs.length > 1) { format = '카루셀'; imageUrls = creativeImgs; }
    else { format = '단일이미지'; imageUrls = creativeImgs; }
    const thumbUrl = posterUrl || imageUrls[0] || null;
    let landing = null;
    for (const a of card.querySelectorAll('a')) {
      const h = a.href || '';
      if (/l\.facebook\.com\/l\.php/.test(h)) { try { const u = new URL(h).searchParams.get('u'); if (u) { landing = decodeURIComponent(u); break; } } catch {} }
      if (!landing && /^https?:\/\//.test(h) && !/facebook\.com|fbcdn|fb\.me/.test(h)) landing = h;
    }
    let cta = null;
    const lines = fullText.split('\n').map(s => s.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) { if (CTA_WORDS.includes(lines[i])) { cta = lines[i]; break; } }
    const copyLines = lines.filter(l => {
      if (!l.replace(/[​-‍﻿\s]/g, '')) return false;
      if (CHROME_LINE.includes(l)) return false;
      if (/(라이브러리 ID|Library ID):/.test(l)) return false;
      if (/게재 시작함|Started running on/.test(l)) return false;
      if (CTA_WORDS.includes(l)) return false;
      if (/^\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}$/.test(l)) return false;
      if (/^[\d.,\s]+$/.test(l)) return false;
      return true;
    });
    results.push({ library_id: libId, started, active, format, collation, video_url: videoUrl, thumb_url: thumbUrl, landing_url: landing, cta, copy: copyLines.join('\n').trim() });
  }
  return results;
}
/* eslint-enable */

async function download(url, dest) {
  if (!url) return false;
  try {
    const res = await fetch(url, { headers: { referer: 'https://www.facebook.com/', 'user-agent': UA } });
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
  const advertisers = (M.advertisers || []).filter(a => a.page_id && a.page_id !== 'TBD');
  if (!advertisers.length) { console.error('config.sources.meta.advertisers 에 유효한 page_id 가 없습니다 (TBD)'); process.exit(1); }

  const ctx = await chromium.launchPersistentContext(path.join(DIR, 'data', '.pwprofile'), {
    headless: CFG.headless !== false, locale: 'en-US', timezoneId: 'Europe/Paris',
    userAgent: UA, viewport: { width: 1366, height: 1000 }, args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(CFG.nav_timeout_ms || 60000);

  const items = {}; // 'meta:'+id -> record
  // 글로벌 광고주 페이지는 country=ALL 로 수집(특정국 필터 시 "Similar regional ads" 디스앰비그로 광고 0).
  for (const adv of advertisers) {
    let advTotal = 0;
    for (const country of ['ALL']) {
      if (advTotal >= (M.max_ads_per_advertiser || 200)) break;
      try { await page.goto(adLibraryUrl(adv.page_id, country), { waitUntil: 'domcontentloaded' }); }
      catch (e) { process.stderr.write(`  nav ${adv.label}/${country} fail: ${e.message}\n`); continue; }
      await page.waitForTimeout(2500);
      for (const lab of ['모든 쿠키 허용', 'Allow all cookies', 'Autoriser tous les cookies', 'Tout autoriser']) {
        try { const b = page.getByRole('button', { name: lab }); if (await b.count()) { await b.first().click({ timeout: 1500 }); break; } } catch {}
      }
      try { await page.getByText(/(라이브러리 ID|Library ID):/).first().waitFor({ timeout: 15000 }); } catch {}
      const idle = M.scroll_idle_rounds || 3; let stable = 0, last = -1;
      const countCards = async () => page.evaluate(() => (document.body.innerText.match(/(?:라이브러리 ID|Library ID):/g) || []).length);
      while (stable < idle) {
        const c = await countCards();
        if (c >= (M.max_ads_per_advertiser || 200)) break;
        if (c === last) stable++; else { stable = 0; last = c; }
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(M.scroll_pause_ms || 1500);
      }
      const ads = await page.evaluate(PAGE_EXTRACT);
      for (const ad of ads) {
        const key = `meta:${ad.library_id}`;
        // 동일 광고가 다른 지역 페이지에도 있으면 country union (같은 브랜드로 묶임)
        if (items[key]) { if (adv.country && !items[key].countries.includes(adv.country)) items[key].countries.push(adv.country); continue; }
        const copy = (ad.copy || '').split('\n').filter(l => l.trim() !== adv.label && l.trim() !== '광고' && l.trim() !== 'Sponsored').join('\n').trim();
        items[key] = {
          source: 'meta', ad_id: ad.library_id,
          advertiser: adv.label, advertiser_type: adv.type || 'brand', kbeauty: !!adv.kbeauty,
          countries: adv.country ? [adv.country] : [], format: ad.format, started: ad.started, is_active: !!ad.active, collation: ad.collation,
          copy, cta: ad.cta, landing_url: ad.landing_url, video_url: ad.video_url,
          detail_url: detailUrl(ad.library_id),
          _thumb: ad.thumb_url, _page_id: adv.page_id, _new: !seen.has(key),
        };
        advTotal++;
      }
      process.stderr.write(`  ${adv.label}/${country}: ${ads.length} ads (adv unique ${advTotal})\n`);
    }
  }

  const { saveVideo } = require('./lib-media');
  const newItems = Object.values(items).filter(x => x._new);
  let dl = 0, vdl = 0;
  for (const it of newItems) {
    const rel = path.join('assets', 'meta', String(it._page_id), `${it.ad_id}.jpg`);
    const ok = await download(it._thumb, path.join(OUT_DIR, rel));
    it.media_rel = ok ? rel.split(path.sep).join('/') : null;
    if (ok) dl++;
    // 영상=만료 방지 위해 파일 저장(Meta 는 작아서 raw). video_rel 우선, 실패 시 원격 video_url 폴백.
    if (it.video_url) {
      const vrel = path.join('assets', 'meta', String(it._page_id), `${it.ad_id}.mp4`);
      const vok = await saveVideo(it.video_url, path.join(OUT_DIR, vrel), { referer: 'https://www.facebook.com/', level: 'raw' });
      it.video_rel = vok ? vrel.split(path.sep).join('/') : null;
      if (vok) vdl++;
    }
  }
  await ctx.close();

  writeJSON(MANIFEST, {
    generated_at: new Date().toISOString(), source: 'meta',
    new: newItems.map(({ _thumb, _page_id, _new, ...r }) => r),
    live_ids: Object.keys(items),
  });
  process.stdout.write(JSON.stringify({ advertisers: advertisers.length, countries: M.countries.length, unique: Object.keys(items).length, new: newItems.length, downloaded: dl, videos: vdl }, null, 2) + '\n');
})().catch(e => { console.error(e); process.exit(1); });
