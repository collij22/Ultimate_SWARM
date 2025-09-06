import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateBrief } from '../../orchestration/lib/validate_brief.mjs';
import fs from 'fs';
import path from 'path';

describe('validate_brief', () => {
  it('should validate a correct brief', () => {
    const brief = {
      business_goals: ['Build an e-commerce platform'],
      must_have: ['Product catalog', 'Shopping cart'],
      nice_to_have: ['Reviews system'],
      constraints: {
        budget_usd: 5000,
        timeline_days: 30
      }
    };
    
    const result = validateBrief(brief);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should catch missing required fields', () => {
    const brief = {
      must_have: ['Product catalog']
    };
    
    const result = validateBrief(brief);
    assert.strictEqual(result.valid, false);
    assert(result.errors.some(e => e.includes('business_goals')));
  });

  it('should validate budget constraints', () => {
    const brief = {
      business_goals: ['Build platform'],
      must_have: ['Feature A'],
      constraints: {
        budget_usd: 'invalid'
      }
    };
    
    const result = validateBrief(brief);
    assert.strictEqual(result.valid, false);
    assert(result.errors.some(e => e.includes('budget_usd')));
  });

  it('should parse markdown brief format', () => {
    const mdContent = `
# Project Brief

## Business Goals
- Build e-commerce marketplace
- Support 1000+ vendors

## Must Have
- Product catalog
- Shopping cart
- Checkout flow

## Nice to Have
- Reviews
- Wishlist

## Constraints
- Budget: $5000
- Timeline: 30 days
`;
    
    const brief = parseBriefFromMarkdown(mdContent);
    assert(Array.isArray(brief.business_goals));
    assert(brief.business_goals.length === 2);
    assert(Array.isArray(brief.must_have));
    assert(brief.must_have.length === 3);
  });
});

// Helper function from validate_brief.mjs
function parseBriefFromMarkdown(content) {
  const brief = {
    business_goals: [],
    must_have: [],
    nice_to_have: [],
    constraints: {}
  };

  const sections = content.split(/^## /m);
  
  for (const section of sections) {
    const lines = section.trim().split('\n');
    const header = lines[0]?.toLowerCase();
    
    if (header?.includes('business') || header?.includes('goal')) {
      brief.business_goals = lines.slice(1)
        .filter(l => l.trim().startsWith('-'))
        .map(l => l.replace(/^-\s*/, '').trim());
    } else if (header?.includes('must')) {
      brief.must_have = lines.slice(1)
        .filter(l => l.trim().startsWith('-'))
        .map(l => l.replace(/^-\s*/, '').trim());
    } else if (header?.includes('nice')) {
      brief.nice_to_have = lines.slice(1)
        .filter(l => l.trim().startsWith('-'))
        .map(l => l.replace(/^-\s*/, '').trim());
    } else if (header?.includes('constraint')) {
      lines.slice(1).forEach(line => {
        if (line.includes('Budget:')) {
          const match = line.match(/\$?([\d,]+)/);
          if (match) brief.constraints.budget_usd = parseInt(match[1].replace(/,/g, ''));
        }
        if (line.includes('Timeline:')) {
          const match = line.match(/(\d+)/);
          if (match) brief.constraints.timeline_days = parseInt(match[1]);
        }
      });
    }
  }
  
  return brief;
}