# Cloud Integrations Documentation

## Overview
This document describes the bulletproof implementation of Supabase and TTS Cloud integrations in the Swarm1 system. Both integrations include comprehensive safety checks, error handling, and fallback mechanisms.

## Supabase Integration (cloud.db)

### Features
- **Connectivity Testing**: Validates connection to Supabase instance
- **Schema Management**: Documents and manages database schemas
- **Query Execution**: Safe query execution with result limits
- **Safety Features**:
  - URL sanitization (redacts project IDs in logs)
  - Query result limits (max 100 rows)
  - Comprehensive error handling with fallbacks
  - TEST_MODE for deterministic testing

### Configuration
```bash
# Required environment variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here

# Optional
TEST_MODE=true  # Use TEST_MODE for safe testing
```

### Operations

#### 1. Connectivity Test
```javascript
{
  capability: 'cloud.db',
  input_spec: {
    operation: 'connectivity'
  }
}
```
**Output**: Connection status, latency, and health check

#### 2. Schema Creation
```javascript
{
  capability: 'cloud.db',
  input_spec: {
    operation: 'create_schema',
    schema_name: 'my_schema',
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'serial', primary: true },
          { name: 'email', type: 'varchar(255)', unique: true }
        ]
      }
    ]
  }
}
```
**Output**: Schema documentation (Note: Actual table creation requires SQL permissions)

#### 3. Query Execution
```javascript
{
  capability: 'cloud.db',
  input_spec: {
    operation: 'query',
    table: 'users',
    limit: 10  // Max 100
  }
}
```
**Output**: Query results, execution time, and metadata

### Artifacts Generated
- `connectivity.json`: Connection test results
- `roundtrip.json`: Query execution details
- `schema.json`: Schema documentation
- `query_results.json`: Query result data
- `error.json`: Error reports (if failures occur)

### Safety Mechanisms
1. **URL Redaction**: Project IDs are replaced with `***` in logs
2. **Query Limits**: Maximum 100 rows per query
3. **Error Isolation**: Errors are caught and reported without exposing sensitive data
4. **Fallback Mode**: Graceful degradation to error reporting

## TTS Cloud Integration (audio.tts.cloud)

### Features
- **Multi-Provider Support**: Google, ElevenLabs, and fallback providers
- **Text Processing**: Automatic sanitization and length validation
- **Cost Control**: Enforces $1.00 per request limit
- **Audio Generation**: Creates standard WAV files (44.1kHz, 16-bit)
- **Safety Features**:
  - Text length limit (5000 characters)
  - Cost estimation and enforcement
  - Fallback audio generation
  - Comprehensive error handling

### Configuration
```bash
# Required for live mode
TTS_CLOUD_API_KEY=your-api-key-here

# Optional
TTS_PROVIDER=google  # Options: google, elevenlabs, azure, aws
ELEVENLABS_VOICE_ID=voice-id  # For ElevenLabs provider
TEST_MODE=true  # Use TEST_MODE for safe testing
```

### Supported Providers

#### 1. Google Cloud Text-to-Speech
```javascript
{
  capability: 'audio.tts.cloud',
  input_spec: {
    text: 'Your text here',
    voice: 'en-US-Standard-A'  // Google voice name
  }
}
```
- **Pricing**: ~$16 per 1M characters
- **Voices**: Standard, WaveNet, Neural2
- **Languages**: 40+ languages supported

#### 2. ElevenLabs
```javascript
{
  capability: 'audio.tts.cloud',
  input_spec: {
    text: 'Your text here',
    voice: 'Rachel'  // ElevenLabs voice name (ignored, uses ELEVENLABS_VOICE_ID)
  }
}
```
- **Pricing**: ~$30 per 1M characters
- **Quality**: Premium voice cloning
- **Models**: Monolingual and multilingual

#### 3. Fallback Provider
- Generates placeholder sine wave audio
- Used when provider is unknown or API fails
- Creates valid WAV file with 440Hz tone

### Safety Mechanisms

#### Text Validation
```javascript
// Maximum text length: 5000 characters
const maxTextLength = 5000;
const sanitizedText = text.substring(0, maxTextLength).trim();
```

#### Cost Control
```javascript
// Cost estimation and enforcement
const charCount = sanitizedText.length;
const estimatedCost = charCount * 0.000016; // Google pricing

if (estimatedCost > 1.0) {
  throw new Error(`TTS request too expensive: $${estimatedCost.toFixed(2)}`);
}
```

