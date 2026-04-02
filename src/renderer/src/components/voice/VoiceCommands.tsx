/**
 * Voice command mapping — spoken phrases to app actions.
 * Used by the voice input system to detect command patterns.
 */

export interface VoiceCommand {
  patterns: RegExp[]
  action: string
  description: string
}

export const VOICE_COMMANDS: VoiceCommand[] = [
  {
    patterns: [/start\s+(?:a\s+)?new\s+session/i, /new\s+session/i, /create\s+session/i],
    action: 'navigate:/work',
    description: 'Opens the Work view',
  },
  {
    patterns: [/switch\s+to\s+autopilot/i, /autopilot\s+mode/i, /enable\s+autopilot/i],
    action: 'mode:autopilot',
    description: 'Switches to autopilot mode',
  },
  {
    patterns: [/kill\s+all\s+agents/i, /stop\s+all\s+(?:agents|processes)/i],
    action: 'killall',
    description: 'Stops all running processes',
  },
  {
    patterns: [/show\s+(?:me\s+)?(?:the\s+)?cost/i, /cost\s+dashboard/i, /analytics/i],
    action: 'navigate:/insights',
    description: 'Navigate to insights dashboard',
  },
  {
    patterns: [/save\s+(?:this\s+)?(?:as\s+)?(?:a\s+)?template/i, /create\s+template/i],
    action: 'navigate:/work',
    description: 'Opens the Work view for templates',
  },
  {
    patterns: [/go\s+to\s+settings/i, /open\s+settings/i],
    action: 'navigate:/configure',
    description: 'Navigate to configure',
  },
  {
    patterns: [/go\s+to\s+agents/i, /show\s+agents/i],
    action: 'navigate:/work',
    description: 'Navigate to Work view',
  },
  {
    patterns: [/go\s+to\s+dashboard/i, /show\s+dashboard/i, /go\s+home/i],
    action: 'navigate:/',
    description: 'Navigate to home dashboard',
  },
]

export function matchVoiceCommand(text: string): VoiceCommand | null {
  for (const cmd of VOICE_COMMANDS) {
    for (const pattern of cmd.patterns) {
      if (pattern.test(text)) return cmd
    }
  }
  return null
}
