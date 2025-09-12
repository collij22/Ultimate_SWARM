---
title: "Media Narration + Video Compose + Report"
project_context: |
  Client wants a narrated video from a short script and a single slide, composed locally
  using offline TTS (Piper) and FFmpeg. Deliver media artifacts and a compact report.
business_goals:
  - Deterministically generate narration and compose an MP4.
  - Provide a brief media production report (MD/HTML).
  - Avoid external dependencies; default to offline tools.
must_have:
  - audio.tts (offline) → media/narration.wav
  - video.compose → media/final.mp4 + compose-metadata.json
  - doc.generate media_report (MD/HTML)
nice_to_have:
  - narration_script generation (doc.generate)
constraints:
  budget_usd: 2200
  timeline_days: 5
  tech_stack: [piper, ffmpeg]
  environments: [local]
sample_urls: []
references: []
---

## Overview

Use offline TTS to render a short narration and compose a basic video with FFmpeg, then
generate a simple production report suitable for stakeholders.

## Must-Have Features

- audio.tts → WAV
- video.compose → MP4
- doc.generate → media_report

## Nice-to-Have Features

- narration_script from provided content

## Constraints

- Budget: $2,200
- Timeline: 5 days
- Offline-first


