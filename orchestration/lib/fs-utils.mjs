import fs from 'fs';
import path from 'path';

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function fileExists(p) {
  try { fs.accessSync(p, fs.constants.F_OK); return true; }
  catch { return false; }
}

export function writeIfMissing(file, content) {
  ensureDir(path.dirname(file));
  if (!fileExists(file)) {
    fs.writeFileSync(file, content, 'utf8');
    return true;
  }
  return false;
}