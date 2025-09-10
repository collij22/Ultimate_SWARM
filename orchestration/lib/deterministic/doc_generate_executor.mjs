/**
 * Document Generate Executor - Deterministic document generation
 * Creates markdown and HTML reports from audit data
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Generate markdown summary from SEO audit
 */
function generateMarkdownSummary(audit) {
  // Handle different audit structures
  const url = audit.url || audit.audit_url || 'Unknown';
  const timestamp = audit.timestamp || audit.generated_at || new Date().toISOString();
  const source = audit.source || 'automated';
  const score = audit.score || (audit.pages && audit.pages[0] && Math.round((1 - (audit.pages[0].issues || []).length / 10) * 100)) || 0;

  let md = '# SEO Audit Report\n\n';
  md += `**URL:** ${url}\n`;
  md += `**Date:** ${new Date(timestamp).toLocaleString()}\n`;
  md += `**Source:** ${source}\n\n`;

  // Score section
  md += `## Overall Score: ${score}%\n\n`;

  // Score badge
  let badge = '🔴'; // Red for poor
  if (score >= 80) badge = '🟢'; // Green for good
  else if (score >= 60) badge = '🟡'; // Yellow for moderate

  md += `${badge} **${score >= 80 ? 'Good' : score >= 60 ? 'Needs Improvement' : 'Poor'}** SEO Health\n\n`;

  // Summary stats - handle both structures
  md += '### Summary\n\n';
  if (audit.summary) {
    md += `- ✅ **Passed:** ${audit.summary.passed_count || 0} checks\n`;
    md += `- ⚠️ **Warnings:** ${audit.summary.warning_count || 0} items\n`;
    md += `- ❌ **Issues:** ${audit.summary.issue_count || 0} problems\n`;
    md += `- **Total Checks:** ${audit.summary.total_checks || 0}\n\n`;
  } else if (audit.pages && audit.pages[0]) {
    const page = audit.pages[0];
    const issueCount = (page.issues || []).length;
    const warningCount = page.warnings || 0;
    md += `- ❌ **Issues:** ${issueCount} problems\n`;
    md += `- ⚠️ **Warnings:** ${warningCount} items\n\n`;
  }

  // Page information
  md += '### Page Information\n\n';
  md += `**Title:** ${audit.data?.title || 'Not found'}\n\n`;
  md += `**Meta Description:** ${audit.data?.meta_tags?.description || 'Not found'}\n\n`;
  md += `**Canonical URL:** ${audit.data?.canonical_url || 'Not specified'}\n\n`;
  md += `**Robots:** ${audit.data?.robots_directive || 'Not specified'}\n\n`;

  // Critical issues - handle both structures
  const issues = audit.issues || (audit.pages && audit.pages[0] && audit.pages[0].issues) || [];
  if (issues && issues.length > 0) {
    md += '### ❌ Critical Issues\n\n';
    issues.forEach(issue => {
      if (typeof issue === 'string') {
        md += `- ${issue}\n`;
      } else {
        md += `- **${issue.type || 'Issue'}:** ${issue.message || issue}\n`;
      }
    });
    md += '\n';
  }

  // Warnings - handle both structures
  const warnings = audit.warnings || [];
  if (warnings && warnings.length > 0) {
    md += '### ⚠️ Warnings\n\n';
    warnings.slice(0, 10).forEach(warning => {
      if (typeof warning === 'string') {
        md += `- ${warning}\n`;
      } else {
        md += `- **${warning.type || 'Warning'}:** ${warning.message || warning}\n`;
      }
    });
    if (warnings.length > 10) {
      md += `- ... and ${warnings.length - 10} more warnings\n`;
    }
    md += '\n';
  }

  // Passed checks - handle missing passed array
  const passed = audit.passed || [];
  if (passed && passed.length > 0) {
    md += '### ✅ Passed Checks\n\n';
    passed.slice(0, 10).forEach(pass => {
      if (typeof pass === 'string') {
        md += `- ${pass}\n`;
      } else {
        md += `- **${pass.type || 'Check'}:** ${pass.message || pass}\n`;
      }
    });
    if (passed.length > 10) {
      md += `- ... and ${passed.length - 10} more passed checks\n`;
    }
    md += '\n';
  }

  // Content analysis
  md += '### Content Analysis\n\n';
  md += '#### Headings\n';
  md += `- **H1 Tags:** ${audit.data?.headings?.h1?.length || 0}\n`;
  md += `- **H2 Tags:** ${audit.data?.headings?.h2?.length || 0}\n`;
  md += `- **H3 Tags:** ${audit.data?.headings?.h3?.length || 0}\n\n`;

  md += '#### Links\n';
  md += `- **Internal Links:** ${audit.data?.links?.internal_count || 0}\n`;
  md += `- **External Links:** ${audit.data?.links?.external_count || 0}\n\n`;

  md += '#### Images\n';
  md += `- **Total Images:** ${audit.data?.images?.total || 0}\n`;
  md += `- **Images without Alt Text:** ${audit.data?.images?.without_alt || 0}\n\n`;

  md += '#### Structured Data\n';
  md += `- **Schema.org Blocks:** ${audit.data?.structured_data_count || 0}\n\n`;

  // Open Graph
  const ogTags = audit.data?.open_graph ? Object.keys(audit.data.open_graph) : [];
  if (ogTags.length > 0) {
    md += '#### Open Graph Tags\n';
    ogTags.forEach(tag => {
      md += `- **${tag}:** ${audit.data.open_graph[tag]}\n`;
    });
    md += '\n';
  }

  // Recommendations - handle both string and object formats
  const recommendations = audit.recommendations || [];
  if (recommendations && recommendations.length > 0) {
    md += '## Recommendations\n\n';
    recommendations.forEach((rec, index) => {
      if (typeof rec === 'string') {
        md += `${index + 1}. ${rec}\n`;
      } else if (rec && rec.description) {
        const priority = rec.priority ? `[${rec.priority.toUpperCase()}] ` : '';
        md += `${index + 1}. ${priority}${rec.description}\n`;
      }
    });
    md += '\n';
  }

  // Footer
  md += '---\n\n';
  md += '*Generated by Swarm1 SEO Auditor*\n';
  md += `*Timestamp: ${new Date().toISOString()}*\n`;

  return md;
}

