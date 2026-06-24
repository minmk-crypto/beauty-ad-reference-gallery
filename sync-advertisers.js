#!/usr/bin/env node
'use strict';
/*
 * sync-advertisers.js — 마케터가 관리하는 Google Sheet(광고주 관리 시트)를 SSOT로 삼아
 * config.json 의 sources.meta.advertisers 를 동기화한다. 월·수·금 갱신 주기 첫 단계에서 실행.
 *
 * 인증 불필요: 시트를 "웹에 게시(CSV)" 하거나 "링크가 있는 모든 사용자 보기"로 공유하면
 *   - 게시 URL  : https://docs.google.com/spreadsheets/d/e/<...>/pub?output=csv
 *   - gviz URL : https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&sheet=<탭이름>
 * 둘 다 평범한 GET 으로 CSV 를 돌려준다. 비전 태깅과 동일하게 별도 API 키/시크릿이 없다.
 *
 * URL 우선순위: 환경변수 ADVERTISERS_SHEET_CSV_URL > config.sources.meta.advertisers_sheet.csv_url
 *
 * Fail-safe 원칙(중요): 네트워크 실패·CSV 깨짐·유효 행 0개 → config.json 을 건드리지 않고
 *   기존 광고주 목록을 그대로 유지한다(자동 수집이 빈 목록으로 도는 사고 방지).
 *
 * CSV 컬럼(헤더 대소문자/한글 별칭 허용):
 *   label(광고주/브랜드) · page_id(Meta Page ID=view_all_page_id) · type(retailer/brand) ·
 *   kbeauty(TRUE/FALSE/O/X) · country(FR 등, 비우면 글로벌) · enabled(FALSE 면 수집 제외) · notes(무시)
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CFG_PATH = path.join(DIR, 'config.json');

const log = (m) => process.stderr.write(m + '\n');
const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n');

/* ---------- CSV 파서 (RFC4180 비슷: 따옴표·콤마·CRLF·BOM 처리) ---------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, ''); // strip BOM
  const rows = [];
  let row = [], field = '', i = 0, inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { pushRow(); i++; continue; }
    field += c; i++;
  }
  // 마지막 필드/행
  if (field.length || row.length) pushRow();
  // 완전 빈 행 제거
  return rows.filter(r => r.some(cell => (cell || '').trim() !== ''));
}

/* ---------- 헤더 별칭 → 정규 컬럼명 ---------- */
const HEADER_ALIASES = {
  label:   ['label', '광고주', '브랜드', '이름', 'name', 'advertiser'],
  page_id: ['page_id', 'pageid', 'page id', '페이지id', '페이지 id', 'page', 'view_all_page_id'],
  type:    ['type', '유형', '구분', '광고주유형'],
  kbeauty: ['kbeauty', 'k뷰티', 'k-뷰티', 'kbeauty여부', 'k_beauty'],
  country: ['country', '국가', '나라'],
  enabled: ['enabled', '사용', '활성', '수집', '수집여부', '사용여부', 'active', 'on'],
  notes:   ['notes', '메모', '비고', '설명', 'note'],
};
function normHeader(h) {
  const key = (h || '').trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [canon, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return canon;
  }
  return null; // 모르는 컬럼은 무시
}

const truthy = (v, dflt) => {
  const s = (v || '').trim().toLowerCase();
  if (s === '') return dflt;
  if (['true', '1', 'o', 'y', 'yes', '예', '사용', '활성', 'on', '✓', '√'].includes(s)) return true;
  if (['false', '0', 'x', 'n', 'no', '아니오', '미사용', '비활성', 'off'].includes(s)) return false;
  return dflt;
};

