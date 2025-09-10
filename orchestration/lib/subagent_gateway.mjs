#!/usr/bin/env node
// @ts-nocheck
/**
 * Subagent Gateway (Phase 10b-1)
 *
 * Plan Mode-only driver for Claude subagents with:
 * - Request/response schema validation (Ajv)
 * - Stop conditions (max steps, seconds, budget)
 * - Transcript persistence (JSONL) under runs/agents/<role>/<session>/thread.jsonl
 * - Observability events to runs/observability/hooks.jsonl
 *
 * NOTE: Tool execution is NOT performed here (Phase 10b-3). This gateway only
 * mediates the reasoning loop and produces structured plans and tool_requests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import Ajv from 'ajv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNS_DIR = path.join(REPO_ROOT, 'runs');
const OBS_HOOKS = path.join(RUNS_DIR, 'observability', 'hooks.jsonl');
const SCHEMAS_DIR = path.join(REPO_ROOT, 'schemas');

/**
 * Ensure directory exists.
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Append a structured event to hooks.jsonl
 * Falls back to direct file write if router helper is unavailable.
 * @param {Record<string, unknown>} event
 */
async function appendHookEvent(event) {
  try {
    // Try to reuse router helper for consistency if available
    // Dynamic import to avoid hard dependency
    const routerPath = path.join(REPO_ROOT, 'mcp', 'router.mjs');
    if (fs.existsSync(routerPath)) {
      const { appendToHooks } = await import(pathToFileUrl(routerPath));
      if (typeof appendToHooks === 'function') {
        appendToHooks(event);
        return;
      }
    }
  } catch {
    // ignore and fallback
  }

  ensureDir(path.dirname(OBS_HOOKS));
  const entry = { ts: Date.now() / 1000, module: 'subagent_gateway', ...event };
  fs.appendFileSync(OBS_HOOKS, JSON.stringify(entry) + '\n');
}

/**
 * Convert filesystem path to file URL string (for dynamic ESM import)
 * @param {string} p
 */
function pathToFileUrl(p) {
  const u = new URL('file://');
  // Ensure absolute path with forward slashes
  const abs = path.resolve(p).replace(/\\/g, '/');
  u.pathname = abs.startsWith('/') ? abs : `/${abs}`;
  return u.href;
}

/**
 * Load and compile JSON schema with Ajv.
 * @param {string} schemaFile - filename under schemas/
 */