#### Error Handling
- **API Failures**: Falls back to TEST_MODE audio generation
- **Invalid Keys**: Generates placeholder audio with error report
- **Network Issues**: Comprehensive error logging and recovery

### Artifacts Generated
- `narration.wav`: Generated audio file (WAV format)
- `metadata.json`: TTS metadata and configuration
- `error.json`: Error reports (if failures occur)

### Audio Specifications
- **Format**: WAV (RIFF/WAVE)
- **Sample Rate**: 44,100 Hz
- **Bit Depth**: 16-bit
- **Channels**: Mono (1 channel)
- **Encoding**: Linear PCM

## Testing

### Unit Tests
Run the comprehensive test suite:
```bash
# Test both integrations
node --test tests/agents/synthetic/cloud.integrations.test.mjs

# Test with TEST_MODE
TEST_MODE=true node --test tests/agents/synthetic/cloud.integrations.test.mjs
```

### Test Coverage
1. **Supabase Tests**:
   - Connectivity validation
   - Schema creation
   - Query execution
   - Error handling without credentials
   - URL sanitization

2. **TTS Cloud Tests**:
   - Audio generation in TEST_MODE
   - Text length validation
   - Cost limit enforcement
   - Fallback mechanism
   - Multiple provider support

### Integration Testing
```bash
# Test with mock credentials
SUPABASE_URL=https://test.supabase.co \
SUPABASE_SERVICE_KEY=test-key \
TTS_CLOUD_API_KEY=test-key \
TTS_PROVIDER=google \
node orchestration/lib/tool_executor.mjs
```

## Best Practices

### 1. Always Use TEST_MODE First
```bash
TEST_MODE=true node your-script.js
```

### 2. Validate Credentials
```javascript
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('Supabase key missing, using TEST_MODE');
  process.env.TEST_MODE = 'true';
}
```

### 3. Handle Errors Gracefully
```javascript
try {
  const result = await executeToolRequest({ 
    capability: 'cloud.db',
    // ...
  });
} catch (error) {
  console.error('Integration failed:', error.message);
  // Use fallback or TEST_MODE
}
```

### 4. Monitor Costs
- TTS requests are automatically limited to $1.00
- Database queries are limited to 100 rows
- Always estimate costs before production use

### 5. Security Considerations
- Never log full API keys or URLs
- Sanitize project IDs in logs
- Use service keys only in secure environments
- Rotate keys regularly

## Troubleshooting

### Common Issues

#### Supabase Connection Failed
```
Error: Supabase connection failed: 401
```
**Solution**: Check SUPABASE_SERVICE_KEY is valid and has proper permissions

#### TTS Cost Limit Exceeded
```
Error: TTS request too expensive: $1.23 (limit: $1.00)
```
**Solution**: Reduce text length or split into smaller requests

#### Invalid API Key
```
Error: Google TTS API error: 400 - API key not valid
```
**Solution**: Verify TTS_CLOUD_API_KEY is correct for the provider

#### Fallback Audio Generated
```
Warning: Unknown TTS provider: azure, generating placeholder audio
```
**Solution**: Set TTS_PROVIDER to a supported value (google, elevenlabs)

## Performance Metrics

### Supabase
- **Connectivity Test**: ~50-200ms latency
- **Query Execution**: Depends on query complexity
- **Schema Documentation**: Instant (no DB operations)

### TTS Cloud
- **Google TTS**: ~500ms-2s per request
- **ElevenLabs**: ~1-3s per request
- **Fallback**: Instant (local generation)
- **Max Text**: 5000 characters per request
- **Cost Limit**: $1.00 per request

## Future Enhancements

### Planned Features
1. **Supabase**:
   - Real-time subscriptions
   - Batch operations
   - Migration management
   - Backup/restore operations

2. **TTS Cloud**:
   - SSML support
   - Voice cloning
   - Batch processing
   - Streaming audio
   - Additional providers (Azure, AWS Polly)

### API Stability
Both integrations follow semantic versioning:
- **Current Version**: 1.0.0
- **Breaking Changes**: Major version bump
- **New Features**: Minor version bump
- **Bug Fixes**: Patch version bump

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review test files for examples
3. Enable debug logging: `DEBUG=true`
4. File issues at: https://github.com/your-org/swarm1/issues