# Capability: video.compose — FFmpeg recipe

## Inputs

- One or more PNG slides under `runs/<AUV>/charts/*.png`
- Narration WAV at `runs/<AUV>/media/narration.wav`

## Steps

1. Create `compose.json` mapping slides to durations.
2. Use ffmpeg to combine slides (fps 1) and audio to `media/final.mp4`.
3. Validate container and audio stream presence with `ffprobe` or ffmpeg exit code.

## Outputs

- `runs/<AUV>/media/compose.json`
- `runs/<AUV>/media/final.mp4`

## Acceptance

- MP4 playable; audio track present; duration within ±5% of sum of slide durations.
