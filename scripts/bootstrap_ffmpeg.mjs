#!/usr/bin/env node
/**
 * Bootstrap ffmpeg locally under tools/ffmpeg/bin when not on PATH.
 *
 * Windows: downloads a portable zip and extracts ffmpeg.exe using PowerShell.
 * Other OS: prints guidance and exits non-zero.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const TOOLS_DIR = path.join(ROOT, 'tools', 'ffmpeg');
const BIN_DIR = path.join(TOOLS_DIR, 'bin');
const FF_EXE = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const LOCAL_FFMPEG = path.join(BIN_DIR, FF_EXE);

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function checkOnPath() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const proc = spawn(cmd, ['-version'], { stdio: 'ignore', shell: true });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

async function main() {
  // If local vendored exists, succeed
  if (exists(LOCAL_FFMPEG)) {
    console.log(`[bootstrap_ffmpeg] Using local ${LOCAL_FFMPEG}`);
    process.exit(0);
  }

  // If on PATH, succeed
  if (await checkOnPath()) {
    console.log('[bootstrap_ffmpeg] ffmpeg found on PATH');
    process.exit(0);
  }

  if (process.platform !== 'win32') {
    console.error('[bootstrap_ffmpeg] ffmpeg not found. Please install via your package manager:');
    console.error('  macOS:  brew install ffmpeg');
    console.error('  Ubuntu: sudo apt-get update && sudo apt-get install -y ffmpeg');
    process.exit(2);
  }

  // Windows portable download
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  const zipPath = path.join(TOOLS_DIR, 'ffmpeg.zip');
  const extractDir = path.join(TOOLS_DIR, 'extracted');

  // Try a reliable essentials build (URL may change over time; fallback mirrors could be added)
  const candidates = [
    'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
    'https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-essentials.zip',
  ];

  let downloaded = false;
  for (const url of candidates) {
    try {
      console.log(`[bootstrap_ffmpeg] Downloading ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(zipPath, buf);
      downloaded = true;
      break;
    } catch (e) {
      console.warn(`[bootstrap_ffmpeg] Download failed from ${url}: ${e.message}`);
    }
  }
  if (!downloaded) {
    console.error('[bootstrap_ffmpeg] Unable to download ffmpeg. Please install manually or place ffmpeg.exe under tools/ffmpeg/bin');
    process.exit(3);
  }

  // Extract using PowerShell Expand-Archive
  fs.mkdirSync(extractDir, { recursive: true });
  await new Promise((resolve, reject) => {
    const ps = spawn(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath.replace(/\\/g, '/')}' -DestinationPath '${extractDir.replace(/\\/g, '/')}' -Force`],
      { stdio: 'inherit' },
    );
    ps.on('error', reject);
    ps.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Expand-Archive exit ${code}`))));
  });

  // Find ffmpeg.exe in extracted tree
  function findExe(dir) {
    const stack = [dir];
    while (stack.length) {
      const d = stack.pop();
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.isFile() && e.name.toLowerCase() === 'ffmpeg.exe') return full;
      }
    }
    return null;
  }

  const exePath = findExe(extractDir);
  if (!exePath) {
    console.error('[bootstrap_ffmpeg] ffmpeg.exe not found in extracted archive');
    process.exit(4);
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.copyFileSync(exePath, LOCAL_FFMPEG);
  console.log(`[bootstrap_ffmpeg] ffmpeg installed at ${LOCAL_FFMPEG}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[bootstrap_ffmpeg] Error:', e.message);
  process.exit(1);
});


