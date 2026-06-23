#!/usr/bin/env node
'use strict';
/*
 * tag-ci.js — 무인 비전 태깅 드라이버.
 * manifest-meta/tiktok 의 new[] 중 tags.json 에 없는 광고를 배치로 묶어
 * 헤드리스 `claude -p` 로 커버 이미지를 판독시켜 뷰티 enum 태그를 data/tags.json 에 머지한다.
 * 인증: CLAUDE_CODE_OAUTH_TOKEN (Max 플랜, `claude setup-token`). API 키 불필요.
 * 로컬에서도 실행 가능(대화형 세션 대신 CLI 호출). claude CLI 가 PATH 에 있어야 함.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const DIR = __dirname;
const OUT_DIR = path.join(DIR, require('./config.json').output_dir || 'docs');
const TAGS = path.join(DIR, 'data', 'tags.json');
const ENUMS = require('./config.json').tag_enums;
const BATCH = 16;
const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };

// 태깅 대상 = manifest 신규 ∪ gallery 의 무태그 광고(이전 회차에 놓친 것 복구). 키로 dedupe.
function loadTodo(tags) {
  const byKey = {};
  const add = (r, key) => { if (!byKey[key]) byKey[key] = { source: r.source, ad_id: r.ad_id, advertiser: r.advertiser, copy: r.copy, media_rel: r.media_rel }; };
  for (const f of ['manifest-meta.json', 'manifest-tiktok.json']) {
    const m = readJSON(path.join(DIR, 'data', f), null);
    if (m && Array.isArray(m.new)) for (const r of m.new) add(r, `${r.source}:${r.ad_id}`);
  }
  const g = readJSON(path.join(DIR, 'data', 'gallery.json'), { ads: {} });
  for (const [key, a] of Object.entries(g.ads)) { if (!(a.tags && a.tags.summary)) add(a, key); }
  return Object.entries(byKey).filter(([k]) => !(tags[k] && tags[k].summary)).map(([, r]) => r);
}

const PROMPT = (batchPath, outPath) => `뷰티(화장품) 광고 크리에이티브를 레퍼런스 갤러리용으로 태깅한다.
${batchPath} 를 읽어라 — 각 줄은 JSON {key, cover(절대경로), advertiser, copy}.
각 광고마다: Read 도구로 cover 이미지를 보고(이미지로 렌더됨) advertiser·copy 와 종합해 아래 4개를 정확히 부여:
- hook_type(하나): ${ENUMS.hook_type.join(' / ')}
- appeal(하나): ${ENUMS.appeal.join(' / ')}
- tone(하나): ${ENUMS.tone.join(' / ')}
- summary: 한줄 한국어 요약(20~35자)
가이드: 할인/세일/가격 강조→appeal=가격·프로모션. 후기/체험담→hook=후기·증언형. 성분명 강조→appeal=성분. 비포애프터→appeal=결과·비포애프터. 미니멀 제품샷→tone=미니멀.
cover 가 없거나 안 읽히면 copy+advertiser 로 추정.
모든 광고를 처리한 뒤 결과를 ${outPath} 에 하나의 JSON 객체로 Write 하라. 키는 입력의 key 그대로. 값은 {"hook_type":..,"appeal":..,"tone":..,"summary":..}. 모든 key 가 반드시 포함돼야 한다. 다른 출력 없이 파일만 쓰고 "DONE" 만 응답하라.`;

function runClaude(batchPath, outPath) {
  const r = spawnSync('claude', ['-p', PROMPT(batchPath, outPath), '--allowedTools', 'Read', 'Write', '--permission-mode', 'acceptEdits'],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 9 * 60 * 1000, encoding: 'utf8', cwd: DIR });
  if (r.status !== 0 || !fs.existsSync(outPath)) {
    const err = ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 240);
    if (err) process.stderr.write(`    claude 오류(status=${r.status}): ${err}\n`);
    return false;
  }
  return true;
}

(async () => {
  const tags = readJSON(TAGS, {});
  const todo = loadTodo(tags);
  if (!todo.length) { console.log(JSON.stringify({ tagged: 0, note: '신규 태깅 대상 없음' })); return; }

  let tagged = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const bn = Math.floor(i / BATCH);
    const batchPath = path.join(os.tmpdir(), `ci-batch-${bn}.jsonl`);
    const outPath = path.join(os.tmpdir(), `ci-tags-${bn}.json`);
    try { fs.unlinkSync(outPath); } catch {}
    fs.writeFileSync(batchPath, batch.map(r => JSON.stringify({
      key: `${r.source}:${r.ad_id}`,
      cover: r.media_rel ? path.join(OUT_DIR, r.media_rel) : '',
      advertiser: r.advertiser || '', copy: (r.copy || '').slice(0, 180).replace(/\n/g, ' '),
    })).join('\n'));

    let ok = runClaude(batchPath, outPath);
    if (!ok) { process.stderr.write(`  batch ${bn} 1차 실패, 재시도\n`); ok = runClaude(batchPath, outPath); }
    if (ok) {
      const part = readJSON(outPath, {});
      for (const r of batch) {
        const k = `${r.source}:${r.ad_id}`;
        const t = part[k];
        if (t && t.summary) { tags[k] = { hook_type: t.hook_type || null, appeal: t.appeal || null, tone: t.tone || null, summary: t.summary }; tagged++; }
      }
    } else { process.stderr.write(`  batch ${bn} 태깅 실패(건너뜀)\n`); }
    fs.writeFileSync(TAGS, JSON.stringify(tags, null, 2)); // 진행 중 저장(중단 대비)
    process.stderr.write(`  batch ${bn}: 누적 ${tagged}/${todo.length}\n`);
  }
  console.log(JSON.stringify({ candidates: todo.length, tagged, missing: todo.length - tagged }, null, 2));
  // 한 건도 태깅 못 했으면(인증/CLI 문제) step 을 실패시켜 무태그 push 를 막는다.
  if (tagged === 0) { process.stderr.write('태깅 0건 — claude 인증/호출 실패로 판단, step 실패 처리\n'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
