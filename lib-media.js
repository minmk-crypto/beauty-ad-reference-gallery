'use strict';
/*
 * lib-media.js — 영상/이미지 다운로드 + ffmpeg 압축 헬퍼.
 * 광고 CDN 서명 URL 은 휘발성(TikTok 수시간 / Meta 며칠) → 수집 시점에 파일을 레포에 저장해 만료 방지.
 *   saveVideo(url, destMp4, { referer, level }) — level: 'heavy'(TikTok 강압축) | 'raw'(Meta 원본)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let FFMPEG = null;
function hasFfmpeg() {
  if (FFMPEG !== null) return FFMPEG;
  try { const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }); FFMPEG = r.status === 0; } catch { FFMPEG = false; }
  return FFMPEG;
}

async function fetchBuf(url, referer) {
  const res = await fetch(url, { headers: { referer: referer || 'https://www.google.com/', 'user-agent': UA } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length < 512 ? null : buf;
}

async function saveImage(url, dest, referer) {
  if (!url) return false;
  try { const buf = await fetchBuf(url, referer); if (!buf) return false; fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); return true; }
  catch { return false; }
}

// 강압축: 세로 영상 너비 300 cap, h264 crf35, 24fps, 오디오 48k 모노. 레퍼런스 인라인용 최소 용량.
function compress(srcPath, destPath) {
  const args = ['-y', '-i', srcPath,
    '-vf', "scale='min(300,iw)':-2,fps=24",
    '-c:v', 'libx264', '-crf', '35', '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-movflags', '+faststart',
    destPath];
  const r = spawnSync('ffmpeg', args, { stdio: 'ignore', timeout: 120000 });
  return r.status === 0 && fs.existsSync(destPath) && fs.statSync(destPath).size > 512;
}

/* 영상 저장. 성공 시 true(파일 dest 생성). level='heavy' 면 ffmpeg 압축(없으면 원본 저장). */
async function saveVideo(url, dest, { referer, level } = {}) {
  if (!url) return false;
  let buf;
  try { buf = await fetchBuf(url, referer); } catch { return false; }
  if (!buf) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (level === 'heavy' && hasFfmpeg()) {
    const tmp = path.join(os.tmpdir(), 'bag-' + Date.now() + '-' + Math.floor(buf.length % 99991) + '.src');
    try {
      fs.writeFileSync(tmp, buf);
      if (compress(tmp, dest)) { fs.unlinkSync(tmp); return true; }
      fs.unlinkSync(tmp);
    } catch {}
    // 압축 실패 → 원본 저장 폴백
  }
  fs.writeFileSync(dest, buf);
  return true;
}

module.exports = { saveImage, saveVideo, hasFfmpeg, UA };