/**
 * Generate simple HTML report
 */
function generateHTMLReport(audit) {
  // Handle both structures
  const issues = audit.issues || (audit.pages && audit.pages[0] && audit.pages[0].issues) || [];
  const warnings = audit.warnings || [];
  const passed = audit.passed || [];
  const recommendations = audit.recommendations || [];
  const score = audit.score || (audit.pages && audit.pages[0] && Math.round((1 - (audit.pages[0].issues || []).length / 10) * 100)) || 0;
  const url = audit.url || audit.audit_url || 'Unknown';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SEO Audit Report - ${url}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        h3 { color: #7f8c8d; }
        .score-badge {
            display: inline-block;
            font-size: 48px;
            font-weight: bold;
            padding: 20px;
            border-radius: 50%;
            width: 100px;
            height: 100px;
            text-align: center;
            line-height: 100px;
            margin: 20px 0;
            color: white;
            background: ${score >= 80 ? '#27ae60' : score >= 60 ? '#f39c12' : '#e74c3c'};
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #3498db;
        }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { color: #7f8c8d; font-size: 14px; }
        .issue { color: #e74c3c; }
        .warning { color: #f39c12; }
        .passed { color: #27ae60; }
        ul { padding-left: 20px; }
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        .recommendation {
            background: #e8f4f8;
            border-left: 4px solid #3498db;
            padding: 10px 15px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>SEO Audit Report</h1>
        
        <div class="score-badge">${score}%</div>
        
        <p><strong>URL:</strong> <code>${url}</code></p>
        <p><strong>Date:</strong> ${new Date(audit.timestamp || audit.generated_at || new Date().toISOString()).toLocaleString()}</p>
        <p><strong>Source:</strong> ${audit.source || 'automated'}</p>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value passed">${audit.summary?.passed_count || 0}</div>
                <div class="stat-label">Passed Checks</div>
            </div>
            <div class="stat-card">
                <div class="stat-value warning">${audit.summary?.warning_count || (audit.pages && audit.pages[0] && audit.pages[0].warnings) || 0}</div>
                <div class="stat-label">Warnings</div>
            </div>
            <div class="stat-card">
                <div class="stat-value issue">${audit.summary?.issue_count || (issues && issues.length) || 0}</div>
                <div class="stat-label">Issues</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${audit.summary?.total_checks || 10}</div>
                <div class="stat-label">Total Checks</div>
            </div>
        </div>
        
        <h2>Page Information</h2>
        <ul>
            <li><strong>Title:</strong> ${audit.data?.title || 'Not found'}</li>
            <li><strong>Meta Description:</strong> ${audit.data?.meta_tags?.description || 'Not found'}</li>
            <li><strong>Canonical URL:</strong> ${audit.data?.canonical_url || 'Not specified'}</li>
            <li><strong>Robots:</strong> ${audit.data?.robots_directive || 'Not specified'}</li>
        </ul>
        
        ${(issues && issues.length > 0) ? `
        <h2 class="issue">Critical Issues</h2>
        <ul>
            ${issues.map(issue => {
              if (typeof issue === 'string') {
                return `<li>${issue}</li>`;
              } else {
                return `<li><strong>${issue.type || 'Issue'}:</strong> ${issue.message || issue}</li>`;
              }
            }).join('')}
        </ul>
        ` : ''}
        
        ${(recommendations && recommendations.length > 0) ? `
        <h2>Recommendations</h2>
        ${recommendations.map(rec => {
          if (typeof rec === 'string') {
            return `<div class="recommendation">${rec}</div>`;
          } else if (rec && rec.description) {
            const priority = rec.priority ? `[${rec.priority.toUpperCase()}] ` : '';
            return `<div class="recommendation">${priority}${rec.description}</div>`;
          }
          return '';
        }).join('')}
        ` : ''}
        
        <hr>
        <p><em>Generated by Swarm1 SEO Auditor • ${new Date().toISOString()}</em></p>
    </div>
</body>
</html>`;

  return html;
}

/**
 * Execute document generation
 * @param {Object} params - Execution parameters
 * @param {string} params.format - Output format (markdown, html, both)
 * @param {string} params.tenant - Tenant ID (default: 'default')
 * @param {string} params.runId - Run ID for this execution
 * @returns {Object} Result with status and artifacts
 */
export async function executeDocGenerate(params) {
  const { format = 'both' } = params;

  // Find audit from previous step
  const auditPath = path.resolve('reports/seo/audit.json');

  if (!fs.existsSync(auditPath)) {
    throw new Error(`SEO audit not found at: ${auditPath}. Run seo.audit first.`);
  }

  console.log(`[doc.generate] Reading audit from: ${auditPath}`);

  // Load audit
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));

  // Handle different audit structures
  const url = audit.url || audit.audit_url || 'Unknown';
  const score = audit.score || (audit.pages && audit.pages[0] && Math.round((1 - (audit.pages[0].issues || []).length / 10) * 100)) || 0;

  console.log(`[doc.generate] Generating report for URL: ${url} (score: ${score}%)`);

  const artifacts = [];

  // Generate markdown
  if (format === 'markdown' || format === 'both') {
    const markdown = generateMarkdownSummary(audit);
    const mdPath = path.resolve('reports/seo/summary.md');
    fs.writeFileSync(mdPath, markdown);
    artifacts.push(mdPath);
    console.log(`[doc.generate] Markdown report written to: ${mdPath}`);
  }

  // Generate HTML
  if (format === 'html' || format === 'both') {
    generateMarkdownSummary(audit); // Generate to ensure consistent processing
    const html = generateHTMLReport(audit);
    const htmlPath = path.resolve('reports/seo/summary.html');
    fs.writeFileSync(htmlPath, html);
    artifacts.push(htmlPath);
    console.log(`[doc.generate] HTML report written to: ${htmlPath}`);
  }

  // Extract values for return metadata
  const issues = audit.issues || (audit.pages && audit.pages[0] && audit.pages[0].issues) || [];
  const issueCount = Array.isArray(issues) ? issues.length : 0;
  const warningCount = (audit.pages && audit.pages[0] && audit.pages[0].warnings) || 0;

  return {
    status: 'success',
    message: `Generated ${format} report for SEO audit (score: ${score}%)`,
    artifacts,
    metadata: {
      format,
      score,
      url,
      issues: issueCount,
      warnings: warningCount,
    },
  };
}
