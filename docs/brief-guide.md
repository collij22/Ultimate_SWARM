# Brief Guide - Writing Project Briefs for Swarm1

## Overview

This guide explains how to write effective project briefs that the Swarm1 AUV Compiler can transform into executable capabilities. A well-structured brief ensures accurate requirement extraction and optimal AUV generation.

## Brief Format

Briefs can be written in Markdown (.md), YAML (.yaml), or JSON (.json) format. Markdown is recommended for readability and ease of editing.

## Required Sections

### 1. Business Goals

**Purpose**: Define high-level objectives the project aims to achieve  
**Format**: List of 1-10 clear, measurable goals  
**Example**:

```markdown
## Business Goals

- Launch a minimum viable marketplace within 3 weeks
- Support 1000+ vendors in the first year
- Process 10,000 orders per month within 6 months
```

### 2. Must Have Features

**Purpose**: Essential features that must be delivered  
**Format**: List of specific, actionable features (1-20 items)  
**Example**:

```markdown
## Must Have Features

- Product catalog with search and filtering
- Shopping cart with persistent state
- Guest checkout with optional account creation
- Secure payment processing
```

## Optional Sections

### 3. Nice to Have Features

**Purpose**: Additional features that add value but aren't critical  
**Format**: List of enhancement features  
**Example**:

```markdown
## Nice to Have Features

- Product recommendations
- Social sharing buttons
- Advanced analytics dashboard
```

### 4. Constraints

**Purpose**: Project limitations and requirements  
**Fields**:

- `budget_usd`: Maximum budget in USD
- `timeline_days`: Project duration in days
- `tech_stack`: Preferred technologies
- `environments`: Target deployment environments

**Example**:

```markdown
## Constraints

- Budget: $8,000
- Timeline: 21 days (3 weeks)
- Tech Stack: Node.js, React, PostgreSQL
- Deployment: AWS or Vercel
```

### 5. Technical Requirements

**Purpose**: Non-functional requirements and performance criteria  
**Example**:

```markdown
## Technical Requirements

- Handle 1000+ concurrent users
- Page load times under 3 seconds
- 99.9% uptime SLA
- Mobile-responsive design
```

### 6. Sample URLs

**Purpose**: Reference sites for inspiration or feature comparison  
**Format**: List of URLs with descriptions  
**Example**:

```markdown
## Sample URLs

- https://www.etsy.com (marketplace features)
- https://www.shopify.com (vendor tools)
```

## Brief Schema

Briefs are validated against a JSON Schema (contracts/brief.schema.json):

```json
{
  "business_goals": ["array of strings", "required"],
  "must_have": ["array of strings", "required"],
  "nice_to_have": ["array of strings", "optional"],
  "constraints": {
    "budget_usd": "number",
    "timeline_days": "integer",
    "tech_stack": ["array of strings"],
    "environments": ["array of strings"]
  },
  "sample_urls": ["array of URIs"]
}
```

## Writing Effective Briefs

### Best Practices

1. **Be Specific**: Instead of "user management", write "user registration with email verification"
2. **Use Action Words**: Start features with verbs like "Display", "Calculate", "Process", "Generate"
3. **Include Context**: Explain why features are needed and how they'll be used
4. **Quantify Requirements**: Use numbers for performance, scale, and timeline requirements
5. **Prioritize Clearly**: Distinguish between must-have and nice-to-have features

### Common Patterns

The compiler recognizes these patterns and generates appropriate AUVs:

#### E-commerce

Keywords: shop, cart, product, catalog, checkout, payment, order
Generates: Product catalog, shopping cart, checkout flow AUVs

#### SaaS Dashboard

Keywords: dashboard, analytics, report, metrics, charts
Generates: Dashboard, analytics, reporting AUVs

#### Authentication

Keywords: login, signup, auth, user, account, profile
Generates: Authentication, user management AUVs

#### API/Integration

Keywords: api, endpoint, webhook, integration, service
Generates: API gateway, data endpoint AUVs

## Validation

Validate your brief before compilation:

```bash
# Validate brief structure
node orchestration/cli.mjs validate brief briefs/demo-01/brief.md

# Or use npm script
npm run validate:brief briefs/demo-01/brief.md
```

## Compilation

Transform your brief into AUVs:

```bash
# Full compilation (uses Requirements Analyst)
node orchestration/cli.mjs plan briefs/demo-01/brief.md

# Dry-run mode (uses heuristic extraction)
node orchestration/cli.mjs plan briefs/demo-01/brief.md --dry-run

# Or use npm scripts
npm run plan:demo
npm run plan:demo:dry
```

## Output

The compiler generates:

1. **Individual AUV files**: `capabilities/AUV-01xx.yaml`
   - Complete specifications with acceptance criteria
   - Authoring hints for test generation
   - Dependencies and estimates

2. **Backlog file**: `capabilities/backlog.yaml`
   - Ordered list of all AUVs
   - Dependency graph
   - Total estimates (complexity, time, cost)

3. **Requirements report**: `reports/requirements/<RUN-ID>.json`
   - Extracted capabilities
   - Risk analysis
   - Technical requirements

## Example Brief

See `briefs/demo-01/brief.md` for a complete example of an e-commerce marketplace brief that generates 8+ AUVs.

## Troubleshooting

### Brief validation fails

- Check required fields are present (business_goals, must_have)
- Ensure proper formatting (arrays for lists, numbers for budget)
- Validate against schema: `contracts/brief.schema.json`

### Too few AUVs generated

- Add more specific features to must_have section
- Include technical details that suggest implementation
- Use recognized keywords for your domain

### Dependencies incorrect

- Ensure logical feature ordering in brief
- Explicitly state dependencies in feature descriptions
- Review generated `backlog.yaml` and adjust brief accordingly

### Estimates seem wrong

- Provide more detail about feature complexity
- Include performance requirements
- Specify integration points and external dependencies

## Next Steps

After successful compilation:

1. Review generated AUVs in `capabilities/` directory
2. Validate specific AUVs: `node orchestration/cli.mjs validate auv AUV-0101`
3. Run first AUV: `node orchestration/cli.mjs AUV-0101`
4. Monitor progress via result cards in `runs/<AUV-ID>/`

## Advanced Usage

### Custom Templates

Modify `capabilities/templates/AUV-TEMPLATE.yaml` to customize AUV structure.

### Agent Configuration

Adjust heuristic patterns in `orchestration/lib/call_agent.mjs` for domain-specific extraction.

### Budget Tuning

Update complexity scoring in `orchestration/lib/auv_compiler.mjs` based on your team's velocity.

## Support

For issues or improvements:

- Check existing AUV examples in `capabilities/`
- Review test authoring compatibility in `orchestration/lib/test_authoring.mjs`
- Examine hooks logs: `tail -n 50 runs/observability/hooks.jsonl`
