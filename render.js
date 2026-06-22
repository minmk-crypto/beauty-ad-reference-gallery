#!/usr/bin/env node
'use strict';
/*
 * competitor-ad-gallery / render.js
 * data/gallery.json → <vault>/output/ad-gallery/index.html (자체완결, 인라인 CSS/JS).
 * 미디어는 같은 폴더의 assets/<page_id>/<lib>.jpg 를 상대경로로 참조 → 폴더째 이동·공유 가능.
 * 디자인: Linear/Notion 앱 셸 — 모노크롬 절제 + 모노스페이스 메타 + 우측 peek 패널 + 라이트/다크.
 */
const fs = require('fs');
const path = require('path');

const SKILL_DIR = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'config.json'), 'utf8'));
const GALLERY_PATH = path.join(SKILL_DIR, 'data', 'gallery.json');
const OUT_DIR = path.join(SKILL_DIR, CFG.output_dir || 'docs');
const OUT_HTML = path.join(OUT_DIR, 'index.html');

const gallery = JSON.parse(fs.readFileSync(GALLERY_PATH, 'utf8'));
const ads = Object.values(gallery.ads || {});

function fmtSeoul(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch { return iso; }
}

const brands = CFG.brands.map(b => {
  const list = ads.filter(a => a.page_id === b.page_id);
  return { label: b.label, page_id: b.page_id, total: list.length, active: list.filter(a => a.is_active).length };
});
const totalActive = ads.filter(a => a.is_active).length;

// 빌드 시 각 썸네일의 실제 픽셀 치수를 읽어 카드에 aspect-ratio 로 박는다 → 로딩 중 레이아웃 출렁임 제거
function jpegSize(rel) {
  if (!rel) return null;
  try {
    const b = fs.readFileSync(path.join(OUT_DIR, rel));
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    let o = 2;
    while (o < b.length - 8) {
      if (b[o] !== 0xFF) { o++; continue; }
      const m = b[o + 1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
      }
      o += 2 + b.readUInt16BE(o + 2);
    }
  } catch { /* ignore */ }
  return null;
}

// 브랜드별 고유 색 (config 순서대로) — 카드 상단 브랜드 칩 + peek 점에 사용해 한눈에 구분
const BRAND_PALETTE = [
  '#5e6ad2', '#2f9e8f', '#c2853a', '#c05b86', '#3a8dde', '#9a6ad2',
  '#4a9e5c', '#d2693a', '#2f9ec2', '#c24a8a', '#8a9e3a', '#c2503a',
  '#6a5acd', '#3aa07a', '#a05ec2', '#c2a23a', '#5a8fc2', '#b5654a',
];
const brandColor = {};
CFG.brands.forEach((b, i) => { brandColor[b.page_id] = BRAND_PALETTE[i % BRAND_PALETTE.length]; });

const DATA = JSON.stringify(ads.map(a => {
  const s = jpegSize(a.media_rel);
  return {
    id: a.library_id, brand: a.brand_label, page_id: a.page_id, format: a.format,
    bc: brandColor[a.page_id] || BRAND_PALETTE[0],
    started: a.started || '', active: !!a.is_active, collation: a.collation || 0,
    copy: a.copy || '', cta: a.cta || '', landing: a.landing_url || '',
    detail: a.detail_url || '', video: a.video_url || '', media: a.media_rel || '',
    ar: s ? `${s.w} / ${s.h}` : '',
    hook: (a.tags && a.tags.hook_type) || '', appeal: (a.tags && a.tags.appeal) || '',
    tone: (a.tags && a.tags.tone) || '', summary: (a.tags && a.tags.summary) || '',
  };
}));

const enums = CFG.tag_enums;
const opt = arr => arr.map(v => `<option value="${v}">${v}</option>`).join('');

