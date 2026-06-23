#!/usr/bin/env node
'use strict';
/*
 * beauty-ad-gallery / render.js
 * data/gallery.json → docs/index.html (자체완결, 인라인 CSS/JS). 미디어는 docs/assets/<source>/... 상대참조.
 * 멀티소스(Meta·TikTok) + 플랫폼/광고주/유형/국가/K뷰티 facet + 뷰티 칩 + 인라인 영상 + 우측 peek + 라이트/다크.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
const OUT_DIR = path.join(DIR, CFG.output_dir || 'docs');
const OUT_HTML = path.join(OUT_DIR, 'index.html');
const gallery = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'gallery.json'), 'utf8'));
const ads = Object.values(gallery.ads || {});
const enums = CFG.tag_enums;

function fmtSeoul(iso) {
  if (!iso) return '—';
  try { return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); } catch { return iso; }
}
function jpegSize(rel) {
  if (!rel) return null;
  try {
    const b = fs.readFileSync(path.join(OUT_DIR, rel));
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    let o = 2;
    while (o < b.length - 8) { if (b[o] !== 0xFF) { o++; continue; } const m = b[o + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) }; o += 2 + b.readUInt16BE(o + 2); }
  } catch {}
  return null;
}

// advertiser color palette (stable by sorted advertiser name)
const PALETTE = ['#5e6ad2', '#2f9e8f', '#c2853a', '#c05b86', '#3a8dde', '#9a6ad2', '#4a9e5c', '#d2693a', '#2f9ec2', '#c24a8a', '#8a9e3a', '#c2503a', '#6a5acd', '#3aa07a', '#a05ec2', '#c2a23a', '#5a8fc2', '#b5654a'];
const advNames = [...new Set(ads.map(a => a.advertiser))].sort((a, b) => a.localeCompare(b));
const advColor = {}; advNames.forEach((n, i) => { advColor[n] = PALETTE[i % PALETTE.length]; });

const countriesAll = [...new Set(ads.flatMap(a => a.countries || []))].sort();
const totalActive = ads.filter(a => a.is_active).length;
const bySrc = { meta: ads.filter(a => a.source === 'meta').length, tiktok: ads.filter(a => a.source === 'tiktok').length };
const byType = { retailer: ads.filter(a => a.advertiser_type === 'retailer').length, brand: ads.filter(a => a.advertiser_type === 'brand').length, unknown: ads.filter(a => a.advertiser_type === 'unknown').length };
function dist(key) { const m = {}; for (const a of ads) { const v = (a.tags && a.tags[key]) || null; if (v) m[v] = (m[v] || 0) + 1; } return Object.entries(m).sort((x, y) => y[1] - x[1]); }
const hookDist = dist('hook_type');

const DATA = JSON.stringify(ads.map(a => {
  const s = jpegSize(a.media_rel);
  return {
    id: `${a.source}:${a.ad_id}`, src: a.source, adv: a.advertiser, type: a.advertiser_type || 'brand', kb: !!a.kbeauty,
    ctries: a.countries || [], fmt: a.format || '', started: a.started || '', active: !!a.is_active, collation: a.collation || 0,
    copy: a.copy || '', cta: a.cta || '', landing: a.landing_url || '', detail: a.detail_url || '', video: a.video_rel || a.video_url || '', vlocal: !!a.video_rel, media: a.media_rel || '',
    ar: s ? `${s.w} / ${s.h}` : '',
    ctr: a.metrics ? a.metrics.ctr : null, like: a.metrics ? a.metrics.like : null,
    hook: (a.tags && a.tags.hook_type) || '', appeal: (a.tags && a.tags.appeal) || '', tone: (a.tags && a.tags.tone) || '', summary: (a.tags && a.tags.summary) || '',
    bc: advColor[a.advertiser] || PALETTE[0],
  };
}));

const opt = arr => arr.map(v => `<option value="${v}">${v}</option>`).join('');
const advOptions = advNames.map(n => `<option value="${n}">${n}</option>`).join('');
const ctryOptions = countriesAll.map(c => `<option value="${c}">${c}</option>`).join('');
const miniBar = (data, total) => data.map(([k, v]) => `<div class="mb-row"><span class="mb-k">${k}</span><span class="mb-track"><span class="mb-fill" style="width:${Math.round(v / (total || 1) * 100)}%"></span></span><span class="mb-v">${v}</span></div>`).join('');

const html = `<!doctype html>
<html lang="ko" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beauty Ad References</title>
<script>try{var t=localStorage.getItem('bag-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<style>
:root[data-theme="light"]{--ground:#fbfbfc;--panel:#fff;--panel-2:#f6f6f8;--inset:#f3f3f5;--text:#1c1d22;--muted:#6b6f76;--faint:#9a9ea6;--line:#ececef;--line-2:#e2e2e6;--line-strong:#d6d7db;--accent:#c05b86;--accent-soft:#fbecf2;--dot-hook:#5e6ad2;--dot-appeal:#2f9e8f;--dot-tone:#c2853a;--fmt:#3f3f46;--fmt-bg:#eeeef0;--shadow:0 1px 2px rgba(20,21,26,.04);--shadow-lift:0 6px 24px -10px rgba(20,21,26,.22);--scrim:rgba(28,29,34,.42)}
:root[data-theme="dark"]{--ground:#0d0e11;--panel:#161719;--panel-2:#1c1d20;--inset:#202125;--text:#e8e9ec;--muted:#9a9ea7;--faint:#6c7078;--line:#26272b;--line-2:#2d2e33;--line-strong:#3a3b41;--accent:#d97aa0;--accent-soft:#2a2025;--dot-hook:#828af0;--dot-appeal:#41b8a6;--dot-tone:#d59a52;--fmt:#c7c9cf;--fmt-bg:#26272b;--shadow:0 1px 2px rgba(0,0,0,.4);--shadow-lift:0 10px 30px -12px rgba(0,0,0,.6);--scrim:rgba(0,0,0,.6)}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--ground);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Apple SD Gothic Neo",sans-serif;font-size:13.5px;line-height:1.55;-webkit-font-smoothing:antialiased}
:root{--mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
a{color:inherit;text-decoration:none}button{font-family:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
header{position:relative;padding:30px 26px 18px;background:linear-gradient(180deg,#fff,#fbfbfc);border-bottom:1px solid var(--line)}
#theme{position:absolute;top:20px;right:26px}
:root[data-theme="dark"] header{background:linear-gradient(180deg,#161719,#0d0e11)}
.eyebrow{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
h1{margin:6px 0 4px;font-size:23px;letter-spacing:-.02em;font-weight:700}
.sub{color:var(--muted);font-size:12.5px;max-width:760px}
.stats{margin-top:12px;font-size:12.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.stats b{color:var(--text);font-weight:650}
.stats .dot{color:var(--faint);opacity:.6}
.mb-row{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);margin-top:5px}.mb-row:first-of-type{margin-top:8px}
.mb-k{width:82px;flex:none;text-align:right;color:var(--text)}.mb-track{flex:1;height:6px;background:var(--inset);border-radius:99px;overflow:hidden}.mb-fill{display:block;height:100%;background:var(--accent);border-radius:99px}.mb-v{width:26px;flex:none;text-align:right;font-variant-numeric:tabular-nums}
.bar{position:sticky;top:0;z-index:20;display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:11px 26px;background:color-mix(in srgb,var(--ground) 86%,transparent);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
.seg{display:flex;background:var(--inset);border:1px solid var(--line-2);border-radius:9px;padding:2px}
.seg button{border:none;background:none;cursor:pointer;color:var(--muted);font-size:12.5px;font-weight:500;padding:5px 13px;border-radius:7px;transition:all .14s;white-space:nowrap}
.seg button:hover{color:var(--text)}.seg button.on{background:var(--panel);color:var(--text);box-shadow:var(--shadow);font-weight:600}
.sel{position:relative}.sel select{appearance:none;font:inherit;font-size:12.5px;color:var(--text);background:var(--panel);border:1px solid var(--line-2);border-radius:8px;padding:6px 26px 6px 11px;cursor:pointer}
.sel select:hover{border-color:var(--line-strong)}.sel::after{content:"";position:absolute;right:10px;top:50%;width:7px;height:7px;border-right:1.6px solid var(--faint);border-bottom:1.6px solid var(--faint);transform:translateY(-65%) rotate(45deg);pointer-events:none}
.search{position:relative;display:flex;align-items:center}.search svg{position:absolute;left:9px;width:14px;height:14px;color:var(--faint);pointer-events:none}
.search input{font:inherit;font-size:12.5px;color:var(--text);background:var(--panel);border:1px solid var(--line-2);border-radius:8px;padding:6px 11px 6px 29px;min-width:150px}.search input:hover{border-color:var(--line-strong)}.search input:focus{outline:none;border-color:var(--accent)}
.cmd-count{margin-left:auto;color:var(--muted);font-size:12px;white-space:nowrap}.cmd-count b{color:var(--text);font-weight:600}
.iconbtn{width:30px;height:30px;border:1px solid var(--line-2);background:var(--panel);border-radius:8px;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center}.iconbtn:hover{border-color:var(--line-strong);color:var(--text)}
main{padding:20px 26px 90px}
.grid{column-gap:16px;column-width:262px}
.card{break-inside:avoid;width:100%;margin:0 0 16px;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color .14s,box-shadow .14s;box-shadow:var(--shadow)}
.card:hover{border-color:var(--line-strong);box-shadow:var(--shadow-lift)}
.cover{position:relative;background:var(--inset);overflow:hidden}
.cover img{width:100%;height:auto;display:block}
.cover .ph{aspect-ratio:4/5;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:12px}
.srcbadge{position:absolute;top:8px;left:8px;z-index:2;font-size:10px;font-weight:700;letter-spacing:.02em;padding:2px 7px;border-radius:6px;color:#fff}
.srcbadge.meta{background:rgba(24,119,242,.92)}.srcbadge.tiktok{background:rgba(15,16,20,.82)}
.play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2}
.play .pbtn{pointer-events:auto;cursor:pointer;width:50px;height:50px;border-radius:50%;background:rgba(15,16,20,.4);backdrop-filter:blur(3px);border:1.5px solid rgba(255,255,255,.92);color:#fff;display:flex;align-items:center;justify-content:center;transition:transform .14s,background .14s}
.play .pbtn:hover{transform:scale(1.09);background:rgba(15,16,20,.64)}.play .pbtn svg{width:19px;height:19px;display:block;margin-left:1px}
.cover video.cvideo{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:3}
.vclose{position:absolute;top:8px;right:8px;z-index:4;width:26px;height:26px;border-radius:50%;background:rgba(15,16,20,.66);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}.vclose svg{width:14px;height:14px}
.vfail{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:4;background:rgba(15,16,20,.82);color:#fff;font-size:11.5px;padding:5px 11px;border-radius:8px;text-decoration:none}
.ver{position:absolute;top:8px;right:8px;background:rgba(15,16,20,.66);color:#fff;font-size:10.5px;line-height:1.5;padding:2px 7px;border-radius:6px;font-family:var(--mono)}
.card.off .cover img{filter:grayscale(.55) opacity(.78)}
.cbody{padding:11px 13px 12px;display:flex;flex-direction:column;gap:8px}
.tagrow{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.advtag{align-self:flex-start;font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;line-height:1.45}
.kbtag{font-size:10px;font-weight:700;color:#b23083;background:#fbecf2;padding:2px 6px;border-radius:5px}
:root[data-theme="dark"] .kbtag{color:#e887b5;background:#2a2025}
.title{font-size:13.5px;font-weight:600;letter-spacing:-.01em;line-height:1.4}
.excerpt{font-size:12px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.pills{display:flex;gap:5px;flex-wrap:wrap}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);background:var(--inset);border-radius:6px;padding:2px 8px;white-space:nowrap}
.pill .d{width:6px;height:6px;border-radius:50%;flex:none}.d.h{background:var(--dot-hook)}.d.a{background:var(--dot-appeal)}.d.t{background:var(--dot-tone)}.pill.fmt{color:var(--faint)}
.cmeta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-family:var(--mono);font-size:11px;color:var(--faint)}.cmeta .sep{opacity:.5}
.empty{color:var(--faint);text-align:center;padding:80px 0;font-size:14px}
.scrim{position:fixed;inset:0;background:var(--scrim);opacity:0;pointer-events:none;transition:opacity .2s;z-index:40}.scrim.on{opacity:1;pointer-events:auto}
.peek{position:fixed;top:0;right:0;height:100%;width:min(540px,96vw);background:var(--panel);z-index:41;transform:translateX(100%);transition:transform .26s cubic-bezier(.32,.72,0,1);border-left:1px solid var(--line-2);box-shadow:-16px 0 50px -22px rgba(0,0,0,.5);display:flex;flex-direction:column}.peek.on{transform:translateX(0)}
.ptop{display:flex;align-items:center;gap:9px;padding:12px 16px;border-bottom:1px solid var(--line)}.ptop .pdot{width:8px;height:8px;border-radius:50%;flex:none}.ptop .bn{font-weight:650;font-size:14px}.ptop .fmt{font-size:10.5px;color:var(--faint);background:var(--inset);padding:2px 8px;border-radius:6px}
.pnav{margin-left:auto;display:flex;align-items:center;gap:6px}.pnav button{width:30px;height:30px;border:1px solid var(--line-2);background:var(--panel);border-radius:8px;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center}.pnav button:hover{border-color:var(--line-strong);color:var(--text)}.pnav button svg{width:16px;height:16px}
.pbody{overflow:auto;padding:16px;display:flex;flex-direction:column;gap:14px}
.pmedia{flex:none;width:100%;border-radius:11px;overflow:hidden;background:#0c0d10;border:1px solid var(--line);text-align:center;font-size:0}.pmedia img{max-width:100%;max-height:66vh;width:auto;height:auto;display:inline-block;vertical-align:middle;object-fit:contain}.pmedia video{max-width:100%;max-height:66vh;display:inline-block}.pmedia .vfallback{display:block;padding:13px;font-size:12.5px;font-weight:500;color:var(--accent)}
.ptitle{font-size:16px;font-weight:650;letter-spacing:-.015em;line-height:1.4}
.prop{display:grid;grid-template-columns:96px 1fr;gap:4px 10px;font-size:13px}.prop dt{color:var(--muted)}.prop dd{margin:0;color:var(--text)}.prop dd.mono{font-family:var(--mono);font-size:12px}
.pcopy{font-size:13px;line-height:1.7;white-space:pre-line;color:var(--text);background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:13px 15px}
.plinks{display:flex;gap:8px;flex-wrap:wrap}.plinks a{font-size:12.5px;font-weight:500;padding:8px 14px;border-radius:8px;border:1px solid var(--line-2);color:var(--text);background:var(--panel)}.plinks a.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.plinks a:hover{border-color:var(--line-strong)}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto}}
@media(max-width:560px){main{padding:16px 14px 80px}header,.bar{padding-left:14px;padding-right:14px}#theme{right:14px;top:14px}}
</style></head>
<body>
<header>
  <button class="iconbtn" id="theme" title="라이트/다크 전환" aria-label="테마 전환"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg></button>
  <div class="eyebrow">Beauty Ad Reference · EU</div>
  <h1>뷰티 광고 레퍼런스 갤러리</h1>
  <div class="sub">유럽 뷰티 시장에서 현재 집행 중인 광고 소재 레퍼런스입니다. (Meta·TikTok에서 실제 운영되는 소재를 후킹·소구·톤으로 분류)</div>
  <div class="stats">
    <span>광고 <b>${ads.length}</b></span><span class="dot">·</span>
    <span>광고주 <b>${advNames.length}</b></span><span class="dot">·</span>
    <span>국가 <b>${countriesAll.length}</b></span><span class="dot">·</span>
    <span>Meta <b>${bySrc.meta}</b> / TikTok <b>${bySrc.tiktok}</b></span>
  </div>
</header>
<div class="bar">
  <div class="seg" id="seg">
    <button data-src="" class="on">전체</button><button data-src="meta">Meta</button><button data-src="tiktok">TikTok</button>
  </div>
  <span class="sel"><select id="f-adv"><option value="">광고주 전체</option>${advOptions}</select></span>
  <span class="sel"><select id="f-type"><option value="">유형 전체</option><option value="retailer">리테일러·플랫폼</option><option value="brand">브랜드</option><option value="unknown">미상</option></select></span>
  <span class="sel"><select id="f-ctry"><option value="">국가 전체</option>${ctryOptions}</select></span>
  <span class="sel"><select id="f-kb"><option value="">K뷰티 전체</option><option value="1">K뷰티만</option></select></span>
  <span class="sel"><select id="f-fmt"><option value="">포맷</option>${opt(['단일이미지', '카루셀', '영상'])}</select></span>
  <span class="sel"><select id="f-hook"><option value="">후킹</option>${opt(enums.hook_type)}</select></span>
  <span class="sel"><select id="f-appeal"><option value="">소구</option>${opt(enums.appeal)}</select></span>
  <span class="sel"><select id="f-tone"><option value="">톤</option>${opt(enums.tone)}</select></span>
  <span class="sel"><select id="f-active"><option value="">상태</option><option value="1">게재 중</option><option value="0">종료</option></select></span>
  <span class="sel"><select id="f-sort"><option value="new">최신순</option><option value="old">오래된순</option></select></span>
  <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="f-q" type="search" placeholder="카피·요약 검색"></label>
  <span class="cmd-count" id="count"></span>
</div>
<main><div class="grid" id="grid"></div></main>
<div class="scrim" id="scrim"></div>
<aside class="peek" id="peek" aria-hidden="true">
  <div class="ptop"><span class="pdot" id="p-dot"></span><span class="bn" id="p-adv"></span><span class="fmt" id="p-fmt"></span>
    <span class="pnav"><button id="p-prev" aria-label="이전"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button><button id="p-next" aria-label="다음"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button><button id="p-close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></span>
  </div>
  <div class="pbody" id="pbody"></div>
</aside>
<script>
const ADS = ${DATA};
const $ = s => document.querySelector(s);
const FILT = ['f-adv','f-type','f-ctry','f-kb','f-fmt','f-hook','f-appeal','f-tone','f-active','f-sort','f-q'];
let src = '', view = [], cur = -1, activeCard = null;
const esc = s => (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SRCLBL = {meta:'Meta', tiktok:'TikTok'};
const uniq = arr => [...new Set(arr)];
const COUNTRY = {FR:['🇫🇷','프랑스'],DE:['🇩🇪','독일'],IT:['🇮🇹','이탈리아'],ES:['🇪🇸','스페인'],BE:['🇧🇪','벨기에'],PL:['🇵🇱','폴란드'],SE:['🇸🇪','스웨덴'],AT:['🇦🇹','오스트리아'],IE:['🇮🇪','아일랜드'],PT:['🇵🇹','포르투갈'],FI:['🇫🇮','핀란드'],DK:['🇩🇰','덴마크'],CZ:['🇨🇿','체코'],HU:['🇭🇺','헝가리'],RO:['🇷🇴','루마니아'],BG:['🇧🇬','불가리아'],HR:['🇭🇷','크로아티아'],EE:['🇪🇪','에스토니아'],LV:['🇱🇻','라트비아'],LT:['🇱🇹','리투아니아'],NL:['🇳🇱','네덜란드'],GR:['🇬🇷','그리스'],LU:['🇱🇺','룩셈부르크'],SK:['🇸🇰','슬로바키아'],SI:['🇸🇮','슬로베니아'],GB:['🇬🇧','영국'],US:['🇺🇸','미국']};
const cflag = c => (COUNTRY[c]||['',''])[0] || c;
const cname = c => (COUNTRY[c]||['',c])[1] || c;
const clabel = c => COUNTRY[c] ? COUNTRY[c][0]+' '+COUNTRY[c][1] : c;
const advsFor = s => uniq(ADS.filter(a=>!s||a.src===s).map(a=>a.adv)).sort((x,y)=>x.localeCompare(y,'ko'));
const ctriesFor = s => uniq(ADS.filter(a=>!s||a.src===s).flatMap(a=>a.ctries)).sort((a,b)=>cname(a).localeCompare(cname(b),'ko'));
function rebuildAdv(){
  const sel=$('#f-adv'), cur=sel.value; let html='<option value="">광고주 전체</option>';
  if(src===''){ [['meta','Meta'],['tiktok','TikTok']].forEach(([s,lbl])=>{const list=advsFor(s);if(!list.length)return;html+='<optgroup label="'+lbl+'">'+list.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('')+'</optgroup>';}); }
  else { html+=advsFor(src).map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join(''); }
  sel.innerHTML=html; sel.value=[...sel.options].some(o=>o.value===cur)?cur:'';
}
function rebuildCtry(){
  const sel=$('#f-ctry'), cur=sel.value, list=ctriesFor(src);
  if(!list.length){ sel.innerHTML='<option value="">국가 없음</option>'; sel.value=''; sel.disabled=true; return; }
  sel.disabled=false; sel.innerHTML='<option value="">국가 전체</option>'+list.map(v=>'<option value="'+esc(v)+'">'+esc(clabel(v))+'</option>').join('');
  sel.value=[...sel.options].some(o=>o.value===cur)?cur:'';
}
function pills(a){let o='';if(a.fmt)o+='<span class="pill fmt">'+esc(a.fmt)+'</span>';if(a.hook)o+='<span class="pill"><span class="d h"></span>'+esc(a.hook)+'</span>';if(a.appeal)o+='<span class="pill"><span class="d a"></span>'+esc(a.appeal)+'</span>';if(a.tone)o+='<span class="pill"><span class="d t"></span>'+esc(a.tone)+'</span>';return o}
function card(a,i){
  const cover = a.media ? '<img loading="lazy" decoding="async" src="'+a.media+'" alt="">' : '<div class="ph">미리보기 없음</div>';
  const play = a.fmt==='영상' ? '<div class="play"><button class="pbtn" aria-label="재생"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 6l9 6-9 6z"/></svg></button></div>' : '';
  const cs = a.ar ? ' style="aspect-ratio:'+a.ar+'"' : '';
  const ver = a.collation>1 ? '<div class="ver">v'+a.collation+'</div>' : '';
  return '<article class="card'+(a.active?'':' off')+'" data-i="'+i+'" tabindex="0">'+
    '<div class="cover"'+cs+'><span class="srcbadge '+a.src+'">'+SRCLBL[a.src]+'</span>'+cover+play+ver+'</div>'+
    '<div class="cbody">'+
      '<div class="tagrow"><span class="advtag" style="color:'+a.bc+';background:color-mix(in srgb,'+a.bc+' 13%,transparent)">'+esc(a.adv)+'</span>'+(a.kb?'<span class="kbtag">K-Beauty</span>':'')+'</div>'+
      (a.summary?'<div class="title">'+esc(a.summary)+'</div>':'')+
      '<div class="excerpt">'+esc(a.copy)+'</div>'+
      '<div class="pills">'+pills(a)+'</div>'+
      '<div class="cmeta">'+[a.started?'<span>'+esc(a.started)+'</span>':'',a.ctries.length?'<span title="'+esc(a.ctries.map(cname).join(', '))+'">'+a.ctries.slice(0,8).map(cflag).join('')+(a.ctries.length>8?'…':'')+'</span>':'',a.ctr?'<span>CTR '+a.ctr+'</span>':''].filter(Boolean).join('<span class="sep">·</span>')+'</div>'+
    '</div></article>';
}
const fv = () => { const o={}; FILT.forEach(id=>o[id]=$('#'+id).value); return o };
function apply(){
  if(activeCard)stopInline(activeCard);
  const f=fv(), q=(f['f-q']||'').trim().toLowerCase();
  const vis=ADS.map((a,idx)=>({a,idx})).filter(({a})=>(!src||a.src===src)&&(!f['f-adv']||a.adv===f['f-adv'])&&(!f['f-type']||a.type===f['f-type'])&&(!f['f-ctry']||a.ctries.includes(f['f-ctry']))&&(!f['f-kb']||a.kb)&&(!f['f-fmt']||a.fmt===f['f-fmt'])&&(!f['f-hook']||a.hook===f['f-hook'])&&(!f['f-appeal']||a.appeal===f['f-appeal'])&&(!f['f-tone']||a.tone===f['f-tone'])&&(f['f-active']===''||(f['f-active']==='1')===a.active)&&(!q||a.copy.toLowerCase().includes(q)||(a.summary||'').toLowerCase().includes(q)));
  vis.sort((x,y)=>f['f-sort']==='old'?(x.a.started>y.a.started?1:-1):(x.a.started<y.a.started?1:-1));
  view=vis.map(o=>o.idx);
  const visset=new Set(view);
  nodes.forEach((el,idx)=>{const d=visset.has(idx)?'':'none';if(el.style.display!==d)el.style.display=d;});
  const frag=document.createDocumentFragment(); view.forEach(idx=>frag.appendChild(nodes[idx])); grid.insertBefore(frag,emptyEl);
  emptyEl.style.display=view.length?'none':'';
  $('#count').innerHTML='<b>'+view.length+'</b> / '+ADS.length;
}
const grid=$('#grid');
grid.innerHTML=ADS.map((a,i)=>card(a,i)).join('');
const nodes=[...grid.children];
const emptyEl=document.createElement('div');emptyEl.className='empty';emptyEl.textContent='조건에 맞는 광고가 없습니다.';emptyEl.style.display='none';grid.appendChild(emptyEl);
// inline video
function stopInline(c){if(!c)return;const cv=c.querySelector('.cover');if(!cv)return;cv.querySelector('video.cvideo')?.remove();cv.querySelector('.vclose')?.remove();cv.querySelector('.vfail')?.remove();const p=c.querySelector('.play');if(p)p.style.display='';if(activeCard===c)activeCard=null;}
function failInline(c,a){stopInline(c);const cv=c.querySelector('.cover');if(!cv)return;const l=document.createElement('a');l.className='vfail';l.href=a.detail||a.video||'#';l.target='_blank';l.rel='noopener';l.textContent='재생 만료 — 원본 보기';l.addEventListener('click',e=>e.stopPropagation());cv.appendChild(l);setTimeout(()=>l.remove(),5000);}
function playInline(c,a){if(activeCard&&activeCard!==c)stopInline(activeCard);const cv=c.querySelector('.cover');if(!cv||cv.querySelector('video.cvideo'))return;if(!a.video){failInline(c,a);return;}const v=document.createElement('video');v.className='cvideo';v.src=a.video;v.muted=true;v.controls=true;v.autoplay=true;v.loop=true;v.playsInline=true;v.preload='metadata';v.addEventListener('error',()=>failInline(c,a));v.addEventListener('click',e=>e.stopPropagation());const p=c.querySelector('.play');if(p)p.style.display='none';const x=document.createElement('button');x.className='vclose';x.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';cv.appendChild(v);cv.appendChild(x);v.play().catch(()=>{});activeCard=c;}
function openPeek(i){if(i<0||i>=view.length)return;cur=i;const a=ADS[view[i]];
  $('#p-adv').textContent=a.adv;$('#p-fmt').textContent=a.fmt;$('#p-dot').style.background=a.bc;
  // 로컬 저장 영상(vlocal)은 만료 없음 → 항상 인라인. 원격 URL 은 TikTok 제외(수시간 만료), Meta 만 인라인+onerror 폴백.
  const playable=a.video&&(a.vlocal||a.src!=='tiktok');
  const media=playable?'<video src="'+esc(a.video)+'"'+(a.media?' poster="'+a.media+'"':'')+' controls autoplay muted loop playsinline></video>':(a.media?'<img src="'+a.media+'" alt="">':'<div style="min-height:280px;display:flex;align-items:center;justify-content:center;color:#888">미리보기 없음</div>');
  const tlbl={retailer:'리테일러·플랫폼',brand:'브랜드',unknown:'미상'}[a.type]||a.type;
  $('#pbody').innerHTML='<div class="pmedia">'+media+'</div>'+
    (a.summary?'<div class="ptitle">'+esc(a.summary)+'</div>':'')+
    '<div class="pills">'+pills(a)+'</div>'+
    '<dl class="prop">'+
      '<dt>플랫폼</dt><dd>'+SRCLBL[a.src]+(a.kb?' · K뷰티':'')+'</dd>'+
      '<dt>광고주 유형</dt><dd>'+tlbl+'</dd>'+
      (a.started?'<dt>게재 시작</dt><dd class="mono">'+esc(a.started)+(a.active?'':' · 종료')+'</dd>':'')+
      (a.ctries.length?'<dt>국가</dt><dd>'+a.ctries.map(clabel).join(', ')+'</dd>':'')+
      (a.ctr!=null?'<dt>CTR</dt><dd class="mono">'+a.ctr+(a.like?' · ♥ '+a.like:'')+'</dd>':'')+
      (a.cta?'<dt>CTA</dt><dd>'+esc(a.cta)+'</dd>':'')+
      '<dt>ID</dt><dd class="mono">'+esc(a.id)+'</dd>'+
    '</dl>'+
    '<div class="pcopy">'+esc(a.copy||'(카피 없음)')+'</div>'+
    '<div class="plinks">'+(!a.vlocal&&a.src!=='tiktok'&&a.video?'<a class="primary" href="'+esc(a.video)+'" target="_blank" rel="noopener">영상 원본</a>':'')+(a.detail?'<a class="'+(!playable?'primary':'')+'" href="'+esc(a.detail)+'" target="_blank" rel="noopener">'+(a.src==='meta'?'Ad Library':'Creative Center'+(playable?'':'에서 재생'))+'</a>':'')+(a.landing?'<a href="'+esc(a.landing)+'" target="_blank" rel="noopener">랜딩</a>':'')+'</div>';
  const pv0=$('#pbody').querySelector('.pmedia video');
  if(pv0)pv0.addEventListener('error',()=>{const pm=$('#pbody').querySelector('.pmedia');if(pm)pm.innerHTML=(a.media?'<img src="'+a.media+'" alt="">':'')+'<a class="vfallback" href="'+esc(a.detail||a.video||'#')+'" target="_blank" rel="noopener">영상 만료 — 원본에서 재생</a>';});
  $('#pbody').scrollTop=0;$('#peek').classList.add('on');$('#scrim').classList.add('on');$('#peek').setAttribute('aria-hidden','false');
}
function closePeek(){$('#peek').classList.remove('on');$('#scrim').classList.remove('on');$('#peek').setAttribute('aria-hidden','true');const pv=$('#pbody').querySelector('video');if(pv)pv.pause();cur=-1}
const step=d=>{if(cur>=0)openPeek(cur+d)};
$('#grid').addEventListener('click',e=>{const c=e.target.closest('.card');if(!c)return;const a=ADS[+c.dataset.i];if(e.target.closest('.vclose')){e.stopPropagation();stopInline(c);return;}if(e.target.closest('.pbtn')){e.stopPropagation();if(a.vlocal||a.src!=='tiktok'){playInline(c,a);}else{window.open(a.detail||'#','_blank','noopener');}return;}const p=view.indexOf(+c.dataset.i);if(p>=0)openPeek(p);});
$('#grid').addEventListener('keydown',e=>{if(e.key!=='Enter')return;const c=e.target.closest('.card');if(!c)return;const p=view.indexOf(+c.dataset.i);if(p>=0)openPeek(p)});
$('#scrim').addEventListener('click',closePeek);$('#p-close').addEventListener('click',closePeek);$('#p-prev').addEventListener('click',()=>step(-1));$('#p-next').addEventListener('click',()=>step(1));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePeek();else if(cur>=0&&e.key==='ArrowRight')step(1);else if(cur>=0&&e.key==='ArrowLeft')step(-1)});
$('#seg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;src=b.dataset.src;[...$('#seg').children].forEach(x=>x.classList.toggle('on',x===b));rebuildAdv();rebuildCtry();apply()});
FILT.forEach(id=>$('#'+id).addEventListener('input',apply));
$('#theme').addEventListener('click',()=>{const r=document.documentElement;const n=r.getAttribute('data-theme')==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('bag-theme',n)}catch(e){}});
rebuildAdv();rebuildCtry();apply();
</script>
</body></html>`;
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_HTML, html);
console.log(JSON.stringify({ written: OUT_HTML, ads: ads.length, meta: bySrc.meta, tiktok: bySrc.tiktok, advertisers: advNames.length, countries: countriesAll.length }, null, 2));
