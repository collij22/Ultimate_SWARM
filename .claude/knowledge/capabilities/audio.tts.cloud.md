# Cloud TTS - Premium Text-to-Speech Capability

## Overview

The `audio.tts.cloud` capability provides premium text-to-speech synthesis using cloud providers for high-quality narration.

## Requirements

- `TEST_MODE=true` mandatory for all executions
- Secondary consent required (`secondary_consent: true`)
- TTS_CLOUD_API_KEY environment variable
- Budget allocation (typically $0.05 per run)

## Input Specification

```yaml
capability: audio.tts.cloud
input:
  text: 'Text to synthesize'
  text_file: 'path/to/script.txt' # Alternative to inline text
  voice: 'en-US-Wavenet-D' # Premium voice selection
  language: 'en-US'
  speed: 1.0 # 0.5 to 2.0
  pitch: 0 # -20 to 20 semitones
  volume_gain: 0 # -96 to 16 dB
  format: 'wav' # or 'mp3'
```

## Expected Artifacts

- `runs/tts_cloud_demo/narration.wav` - Generated audio file
- `runs/tts_cloud_demo/metadata.json` - Audio metadata

## TEST_MODE Behavior

In TEST_MODE, generates mock audio:

- Creates valid WAV header
- Fills with silence matching text duration
- Duration estimate: ~15 characters per second
- Marked with test_mode: true

## Live Mode Behavior

- Connects to cloud TTS provider
- Uses premium neural voices
- Supports SSML markup
- Automatic retry on failures
- Caches results by text hash

## Voice Options

### Google Cloud Voices (Wavenet)

- en-US-Wavenet-A: Female, neutral
- en-US-Wavenet-B: Male, neutral
- en-US-Wavenet-C: Female, warm
- en-US-Wavenet-D: Male, warm

### Amazon Polly Neural Voices

- Joanna: Female, conversational
- Matthew: Male, conversational
- Ruth: Female, news
- Stephen: Male, news

## Validation

CVF checks for:

- Valid WAV/MP3 file format
- Audio duration within ±5% of expected
- File size reasonable for duration
- Metadata present and valid

## Common Patterns

```javascript
// Simple narration
{
  capability: 'audio.tts.cloud',
  purpose: 'Generate video narration',
  input_spec: {
    text: 'Welcome to our product demo...',
    voice: 'en-US-Wavenet-D',
    speed: 0.95
  },
  constraints: {
    test_mode: true,
    max_cost_usd: 0.05,
    secondary_consent: true
  },
  expected_artifacts: [
    'runs/tts_cloud_demo/narration.wav'
  ]
}

// Script-based narration
{
  capability: 'audio.tts.cloud',
  purpose: 'Convert script to speech',
  input_spec: {
    text_file: 'media/script.txt',
    voice: 'en-US-Wavenet-C',
    speed: 1.0,
    pitch: 2  // Slightly higher pitch
  }
}
```

## SSML Support

```xml
<speak>
  Welcome to <emphasis level="strong">Swarm1</emphasis>.
  <break time="500ms"/>
  This is a <prosody rate="slow">demonstration</prosody>
  of our capabilities.
  <say-as interpret-as="spell-out">API</say-as>
</speak>
```

## Integration Patterns

### With Video Composition

1. Generate script with doc.generate
2. Convert to speech with audio.tts.cloud
3. Combine with slides using video.compose
4. Output final video

### With Translation

1. Translate text with nlp.translate
2. Generate speech in target language
3. Sync with original video timing

## Duration Estimation

- English: ~150 words per minute
- With pauses: ~130 words per minute
- SSML breaks add explicit delays
- Speed parameter scales duration

## Quality Settings

```javascript
{
  // Best quality (slower, more expensive)
  quality: 'premium',
  sample_rate: 48000,
  bit_depth: 24,

  // Standard quality (balanced)
  quality: 'standard',
  sample_rate: 44100,
  bit_depth: 16,

  // Economy (faster, cheaper)
  quality: 'economy',
  sample_rate: 22050,
  bit_depth: 16
}
```

## Cost Optimization

- Cache frequently used phrases
- Batch multiple texts in one request
- Use standard voices for drafts
- Premium voices for final output
- Consider Primary TTS for non-critical audio

## Safety Considerations

- **Never synthesize PII or sensitive data**
- Respect voice actor rights
- Include attribution where required
- Monitor for inappropriate content
- Set reasonable length limits
- Use TEST_MODE for all development

## Error Handling

Common errors and resolutions:

- Missing API key: Set TTS_CLOUD_API_KEY
- Invalid voice: Check supported voice list
- Text too long: Split into chunks
- Rate limited: Implement backoff
- Unsupported language: Verify language code

## Character Limits

- Single request: 5000 characters
- With SSML: 6000 characters
- Batch mode: 50000 characters total
- Script file: No limit (chunked automatically)
