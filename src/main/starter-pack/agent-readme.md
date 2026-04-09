# Starter Pack — Pre-configured agents, skills, memories, and handoff system

## Purpose
Provides a curated set of ready-to-use agents, skills, memories, and prompts that bootstrap users with structured multi-agent workflows. Handles agent handoff suggestions and context transfer between agents based on user request triggers.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| index.ts | Public API entry point | Re-exports: `STARTER_AGENTS`, `STARTER_SKILLS`, `STARTER_MEMORIES`, `STARTER_PROMPTS`, `AgentHandoffService` |
| agents.ts | Pre-built agent definitions (6 agents) | `STARTER_AGENTS: StarterAgentDefinition[]` with agents: Communication Coach, Research Analyst, Chief of Staff, Strategy & Decision Partner, Technical Reviewer, Document Builder |
| skills.ts | Reusable skill templates (6 skills) | `STARTER_SKILLS: StarterSkillDefinition[]` with skills: Audience & Tone Rewrite, Research Brief & Source Verification, Meeting-to-Action, Priority & Execution Planner, Feedback & Difficult Conversation Prep, Document Builder, Concept Explainer |
| memories.ts | Memory definitions for user context (5 memory types) | `STARTER_MEMORIES: StarterMemoryDefinition[]` with memories: Work Profile, Stakeholder Map, Current Priorities, Communication Preferences, Working Preferences & Constraints |
| prompts.ts | Suggested prompt starters for agents | `STARTER_PROMPTS: PromptSuggestion[]` with 6 spotlight/default prompts |
| handoff.ts | Agent handoff logic and context transfer | `AgentHandoffService` class; `checkForHandoff()`, `buildHandoffContext()`, `buildHandoffSystemPromptAddition()`, `getAgentSystemPrompt()` |

## Architecture Notes

### Agent Definitions (`StarterAgentDefinition`)
Six pre-built agents with:
- `id`, `name`, `description`
- `systemPrompt`: Full role and behavior instructions
- `handoffTriggers[]`: Keywords that trigger handoffs to other agents
  - Each trigger has: `condition` (intent), `targetAgentId`, `suggestionText`
- `memoryContext`: Which memory types this agent uses to calibrate responses

**Agents:**
1. **Communication Coach** (communication-coach) — Writes and refines messages, emails, announcements
2. **Research Analyst** (research-analyst) — Gathers data, provides decision briefs with sources
3. **Chief of Staff** (chief-of-staff) — Turns meetings into action items, plans weeks
4. **Strategy & Decision Partner** (strategy-decision-partner) — Analyzes trade-offs, evaluates options
5. **Technical Reviewer** (technical-reviewer) — Reviews code, explains technical concepts
6. **Document Builder** (document-builder) — Creates structured documents

### Skills (`StarterSkillDefinition`)
Seven reusable skills that agents can invoke:
1. **Audience & Tone Rewrite** — Adapts writing to audience
2. **Research Brief & Source Verification** — Gathers and verifies sources
3. **Meeting-to-Action** — Parses meeting notes
4. **Priority & Execution Planner** — Prioritizes work, creates timelines
5. **Feedback & Difficult Conversation Prep** — Prepares feedback conversations
6. **Document Builder** — Creates templates and structures
7. **Concept Explainer** — Explains topics at user's level

### Memories (`StarterMemoryDefinition`)
Five memory types that agents use to personalize responses:
1. **Work Profile** — Role, function, industry, seniority, team size, technical comfort
2. **Stakeholder Map** — Key people, their roles, what they care about
3. **Current Priorities** — Top 2-3 initiatives this quarter
4. **Communication Preferences** — Tone, length, format, formality
5. **Working Preferences & Constraints** — Time zone, meeting load, approval rules, tool constraints, confidentiality

### Prompts (`PromptSuggestion`)
Suggested starting prompts shown in UI:
- Category: `'spotlight'` or `'default'`
- `displayOrder`: UI ordering
- `followUpQuestions[]`: Suggested next questions
- Each links to a target agent ID

### Handoff System (`AgentHandoffService`)
Manages agent-to-agent context transfer:
- **Handoff Map** (`HANDOFF_MAP`): Defines valid handoff paths (source → [targets])
- **Trigger Matching**: Keyword-based detection of handoff conditions:
  - Research/data signals: "need more data", "verify this", "fact-check"
  - Decision signals: "should i", "which option", "trade-off"
  - Communication signals: "share this", "present this", "email"
  - Execution/plan signals: "action items", "next steps", "who does what"
  - Strategic signals: "long-term", "organizational", "investment"
  - Leadership signals: "explain to my", "executive summary"
- **Context Building**: `buildHandoffContext()` creates transfer object with:
  - `fromAgentId`, `toAgentId`, `summary` (first 2000 chars of output), `originalRequest`, `reason`
- **System Prompt Addition**: Injects handoff context into receiving agent's session

## Business Context
Provides the foundation for CoPilot Commander's multi-agent collaboration feature. Enables:
- Users to start with zero configuration — agents are pre-trained
- Cross-agent handoffs without context loss (summary of prior agent's work passed along)
- Memories to calibrate all agents to user's role, priorities, and preferences
- Suggested prompts to guide users into workflows

Users can manually edit agents/skills/memories or rely on pre-built definitions.

## Integration Points
- `AgentHandoffService` used by CLI managers and session handlers to detect and execute handoffs
- Agents and skills are loaded into renderer for UI display
- Memories bind to user profile setup flow in renderer
- `checkForHandoff()` called after each agent turn to suggest next agent
- `buildHandoffContext()` prepends context to next agent's system prompt
