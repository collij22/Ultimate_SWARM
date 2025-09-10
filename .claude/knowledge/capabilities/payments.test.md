# Payments Test - Stripe Capability

## Overview

The `payments.test` capability enables payment flow validation using Stripe's test mode APIs.

## Requirements

- `TEST_MODE=true` mandatory for all executions
- Secondary consent required (`secondary_consent: true`)
- STRIPE_API_KEY environment variable (test keys only)
- Budget allocation (typically $0.05 per run)

## Input Specification

```yaml
capability: payments.test
input:
  amount: 1999 # Amount in cents ($19.99)
  currency: 'usd'
  description: 'Test payment for demo'
  customer_email: 'test@example.com'
  metadata:
    order_id: 'ORD-123'
    product: 'Demo Product'
```

## Expected Artifacts

- `runs/payments_demo/payment_intent.json` - Payment intent object
- `runs/payments_demo/charge.json` - Charge record
- `runs/payments_demo/validation.json` - Validation results

## TEST_MODE Behavior

In TEST_MODE, synthesizes test payment data:

- Generates payment*intent with test ID pattern (pi_test*\*)
- Creates succeeded status
- Includes test_mode: true flag
- No actual Stripe API calls

## Live Mode Behavior (Test Keys Only)

- Uses Stripe test mode API keys
- Creates real test payment intents
- Never processes actual payments
- All IDs prefixed with test indicators

## Validation

CVF checks for:

- Payment intent status === 'succeeded'
- Charge record with paid: true
- Matching amounts and currency
- Valid test mode indicators

## Common Patterns

```javascript
// Payment processing flow
{
  capability: 'payments.test',
  purpose: 'Validate checkout payment flow',
  input_spec: {
    amount: 2499,  // $24.99
    currency: 'usd',
    description: 'Test subscription payment',
    customer_email: 'customer@test.com'
  },
  constraints: {
    test_mode: true,  // Mandatory
    max_cost_usd: 0.05,
    secondary_consent: true
  },
  expected_artifacts: [
    'runs/payments_demo/payment_intent.json',
    'runs/payments_demo/charge.json'
  ],
  acceptance: [
    'payment_intent.status === "succeeded"',
    'charge.paid === true',
    'amount matches input'
  ]
}
```

## Integration Patterns

### With Receipt Generation

1. Execute payments.test for payment processing
2. Use payment_intent.json for receipt data
3. Generate receipt with doc.generate capability

### With Order Fulfillment

1. Validate payment succeeded
2. Update order status
3. Trigger fulfillment workflow

## Safety Considerations

- **NEVER use production API keys**
- Always verify test_mode flag in responses
- Redact any sensitive data in logs
- Use test card numbers only (4242 4242 4242 4242)
- Monitor for accidental production key usage

## Test Card Numbers

- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002
- Requires auth: 4000 0025 0000 3155
- Expired: 4000 0000 0000 0069

## Error Handling

Common errors and resolutions:

- Missing API key: Set STRIPE_API_KEY env var
- Invalid amount: Ensure positive integer in cents
- Currency not supported: Use standard ISO codes
- Test mode required: Ensure TEST_MODE=true
