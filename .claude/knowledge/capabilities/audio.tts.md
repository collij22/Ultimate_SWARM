# Audio TTS (Text-to-Speech) Capability

## Overview

The `audio.tts` capability converts text scripts into audio narration files using text-to-speech engines.

## Tools Required

- **Primary**: `tts-piper` - Local Piper TTS engine
- **Secondary**: `tts.cloud` - Cloud-based TTS services

## Artifacts Produced

### Required Artifacts

1. **media/script.txt** - Source text for narration
2. **media/narration.wav** - Generated audio file
3. **media/compose-metadata.json** - TTS metadata including:
   - Word count
   - Duration
   - Voice settings
   - Language

## Implementation Pattern

```javascript
// 1. Prepare script
const script = `
Welcome to our data insights presentation.
Today we'll explore the key findings from our analysis.
First, let's look at the revenue trends.
`;

fs.writeFileSync('media/script.txt', script);

// 2. Count words for estimation
const wordCount = script.split(/\s+/).filter((w) => w.length > 0).length;
const estimatedDuration = (wordCount / 150) * 60; // 150 words per minute

// 3. Generate audio with Piper
const ttsCommand = `
  echo "${script}" | piper \
    --model en_US-amy-medium \
    --output_file media/narration.wav
`;

// Alternative with more control:
const ttsConfig = {
  text: script,
  voice: 'en_US-amy-medium',
  speed: 1.0,
  pitch: 1.0,
  output: 'media/narration.wav',
};

// 4. Verify audio generation
const audioInfo = await getAudioInfo('media/narration.wav');

// 5. Create metadata
const metadata = {
  tts_metadata: {
    engine: 'piper',
    voice: 'en_US-amy-medium',
    language: 'en-US',
    speed: 1.0,
    word_count: wordCount,
    estimated_duration_s: estimatedDuration,
    actual_duration_s: audioInfo.duration,
  },
};
```

## Voice Selection

### Piper Voices

```javascript
const piperVoices = {
  en_US: {
    'amy-medium': { gender: 'female', quality: 'medium' },
    'danny-low': { gender: 'male', quality: 'low' },
    'kathleen-low': { gender: 'female', quality: 'low' },
    'ryan-high': { gender: 'male', quality: 'high' },
  },
  en_GB: {
    'alan-medium': { gender: 'male', quality: 'medium' },
    'jenny-medium': { gender: 'female', quality: 'medium' },
  },
};
```

### Voice Parameters

- **Speed**: 0.5-2.0 (1.0 = normal)
- **Pitch**: 0.5-2.0 (1.0 = normal)
- **Volume**: 0.0-1.0 (1.0 = full)
- **Emphasis**: normal, strong, reduced

## Script Preparation

### Text Formatting

```text
# Add pauses with punctuation
This is a sentence. [pause] This is another.

# Emphasis with capitals (use sparingly)
This is VERY important.

# Numbers and abbreviations
The value increased to $1,234,567 (one million, two hundred thirty-four thousand).
The CEO (Chief Executive Officer) announced...

# Phonetic hints (if supported)
The data shows <phoneme alphabet="ipa" ph="deɪtə">data</phoneme>
```

### Script Optimization

```javascript
function optimizeScript(text) {
  return (
    text
      // Expand abbreviations
      .replace(/CEO/g, 'Chief Executive Officer')
      .replace(/YoY/g, 'year over year')
      .replace(/Q1/g, 'first quarter')

      // Format numbers
      .replace(/\$(\d+)k/g, '$$$1 thousand dollars')
      .replace(/\$(\d+)M/g, '$$$1 million dollars')

      // Add pauses
      .replace(/\. /g, '. ... ')
      .replace(/: /g, ': ... ')

      // Clean up
      .replace(/\s+/g, ' ')
      .trim()
  );
}
```

## Audio Processing

### Format Conversion

```bash
# Convert to different formats
ffmpeg -i narration.wav -b:a 128k narration.mp3
ffmpeg -i narration.wav -c:a aac -b:a 128k narration.m4a

# Normalize audio levels
ffmpeg -i narration.wav -af loudnorm narration-normalized.wav

# Add silence padding
ffmpeg -i narration.wav -af "adelay=1000|1000" narration-padded.wav
```

### Quality Enhancement

```javascript
// Apply audio filters
const filters = [
  'highpass=f=80', // Remove low frequency noise
  'lowpass=f=15000', // Remove high frequency noise
  'compand', // Dynamic range compression
  'loudnorm=I=-16', // Normalize to -16 LUFS
];

const filterString = filters.join(',');
```

## Timing and Synchronization

### Speech Rate Calculation

```javascript
function calculateSpeechTiming(text, wordsPerMinute = 150) {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  return {
    wordCount,
    estimatedDuration: (wordCount / wordsPerMinute) * 60,
    wordsPerMinute,
    charactersPerSecond: text.length / ((wordCount / wordsPerMinute) * 60),
  };
}
```

### Slide Timing

```javascript
// For video composition
const slides = [
  { text: 'Introduction slide text', duration: 5 },
  { text: 'Main points slide text', duration: 8 },
  { text: 'Conclusion slide text', duration: 6 },
];

// Generate timed script
const timedScript = slides.map((slide) => ({
  text: slide.text,
  startTime: calculateStartTime(previousSlides),
  duration: slide.duration,
  audioSegment: `segment_${index}.wav`,
}));
```

## Validation

```bash
# Check audio file
ffprobe -v quiet -print_format json -show_format narration.wav

# Validate with media validator
node orchestration/lib/media_validator.mjs media/compose-metadata.json
```

## Best Practices

1. **Keep sentences short** for better clarity
2. **Use punctuation** to control pacing
3. **Test different voices** for audience preference
4. **Normalize audio levels** for consistency
5. **Add brief pauses** between sections
6. **Spell out acronyms** on first use
7. **Format numbers** as words for large values
8. **Preview and adjust** speech rate as needed

## Common Issues

### Pronunciation Problems

- Use phonetic spelling in parentheses
- Break complex words with hyphens
- Provide IPA phonetic notation

### Timing Mismatch

- Adjust speech rate parameter
- Edit script for brevity
- Add or remove pauses

### Audio Quality

- Use higher quality voice models
- Apply noise reduction filters
- Ensure proper sample rate (44.1kHz)

## Integration Example

Complete TTS pipeline for data presentation:

```javascript
async function generateNarration(insights) {
  // 1. Create script from insights
  const script = `
    Data Analysis Report.
    
    We analyzed ${insights.data_row_count} records.
    
    Key findings include:
    ${insights.findings.join('. ')}.
    
    Top metrics:
    ${insights.metrics.map((m) => `${m.label}: ${m.value} ${m.unit || ''}`).join('. ')}.
    
    Thank you for watching.
  `;

  // 2. Generate audio
  await generateTTS(script, {
    voice: 'en_US-amy-medium',
    speed: 0.95,
    output: 'media/narration.wav',
  });

  // 3. Validate
  const metadata = {
    script_path: 'media/script.txt',
    audio_path: 'media/narration.wav',
    expected_duration_s: calculateDuration(script),
    actual_duration_s: await getAudioDuration('media/narration.wav'),
    has_audio_track: true,
  };

  return metadata;
}
```