const html = `<!doctype html>
<html lang="ko" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ad References — 경쟁사 광고</title>
<script>try{var t=localStorage.getItem('cag-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<style>
:root[data-theme="light"]{
  --ground:#fbfbfc; --panel:#ffffff; --panel-2:#f6f6f8; --inset:#f3f3f5;
  --text:#1c1d22; --muted:#6b6f76; --faint:#9a9ea6;
  --line:#ececef; --line-2:#e2e2e6; --line-strong:#d6d7db;
  --accent:#5e6ad2; --accent-soft:#eceefb;
  --dot-hook:#5e6ad2; --dot-appeal:#2f9e8f; --dot-tone:#c2853a;
  --shadow:0 1px 2px rgba(20,21,26,.04); --shadow-lift:0 6px 24px -10px rgba(20,21,26,.22);
  --scrim:rgba(28,29,34,.42);
}
:root[data-theme="dark"]{
  --ground:#0d0e11; --panel:#161719; --panel-2:#1c1d20; --inset:#202125;
  --text:#e8e9ec; --muted:#9a9ea7; --faint:#6c7078;
  --line:#26272b; --line-2:#2d2e33; --line-strong:#3a3b41;
  --accent:#828af0; --accent-soft:#22243a;
  --dot-hook:#828af0; --dot-appeal:#41b8a6; --dot-tone:#d59a52;
  --shadow:0 1px 2px rgba(0,0,0,.4); --shadow-lift:0 10px 30px -12px rgba(0,0,0,.6);
  --scrim:rgba(0,0,0,.6);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--ground);color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Apple SD Gothic Neo",sans-serif;
  font-size:13.5px;line-height:1.55;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
:root{--mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
a{color:inherit;text-decoration:none}
button{font-family:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}

/* top bar */
.topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:14px;height:52px;padding:0 22px;
  background:color-mix(in srgb,var(--ground) 82%,transparent);backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line)}
.brandmark{display:flex;align-items:center;gap:9px;font-weight:650;letter-spacing:-.01em;font-size:14px}
.brandmark .glyph{width:18px;height:18px;border-radius:5px;background:#ffcb27;display:flex;align-items:center;justify-content:center;transform:rotate(45deg)}
.brandmark .glyph::after{content:"";width:6px;height:6px;background:var(--ground);border-radius:1px}
.tb-meta{color:var(--muted);font-size:12px}
.tb-meta b{color:var(--text);font-weight:600}
.tb-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.iconbtn{width:30px;height:30px;border:1px solid var(--line-2);background:var(--panel);border-radius:8px;cursor:pointer;
  color:var(--muted);display:flex;align-items:center;justify-content:center;transition:all .14s}
.iconbtn:hover{border-color:var(--line-strong);color:var(--text)}

/* command row */
.cmd{position:sticky;top:52px;z-index:29;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 22px;
  background:color-mix(in srgb,var(--ground) 82%,transparent);backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line)}
.seg{display:flex;background:var(--inset);border:1px solid var(--line-2);border-radius:9px;padding:2px}
.seg button{border:none;background:none;cursor:pointer;color:var(--muted);font-size:12.5px;font-weight:500;
  padding:5px 12px;border-radius:7px;transition:all .14s;white-space:nowrap}
.seg button:hover{color:var(--text)}
.seg button.on{background:var(--panel);color:var(--text);box-shadow:var(--shadow);font-weight:600}
.sel{position:relative}
.sel select{appearance:none;font:inherit;font-size:12.5px;color:var(--text);background:var(--panel);
  border:1px solid var(--line-2);border-radius:8px;padding:6px 26px 6px 11px;cursor:pointer;transition:border-color .14s}
.sel select:hover{border-color:var(--line-strong)}
.sel::after{content:"";position:absolute;right:10px;top:50%;width:7px;height:7px;border-right:1.6px solid var(--faint);
  border-bottom:1.6px solid var(--faint);transform:translateY(-65%) rotate(45deg);pointer-events:none}
.search{position:relative;display:flex;align-items:center}
.search svg{position:absolute;left:9px;width:14px;height:14px;color:var(--faint);pointer-events:none}
.search input{font:inherit;font-size:12.5px;color:var(--text);background:var(--panel);border:1px solid var(--line-2);
  border-radius:8px;padding:6px 11px 6px 29px;min-width:180px;transition:border-color .14s}
.search input:hover{border-color:var(--line-strong)}
.search input:focus{outline:none;border-color:var(--accent)}
.cmd-count{margin-left:auto;color:var(--muted);font-size:12px;white-space:nowrap}
.cmd-count b{color:var(--text);font-weight:600}

/* active filters */
.afrow{display:flex;gap:7px;flex-wrap:wrap;align-items:center;padding:0 22px;max-height:0;overflow:hidden;transition:max-height .18s,padding .18s}
.afrow.show{max-height:80px;padding:11px 22px 0}
.afchip{display:flex;align-items:center;gap:7px;font-size:12px;background:var(--panel);border:1px solid var(--line-2);
  border-radius:7px;padding:3px 5px 3px 10px}
.afchip .k{color:var(--faint)}
.afchip .rm{cursor:pointer;width:16px;height:16px;border-radius:5px;background:var(--inset);color:var(--muted);
  display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1}
.afchip .rm:hover{background:var(--accent);color:#fff}
.clearall{border:none;background:none;color:var(--accent);cursor:pointer;font:inherit;font-size:12px;font-weight:500}
.clearall:hover{text-decoration:underline}

/* board */
main{padding:20px 22px 90px}
.grid{column-gap:16px;column-width:252px}
.card{break-inside:avoid;width:100%;margin:0 0 16px;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color .14s,box-shadow .14s;box-shadow:var(--shadow)}
.card:hover{border-color:var(--line-strong);box-shadow:var(--shadow-lift)}
.cover{position:relative;background:var(--inset);overflow:hidden}
.cover img{width:100%;height:auto;display:block}
.cover .ph{aspect-ratio:4/5;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:12px;line-height:1.4}
.play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2}
.play .pbtn{pointer-events:auto;cursor:pointer;width:50px;height:50px;border-radius:50%;background:rgba(15,16,20,.4);backdrop-filter:blur(3px);
  border:1.5px solid rgba(255,255,255,.92);color:#fff;display:flex;align-items:center;justify-content:center;transition:transform .14s,background .14s}
.play .pbtn svg{width:19px;height:19px;display:block;margin-left:1px}
.play .pbtn:hover{transform:scale(1.09);background:rgba(15,16,20,.64)}
.cover video.cvideo{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:3}
.vclose{position:absolute;top:8px;right:8px;z-index:4;width:26px;height:26px;border-radius:50%;background:rgba(15,16,20,.66);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}
.vclose svg{width:14px;height:14px;display:block}
.vclose:hover{background:rgba(15,16,20,.85)}
.vfail{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:4;background:rgba(15,16,20,.82);color:#fff;font-size:11.5px;padding:5px 11px;border-radius:8px;text-decoration:none;white-space:nowrap}
.ver{position:absolute;top:9px;left:9px;background:rgba(15,16,20,.66);color:#fff;font-size:10.5px;line-height:1.5;
  padding:2px 7px;border-radius:6px;font-family:var(--mono)}
.card.off .cover img{filter:grayscale(.55) opacity(.78)}
.card.off .cover::after{content:"종료";position:absolute;top:9px;right:9px;background:rgba(15,16,20,.6);color:#fff;
  font-size:10px;line-height:1.5;padding:2px 7px;border-radius:6px}
.cbody{padding:11px 13px 12px;display:flex;flex-direction:column;gap:9px}
.brandtag{align-self:flex-start;font-size:11px;font-weight:600;letter-spacing:-.01em;padding:2px 9px;border-radius:999px;line-height:1.45}
.title{font-size:13.5px;font-weight:600;letter-spacing:-.01em;line-height:1.4;color:var(--text)}
.excerpt{font-size:12px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.pills{display:flex;gap:5px;flex-wrap:wrap}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);background:var(--inset);
  border-radius:6px;padding:2px 8px;white-space:nowrap}
.pill .d{width:6px;height:6px;border-radius:50%;flex:none}
.d.h{background:var(--dot-hook)} .d.a{background:var(--dot-appeal)} .d.t{background:var(--dot-tone)}
.pill.fmt{color:var(--faint)}
.cmeta{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;color:var(--faint)}
.cmeta .sep{opacity:.5}
.empty{color:var(--faint);text-align:center;padding:80px 0;font-size:14px}

/* peek panel */
.scrim{position:fixed;inset:0;background:var(--scrim);opacity:0;pointer-events:none;transition:opacity .2s;z-index:40}
.scrim.on{opacity:1;pointer-events:auto}
.peek{position:fixed;top:0;right:0;height:100%;width:min(540px,96vw);background:var(--panel);z-index:41;
  transform:translateX(100%);transition:transform .26s cubic-bezier(.32,.72,0,1);
  border-left:1px solid var(--line-2);box-shadow:-16px 0 50px -22px rgba(0,0,0,.5);display:flex;flex-direction:column}
.peek.on{transform:translateX(0)}
.ptop{display:flex;align-items:center;gap:9px;padding:12px 16px;border-bottom:1px solid var(--line)}
.ptop .pdot{width:8px;height:8px;border-radius:50%;flex:none}
.ptop .bn{font-weight:650;font-size:14px}
.ptop .fmt{font-size:10.5px;color:var(--faint);background:var(--inset);padding:2px 8px;border-radius:6px}
.pnav{margin-left:auto;display:flex;align-items:center;gap:6px}
.pnav button{width:30px;height:30px;border:1px solid var(--line-2);background:var(--panel);border-radius:8px;cursor:pointer;
  color:var(--muted);display:flex;align-items:center;justify-content:center;transition:all .14s}
.pnav button svg{width:16px;height:16px;display:block}
.pnav button:hover{border-color:var(--line-strong);color:var(--text)}
.pbody{overflow:auto;padding:16px;display:flex;flex-direction:column;gap:14px}
.pmedia{flex:none;width:100%;border-radius:11px;overflow:hidden;background:#0c0d10;border:1px solid var(--line);text-align:center;font-size:0}
.pmedia img{max-width:100%;max-height:66vh;width:auto;height:auto;display:inline-block;vertical-align:middle;object-fit:contain}
.ptitle{font-size:16px;font-weight:650;letter-spacing:-.015em;line-height:1.4}
.prop{display:grid;grid-template-columns:96px 1fr;gap:4px 10px;font-size:13px}
.prop dt{color:var(--muted)} .prop dd{margin:0;color:var(--text)}
.prop dd.mono{font-family:var(--mono);font-size:12px}
.pcopy{font-size:13px;line-height:1.7;white-space:pre-line;color:var(--text);background:var(--panel-2);
  border:1px solid var(--line);border-radius:10px;padding:13px 15px}
.plinks{display:flex;gap:8px;flex-wrap:wrap}
.plinks a{font-size:12.5px;font-weight:500;padding:8px 14px;border-radius:8px;border:1px solid var(--line-2);
  color:var(--text);background:var(--panel);transition:all .14s}
.plinks a:hover{border-color:var(--line-strong)}
.plinks a.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.plinks a.primary:hover{filter:brightness(1.06)}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto}}
@media(max-width:560px){main{padding:16px 14px 80px}.topbar,.cmd{padding-left:14px;padding-right:14px}.afrow.show{padding-left:14px;padding-right:14px}}
</style></head>
<body>

<div class="topbar">
  <div class="brandmark"><span class="glyph"></span>Ad References</div>
  <span class="tb-meta mono"><b>${ads.length}</b> ads · ${brands.length} brands · <b>${totalActive}</b> active</span>
  <div class="tb-right">
    <button class="iconbtn" id="theme" title="테마 전환" aria-label="테마 전환">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
    </button>
  </div>
</div>

<div class="cmd">
  <span class="sel"><select id="f-brand"><option value="">브랜드 전체</option>${brands.map(b => `<option value="${b.label}">${b.label}</option>`).join('')}</select></span>
  <span class="sel"><select id="f-format"><option value="">포맷</option>${opt(['단일이미지', '카루셀', '영상'])}</select></span>
  <span class="sel"><select id="f-hook"><option value="">후킹</option>${opt(enums.hook_type)}</select></span>
  <span class="sel"><select id="f-appeal"><option value="">소구</option>${opt(enums.appeal)}</select></span>
  <span class="sel"><select id="f-tone"><option value="">톤</option>${opt(enums.tone)}</select></span>
  <span class="sel"><select id="f-active"><option value="">상태</option><option value="1">게재 중</option><option value="0">종료</option></select></span>
  <span class="sel"><select id="f-sort"><option value="new">최신순</option><option value="old">오래된순</option></select></span>
  <label class="search">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input id="f-q" type="search" placeholder="카피·요약 검색" aria-label="검색">
  </label>
  <span class="cmd-count" id="count"></span>
</div>
<div class="afrow" id="afrow"></div>

<main><div class="grid" id="grid"></div></main>

<div class="scrim" id="scrim"></div>
<aside class="peek" id="peek" aria-hidden="true" aria-label="광고 상세">
  <div class="ptop">
    <span class="pdot" id="p-dot"></span><span class="bn" id="p-brand"></span><span class="fmt" id="p-fmt"></span>
    <span class="pnav"><button id="p-prev" aria-label="이전"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><button id="p-next" aria-label="다음"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button><button id="p-close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></span>
  </div>
  <div class="pbody" id="pbody"></div>
</aside>

<script>
const ADS = ${DATA};
const $ = s => document.querySelector(s);
const FILT = ['f-brand','f-format','f-hook','f-appeal','f-tone','f-active','f-sort','f-q'];
const LAB = {'f-brand':'브랜드','f-format':'포맷','f-hook':'후킹','f-appeal':'소구','f-tone':'톤','f-active':'상태'};
let view = [], cur = -1, activeCard = null;
const esc = s => (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function pills(a){let o='';if(a.format)o+='<span class="pill fmt">'+esc(a.format)+'</span>';
  if(a.hook)o+='<span class="pill"><span class="d h"></span>'+esc(a.hook)+'</span>';
  if(a.appeal)o+='<span class="pill"><span class="d a"></span>'+esc(a.appeal)+'</span>';
  if(a.tone)o+='<span class="pill"><span class="d t"></span>'+esc(a.tone)+'</span>';return o}
function card(a,i){
  const cover = a.media ? '<img loading="lazy" decoding="async" src="'+a.media+'" alt="">' : '<div class="ph">미리보기 없음</div>';
  const play = a.format==='영상' ? '<div class="play"><button class="pbtn" aria-label="재생"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 6l9 6-9 6z"/></svg></button></div>' : '';
  const ver = a.collation>1 ? '<div class="ver">v'+a.collation+'</div>' : '';
  const cs = a.ar ? ' style="aspect-ratio:'+a.ar+'"' : '';
  return '<article class="card'+(a.active?'':' off')+'" data-i="'+i+'" tabindex="0">'+
    '<div class="cover"'+cs+'>'+cover+play+ver+'</div>'+
    '<div class="cbody">'+
      '<span class="brandtag" style="color:'+a.bc+';background:color-mix(in srgb,'+a.bc+' 13%,transparent)">'+esc(a.brand)+'</span>'+
      (a.summary?'<div class="title">'+esc(a.summary)+'</div>':'')+
      '<div class="excerpt">'+esc(a.copy)+'</div>'+
      '<div class="pills">'+pills(a)+'</div>'+
      '<div class="cmeta"><span>'+esc(a.started||'—')+'</span>'+(a.cta?'<span class="sep">·</span><span>'+esc(a.cta)+'</span>':'')+'</div>'+
    '</div></article>';
}
const fv = () => { const o={}; FILT.forEach(id=>o[id]=$('#'+id).value); return o };
function afchips(f){
  const items=[];
  Object.keys(LAB).forEach(id=>{if(f[id])items.push([id,LAB[id],id==='f-active'?(f[id]==='1'?'게재 중':'종료'):f[id]])});
  if(f['f-q'])items.push(['f-q','검색',f['f-q']]);
  const row=$('#afrow');
  if(!items.length){row.className='afrow';row.innerHTML='';return}
  row.className='afrow show';
  row.innerHTML=items.map(([k,lab,v])=>'<span class="afchip"><span class="k">'+lab+'</span>'+esc(v)+'<span class="rm" data-k="'+k+'">×</span></span>').join('')+'<button class="clearall" id="clearall">초기화</button>';
}
// 카드를 한 번만 생성 → 필터/탭 전환 시 재생성하지 않고 show/hide + 순서만 변경 (썸네일 재로딩·레이아웃 출렁임 방지)
const grid=$('#grid');
grid.innerHTML=ADS.map((a,i)=>card(a,i)).join('');
const nodes=[...grid.children];
const emptyEl=document.createElement('div');emptyEl.className='empty';emptyEl.textContent='조건에 맞는 광고가 없습니다. 필터를 줄여 보세요.';emptyEl.style.display='none';grid.appendChild(emptyEl);
function apply(){
  if(activeCard)stopInline(activeCard);
  const f=fv(), q=(f['f-q']||'').trim().toLowerCase();
  const vis=ADS.map((a,idx)=>({a,idx})).filter(({a})=>(!f['f-brand']||a.brand===f['f-brand'])&&(!f['f-format']||a.format===f['f-format'])&&(!f['f-hook']||a.hook===f['f-hook'])&&(!f['f-appeal']||a.appeal===f['f-appeal'])&&(!f['f-tone']||a.tone===f['f-tone'])&&(f['f-active']===''||(f['f-active']==='1')===a.active)&&(!q||a.copy.toLowerCase().includes(q)||(a.summary||'').toLowerCase().includes(q)));
  vis.sort((x,y)=>f['f-sort']==='old'?(x.a.started>y.a.started?1:-1):(x.a.started<y.a.started?1:-1));
  view=vis.map(o=>o.idx);
  const visset=new Set(view);
  nodes.forEach((el,idx)=>{const d=visset.has(idx)?'':'none';if(el.style.display!==d)el.style.display=d;});
  const frag=document.createDocumentFragment();
  view.forEach(idx=>frag.appendChild(nodes[idx]));
  grid.insertBefore(frag,emptyEl);
  emptyEl.style.display=view.length?'none':'';
  $('#count').innerHTML='<b>'+view.length+'</b> / '+ADS.length;
  afchips(f);
}
function openPeek(i){
  if(i<0||i>=view.length)return; cur=i; const a=ADS[view[i]];
  $('#p-brand').textContent=a.brand; $('#p-fmt').textContent=a.format; $('#p-dot').style.background=a.bc;
  const media=a.media?'<img src="'+a.media+'" alt="">':'<div style="min-height:280px;display:flex;align-items:center;justify-content:center;color:#888">미리보기 없음</div>';
  $('#pbody').innerHTML=
    '<div class="pmedia">'+media+'</div>'+
    (a.summary?'<div class="ptitle">'+esc(a.summary)+'</div>':'')+
    '<div class="pills">'+pills(a)+'</div>'+
    '<dl class="prop">'+
      '<dt>게재 시작</dt><dd class="mono">'+esc(a.started||'—')+(a.active?'':' · 종료')+'</dd>'+
      (a.cta?'<dt>CTA</dt><dd>'+esc(a.cta)+'</dd>':'')+
      (a.collation>1?'<dt>버전</dt><dd>'+a.collation+'개 크리에이티브</dd>':'')+
      '<dt>라이브러리 ID</dt><dd class="mono">'+esc(a.id)+'</dd>'+
    '</dl>'+
    '<div class="pcopy">'+esc(a.copy||'(카피 없음)')+'</div>'+
    '<div class="plinks">'+(a.video?'<a class="primary" href="'+esc(a.video)+'" target="_blank" rel="noopener">영상 재생</a>':'')+(a.detail?'<a href="'+esc(a.detail)+'" target="_blank" rel="noopener">Ad Library 원본</a>':'')+(a.landing?'<a href="'+esc(a.landing)+'" target="_blank" rel="noopener">랜딩 페이지</a>':'')+'</div>';
  $('#pbody').scrollTop=0;
  $('#peek').classList.add('on'); $('#scrim').classList.add('on'); $('#peek').setAttribute('aria-hidden','false');
}
function closePeek(){$('#peek').classList.remove('on');$('#scrim').classList.remove('on');$('#peek').setAttribute('aria-hidden','true');cur=-1}
const step = d => { if(cur>=0) openPeek(cur+d) };

// ── 메인 리스트 인라인 영상 재생 ─────────────────────────────
function stopInline(card){
  if(!card)return; const cover=card.querySelector('.cover'); if(!cover)return;
  cover.querySelector('video.cvideo')?.remove();
  cover.querySelector('.vclose')?.remove();
  cover.querySelector('.vfail')?.remove();
  const play=card.querySelector('.play'); if(play)play.style.display='';
  if(activeCard===card)activeCard=null;
}
function failInline(card,a){
  stopInline(card); const cover=card.querySelector('.cover'); if(!cover)return;
  const link=document.createElement('a');
  link.className='vfail'; link.href=a.detail||a.video||'#'; link.target='_blank'; link.rel='noopener';
  link.textContent='재생 링크 만료 — Ad Library에서 보기';
  link.addEventListener('click',ev=>ev.stopPropagation());
  cover.appendChild(link); setTimeout(()=>link.remove(),5000);
}
function playInline(card,a){
  if(activeCard&&activeCard!==card)stopInline(activeCard);
  const cover=card.querySelector('.cover'); if(!cover)return;
  if(cover.querySelector('video.cvideo'))return;
  if(!a.video){failInline(card,a);return;}
  const v=document.createElement('video');
  v.className='cvideo'; v.src=a.video; v.muted=true; v.controls=true; v.autoplay=true; v.loop=true; v.playsInline=true; v.preload='metadata';
  v.addEventListener('error',()=>failInline(card,a));
  v.addEventListener('click',ev=>ev.stopPropagation());
  const play=card.querySelector('.play'); if(play)play.style.display='none';
  const close=document.createElement('button');
  close.className='vclose'; close.setAttribute('aria-label','영상 닫기');
  close.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  cover.appendChild(v); cover.appendChild(close);
  v.play().catch(()=>{});
  activeCard=card;
}

$('#grid').addEventListener('click',e=>{
  const c=e.target.closest('.card'); if(!c)return;
  const a=ADS[+c.dataset.i];
  if(e.target.closest('.vclose')){e.stopPropagation();stopInline(c);return;}
  if(e.target.closest('.pbtn')){e.stopPropagation();playInline(c,a);return;}
  const p=view.indexOf(+c.dataset.i); if(p>=0)openPeek(p);
});
$('#grid').addEventListener('keydown',e=>{if(e.key!=='Enter')return;const c=e.target.closest('.card');if(!c)return;const p=view.indexOf(+c.dataset.i);if(p>=0)openPeek(p)});
$('#scrim').addEventListener('click',closePeek);
$('#p-close').addEventListener('click',closePeek);
$('#p-prev').addEventListener('click',()=>step(-1));
$('#p-next').addEventListener('click',()=>step(1));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePeek();else if(cur>=0&&e.key==='ArrowRight')step(1);else if(cur>=0&&e.key==='ArrowLeft')step(-1)});
$('#afrow').addEventListener('click',e=>{
  if(e.target.id==='clearall'){FILT.forEach(id=>$('#'+id).value=id==='f-sort'?'new':'');apply();return}
  const rm=e.target.closest('.rm');if(!rm)return;$('#'+rm.dataset.k).value='';apply();
});
FILT.forEach(id=>$('#'+id).addEventListener('input',apply));
$('#theme').addEventListener('click',()=>{const r=document.documentElement;const n=r.getAttribute('data-theme')==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('cag-theme',n)}catch(e){}});
apply();
</script>
</body></html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_HTML, html);
console.log(JSON.stringify({ written: OUT_HTML, ads: ads.length, active: totalActive }, null, 2));
