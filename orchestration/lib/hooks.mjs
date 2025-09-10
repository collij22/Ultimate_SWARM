/**
 * Observability Hooks Module
 * Emits events to the observability pipeline
 */

import fs from 'fs';
import path from 'path';

/**
 * Emit a hook event to the observability pipeline
 *
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export async function emitHook(event, data = {}) {
  const hookData = {
    ts: Date.now() / 1000,
    event,
    ...data,
  };

  // Only emit if in an AUV context
  if (!process.env.AUV_ID && !data.auv_id) {
    return;
  }

  try {
    const hooksPath = path.join(process.cwd(), 'runs', 'observability', 'hooks.jsonl');
    const hooksDir = path.dirname(hooksPath);

    // Ensure directory exists
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    // Append to hooks log
    fs.appendFileSync(hooksPath, JSON.stringify(hookData) + '\n');
  } catch (error) {
    // Silently fail - observability should not break execution
    console.warn(`[hooks] Failed to emit ${event}:`, error.message);
  }
}

/**
 * Emit a span event (start/end of operation)
 */
export async function emitSpan(name, operation, metadata = {}) {
  const startTime = Date.now();

  await emitHook(`${name}Start`, {
    span_id: `${name}-${startTime}`,
    ...metadata,
  });

  try {
    const result = await operation();

    await emitHook(`${name}Complete`, {
      span_id: `${name}-${startTime}`,
      ok: true,
      duration_ms: Date.now() - startTime,
      ...metadata,
    });

    return result;
  } catch (error) {
    await emitHook(`${name}Complete`, {
      span_id: `${name}-${startTime}`,
      ok: false,
      error: error.message,
      duration_ms: Date.now() - startTime,
      ...metadata,
    });

    throw error;
  }
}