function rowsToAdvertisers(rows) {
  if (rows.length < 2) return { advertisers: [], errors: ['데이터 행 없음(헤더만 존재하거나 빈 시트)'] };
  const headerRow = rows[0].map(normHeader);
  if (!headerRow.includes('label') || !headerRow.includes('page_id')) {
    return { advertisers: [], errors: ['필수 헤더 누락: label, page_id (시트 첫 행이 헤더여야 함)'] };
  }
  const col = (name) => headerRow.indexOf(name);
  const iLabel = col('label'), iPage = col('page_id'), iType = col('type'),
        iKb = col('kbeauty'), iCountry = col('country'), iEnabled = col('enabled');

  const errors = [], advertisers = [], dedup = new Set();
  for (let r = 1; r < rows.length; r++) {
    const get = (idx) => (idx >= 0 ? (rows[r][idx] || '').trim() : '');
    const label = get(iLabel);
    let pageId = get(iPage).replace(/^["'\s]+|["'\s]+$/g, ''); // 양끝 따옴표·공백만 제거(내부 문자는 보존해 불량값 검출)
    const enabled = truthy(get(iEnabled), true);
    if (!enabled) continue;
    if (!label && !pageId) continue; // 빈 행
    if (!label) { errors.push(`행 ${r + 1}: label 없음(page_id=${pageId || '?'})`); continue; }
    if (!/^\d+$/.test(pageId)) { errors.push(`행 ${r + 1}: page_id 가 숫자가 아님 (${label}: "${get(iPage)}")`); continue; }

    const typeRaw = get(iType).toLowerCase();
    const type = /retail|리테일/.test(typeRaw) ? 'retailer' : 'brand';
    const kbeauty = truthy(get(iKb), false);
    const country = get(iCountry).toUpperCase().replace(/[^A-Z]/g, '');

    const key = `${pageId}|${country}`;
    if (dedup.has(key)) { errors.push(`행 ${r + 1}: 중복 (${label} ${pageId}${country ? '/' + country : ''})`); continue; }
    dedup.add(key);
    advertisers.push({ label, page_id: pageId, type, kbeauty, country });
  }
  return { advertisers, errors };
}

async function fetchCSV(url) {
  // 게시/공유 시트는 종종 1회 302 리다이렉트 → fetch 가 자동 추종
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'beauty-ad-gallery sync-advertisers', 'accept': 'text/csv,*/*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (/<html|<!doctype/i.test(text.slice(0, 200))) {
    throw new Error('CSV 가 아니라 HTML 응답 — 시트가 "웹에 게시(CSV)" 또는 "링크 보기 공유" 상태인지 확인');
  }
  return text;
}

function diffSummary(prev, next) {
  const k = (a) => `${a.page_id}|${a.country || ''}`;
  const prevSet = new Map(prev.map(a => [k(a), a]));
  const nextSet = new Map(next.map(a => [k(a), a]));
  const added = next.filter(a => !prevSet.has(k(a))).map(a => `${a.label}(${a.page_id}${a.country ? '/' + a.country : ''})`);
  const removed = prev.filter(a => !nextSet.has(k(a))).map(a => `${a.label}(${a.page_id}${a.country ? '/' + a.country : ''})`);
  return { added, removed };
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
  cfg.sources = cfg.sources || {};
  cfg.sources.meta = cfg.sources.meta || {};
  const meta = cfg.sources.meta;
  const url = (process.env.ADVERTISERS_SHEET_CSV_URL || (meta.advertisers_sheet && meta.advertisers_sheet.csv_url) || '').trim();

  if (!url) {
    log('⚠ 광고주 시트 URL 미설정 — config.sources.meta.advertisers_sheet.csv_url 또는 ADVERTISERS_SHEET_CSV_URL 환경변수. 동기화 생략, 기존 config 유지.');
    out({ synced: false, reason: 'no_url', advertisers: (meta.advertisers || []).length });
    return; // exit 0 — 워크플로 계속 진행
  }

  let csv;
  try { csv = await fetchCSV(url); }
  catch (e) {
    log(`✖ 시트 fetch 실패: ${e.message} — 기존 config 유지`);
    out({ synced: false, reason: 'fetch_failed', error: e.message, advertisers: (meta.advertisers || []).length });
    process.exit(0); // fail-safe: 실패해도 워크플로 중단하지 않음
  }

  const { advertisers, errors } = rowsToAdvertisers(parseCSV(csv));
  for (const e of errors) log(`  · ${e}`);

  if (!advertisers.length) {
    log('✖ 유효한 광고주 행 0개 — 기존 config 유지(빈 목록 사고 방지)');
    out({ synced: false, reason: 'empty', errors, advertisers: (meta.advertisers || []).length });
    process.exit(0);
  }

  const prev = meta.advertisers || [];
  const { added, removed } = diffSummary(prev, advertisers);
  meta.advertisers = advertisers;
  fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2) + '\n');

  log(`✔ 동기화 완료: ${advertisers.length}개 광고주 (이전 ${prev.length}개)`);
  if (added.length) log(`  + 추가 ${added.length}: ${added.join(', ')}`);
  if (removed.length) log(`  - 제거 ${removed.length}: ${removed.join(', ')}`);
  out({ synced: true, advertisers: advertisers.length, previous: prev.length, added, removed, skipped_rows: errors.length });
}

module.exports = { parseCSV, normHeader, truthy, rowsToAdvertisers, diffSummary };

if (require.main === module) {
  main().catch(e => { log('✖ 예외: ' + e.message + ' — 기존 config 유지'); process.exit(0); });
}
