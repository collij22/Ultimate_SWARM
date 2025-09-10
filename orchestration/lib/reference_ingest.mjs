/**
 * Reference Ingestion Module
 *
 * Ingests visual references from briefs for advisory intent comparison.
 * Stores references deterministically with SHA-256 deduplication.
 * TEST_MODE uses fixtures instead of external fetches.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
// import { pipeline } from 'stream/promises'; // Reserved for future streaming use
import { tenantPath } from './tenant.mjs';
import { emitHook } from './hooks.mjs';

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.webm'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB default
const FETCH_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Reference ingestion error
 */
export class ReferenceIngestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ReferenceIngestError';
    this.code = code;
  }
}

/**
 * Ingest references from brief
 *
 * @param {Array} references - Array of reference objects from brief
 * @param {Object} options - Ingestion options
 * @param {string} [options.auvId] - AUV identifier
 * @param {string} [options.runId] - Run identifier
 * @param {string} [options.tenant] - Tenant identifier
 * @param {boolean} [options.testMode] - Use fixtures instead of fetching
 * @param {number} [options.maxSize] - Max file size in bytes
 * @returns {Promise<Object>} Ingestion results with index
 */
export async function ingestReferences(references = [], options = {}) {
  const {
    auvId = process.env.AUV_ID,
    runId = process.env.RUN_ID || 'latest',
    tenant = process.env.TENANT || 'default',
    testMode = process.env.TEST_MODE === 'true',
    maxSize = MAX_FILE_SIZE_BYTES,
  } = options;

  if (!auvId) {
    throw new ReferenceIngestError('AUV_ID required for reference ingestion', 'MISSING_AUV_ID');
  }

  if (!references.length) {
    return { count: 0, items: [], skipped: [] };
  }

  // Emit start event
  await emitHook('ReferenceIngestStart', {
    module: 'reference_ingest',
    auv_id: auvId,
    run_id: runId,
    count: references.length,
    test_mode: testMode,
  });

  const startTime = Date.now();
  const outputDir = tenantPath(tenant, `${auvId}/references`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results = {
    count: 0,
    items: [],
    skipped: [],
    deduped: 0,
    bytes_total: 0,
  };

  const seenHashes = new Map(); // For deduplication

  for (const ref of references) {
    try {
      const result = await ingestSingleReference(ref, {
        outputDir,
        testMode,
        maxSize,
        seenHashes,
      });

      if (result.skipped) {
        results.skipped.push(result);
      } else {
        results.items.push(result);
        results.count++;
        results.bytes_total += result.bytes;

        if (result.deduped) {
          results.deduped++;
        }
      }
    } catch (error) {
      console.error(`Failed to ingest reference "${ref.label}":`, error.message);
      results.skipped.push({
        label: ref.label,
        type: ref.type,
        skipped: true,
        reason: error.message,
      });
    }
  }

  // Write index file
  const indexPath = path.join(outputDir, 'references_index.json');
  fs.writeFileSync(indexPath, JSON.stringify(results, null, 2));

  // Emit complete event
  await emitHook('ReferenceIngestComplete', {
    module: 'reference_ingest',
    auv_id: auvId,
    run_id: runId,
    ok: true,
    count: results.count,
    skipped: results.skipped.length,
    deduped: results.deduped,
    bytes_total: results.bytes_total,
    duration_ms: Date.now() - startTime,
  });

  return results;
}

/**
 * Ingest a single reference
 */
async function ingestSingleReference(ref, options) {
  const { outputDir, testMode, maxSize, seenHashes } = options;

  // Validate reference type
  if (!['image', 'video', 'url'].includes(ref.type)) {
    throw new ReferenceIngestError(`Invalid reference type: ${ref.type}`, 'INVALID_TYPE');
  }

  // Determine if source is local or remote
  const isUrl = ref.source.startsWith('http://') || ref.source.startsWith('https://');

  let sourceData;
  let extension;

  if (ref.type === 'url') {
    // URL references are stored as JSON metadata only
    return {
      label: ref.label,
      type: 'url',
      source: ref.source,
      route: ref.route,
      notes: ref.notes,
      path: null,
      sha256: null,
      bytes: 0,
    };
  }

  if (isUrl) {
    if (testMode) {
      // In test mode, use a fixture
      sourceData = await getTestFixture(ref.type);
      extension = ref.type === 'image' ? '.png' : '.mp4';
    } else {
      // Safety: enforce explicit allowlist or explicit consent for external fetches
      const allowlist = (process.env.REF_ALLOWLIST || '')
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);

      const urlObj = new URL(ref.source);
      const hostname = urlObj.hostname;

      const consent = process.env.REF_ALLOW_EXTERNAL === 'true';
      const allowed = allowlist.length > 0 ? allowlist.includes(hostname) : false;

      if (!allowed && !consent) {
        throw new ReferenceIngestError(
          `External fetch disabled for ${hostname}. Set REF_ALLOW_EXTERNAL=true or REF_ALLOWLIST to proceed`,
          'EXTERNAL_FETCH_BLOCKED',
        );
      }

      // Fetch from URL
      sourceData = await fetchReference(ref.source, maxSize);
      extension =
        path.extname(new URL(ref.source).pathname) || (ref.type === 'image' ? '.jpg' : '.mp4');
    }
  } else {
    // Local file - validate path and copy
    const resolvedPath = path.resolve(ref.source);

    // Security: Ensure path is within repository
    if (!isPathAllowed(resolvedPath)) {
      throw new ReferenceIngestError('Path traversal detected', 'PATH_TRAVERSAL');
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new ReferenceIngestError(`File not found: ${ref.source}`, 'FILE_NOT_FOUND');
    }

    const stats = fs.statSync(resolvedPath);
    if (stats.size > maxSize) {
      throw new ReferenceIngestError(
        `File too large: ${stats.size} bytes (max: ${maxSize})`,
        'FILE_TOO_LARGE',
      );
    }

    sourceData = fs.readFileSync(resolvedPath);
    extension = path.extname(resolvedPath);
  }

  // Validate extension
  const allowedExtensions =
    ref.type === 'image' ? ALLOWED_IMAGE_EXTENSIONS : ALLOWED_VIDEO_EXTENSIONS;

  if (!allowedExtensions.includes(extension.toLowerCase())) {
    throw new ReferenceIngestError(
      `Invalid extension ${extension} for type ${ref.type}`,
      'INVALID_EXTENSION',
    );
  }

  // Calculate hash for deduplication
  const sha256 = crypto.createHash('sha256').update(sourceData).digest('hex');

  // Check if we've seen this content before
  if (seenHashes.has(sha256)) {
    const existingPath = seenHashes.get(sha256);
    return {
      label: ref.label,
      type: ref.type,
      route: ref.route,
      notes: ref.notes,
      path: existingPath,
      sha256,
      bytes: sourceData.length,
      deduped: true,
    };
  }

  // Save to output directory
  const safeLabel = ref.label.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
  const filename = `${safeLabel}_${sha256.substring(0, 8)}${extension}`;
  const outputPath = path.join(outputDir, filename);

  fs.writeFileSync(outputPath, sourceData);

  // Track for deduplication
  const relativePath = path.relative(process.cwd(), outputPath).replace(/\\/g, '/');
  seenHashes.set(sha256, relativePath);

  return {
    label: ref.label,
    type: ref.type,
    route: ref.route,
    notes: ref.notes,
    path: relativePath,
    sha256,
    bytes: sourceData.length,
    deduped: false,
  };
}

