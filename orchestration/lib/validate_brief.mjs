import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Ajv with draft-07 support
const ajv = new Ajv({
  strict: false,
  allErrors: true,
  verbose: true,
  schemaId: '$id',
});
addFormats(ajv);

// Load brief schema
const schemaPath = path.join(__dirname, '../../contracts/brief.schema.json');
const briefSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validateBriefSchema = ajv.compile(briefSchema);

/**
 * Parse a brief file (JSON, YAML, or Markdown with frontmatter)
 * @param {string} briefPath - Path to the brief file
 * @returns {object} Parsed brief object
 */
export function parseBriefFile(briefPath) {
  if (!fs.existsSync(briefPath)) {
    throw new Error(`Brief file not found: ${briefPath}`);
  }

  const content = fs.readFileSync(briefPath, 'utf8');
  const ext = path.extname(briefPath).toLowerCase();

  let briefData;

  if (ext === '.json') {
    briefData = JSON.parse(content);
  } else if (ext === '.yaml' || ext === '.yml') {
    briefData = YAML.parse(content);
  } else if (ext === '.md') {
    // Parse markdown with YAML frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      briefData = YAML.parse(frontmatterMatch[1]);
    } else {
      // Try to extract structured data from markdown sections
      briefData = extractFromMarkdown(content);
    }
  } else {
    throw new Error(`Unsupported brief file format: ${ext}`);
  }

  return briefData;
}

/**
 * Extract brief data from markdown structure
 * @param {string} content - Markdown content
 * @returns {object} Extracted brief data
 */
