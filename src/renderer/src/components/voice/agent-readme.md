# Voice — Speech-to-text input, voice commands, and text-to-speech output

## Purpose
Provides hands-free voice interaction with CoPilot Commander, including speech-to-text input, voice command detection and routing, audio notifications, and text-to-speech responses. Enables accessibility and natural conversation flow.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| AudioNotifications.tsx | Web Audio API utilities for notification sounds and TTS | playNotificationSound(), speakText(), stopSpeaking(), isSpeaking() |
| SpeechToText.tsx | Web Speech API wrapper with hands-free auto-send on pause | SpeechToText component |
| VoiceCommands.tsx | Voice command pattern matching and routing definitions | VOICE_COMMANDS array, matchVoiceCommand() |
| VoicePanel.tsx | Unified voice control UI with hands-free and TTS toggles | VoicePanel component |

## Architecture Notes
- **AudioNotifications**:
  - `playNotificationSound(type)` generates tones using Web Audio API for event feedback:
    - 'complete' — 880 Hz sine wave, 200 ms
    - 'permission' — 660 Hz triangle, 300 ms
    - 'error' — 330 Hz square, 400 ms
    - 'rate-limit' — 440 Hz sine, 500 ms
  - Tones fade out with exponential ramp; silently fails if audio unavailable
  - `speakText(text)` uses SpeechSynthesisUtterance API with rate 1.0, pitch 1.0, volume 0.8
  - `stopSpeaking()` and `isSpeaking()` for TTS state control
  - Handles edge case: cancels ongoing speech before starting new utterance

- **SpeechToText**:
  - Uses Web Speech API (SpeechRecognition or webkitSpeechRecognition)
  - Props: `onTranscript(text)` callback, `handsFreeMode` boolean, `onHandsFreeSend(text)` for auto-send
  - Configuration: continuous mode, interim results enabled, lang: 'en-US'
  - Features:
    - Real-time interim transcription display
    - Waveform visualizer (5 animated bars during listening)
    - Hands-free mode: auto-sends after 2-second pause; auto-restarts recognition
    - Error handling for 'no-speech' and other recognition errors
  - Renders MicIcon component (muted SVG when inactive, active microphone when listening)
  - No rendering if speech recognition unavailable (returns disabled button with muted icon)

- **VoiceCommands**:
  - Static `VOICE_COMMANDS` array of command definitions
  - Command type: `VoiceCommand` with patterns (RegExp[]), action string, description
  - Eight built-in commands with regex patterns for:
    - "start new session" → navigate:/work
    - "autopilot mode" → mode:autopilot
    - "kill all agents" → killall
    - "cost dashboard" → navigate:/insights
    - "save template" → navigate:/work
    - "settings" → navigate:/configure
    - "agents" → navigate:/work
    - "dashboard/home" → navigate:/
  - `matchVoiceCommand(text)` performs sequential pattern matching; returns first match or null
  - Case-insensitive patterns with flexible wording variations

- **VoicePanel**:
  - Composes SpeechToText with command matching and navigation
  - Props: `onSendToSession(text)` for prompt injection, optional `lastResponse` for TTS
  - State: handsFree boolean, ttsEnabled boolean, transcript string, commandFeedback string
  - Behavior:
    - When transcript received, `handleSend()` first attempts voice command match
    - If command found: calls `subagent:kill-all` IPC or navigates via React Router
    - Otherwise: passes to `onSendToSession()` as prompt text
    - TTS: auto-reads `lastResponse` when enabled (uses `speakText()`)
    - UI shows transcript preview with manual Send button option
  - Toggle buttons:
    - HF (hands-free) — green when active
    - Speaker icon (TTS) — blue when active
  - Command feedback shown as pulse animation for 2 seconds

## Business Context
Implements accessibility-first voice interface for CoPilot Commander, enabling users to control the app entirely hands-free: speak prompts, trigger navigation commands, enable response readback. Particularly valuable for pair programming scenarios and accessibility needs. Integrates with session input pipeline via `onSendToSession` callback.