function loadSchema(schemaFile) {
  const fullPath = path.join(SCHEMAS_DIR, schemaFile);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Schema not found: ${schemaFile}`);
  }
  const raw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(raw);
}

const ajv = new Ajv({ allErrors: true, strict: false });
const REQUEST_SCHEMA = loadSchema('subagent-request.schema.json');
const RESPONSE_SCHEMA = loadSchema('subagent-response.schema.json');
const validateRequest = ajv.compile(REQUEST_SCHEMA);
const validateResponse = ajv.compile(RESPONSE_SCHEMA);

/**
 * Get default stop conditions from environment.
 * @returns {{maxSteps:number, maxSeconds:number, maxCostUsd:number, testMode:boolean}}
 */
export function getDefaultSubagentOptionsFromEnv() {
  const maxSteps = Number.parseInt(process.env.SUBAGENT_MAX_STEPS || '6', 10);
  const maxSeconds = Number.parseInt(process.env.SUBAGENT_MAX_SECONDS || '120', 10);
  const maxCostUsd = Number.parseFloat(process.env.SUBAGENT_MAX_COST_USD || '0.5');
  const testMode = String(process.env.TEST_MODE || 'true').toLowerCase() === 'true';
  return { maxSteps, maxSeconds, maxCostUsd, testMode };
}

/**
 * Append a JSON object as a line to a transcript file (JSONL)
 * @param {string} transcriptPath
 * @param {Record<string, unknown>} obj
 */
function appendTranscript(transcriptPath, obj) {
  ensureDir(path.dirname(transcriptPath));
  fs.appendFileSync(transcriptPath, JSON.stringify(obj) + '\n');
}

/**
 * Minimal default adapter that simulates subagent output in dry mode.
 * Replace by providing options.adapter to runSubagent.
 * @param {{system:string, messages:Array<{role:string, content:string}>}} _input
 * @returns {Promise<{role:'assistant', content:string}>}
 */
async function defaultAdapter(_input) {
  // Default adapter returns a dummy response with empty tool_requests
  const dummy = {
    plan: [
      'Understand requirements and constraints',
      'Propose safe tool_requests within TEST_MODE and budgets',
      'Iterate until acceptance criteria are satisfied',
    ],
    tool_requests: [],
  };
  return { role: 'assistant', content: JSON.stringify(dummy) };
}

/**
 * Compose the system prompt for a subagent.
 * @param {string} roleId
 * @param {boolean} testMode
 * @returns {string}
 */
function composeSystemPrompt(roleId, testMode) {
  const safety = [
    'You operate in Plan Mode only: propose a plan, tool_requests, and diffs/changesets; do not execute tools or mutate files.',
    'Honor OUTPUT_STANDARDS; validate final outputs against provided schemas.',
    'Prefer Primary tools. Secondary tools require consent and budget. Gated capabilities require TEST_MODE.',
  ];
  return [`Role: ${roleId}`, ...safety, `TEST_MODE: ${testMode ? 'true' : 'false'}`].join('\n');
}

/**
 * Build the first user message with structured context.
 * @param {{goal:string, context:Record<string, unknown>}} req
 */
function buildFirstUserMessage(req) {
  const { goal, context } = req;
  const payload = {
    goal,
    acceptance: context.acceptance || null,
    allowed_capabilities: context.allowed_capabilities || null,
    budgets: context.budgets || null,
    artifact_conventions: context.artifact_conventions || 'runs/**',
    node_context: context.node_context || null,
    guidance: {
      tool_request_shape: {
        capability: 'string',
        purpose: 'string',
        input_spec: 'object',
        expected_artifacts: ['runs/<AUV>/...'],
        constraints: { test_mode: true, max_cost_usd: 0.02 },
        acceptance: ['string'],
        cost_estimate_usd: 0.01,
      },
    },
  };
  return JSON.stringify(payload);
}

/**
 * Run a subagent in Plan Mode with stop conditions and transcript persistence.
 *
 * @param {{
 *   role_id: string,
 *   goal: string,
 *   context: Record<string, unknown>,
 *   options?: { maxSteps?: number, maxSeconds?: number, maxCostUsd?: number, testMode?: boolean, secondaryConsent?: boolean, consentToken?: string },
 *   session_id?: string,
 * }} request
 * @param {{ adapter?: (input:{system:string, messages:Array<{role:string, content:string}>})=>Promise<{role:'assistant', content:string}> }} [opts]
 * @returns {Promise<{ ok: boolean, errors?: string[], transcript_path: string, steps: number, result?: any, escalation?: any }>}
 */
export async function runSubagent(request, opts = {}) {
  const errors = [];
  // Validate request
  if (!validateRequest(request)) {
    const msgs = (validateRequest.errors || []).map((e) => `${e.instancePath} ${e.message}`);
    return { ok: false, errors: msgs, transcript_path: '', steps: 0 };
  }

  const { role_id: roleId, goal } = request;
  const options = { ...getDefaultSubagentOptionsFromEnv(), ...(request.options || {}) };
  const adapter = opts.adapter || defaultAdapter;

  // Check for consent token to authorize Secondary tools
  const hasSecondaryConsent = options.secondaryConsent || !!options.consentToken;

  // Prepare paths
  const sessionId = request.session_id || `SAG-${crypto.randomUUID().slice(0, 8)}`;
  const agentDir = path.join(RUNS_DIR, 'agents', roleId, sessionId);
  ensureDir(agentDir);
  const transcriptPath = path.join(agentDir, 'thread.jsonl');

  await appendHookEvent({ event: 'SubagentStart', role_id: roleId, session_id: sessionId, goal });

  const startedAt = Date.now();
  let steps = 0;
  let consumedSeconds = 0;
  const spentUsd = 0;
  let lastAssistantJson = null;

  // Compose prompts
  const system = composeSystemPrompt(roleId, options.testMode);
  const firstUser = buildFirstUserMessage(request);

  appendTranscript(transcriptPath, { role: 'system', content: system });
  appendTranscript(transcriptPath, { role: 'user', content: firstUser });

  // Main loop (reasoning only; no tool execution here)
  while (steps < options.maxSteps) {
    steps += 1;

    const assistant = await adapter({ system, messages: [{ role: 'user', content: firstUser }] });

    appendTranscript(transcriptPath, {
      role: 'assistant',
      content: assistant.content,
      step: steps,
    });

    // Attempt to parse JSON content produced by subagent
    /** @type {any} */
    let parsed;
    try {
      const parsedJson = JSON.parse(assistant.content);
      parsed = parsedJson;
    } catch (e) {
      errors.push('assistant_response_not_json');
      break;
    }

    // If no tool_requests provided, synthesize one from node context capability to enable handshake demo
    try {
      const cap = /** @type {any} */ (request?.context?.node_context)?.params?.capability;
      if (cap && (!parsed.tool_requests || parsed.tool_requests.length === 0)) {
        const placeholderArtifact = `runs/agents/${request.role_id}/${sessionId}/auto_${cap}.json`;
        parsed.tool_requests = [
          {
            capability: String(cap),
            purpose: `auto-synthesized request for ${cap}`,
            input_spec: /** @type {any} */ (request?.context?.node_context)?.params?.input || {},
            hints: /** @type {any} */ (request?.context?.node_context)?.params?.hints || undefined,
            expected_artifacts: [placeholderArtifact],
            constraints: { test_mode: true, max_cost_usd: 0.05, side_effects: [] },
            acceptance: ['expected_artifacts exist'],
            cost_estimate_usd: 0.01,
          },
        ];
      }
    } catch {
      /* ignore */
    }

    // Validate response shape (plan/tool_requests minimal guarantees)
    if (!validateResponse(parsed)) {
      const msgs = (validateResponse.errors || []).map((e) => `${e.instancePath} ${e.message}`);
      errors.push(...msgs);
      break;
    }

    lastAssistantJson = parsed;

    // Check for Secondary tool proposals without consent
    let escalation = null;
    if (!hasSecondaryConsent && parsed.tool_requests && parsed.tool_requests.length > 0) {
      // Check if any tool_requests require Secondary tools
      // In a real implementation, we'd check against registry/policies
      // For now, check for known Secondary capabilities
      const secondaryCapabilities = ['payments.test', 'cloud.db', 'audio.tts.cloud'];
      const requiresSecondary = parsed.tool_requests.some(
        (req) =>
          secondaryCapabilities.includes(req.capability) ||
          (req.capability === 'web.crawl' && req.input_spec?.max_pages > 100),
      );

      if (requiresSecondary) {
        // Generate escalation per agent-escalation.schema.json
        escalation = {
          type: 'escalation',
          reason: 'secondary_consent_required',
          description: 'Secondary tools requested without consent',
          proposed_tools: parsed.tool_requests
            .filter(
              (req) =>
                secondaryCapabilities.includes(req.capability) ||
                (req.capability === 'web.crawl' && req.input_spec?.max_pages > 100),
            )
            .map((req) => ({
              capability: req.capability,
              estimated_cost_usd: req.cost_estimate_usd || 0.05,
              rationale: req.purpose,
              required_env_keys: [], // Would be populated from registry
            })),
          resolution: {
            option_1: 'Provide consent_token to authorize Secondary tools',
            option_2: 'Modify requirements to use Primary tools only',
          },
          session_id: sessionId,
        };

        // Save escalation
        const escalationPath = path.join(agentDir, 'escalation.json');
        fs.writeFileSync(escalationPath, JSON.stringify(escalation, null, 2));

        await appendHookEvent({
          event: 'SecondaryEscalation',
          role_id: roleId,
          session_id: sessionId,
          reason: 'secondary_consent_required',
        });

        errors.push('secondary_consent_required');
        break; // Exit loop on escalation
      }
    }

    await appendHookEvent({
      event: 'PlanUpdated',
      role_id: roleId,
      session_id: sessionId,
      step: steps,
      // @ts-ignore - parsed is validated by schema
      plan_length: Array.isArray(parsed.plan) ? parsed.plan.length : 0,
      // @ts-ignore - parsed is validated by schema
      tool_request_count: Array.isArray(parsed.tool_requests) ? parsed.tool_requests.length : 0,
    });

    // Stop if a final key is present or no further tool_requests/plan deltas are suggested
    // @ts-ignore - parsed is validated by schema
    const hasNext = Array.isArray(parsed.tool_requests) && parsed.tool_requests.length > 0;
    if (!hasNext) break;

    // Check time budget
    consumedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    if (consumedSeconds >= options.maxSeconds) {
      errors.push('time_budget_exceeded');
      break;
    }

    // Check cost budget (note: tool costs are added in Phase 10b-3; keep zero here)
    if (spentUsd > options.maxCostUsd) {
      errors.push('cost_budget_exceeded');
      break;
    }

    // In Phase 10b-1 we do not execute tools; loop once and exit to persist plan
    break;
  }

  await appendHookEvent({
    event: 'SubagentStop',
    role_id: roleId,
    session_id: sessionId,
    steps,
    duration_ms: Date.now() - startedAt,
    errors_count: errors.length,
  });

  const ok = errors.length === 0 && !!lastAssistantJson;

  // Check if there's an escalation file
  let escalation = null;
  const escalationPath = path.join(path.dirname(transcriptPath), 'escalation.json');
  if (fs.existsSync(escalationPath)) {
    escalation = JSON.parse(fs.readFileSync(escalationPath, 'utf8'));
  }

  // Persist result summary alongside transcript for convenience
  const resultPath = path.join(path.dirname(transcriptPath), 'result-gateway.json');
  const result = {
    ok,
    errors,
    steps,
    consent_state: {
      secondary_consent: hasSecondaryConsent,
      consent_token: options.consentToken || null,
    },
    summary: ok
      ? {
          // @ts-ignore - lastAssistantJson is typed as any
          plan_length: lastAssistantJson?.plan?.length || 0,
          // @ts-ignore - lastAssistantJson is typed as any
          tool_request_count: lastAssistantJson?.tool_requests?.length || 0,
        }
      : null,
    response: lastAssistantJson || null,
    escalation: escalation || null,
  };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

  return { ok, errors, transcript_path: transcriptPath, steps, result, escalation };
}

// Optional CLI for local smoke (no network; dry adapter only)
if (
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/')) ||
  process.argv[1]?.endsWith('subagent_gateway.mjs')
) {
  const args = process.argv.slice(2);
  if (args[0] === 'smoke') {
    const role = args[1] || 'A2.requirements_analyst';
    const goal = args.slice(2).join(' ') || 'Produce a minimal plan and zero tool_requests';
    runSubagent({
      role_id: role,
      goal,
      context: { allowed_capabilities: ['docs.search', 'web.search'], acceptance: ['emit plan'] },
    })
      .then((out) => {
        console.log('Subagent smoke result:', out.ok ? 'OK' : 'ERR');
        console.log('Transcript:', out.transcript_path);
        process.exit(out.ok ? 0 : 1);
      })
      .catch((e) => {
        console.error('Smoke error:', e.message);
        process.exit(1);
      });
  }
}
