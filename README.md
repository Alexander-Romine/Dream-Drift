# Dream-Drift

A browser studio that turns audio and video into an aesthetic slowed + reverb video.

**Live site:** https://dream-drift.vercel.app

![Dream-Drift screenshot](screenshot.png)

## Features

- Drop in an audio or video file plus a background image
- Audio presets: Classic Slowed, Dreamy, Night Drive and Tape
- Audio chain: speed, pitch shift, reverb, tape warmth, cassette flutter, bass boost, stereo width and echo
- Visual presets: warm tape, desaturated and golden hour
- Visual effects: film grain, analog damage, VHS distortion, scanlines, chromatic aberration, vignette, CRT flicker and spectrum analyzer
- Export at 16:9 or 9:16, up to 1440p and 60 fps, with adjustable video and audio bitrate
- Preview with YouTube-style playback controls and fullscreen

## Tech Stack

- [Vite](https://vite.dev/)
- HTML
- TypeScript
- [FFmpeg WASM](https://ffmpegwasm.netlify.app/) for in-browser export
- Hosted on [Vercel](https://vercel.com)
