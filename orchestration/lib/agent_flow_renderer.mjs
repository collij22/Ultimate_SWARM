#!/usr/bin/env node
/**
 * Agent Flow Renderer (Phase 13)
 * 
 * Generates human-readable visualization of subagent activity
 * Produces timeline, sequence diagrams, and step summaries
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read JSONL file and parse events
 */
function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  
  const lines = fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(line => line.trim());
  
  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Collect subagent steps from agent directories
 */
function collectSubagentSteps(agentsDir) {
  const steps = [];
  
  if (!fs.existsSync(agentsDir)) return steps;
  
  const roles = fs.readdirSync(agentsDir);
  for (const role of roles) {
    const roleDir = path.join(agentsDir, role);
    if (!fs.statSync(roleDir).isDirectory()) continue;
    
    const sessions = fs.readdirSync(roleDir);
    for (const session of sessions) {
      const threadPath = path.join(roleDir, session, 'thread.jsonl');
      if (fs.existsSync(threadPath)) {
        const events = readJsonl(threadPath);
        events.forEach(event => {
          steps.push({
            role,
            session,
            timestamp: event.ts || Date.now() / 1000,
            type: event.type || 'message',
            content: event.content || event.message || '',
            tool_calls: event.tool_calls || [],
            artifacts: event.artifacts || []
          });
        });
      }
    }
  }
  
  return steps.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Build timeline from events and steps
 */
function buildTimeline(events, steps) {
  const timeline = {
    start_time: null,
    end_time: null,
    duration: 0,
    nodes: [],
    sequences: [],
    summary: {}
  };
  
  // Combine events and steps
  const allEvents = [
    ...events.map(e => ({ ...e, source: 'hooks' })),
    ...steps.map(s => ({ ...s, source: 'subagent' }))
  ].sort((a, b) => (a.timestamp || a.ts || 0) - (b.timestamp || b.ts || 0));
  
  if (allEvents.length === 0) return timeline;
  
  timeline.start_time = allEvents[0].timestamp || allEvents[0].ts;
  timeline.end_time = allEvents[allEvents.length - 1].timestamp || allEvents[allEvents.length - 1].ts;
  timeline.duration = timeline.end_time - timeline.start_time;
  
  // Group by role/agent
  const byAgent = {};
  allEvents.forEach(event => {
    const agent = event.role || event.agent || event.module || 'main';
    if (!byAgent[agent]) byAgent[agent] = [];
    byAgent[agent].push(event);
  });
  
  // Create timeline nodes
  Object.entries(byAgent).forEach(([agent, agentEvents]) => {
    const node = {
      id: agent,
      label: agent.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      start: agentEvents[0].timestamp || agentEvents[0].ts,
      end: agentEvents[agentEvents.length - 1].timestamp || agentEvents[agentEvents.length - 1].ts,
      events: agentEvents.length,
      tools_used: [],
      artifacts_created: []
    };
    
    // Extract tool usage and artifacts
    agentEvents.forEach(event => {
      if (event.tool_calls) {
        event.tool_calls.forEach(call => {
          if (!node.tools_used.includes(call.tool)) {
            node.tools_used.push(call.tool);
          }
        });
      }
      if (event.artifacts) {
        node.artifacts_created.push(...event.artifacts);
      }
    });
    
    timeline.nodes.push(node);
  });
  
  // Create sequence diagram
  let lastAgent = null;
  allEvents.forEach(event => {
    const agent = event.role || event.agent || event.module || 'main';
    
    if (lastAgent && lastAgent !== agent) {
      timeline.sequences.push({
        from: lastAgent,
        to: agent,
        timestamp: event.timestamp || event.ts,
        message: event.type || 'interaction'
      });
    }
    lastAgent = agent;
  });
  
  // Generate summary
  timeline.summary = {
    total_events: allEvents.length,
    agents_involved: Object.keys(byAgent).length,
    total_tool_calls: allEvents.filter(e => e.tool_calls && e.tool_calls.length > 0).length,
    total_artifacts: allEvents.reduce((sum, e) => sum + (e.artifacts ? e.artifacts.length : 0), 0)
  };
  
  return timeline;
}

/**
 * Render HTML visualization
 */
function renderHtml(flow) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Flow Visualization</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 20px;
    }
    h1 {
      color: #333;
      border-bottom: 2px solid #4CAF50;
      padding-bottom: 10px;
    }
    h2 {
      color: #555;
      margin-top: 30px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .summary-card {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #4CAF50;
    }
    .summary-card h3 {
      margin: 0 0 10px 0;
      color: #666;
      font-size: 14px;
      text-transform: uppercase;
    }
    .summary-card .value {
      font-size: 24px;
      font-weight: bold;
      color: #333;
    }
    .timeline {
      margin: 20px 0;
      position: relative;
      padding: 20px 0;
    }
    .timeline-node {
      background: #fff;
      border: 2px solid #4CAF50;
      border-radius: 6px;
      padding: 15px;
      margin: 10px 0;
      position: relative;
    }
    .timeline-node h4 {
      margin: 0 0 10px 0;
      color: #333;
    }
    .timeline-node .details {
      font-size: 14px;
      color: #666;
      display: grid;
      gap: 5px;
    }
    .timeline-node .tools {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 10px;
    }
    .timeline-node .tool {
      background: #e3f2fd;
      color: #1976d2;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 12px;
    }
    .sequence {
      margin: 20px 0;
      background: #fafafa;
      border-radius: 6px;
      padding: 15px;
    }
    .sequence-item {
      display: flex;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .sequence-item:last-child {
      border-bottom: none;
    }
    .sequence-arrow {
      margin: 0 15px;
      color: #999;
    }
    .sequence-from, .sequence-to {
      background: #f0f0f0;
      padding: 5px 10px;
      border-radius: 4px;
      font-weight: 500;
      min-width: 150px;
      text-align: center;
    }
    .sequence-message {
      flex: 1;
      color: #666;
      font-size: 14px;
      margin-left: 15px;
    }
    .gantt {
      overflow-x: auto;
      margin: 20px 0;
    }
    .gantt-chart {
      position: relative;
      min-height: 200px;
      background: linear-gradient(to right, #f0f0f0 1px, transparent 1px) 0 0 / 10% 100%;
    }
    .gantt-bar {
      position: absolute;
      height: 30px;
      background: linear-gradient(90deg, #4CAF50, #45a049);
      border-radius: 4px;
      color: white;
      padding: 5px 10px;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Agent Flow Visualization</h1>
    
    <div class="summary">
      <div class="summary-card">
        <h3>Duration</h3>
        <div class="value">${flow.duration ? flow.duration.toFixed(2) + 's' : 'N/A'}</div>
      </div>
      <div class="summary-card">
        <h3>Agents</h3>
        <div class="value">${flow.summary?.agents_involved || 0}</div>
      </div>
      <div class="summary-card">
        <h3>Events</h3>
        <div class="value">${flow.summary?.total_events || 0}</div>
      </div>
      <div class="summary-card">
        <h3>Tool Calls</h3>
        <div class="value">${flow.summary?.total_tool_calls || 0}</div>
      </div>
      <div class="summary-card">
        <h3>Artifacts</h3>
        <div class="value">${flow.summary?.total_artifacts || 0}</div>
      </div>
    </div>
    
    <h2>Timeline</h2>
    <div class="timeline">
      ${flow.nodes ? flow.nodes.map(node => `
        <div class="timeline-node">
          <h4>${node.label}</h4>
          <div class="details">
            <span>⏱ Duration: ${((node.end - node.start) || 0).toFixed(2)}s</span>
            <span>📊 Events: ${node.events}</span>
            <span>📁 Artifacts: ${node.artifacts_created.length}</span>
          </div>
          ${node.tools_used.length > 0 ? `
            <div class="tools">
              ${node.tools_used.map(tool => `<span class="tool">${tool}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `).join('') : '<p>No timeline data</p>'}
    </div>
    
    <h2>Sequence Flow</h2>
    <div class="sequence">
      ${flow.sequences && flow.sequences.length > 0 ? flow.sequences.slice(0, 20).map(seq => `
        <div class="sequence-item">
          <span class="sequence-from">${seq.from}</span>
          <span class="sequence-arrow">→</span>
          <span class="sequence-to">${seq.to}</span>
          <span class="sequence-message">${seq.message}</span>
        </div>
      `).join('') : '<p>No sequence data</p>'}
    </div>
    
    <h2>Gantt Chart</h2>
    <div class="gantt">
      <div class="gantt-chart" style="height: ${(flow.nodes ? flow.nodes.length * 40 + 40 : 100)}px">
        ${flow.nodes && flow.start_time ? flow.nodes.map((node, i) => {
          const startPercent = ((node.start - flow.start_time) / flow.duration) * 100;
          const widthPercent = ((node.end - node.start) / flow.duration) * 100;
          return `
            <div class="gantt-bar" style="
              top: ${i * 40 + 10}px;
              left: ${startPercent}%;
              width: ${widthPercent}%;
            ">${node.label}</div>
          `;
        }).join('') : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
  
  return html;
}

/**
 * Main function to render agent flow
 * @param {{
 *   hooksPath?: string,
 *   agentsDir?: string,
 *   outDir: string,
 *   runId?: string
 * }} params
 */
export function renderAgentFlow({ hooksPath, agentsDir, outDir, runId }) {
  // Default paths
  const defaultHooksPath = path.join(__dirname, '../../runs/observability/hooks.jsonl');
  const defaultAgentsDir = path.join(__dirname, '../../runs/agents');
  
  hooksPath = hooksPath || defaultHooksPath;
  agentsDir = agentsDir || defaultAgentsDir;
  
  // Read events and steps
  const events = readJsonl(hooksPath);
  const steps = collectSubagentSteps(agentsDir);
  
  // Build flow
  const flow = buildTimeline(events, steps);
  
  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  // Write JSON output
  const jsonPath = path.join(outDir, 'agent-flow.json');
  fs.writeFileSync(jsonPath, JSON.stringify(flow, null, 2));
  
  // Write HTML output
  const htmlPath = path.join(outDir, 'agent-flow.html');
  fs.writeFileSync(htmlPath, renderHtml(flow));
  
  return {
    flow,
    artifacts: [jsonPath, htmlPath]
  };
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const runId = args[0] || 'latest';
  const outDir = path.join(__dirname, `../../runs/${runId}`);
  
  console.log(`Rendering agent flow for run: ${runId}`);
  const result = renderAgentFlow({ outDir, runId });
  console.log(`Agent flow rendered:`);
  console.log(`  JSON: ${result.artifacts[0]}`);
  console.log(`  HTML: ${result.artifacts[1]}`);
  console.log(`Summary:`, result.flow.summary);
}