/**
 * Fetch reference from URL with timeout and size limit
 */
async function fetchReference(url, maxSize) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Swarm1/1.0 (Reference Ingestion)',
      },
    });

    if (!response.ok) {
      throw new ReferenceIngestError(
        `HTTP ${response.status}: ${response.statusText}`,
        'FETCH_FAILED',
      );
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0');
    if (contentLength > maxSize) {
      throw new ReferenceIngestError(
        `Content too large: ${contentLength} bytes (max: ${maxSize})`,
        'CONTENT_TOO_LARGE',
      );
    }

    const chunks = [];
    let totalBytes = 0;

    for await (const chunk of response.body) {
      totalBytes += chunk.length;
      if (totalBytes > maxSize) {
        controller.abort();
        throw new ReferenceIngestError(
          `Download exceeded max size: ${maxSize} bytes`,
          'DOWNLOAD_TOO_LARGE',
        );
      }
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get test fixture for deterministic testing
 */
async function getTestFixture(type) {
  if (type === 'image') {
    // Return a minimal PNG (1x1 pixel, transparent)
    return Buffer.from(
      '89504e470d0a1a0a0000000d494844520000000100000001' +
        '0100000000376ef9240000001049444154789c626001000000' +
        '05000106e3ac8c0000000049454e44ae426082',
      'hex',
    );
  } else if (type === 'video') {
    // Return a minimal MP4 header (not playable but valid structure)
    return Buffer.from(
      '0000001c667479706d70343200000000697369736f6d6d7034' + '32000000086d646174',
      'hex',
    );
  }
  throw new ReferenceIngestError(`No fixture for type: ${type}`, 'NO_FIXTURE');
}

/**
 * Check if path is allowed (within repository)
 */
function isPathAllowed(filePath) {
  const repoRoot = process.cwd();
  const resolved = path.resolve(filePath);

  // Must be within repo and not in sensitive directories
  if (!resolved.startsWith(repoRoot)) {
    return false;
  }

  const relative = path.relative(repoRoot, resolved);
  const segments = relative.split(path.sep);

  // Disallow certain directories
  const forbidden = ['.git', 'node_modules', '.env'];
  if (segments.some((seg) => forbidden.includes(seg))) {
    return false;
  }

  // No parent directory traversal
  if (relative.includes('..')) {
    return false;
  }

  return true;
}

/**
 * Clean references directory (for testing)
 */
export function cleanReferences(auvId, tenant = 'default') {
  const dir = tenantPath(tenant, `${auvId}/references`);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
