/**
 * Engine Selector (Phase 10b-2)
 *
 * Decides whether a node should run via deterministic engine or claude subagent gateway.
 * Rules (docs/conversion.md):
 * - Node param `execution` overrides global: `claude|deterministic`.
 * - Global modes: deterministic | claude | hybrid.
 * - Hybrid: only roles in includes set (and not in excludes) use claude.
 * - Deterministic nodes for gating/packaging remain deterministic.
 */

/**
 * Determine role id for a node.
 * Falls back to A2.requirements_analyst for agent_task without explicit role/agent.
 * @param {any} node
 */
export function deriveRoleForNode(node) {
  const params = node?.params || {};
  return (
    params.role ||
    params.agent ||
    (node.type === 'agent_task' ? 'A2.requirements_analyst' : 'A1.orchestrator')
  );
}

/**
 * Whether a deterministic-only node type should never be delegated.
 * @param {string} type
 */
export function isDeterministicOnlyNode(type) {
  // CVF, lighthouse, playwright, package, report, server are deterministic
  return ['cvf', 'lighthouse', 'playwright', 'package', 'report', 'server'].includes(type);
}

/**
 * Select engine for a node.
 * @param {any} node
 * @param {{ mode: 'deterministic'|'claude'|'hybrid', include?: string[], exclude?: string[] }} cfg
 * @returns {'deterministic'|'claude'}
 */
export function selectEngine(node, cfg) {
  // Hard guardrails
  if (isDeterministicOnlyNode(node.type)) return 'deterministic';

  const override = node?.params?.execution;
  if (override === 'claude') return 'claude';
  if (override === 'deterministic') return 'deterministic';

  const mode = cfg.mode || 'deterministic';
  if (mode === 'deterministic') return 'deterministic';
  if (mode === 'claude') return 'claude';

  // Hybrid mode
  const roleId = deriveRoleForNode(node);
  const include = new Set((cfg.include || []).map((s) => s.trim()).filter(Boolean));
  const exclude = new Set((cfg.exclude || []).map((s) => s.trim()).filter(Boolean));
  if (exclude.has(roleId)) return 'deterministic';
  if (include.size === 0) return 'deterministic';
  return include.has(roleId) ? 'claude' : 'deterministic';
}