function extractFromMarkdown(content) {
  const brief = {
    business_goals: [],
    must_have: [],
    nice_to_have: [],
    constraints: {},
    sample_urls: [],
    project_context: '',
  };

  // Extract business goals
  const goalsMatch = content.match(/##\s*Business\s+Goals?\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (goalsMatch) {
    brief.business_goals = extractListItems(goalsMatch[1]);
  }

  // Extract must-have features
  const mustHaveMatch = content.match(
    /##\s*Must[\s-]?Have(?:\s+Features?)?\s*\n([\s\S]*?)(?=\n##|$)/i,
  );
  if (mustHaveMatch) {
    brief.must_have = extractListItems(mustHaveMatch[1]);
  }

  // Extract nice-to-have features
  const niceToHaveMatch = content.match(
    /##\s*Nice[\s-]?to[\s-]?Have(?:\s+Features?)?\s*\n([\s\S]*?)(?=\n##|$)/i,
  );
  if (niceToHaveMatch) {
    brief.nice_to_have = extractListItems(niceToHaveMatch[1]);
  }

  // Extract constraints
  const constraintsMatch = content.match(
    /##\s*(?:Constraints?|Budget\s*&?\s*Timeline|Technical\s+Requirements?)\s*\n([\s\S]*?)(?=\n##|$)/i,
  );
  if (constraintsMatch) {
    const constraintText = constraintsMatch[1];

    // Extract budget
    const budgetMatch = constraintText.match(/[Bb]udget[:\s]*\$?([\d,]+(?:\.\d+)?)/);
    if (budgetMatch) {
      brief.constraints.budget_usd = parseFloat(budgetMatch[1].replace(/,/g, ''));
    }

    // Extract timeline
    const timelineMatch = constraintText.match(/[Tt]imeline[:\s]*(\d+)\s*(?:days?|weeks?)/i);
    if (timelineMatch) {
      const value = parseInt(timelineMatch[1]);
      const unit = timelineMatch[0].toLowerCase();
      brief.constraints.timeline_days = unit.includes('week') ? value * 7 : value;
    }

    // Extract tech stack
    const techMatch = constraintText.match(/[Tt]ech(?:nology)?\s*[Ss]tack[:\s]*(.*?)(?:\n|$)/);
    if (techMatch) {
      brief.constraints.tech_stack = techMatch[1]
        .split(/[,、]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }

  // Extract sample URLs
  const urlMatches = content.match(/https?:\/\/[^\s)]+/g);
  if (urlMatches) {
    brief.sample_urls = [...new Set(urlMatches)]; // Unique URLs
  }

  // Extract project context (overview/description)
  const contextMatch = content.match(
    /##\s*(?:Overview|Description|Context|Background)\s*\n([\s\S]*?)(?=\n##|$)/i,
  );
  if (contextMatch) {
    brief.project_context = contextMatch[1].trim();
  }

  return brief;
}

/**
 * Extract list items from markdown text
 * @param {string} text - Markdown text containing list items
 * @returns {string[]} Array of extracted items
 */
function extractListItems(text) {
  const items = [];

  // Match bullet points (-, *, +) and numbered lists
  const listPattern = /^[\s]*(?:[-*+]|\d+\.)\s+(.+)$/gm;
  let match;

  while ((match = listPattern.exec(text)) !== null) {
    let item = match[1].trim();

    // Check for multi-line items (indented continuation)
    const nextLineIndex = match.index + match[0].length;
    const remainingText = text.slice(nextLineIndex);
    const continuationMatch = remainingText.match(/^((?:\n\s{2,}[^\n]+)*)/);

    if (continuationMatch && continuationMatch[1]) {
      item += ' ' + continuationMatch[1].replace(/\n\s+/g, ' ').trim();
    }

    if (item.length > 0) {
      items.push(item);
    }
  }

  return items;
}

/**
 * Validate a brief object against the schema
 * @param {object} brief - Brief object to validate
 * @returns {object} Validation result with { valid, errors, data }
 */
export function validateBrief(brief) {
  const valid = validateBriefSchema(brief);

  const result = {
    valid,
    errors: [],
    data: valid ? brief : null,
  };

  if (!valid && validateBriefSchema.errors) {
    result.errors = validateBriefSchema.errors.map((err) => {
      const field = err.instancePath.replace(/^\//, '').replace(/\//g, '.');
      const message = err.message || 'validation failed';

      switch (err.keyword) {
        case 'required':
          return `Missing required field: ${err.params.missingProperty}`;
        case 'minItems':
          return `${field || 'Field'} must have at least ${err.params.limit} item(s)`;
        case 'maxItems':
          return `${field || 'Field'} must have at most ${err.params.limit} item(s)`;
        case 'minLength':
          return `${field || 'Field'} must be at least ${err.params.limit} characters`;
        case 'type':
          return `${field || 'Field'} must be of type ${err.params.type}`;
        case 'format':
          return `${field || 'Field'} must be a valid ${err.params.format}`;
        default:
          return `${field ? field + ': ' : ''}${message}`;
      }
    });
  }

  return result;
}

/**
 * Validate a brief file
 * @param {string} briefPath - Path to the brief file
 * @returns {object} Validation result with { valid, errors, data }
 */
export function validateBriefFile(briefPath) {
  try {
    const briefData = parseBriefFile(briefPath);
    const result = validateBrief(briefData);

    if (result.valid) {
      // Emit hook for observability
      logHook('BriefValidated', {
        path: briefPath,
        goals: briefData.business_goals?.length || 0,
        features: briefData.must_have?.length || 0,
        budget: briefData.constraints?.budget_usd,
        timeline: briefData.constraints?.timeline_days,
      });
    } else {
      logHook('BriefValidationFailed', {
        path: briefPath,
        errors: result.errors,
      });
    }

    return result;
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to parse brief file: ${error.message}`],
      data: null,
    };
  }
}

/**
 * Log an event to the hooks observability system
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function logHook(event, data) {
  const hookPath = path.join(process.cwd(), 'runs/observability/hooks.jsonl');
  const hookDir = path.dirname(hookPath);

  if (!fs.existsSync(hookDir)) {
    fs.mkdirSync(hookDir, { recursive: true });
  }

  const entry = {
    ts: Date.now() / 1000,
    event,
    module: 'validate_brief',
    ...data,
  };

  fs.appendFileSync(hookPath, JSON.stringify(entry) + '\n', 'utf8');
}

/**
 * CLI-friendly validation with formatted output
 * @param {string} briefPath - Path to the brief file
 * @returns {boolean} True if valid, false otherwise
 */
export function validateBriefCLI(briefPath) {
  console.log(`[validate] Checking brief: ${briefPath}`);

  const result = validateBriefFile(briefPath);

  if (result.valid) {
    console.log('[validate] ✅ Brief is valid');

    if (result.data) {
      console.log('[validate] Summary:');
      console.log(`  - Business goals: ${result.data.business_goals?.length || 0}`);
      console.log(`  - Must-have features: ${result.data.must_have?.length || 0}`);
      console.log(`  - Nice-to-have features: ${result.data.nice_to_have?.length || 0}`);

      if (result.data.constraints?.budget_usd) {
        console.log(`  - Budget: $${result.data.constraints.budget_usd.toLocaleString()}`);
      }
      if (result.data.constraints?.timeline_days) {
        console.log(`  - Timeline: ${result.data.constraints.timeline_days} days`);
      }
      if (result.data.constraints?.tech_stack?.length) {
        console.log(`  - Tech stack: ${result.data.constraints.tech_stack.join(', ')}`);
      }
    }

    return true;
  } else {
    console.error('[validate] ❌ Brief validation failed:');
    result.errors.forEach((err) => {
      console.error(`  - ${err}`);
    });
    return false;
  }
}

// Export for testing
export default {
  parseBriefFile,
  validateBrief,
  validateBriefFile,
  validateBriefCLI,
};
