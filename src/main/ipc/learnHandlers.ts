import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

// ── Feature flag unlock mapping ─────────────────────────────────────────────
// Maps lesson IDs to the feature flag(s) they unlock when completed.
const LESSON_FLAG_UNLOCKS: Record<string, string[]> = {
  'fd-composer-3': ['showComposer'],
  'fd-scheduler-2': ['showScheduler'],
  'fd-subagents-2': ['showSubAgents'],
  'fd-kb-2': ['showKnowledgeBase'],
  'fd-voice-2': ['showVoice'],
  'fd-compliance-2': ['showComplianceLogs'],
  'fd-plugins-2': ['showPlugins'],
  'fd-envvars-2': ['showEnvVars'],
  'fd-webhooks-2': ['showWebhooks'],
  'fd-experimental-2': ['enableExperimentalFeatures', 'showPrScores'],
}

// ── Content Types ────────────────────────────────────────────────────────────

interface WalkthroughContent {
  kind: 'walkthrough'
  introduction: string
  steps: Array<{
    title: string
    description: string
    tip?: string
  }>
  keyTakeaway: string
}

interface GuidedTaskContent {
  kind: 'guided-task'
  introduction: string
  goal: string
  steps: Array<{
    title: string
    instruction: string
    detail: string
    successCheck?: string
  }>
  celebration: string
}

interface KnowledgeCheckContent {
  kind: 'knowledge-check'
  introduction: string
  questions: Array<{
    question: string
    options: Array<{ text: string; correct: boolean }>
    explanation: string
  }>
}

type LessonContent = WalkthroughContent | GuidedTaskContent | KnowledgeCheckContent | Record<string, never>

interface Lesson {
  id: string
  title: string
  type: 'interactive-walkthrough' | 'guided-task' | 'knowledge-check' | 'video-placeholder' | 'sandbox'
  estimatedMinutes: number
  description: string
  content: LessonContent
}

interface Module {
  id: string
  title: string
  description: string
  estimatedMinutes: number
  prerequisites: string[]
  lessons: Lesson[]
}

interface LearningPath {
  id: string
  name: string
  description: string
  icon: string
  modules: Module[]
  prerequisitePaths: string[]
  recommended?: boolean
}

interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  criteria: string
}

// ── Store ────────────────────────────────────────────────────────────────────

interface LearnStoreSchema {
  completedLessons: Record<string, { completedAt: number; score?: number; skipped?: boolean }>
  selectedPath: string | null
  streak: { lastDate: string; count: number }
  totalTimeMinutes: number
  achievements: Record<string, { unlockedAt: number }>
  helpClicked: string[]
  dismissed: boolean
}

const store = new Store<LearnStoreSchema>({
  name: 'clear-path-learn',
  encryptionKey: getStoreEncryptionKey(),
  defaults: {
    completedLessons: {},
    selectedPath: null,
    streak: { lastDate: '', count: 0 },
    totalTimeMinutes: 0,
    achievements: {},
    helpClicked: [],
    dismissed: false,
  },
})

// ── Achievement Definitions ──────────────────────────────────────────────────

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-steps', name: 'First Steps', description: 'Complete the Getting Started path', icon: '🎯', criteria: 'Finish all Getting Started lessons' },
  { id: 'session-pro', name: 'Session Pro', description: 'Run 10 sessions', icon: '⚡', criteria: 'Start 10 sessions in the Work tab' },
  { id: 'workflow-architect', name: 'Workflow Architect', description: 'Create and execute 5 workflows', icon: '🏗️', criteria: 'Build 5 multi-step workflows in the Composer' },
  { id: 'template-master', name: 'Template Master', description: 'Use 10 different templates', icon: '📋', criteria: 'Send prompts from 10 different templates' },
  { id: 'delegation-expert', name: 'Delegation Expert', description: 'Delegate 20 tasks to sub-agents', icon: '🤖', criteria: 'Use &prompt or /delegate 20 times' },
  { id: 'multi-repo-maverick', name: 'Multi-Repo Maverick', description: 'Broadcast a task across 3+ repos', icon: '🌐', criteria: 'Use workspace broadcast across 3 or more repos' },
  { id: 'knowledge-keeper', name: 'Knowledge Keeper', description: 'Generate a knowledge base', icon: '📖', criteria: 'Auto-generate documentation for a project' },
  { id: 'cost-conscious', name: 'Cost Conscious', description: 'Set a budget and stay under it for a week', icon: '💰', criteria: 'Configure a budget limit and stay within it for 7 days' },
  { id: 'security-sentinel', name: 'Security Sentinel', description: 'Review 5 security events in the audit log', icon: '🛡️', criteria: 'Open and review 5 events in Compliance' },
  { id: 'connected', name: 'Connected', description: 'Set up at least 2 integrations', icon: '🔗', criteria: 'Configure 2 external service connections' },
  { id: 'speed-runner', name: 'Speed Runner', description: 'Complete any learning path in under one day', icon: '🏃', criteria: 'Finish all lessons in a path within 24 hours' },
  { id: 'scholar', name: 'Scholar', description: 'Complete all learning paths (100%)', icon: '🎓', criteria: 'Complete every lesson in every path' },
  { id: 'streak-master', name: 'Streak Master', description: 'Maintain a 7-day learning streak', icon: '🔥', criteria: 'Complete at least one lesson each day for 7 consecutive days' },
]

// ── Helper builders ─────────────────────────────────────────────────────────

function makeLesson(id: string, title: string, type: Lesson['type'], mins: number, desc: string, content?: LessonContent): Lesson {
  return { id, title, type, estimatedMinutes: mins, description: desc, content: content ?? {} as Record<string, never> }
}

function makeModule(id: string, title: string, desc: string, prereqs: string[], lessons: Lesson[]): Module {
  return { id, title, description: desc, estimatedMinutes: lessons.reduce((s, l) => s + l.estimatedMinutes, 0), prerequisites: prereqs, lessons }
}

// ── Learning Content ────────────────────────────────────────────────────────
//
// Content philosophy: These lessons are for non-technical managers and
// associates who don't write code. They direct AI tools to get technical
// work done. Every lesson uses plain language, business analogies, and
// focuses on outcomes — what can I DO after this lesson?

const PATHS: LearningPath[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTING STARTED — Required for all users
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'getting-started', name: 'Getting Started', icon: '🚀',
    description: 'Essential basics for all users — required before other paths',
    prerequisitePaths: [],
    modules: [
      makeModule('welcome', 'Welcome to ClearPath', 'Learn what ClearPath does and how to navigate it', [], [
        makeLesson('welcome-1', 'What is ClearPath?', 'interactive-walkthrough', 3,
          'Understand what ClearPath does and why it matters for your work',
          {
            kind: 'walkthrough',
            introduction: 'ClearPath is your command center for AI-powered work. Think of it like a dashboard for managing a very capable assistant — you give direction, review results, and stay in control. You never need to write code or use the terminal. ClearPath handles all of that behind the scenes.',
            steps: [
              { title: 'Home — Your overview', description: 'Home shows your dashboard with widgets for recent activity, costs, and learning progress. It\'s the first thing you see when you open the app.', tip: 'You can customize which widgets appear on your dashboard later.' },
              { title: 'Work — Where tasks happen', description: 'Work is where you interact with AI. You type what you need in plain English, and the AI responds with analysis, code, or answers. Think of it as a chat with a technical expert who can also edit files.', tip: 'This is where you\'ll spend most of your time.' },
              { title: 'Insights — Track your impact', description: 'Insights shows you analytics: how much AI costs, how it\'s being used, and compliance details. Perfect for understanding the value AI brings to your team.' },
              { title: 'Configure — Your settings', description: 'Configure is where you adjust settings, manage connections, set up budgets, and control what the AI is allowed to do.' },
            ],
            keyTakeaway: 'ClearPath has four main areas: Home (overview), Work (do things), Insights (measure things), and Configure (control things). You\'ll learn each one step by step.',
          },
        ),
        makeLesson('welcome-2', 'Your First Look Around', 'interactive-walkthrough', 3,
          'Get familiar with the layout and find your way around',
          {
            kind: 'walkthrough',
            introduction: 'Let\'s take a quick tour so you know where everything is. The app is organized so the most common actions are always within reach.',
            steps: [
              { title: 'The sidebar', description: 'On the left, you\'ll see the navigation sidebar with icons for each section. The green and orange dots near the top show whether your AI tools are connected and ready.' },
              { title: 'The notification bell', description: 'The bell icon shows alerts — like when a task finishes, a budget limit is approaching, or something needs your attention. A red badge means you have unread notifications.' },
              { title: 'The status area', description: 'In the top right of the Work page, you\'ll see the session mode (Normal, Plan, Autopilot) and whether the AI is currently thinking. This tells you what\'s happening at a glance.' },
              { title: 'Learning progress', description: 'The "Learn" item in the sidebar shows your progress as a percentage. As you complete lessons, this fills up — a nice way to see how far you\'ve come.' },
            ],
            keyTakeaway: 'The sidebar is your main navigation. Status indicators and the notification bell keep you informed without needing to hunt for information.',
          },
        ),
        makeLesson('welcome-3', 'Understanding the Basics', 'knowledge-check', 2,
          'Quick check on what you\'ve learned about ClearPath',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s make sure the fundamentals are solid before we move on. Don\'t worry — you can always come back and review.',
            questions: [
              {
                question: 'Where do you go to interact with AI and get work done?',
                options: [
                  { text: 'The Home page', correct: false },
                  { text: 'The Work page', correct: true },
                  { text: 'The Configure page', correct: false },
                ],
                explanation: 'The Work page is where you have conversations with AI, send prompts, and get tasks done. Home is your dashboard overview, and Configure is for settings.',
              },
              {
                question: 'What do the green and orange dots near the top of the sidebar indicate?',
                options: [
                  { text: 'Whether you have notifications', correct: false },
                  { text: 'Whether your AI tools (Copilot and Claude) are connected', correct: true },
                  { text: 'Whether the app is online', correct: false },
                ],
                explanation: 'Green means Copilot CLI is connected and ready. Orange means Claude Code CLI is connected. If a dot is missing, that tool isn\'t set up yet.',
              },
              {
                question: 'Do you need to know how to write code to use ClearPath?',
                options: [
                  { text: 'Yes, it\'s a developer tool', correct: false },
                  { text: 'No — you give instructions in plain English and ClearPath handles the technical parts', correct: true },
                  { text: 'Only for advanced features', correct: false },
                ],
                explanation: 'ClearPath is designed so you can direct AI work using plain language. The app manages all the technical interactions behind the scenes.',
              },
            ],
          },
        ),
      ]),

      makeModule('connecting', 'Connecting Your Tools', 'Set up your AI connections so you\'re ready to work', ['welcome'], [
        makeLesson('connect-1', 'Setting Up GitHub Copilot', 'guided-task', 4,
          'Connect to GitHub Copilot — your primary AI tool',
          {
            kind: 'guided-task',
            introduction: 'GitHub Copilot is the primary AI engine that ClearPath uses. Think of it as hiring your AI assistant — this step gets them "on the payroll" so they can start working for you. You need a GitHub account with Copilot access (your organization likely provides this).',
            goal: 'Get the Copilot connection showing a green dot in the sidebar.',
            steps: [
              { title: 'Check the current status', instruction: 'Look at the top of the sidebar. If you see a green dot next to "Copilot", you\'re already connected — skip to the next lesson!', detail: 'If there\'s no dot, or it says "Not installed", we need to set things up.', successCheck: 'A green dot appears next to Copilot.' },
              { title: 'Open Configure', instruction: 'Click "Configure" in the sidebar, then look for the CLI Connection section.', detail: 'This shows you the status of each AI tool and whether it\'s installed and authenticated.' },
              { title: 'Follow the auth prompts', instruction: 'If Copilot shows as installed but not authenticated, click the Login button. A browser window will open for you to sign in to GitHub.', detail: 'If it shows "Not installed", you\'ll need your IT team to install the Copilot CLI first. The app will show you the command they need to run.', successCheck: 'The status changes from "Not authenticated" to "Ready".' },
              { title: 'Verify the connection', instruction: 'Go back to the sidebar. You should now see a green dot next to "Copilot". That means you\'re ready to start working!', detail: 'The connection is saved — you won\'t need to log in again unless your token expires.', successCheck: 'Green dot visible in the sidebar.' },
            ],
            celebration: 'Your AI assistant is connected and ready. Everything you do in sessions will use this connection to get work done.',
          },
        ),
        makeLesson('connect-2', 'Setting Up Claude Code (Optional)', 'guided-task', 4,
          'Add a second AI tool for even more flexibility',
          {
            kind: 'guided-task',
            introduction: 'Claude Code is a second AI engine you can use alongside Copilot. Having both gives you options — different tools have different strengths, just like having multiple experts on your team. This is optional but recommended.',
            goal: 'Get Claude Code connected (orange dot in sidebar) or understand when to set it up later.',
            steps: [
              { title: 'Check if Claude is needed', instruction: 'Look at the sidebar. If you see an orange dot next to "Claude", it\'s already set up. If your team only uses Copilot, you can skip this lesson.', detail: 'Some organizations use only Copilot, some use both. Check with your team lead if you\'re unsure.' },
              { title: 'Open Configure', instruction: 'Click Configure and find the Claude Code section in CLI Connection.', detail: 'The setup is similar to Copilot — the app checks if Claude is installed and guides you through login.' },
              { title: 'Authenticate', instruction: 'Click Login and follow the prompts. Claude uses Anthropic\'s authentication system.', detail: 'You may need an API key from your organization. The app will tell you exactly what\'s needed.', successCheck: 'Status shows "Ready" for Claude Code.' },
              { title: 'Choosing between tools', instruction: 'When you start a new session, you\'ll be able to choose Copilot or Claude. For now, either one works great.', detail: 'You can switch between them any time. Different tasks may benefit from different AI tools — you\'ll develop preferences over time.' },
            ],
            celebration: 'You now have two AI engines available. When you start sessions, you can pick whichever works best for the task at hand.',
          },
        ),
        makeLesson('connect-3', 'Understanding Connection Status', 'interactive-walkthrough', 2,
          'Know at a glance whether your tools are ready',
          {
            kind: 'walkthrough',
            introduction: 'Quick reference for the status indicators you\'ll see every day. These tell you at a glance whether everything is ready to go.',
            steps: [
              { title: 'Green dot = Copilot ready', description: 'A solid green dot means Copilot CLI is installed and authenticated. You\'re good to go.', tip: 'If this disappears, your token may have expired. Just re-authenticate in Configure.' },
              { title: 'Orange dot = Claude ready', description: 'A solid orange dot means Claude Code is installed and authenticated.', tip: 'It\'s fine to have only one tool connected. You don\'t need both.' },
              { title: 'No dot = not connected', description: 'If a tool has no dot, it\'s either not installed or not logged in. Click Configure to see what\'s needed.' },
              { title: 'Session status indicators', description: 'In the Work page header, you\'ll also see "Thinking..." when the AI is processing, and the mode indicator (Normal/Plan/Autopilot) showing how the AI is operating.' },
            ],
            keyTakeaway: 'Green dot = Copilot ready, Orange dot = Claude ready, No dot = needs setup. You can check and fix connections any time in Configure.',
          },
        ),
      ]),

      makeModule('first-session', 'Your First Session', 'Have your first conversation with AI', ['connecting'], [
        makeLesson('session-1', 'Starting a Session', 'interactive-walkthrough', 3,
          'Learn how to open a new session and get ready to work',
          {
            kind: 'walkthrough',
            introduction: 'A session is like a meeting with your AI assistant. You open a session, have a conversation, and close it when you\'re done. Each session remembers everything discussed, so you can pick up where you left off.',
            steps: [
              { title: 'Go to the Work page', description: 'Click "Work" in the sidebar. This is your workspace for AI interactions.' },
              { title: 'Start a new session', description: 'Click the "+ New" button in the header bar. A dialog will appear asking which AI to use and an optional session name.', tip: 'Give your sessions descriptive names like "Q2 Report Analysis" — it makes finding them later much easier.' },
              { title: 'Choose your AI', description: 'Pick Copilot or Claude. If you\'re not sure, Copilot is the default and works great for most tasks.' },
              { title: 'The session is live', description: 'Once created, you\'ll see a text input at the bottom of the screen. The AI is ready and waiting for your first message.' },
            ],
            keyTakeaway: 'Starting a session takes about 5 seconds. Name it well, pick your AI, and you\'re ready to type your first request.',
          },
        ),
        makeLesson('session-2', 'Talking to the AI', 'guided-task', 5,
          'Send your first message and understand how the AI responds',
          {
            kind: 'guided-task',
            introduction: 'Talking to AI through ClearPath is like texting a knowledgeable colleague. You type what you need in plain English — no special syntax or commands required. The AI reads your message, thinks about it, and responds with helpful analysis, code, or suggestions.',
            goal: 'Send a prompt, watch the AI respond, and understand the response format.',
            steps: [
              { title: 'Type a simple request', instruction: 'In the text input at the bottom, type something like: "Explain what a pull request is in simple terms" and press Enter.', detail: 'You can ask anything — explanations, analysis, help with tasks. Start simple to see how it works.', successCheck: 'Your message appears as an indigo bubble at the top of the chat.' },
              { title: 'Watch the AI think', instruction: 'After you send a message, you\'ll see a "Thinking..." indicator. This means the AI is processing your request.', detail: 'Responses usually take a few seconds. Complex tasks can take longer — the indicator shows the AI is working, not stuck.', successCheck: 'The thinking indicator appears and then a response shows up.' },
              { title: 'Read the response', instruction: 'The AI\'s response appears below your message with formatted text — bold headings, bullet points, and code blocks. Read through it.', detail: 'AI responses use markdown formatting to make complex information scannable. Code appears in dark boxes, lists use bullets, and key terms are bolded.' },
              { title: 'Send a follow-up', instruction: 'Type a follow-up like: "Can you give me an example of when I would use one?" and press Enter.', detail: 'Sessions are conversations — the AI remembers everything you\'ve discussed. Each follow-up builds on the previous context, just like a real conversation.', successCheck: 'A second response appears that references the earlier discussion.' },
            ],
            celebration: 'You just had your first AI conversation! Everything from simple questions to complex multi-step tasks follows this same pattern: you ask, the AI responds, you follow up as needed.',
          },
        ),
        makeLesson('session-3', 'Using Slash Commands', 'interactive-walkthrough', 4,
          'Quick shortcuts that give you control over the session',
          {
            kind: 'walkthrough',
            introduction: 'Slash commands are shortcuts you type in the chat input. They start with "/" and give you quick control without leaving the conversation. Think of them like keyboard shortcuts, but you type them in the message box.',
            steps: [
              { title: 'How to use them', description: 'Type "/" in the message input and a dropdown will appear showing all available commands. Select one or keep typing to filter the list.', tip: 'You don\'t need to memorize them — the dropdown always shows what\'s available.' },
              { title: '/help — See all commands', description: 'Type "/help" to see a full list of commands. This is your reference card whenever you\'re unsure what\'s available.' },
              { title: '/model — Switch AI models', description: 'Different AI models have different strengths. "/model" lets you switch mid-conversation. Stronger models cost more but handle complex tasks better.' },
              { title: '/compact — Save memory', description: 'Long conversations use up the AI\'s memory (called "context"). If a session gets very long, "/compact" compresses the history so you can keep going without starting over.', tip: 'The AI does this automatically when it runs low, but you can trigger it manually too.' },
              { title: '/clear — Fresh start', description: 'Want to change topics completely? "/clear" wipes the conversation history without creating a new session.' },
            ],
            keyTakeaway: 'Slash commands give you quick control. The three most useful: /help (see options), /model (switch AI), /compact (save memory). Type "/" in the input to discover all of them.',
          },
        ),
        makeLesson('session-4', 'Session Basics Quiz', 'knowledge-check', 3,
          'Test your understanding of sessions and commands',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s confirm you\'re comfortable with the fundamentals of working in sessions.',
            questions: [
              {
                question: 'What happens when you send a message in a session?',
                options: [
                  { text: 'The AI processes it and responds, then waits for your next message', correct: true },
                  { text: 'It sends an email to your team', correct: false },
                  { text: 'It immediately changes files on your computer', correct: false },
                ],
                explanation: 'Sessions are conversations. The AI reads your message, responds, and waits for you. It won\'t change files unless you specifically ask it to and grant permission.',
              },
              {
                question: 'How do you access slash commands?',
                options: [
                  { text: 'Click a menu button at the top of the screen', correct: false },
                  { text: 'Type "/" in the message input to see available commands', correct: true },
                  { text: 'Open the Settings page', correct: false },
                ],
                explanation: 'Just type "/" in the message input and a dropdown appears. It\'s designed to be discoverable — you never need to memorize commands.',
              },
              {
                question: 'Can the AI remember earlier parts of your conversation?',
                options: [
                  { text: 'No, each message is independent', correct: false },
                  { text: 'Yes, it remembers everything in the current session', correct: true },
                  { text: 'Only if you repeat the important parts', correct: false },
                ],
                explanation: 'The AI keeps the full conversation in memory within a session. That\'s why follow-up messages work so well — you can say "now do the same thing for the other file" and it knows what you mean.',
              },
            ],
          },
        ),
      ]),

      makeModule('panels', 'Understanding Panels', 'The tools alongside your conversation', ['first-session'], [
        makeLesson('panels-1', 'The Panel Toolbar', 'interactive-walkthrough', 4,
          'Discover the tools available alongside your session',
          {
            kind: 'walkthrough',
            introduction: 'The Work page has a vertical toolbar on the left edge with small icons. Each one opens a panel that slides in next to your conversation. These panels give you extra capabilities without leaving your chat.',
            steps: [
              { title: 'Agents — Your specialists', description: 'The people icon opens the Agents panel. Agents are like pre-configured specialists — a "Code Reviewer" agent, a "Security Auditor" agent, etc. You can toggle agents on or off for your session.', tip: 'Think of agents like calling in a specialist for a specific job.' },
              { title: 'Tools — Permissions control', description: 'The gear icon opens Tools. This is where you control what the AI is allowed to do — can it read files? Write files? Run commands? You set the boundaries.', tip: 'By default, the AI asks permission before making changes. You can loosen or tighten this.' },
              { title: 'Files — Your codebase', description: 'The folder icon opens a file browser. You can see your project files and even drag them into the conversation to give the AI specific context.' },
              { title: 'Templates — Reusable prompts', description: 'The document icon opens Templates. Instead of typing the same instructions repeatedly, you can save them as templates with fill-in-the-blank variables.', tip: 'Templates are huge time-savers once you find prompts that work well.' },
              { title: 'More panels', description: 'There are also panels for Git (version control), Skills (AI capabilities), Sub-Agents (background workers), and Knowledge Base (project documentation). You\'ll learn these in later lessons.' },
            ],
            keyTakeaway: 'Panels are your toolbox alongside the conversation. You don\'t need to learn them all now — start with Agents and Templates, then explore the rest as needed.',
          },
        ),
        makeLesson('panels-2', 'Working with Panels Open', 'guided-task', 4,
          'Try opening a panel alongside your conversation',
          {
            kind: 'guided-task',
            introduction: 'Panels open beside your conversation — they don\'t replace it. This means you can configure tools, browse agents, or check files while keeping your chat visible. Let\'s try it.',
            goal: 'Open the Agents panel, explore it, and close it — all while keeping your session visible.',
            steps: [
              { title: 'Open a session', instruction: 'Make sure you have an active session in the Work page. If not, create a new one.', detail: 'You need an active conversation to see how panels work alongside it.' },
              { title: 'Click the Agents icon', instruction: 'In the leftmost toolbar (thin vertical bar with icons), click the top icon (people icon). The Agents panel will slide in from the right.', detail: 'Notice that your conversation area narrows to make room, but stays visible and usable.', successCheck: 'The Agents panel appears on the right side of the screen.' },
              { title: 'Browse the agents', instruction: 'You\'ll see a list of available agents. Each one has a name, description, and toggle switch. Don\'t change anything yet — just read through what\'s available.', detail: 'Agents are pre-built configurations that tell the AI to approach tasks in a specific way. "Explore" is fast for browsing code, "Code Review" focuses on finding issues.' },
              { title: 'Close the panel', instruction: 'Click the "Close" button in the panel header, or click the same Agents icon again to toggle it off.', detail: 'Panels are always one click away. Open them when you need context, close them to focus on your conversation.', successCheck: 'The panel slides away and your conversation area expands back to full width.' },
            ],
            celebration: 'You now know how to use the panel system. It\'s like having a toolbox that slides open when you need it and tucks away when you don\'t.',
          },
        ),
        makeLesson('panels-3', 'Panel Navigation Quiz', 'knowledge-check', 2,
          'Quick check on panels and layout',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s make sure the panel system makes sense.',
            questions: [
              {
                question: 'What happens to your conversation when you open a panel?',
                options: [
                  { text: 'It disappears and you see only the panel', correct: false },
                  { text: 'It stays visible — the panel slides in beside it', correct: true },
                  { text: 'It moves to a different tab', correct: false },
                ],
                explanation: 'Panels share the screen with your conversation. You can always see both at once, which makes it easy to configure settings while chatting.',
              },
              {
                question: 'Where is the panel toolbar located?',
                options: [
                  { text: 'At the top of the screen in the header bar', correct: false },
                  { text: 'On the thin vertical bar at the left edge of the Work area', correct: true },
                  { text: 'In the sidebar navigation', correct: false },
                ],
                explanation: 'The panel toolbar is the thin column of icons on the far left of the Work page. Each icon opens a different panel. The main sidebar navigation is a separate area.',
              },
            ],
          },
        ),
      ]),

      makeModule('choose-path', 'Choosing Your Path', 'Decide what to learn next', ['panels'], [
        makeLesson('choose-1', 'What\'s Next?', 'interactive-walkthrough', 3,
          'Explore the learning paths and choose your direction',
          {
            kind: 'walkthrough',
            introduction: 'You\'ve completed the essentials! Now you get to choose what to learn next based on your role. There\'s no wrong choice — you can always come back and take other paths later.',
            steps: [
              { title: 'Manager Track', description: 'Best for team leads, project managers, and anyone focused on oversight. You\'ll learn delegation, cost tracking, workflows for repeatable processes, compliance, and how to demonstrate ROI to leadership.', tip: 'If you manage people or budgets, start here.' },
              { title: 'Developer Track', description: 'Best for developers and technical users. Deep dives into advanced sessions, custom agents, Git integration, file management, and automation. More hands-on and technical.', tip: 'If you write code or manage repositories, start here.' },
              { title: 'Admin Track', description: 'Best for IT administrators and team leads setting up ClearPath for others. Covers team configuration, security, workspace organization, and adoption metrics.', tip: 'If you\'re responsible for rolling ClearPath out to a team, start here.' },
              { title: 'Power User Track', description: 'Advanced features for experienced users. Unlocks after you complete either the Manager or Developer track. Covers complex workflows, custom agents, template engineering, and local AI models.' },
            ],
            keyTakeaway: 'Pick the path that matches your role. Manager Track for oversight and delegation, Developer Track for hands-on technical work, Admin Track for team setup. You can always take multiple paths.',
          },
        ),
      ]),
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGER TRACK — Oversight, delegation, analytics, compliance
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'manager', name: 'Manager Track', icon: '📊',
    description: 'Delegation, analytics, cost tracking, and compliance for managers and team leads',
    prerequisitePaths: ['getting-started'],
    modules: [
      makeModule('delegating', 'Delegating Work to AI', 'Learn to assign tasks effectively — just like managing a team member', [], [
        makeLesson('delegate-1', 'What is Delegation?', 'interactive-walkthrough', 3,
          'Three ways to assign work, from quick tasks to background jobs',
          {
            kind: 'walkthrough',
            introduction: 'Delegating to AI is a lot like delegating to a team member. You explain what you need, set the boundaries, and check the results. ClearPath gives you three levels of delegation, from a quick conversation to fully autonomous background work.',
            steps: [
              { title: 'In-session (direct conversation)', description: 'You type a request in the chat and the AI works on it right in front of you. You see every step, can ask follow-ups, and stay hands-on. Best for tasks you want to supervise closely.', tip: 'Like standing at someone\'s desk walking through a task together.' },
              { title: 'Sub-agents (background workers)', description: 'You can send work to a background sub-agent using the "&" prefix. For example, typing "&Summarize the README files in all repos" spins up a separate AI process. It works in the background while you continue your conversation.', tip: 'Like giving a team member an assignment and checking in later.' },
              { title: '/delegate (hand it off)', description: 'The /delegate command pushes work to a fully autonomous background process. It will work independently and report back when done.', tip: 'Like emailing a request — you don\'t watch over their shoulder.' },
              { title: 'Choosing the right level', description: 'Use in-session for important, nuanced tasks. Sub-agents for parallel work. /delegate for routine tasks you trust the AI to handle independently. Match the level of oversight to the task\'s importance.' },
            ],
            keyTakeaway: 'Three delegation levels: direct conversation (high oversight), sub-agents (medium), and /delegate (hands-off). Choose based on how much you need to supervise the work.',
          },
        ),
        makeLesson('delegate-2', 'Your First Delegation', 'guided-task', 5,
          'Send a task to a background sub-agent',
          {
            kind: 'guided-task',
            introduction: 'Let\'s try the most useful delegation pattern: sending work to a sub-agent. This lets the AI work in the background while you do other things — like having an assistant research something while you focus on a meeting.',
            goal: 'Send a task to a sub-agent and see it appear in the Sub-Agents panel.',
            steps: [
              { title: 'Start a session', instruction: 'Go to Work and start a new session (or use an existing one).', detail: 'Any active session can spawn sub-agents.' },
              { title: 'Type a delegated task', instruction: 'In the chat input, type: &Explain what files are in this project and what each one does', detail: 'The "&" at the beginning is the key — it tells ClearPath to run this as a background task instead of handling it in your current conversation.', successCheck: 'You see a status message: "Delegating to background sub-agent..."' },
              { title: 'Check the Sub-Agents panel', instruction: 'Click the Sub-Agents icon in the panel toolbar (monitor icon near the bottom). You should see your task listed with its status.', detail: 'The panel shows all running sub-agents, their output, and their completion status. You can view the output, or kill a sub-agent if needed.', successCheck: 'Your delegated task appears in the Sub-Agents panel.' },
              { title: 'Keep working', instruction: 'While the sub-agent works, you can continue your main conversation. Send another prompt in the chat — your session isn\'t blocked.', detail: 'This is the real power of delegation: you can have multiple things happening at once. The sub-agent works in parallel.' },
            ],
            celebration: 'You just delegated your first background task! This pattern — sending work to sub-agents while you focus on something else — is one of the most powerful productivity tools in ClearPath.',
          },
        ),
        makeLesson('delegate-3', 'Monitoring Delegated Work', 'interactive-walkthrough', 4,
          'Keep track of everything you\'ve assigned',
          {
            kind: 'walkthrough',
            introduction: 'Good delegation requires good follow-up. The Sub-Agents panel is your management dashboard for all background work. Let\'s learn to read it.',
            steps: [
              { title: 'The task list', description: 'Each delegated task shows as a card with the task name, which AI is running it, how long it\'s been running, and its current status (running, completed, or failed).' },
              { title: 'Viewing results', description: 'Click on a completed task to see its full output — what the AI found, what it changed, and any issues it encountered. This is where you review the work.' },
              { title: 'Stopping a runaway task', description: 'If a sub-agent is taking too long or heading in the wrong direction, you can click Stop to terminate it immediately. Don\'t worry about wasting time — it\'s better to stop and redirect than wait for wrong results.' },
              { title: 'Parallel work', description: 'You can have multiple sub-agents running at the same time. For example, one reviewing code quality while another generates documentation. The Sub-Agents panel shows them all.', tip: 'Start small — one or two sub-agents at a time until you\'re comfortable.' },
            ],
            keyTakeaway: 'Check the Sub-Agents panel regularly to review completed work and catch issues early. Good managers check in on delegated work — AI delegation is no different.',
          },
        ),
        makeLesson('delegate-4', 'Delegation Quiz', 'knowledge-check', 3,
          'Test your understanding of AI delegation',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s check your understanding of the delegation patterns.',
            questions: [
              {
                question: 'You need the AI to analyze a large report while you continue asking it about something else. What\'s the best approach?',
                options: [
                  { text: 'Wait for the analysis to finish, then ask your question', correct: false },
                  { text: 'Use "&" to delegate the analysis to a sub-agent, then continue your conversation', correct: true },
                  { text: 'Open two separate browser windows', correct: false },
                ],
                explanation: 'The "&" prefix sends work to a background sub-agent, letting you continue your current conversation. This is perfect for parallel work.',
              },
              {
                question: 'When should you use direct in-session conversation instead of delegation?',
                options: [
                  { text: 'For tasks that need close supervision or nuanced back-and-forth', correct: true },
                  { text: 'Only for simple questions', correct: false },
                  { text: 'Never — delegation is always better', correct: false },
                ],
                explanation: 'Direct conversation gives you maximum control and the ability to course-correct in real time. Use it for important, complex, or sensitive tasks where you want to stay hands-on.',
              },
              {
                question: 'Where do you check the status and results of delegated tasks?',
                options: [
                  { text: 'In the Home dashboard', correct: false },
                  { text: 'In the Sub-Agents panel (monitor icon in the Work page toolbar)', correct: true },
                  { text: 'In your email', correct: false },
                ],
                explanation: 'The Sub-Agents panel shows all running and completed background tasks. Click any task to see its full output and results.',
              },
            ],
          },
        ),
      ]),

      makeModule('mgr-templates', 'Using Templates', 'Save time with reusable instructions', ['delegating'], [
        makeLesson('mgr-tpl-1', 'Browsing the Template Library', 'interactive-walkthrough', 4,
          'Discover ready-made templates and how they work',
          {
            kind: 'walkthrough',
            introduction: 'Templates are pre-written instructions with fill-in-the-blank variables. Instead of typing the same complex prompt every time, you fill in a few blanks and send. Think of them like email templates or form letters — the structure is set, you just customize the details.',
            steps: [
              { title: 'Open the Templates panel', description: 'In the Work page, click the document icon in the panel toolbar to open Templates. You\'ll see a searchable library of ready-to-use templates.' },
              { title: 'Browse by category', description: 'Templates are organized by category — Code Review, Documentation, Analysis, Security, and more. Use the search bar or category filter to find what you need.' },
              { title: 'Understanding variables', description: 'Templates contain placeholders like {{project_name}} or {{branch}}. When you select a template, ClearPath shows a form where you fill in each variable before sending.', tip: 'Variables let one template work for many different situations.' },
              { title: 'QuickCompose', description: 'Below the chat input, you may see a QuickCompose bar with suggested templates based on your recent activity. This is the fastest way to grab a template.' },
            ],
            keyTakeaway: 'Templates turn multi-paragraph instructions into fill-in-the-blank forms. Browse the library to see what\'s available, and you\'ll soon find yourself using them for everything.',
          },
        ),
        makeLesson('mgr-tpl-2', 'Running a Template', 'guided-task', 5,
          'Use a template to send a structured prompt',
          {
            kind: 'guided-task',
            introduction: 'Let\'s use a template to send a structured prompt. This shows you how much time templates save — especially for complex instructions that would take several minutes to type from scratch.',
            goal: 'Select a template, fill in the variables, and send it to your session.',
            steps: [
              { title: 'Open Templates in a session', instruction: 'Make sure you have an active session, then open the Templates panel from the toolbar.', detail: 'Templates send their output directly into your current session.' },
              { title: 'Pick a template', instruction: 'Browse the library and click on any template that interests you. If you\'re not sure, look for a simple one with 1-2 variables.', detail: 'Templates show their name, category, and a preview of what they do. Click one to select it.', successCheck: 'A template form appears with fields to fill in.' },
              { title: 'Fill in the variables', instruction: 'Each variable has a labeled field. Type the relevant information for your situation. For example, if there\'s a {{project}} field, enter your project name.', detail: 'Some variables have default values pre-filled. You can change these or keep them.' },
              { title: 'Send it', instruction: 'Click Send. The template expands into a full prompt with your values inserted and sends it to the AI.', detail: 'Watch how the template turns into a detailed, well-structured instruction. This is why templates are powerful — they encode expert-level prompt writing.', successCheck: 'The expanded prompt appears in the chat and the AI starts responding.' },
            ],
            celebration: 'You just used your first template. Notice how much detail was in the expanded prompt — templates let you send expert-level instructions without being an expert yourself.',
          },
        ),
        makeLesson('mgr-tpl-3', 'Creating Your Own Templates', 'guided-task', 3,
          'Save a good prompt as a reusable template',
          {
            kind: 'guided-task',
            introduction: 'When you discover a prompt that works really well, save it as a template so you (and your team) can reuse it. This is like documenting a successful process so it can be repeated consistently.',
            goal: 'Create a new template from a prompt you\'ve used or would like to reuse.',
            steps: [
              { title: 'Open the Templates panel', instruction: 'Go to the Templates panel and look for the "Create" or "New Template" button.', detail: 'You can also create templates from the session summary screen after ending a session — look for "Save as Template".' },
              { title: 'Write the template body', instruction: 'Type or paste a prompt. Wherever you want a fill-in-the-blank, wrap it in double curly braces: {{variable_name}}.', detail: 'Example: "Review the {{file_path}} file for {{review_type}} issues and summarize findings in a table." This creates two variables: file_path and review_type.', successCheck: 'Your template shows the variables detected from the curly braces.' },
              { title: 'Add metadata', instruction: 'Give your template a clear name and choose a category. Good names describe the outcome, like "Weekly Status Summary" or "Security Quick Check".', detail: 'A good template name answers "what will this do for me?" at a glance.' },
              { title: 'Save and test', instruction: 'Save the template, then try using it right away. Select it, fill in the variables, and verify the expanded output looks right.', detail: 'Iterate on your templates — if the AI gives better results with slightly different wording, update the template.', successCheck: 'Your template appears in the library and can be selected.' },
            ],
            celebration: 'You\'ve created a reusable template. Every time you or your team uses it, you\'re saving the time of writing that prompt from scratch — and getting consistent, high-quality results.',
          },
        ),
      ]),

      makeModule('mgr-workflows', 'Building Workflows', 'Chain multiple AI steps into automated processes', ['mgr-templates'], [
        makeLesson('mgr-wf-1', 'What is the Composer?', 'interactive-walkthrough', 3,
          'Multi-step workflows: the AI equivalent of a process checklist',
          {
            kind: 'walkthrough',
            introduction: 'The Composer lets you build multi-step workflows — think of it like creating a checklist where each step is handled by AI. Instead of manually running five prompts one after another, you define them all upfront and let ClearPath execute them in sequence.',
            steps: [
              { title: 'Accessing the Composer', description: 'In the Work page header, switch from "Session" mode to "Compose" mode using the toggle buttons. The Composer canvas replaces the chat view.' },
              { title: 'How workflows work', description: 'Each workflow is a series of steps. Each step has a prompt that gets sent to the AI. The output of one step can feed into the next step, creating a pipeline of work.', tip: 'Like an assembly line — each station does its part, then passes the result forward.' },
              { title: 'Why use workflows?', description: 'Workflows are perfect for repeatable processes: weekly reports, code review checklists, onboarding documentation, audit procedures. Define once, run many times.' },
              { title: 'Templates + Workflows', description: 'Workflow steps can use templates, so you get the power of both: reusable prompt structure (templates) combined with multi-step automation (workflows).' },
            ],
            keyTakeaway: 'The Composer turns multi-step processes into automated workflows. Define the steps once, then run them whenever you need. Great for any repeatable process.',
          },
        ),
        makeLesson('mgr-wf-2', 'Your First Workflow', 'guided-task', 5,
          'Build a simple two-step workflow',
          {
            kind: 'guided-task',
            introduction: 'Let\'s build a simple workflow to see how steps connect. We\'ll create a two-step process: Step 1 analyzes something, Step 2 summarizes the analysis. This pattern — analyze then summarize — applies to dozens of real-world tasks.',
            goal: 'Create and run a two-step workflow in the Composer.',
            steps: [
              { title: 'Switch to Compose mode', instruction: 'In the Work page, click the "Compose" tab in the header. The Composer canvas will appear.', detail: 'The Composer is a separate workspace from your chat sessions. Think of it as a workflow design tool.', successCheck: 'You see the Composer interface with an option to add steps.' },
              { title: 'Add the first step', instruction: 'Click "Add Step" and enter a prompt like: "List all the main features of this project based on the README and source files."', detail: 'This first step will analyze the project. Its output becomes available to the next step.' },
              { title: 'Add the second step', instruction: 'Add another step with: "Based on the analysis above, create a one-paragraph executive summary suitable for a stakeholder presentation."', detail: 'This step automatically receives the output from Step 1 as context. The AI knows what "the analysis above" refers to.' },
              { title: 'Run the workflow', instruction: 'Click Run. Watch as ClearPath executes Step 1, waits for it to complete, then feeds its output into Step 2.', detail: 'The status indicator shows which step is currently running. Green checkmarks appear as each step completes.', successCheck: 'Both steps complete and you see the final executive summary.' },
            ],
            celebration: 'You\'ve built your first automated workflow. Imagine this for weekly status reports, code review checklists, or any multi-step process your team runs regularly.',
          },
        ),
        makeLesson('mgr-wf-3', 'Templates in Workflows', 'guided-task', 4,
          'Use templates as workflow steps for maximum reusability',
          {
            kind: 'guided-task',
            introduction: 'Workflow steps can use templates, giving you the best of both worlds: well-tested prompt templates as building blocks, connected into an automated pipeline. This is how teams build standardized processes.',
            goal: 'Add a template-based step to a workflow.',
            steps: [
              { title: 'Create or open a workflow', instruction: 'In the Composer, start a new workflow or open an existing one.', detail: 'You can build on the two-step workflow from the previous lesson if it\'s still available.' },
              { title: 'Add a template step', instruction: 'When adding a new step, look for the option to "Use Template" instead of writing a free-form prompt.', detail: 'This lets you pick from your template library. The template\'s variables become parameters of the workflow step.', successCheck: 'A template is attached to the step with its variable fields visible.' },
              { title: 'Fill in or map variables', instruction: 'Fill in the template variables. Some may be filled automatically from previous step outputs.', detail: 'This is where workflows become powerful — the output of Step 1 can automatically fill a variable in Step 2\'s template.' },
              { title: 'Save the workflow', instruction: 'Give your workflow a name and save it. You can run it again any time with different inputs.', detail: 'Saved workflows appear in your workflow list. You can share them with your team through config bundles.', successCheck: 'The workflow is saved and appears in your workflow list.' },
            ],
            celebration: 'Templates + Workflows = repeatable, standardized AI processes. Your team can run the same high-quality process every time, regardless of who\'s operating the tool.',
          },
        ),
        makeLesson('mgr-wf-4', 'Running and Monitoring Workflows', 'interactive-walkthrough', 4,
          'Understand workflow execution and handle issues',
          {
            kind: 'walkthrough',
            introduction: 'Once you launch a workflow, ClearPath runs each step in sequence. Let\'s learn how to monitor progress and handle situations where something goes wrong.',
            steps: [
              { title: 'Execution view', description: 'When a workflow runs, each step shows its status: waiting (gray), running (yellow pulse), completed (green check), or failed (red). You can watch the progress in real time.' },
              { title: 'Viewing step output', description: 'Click any completed step to see what the AI produced. This lets you verify quality at each stage, not just the final result.' },
              { title: 'Handling failures', description: 'If a step fails, the workflow pauses. You can read the error, fix the step\'s prompt, and retry — or skip the step and continue with the rest of the workflow.', tip: 'Failures are normal — AI isn\'t perfect. The ability to retry or skip keeps you moving forward.' },
              { title: 'Sending to a session', description: 'Once a workflow completes, you can send its output to a regular session for further refinement. This bridges the gap between automated processes and hands-on conversation.' },
            ],
            keyTakeaway: 'Workflows run step by step with visual progress. If something fails, you can retry or skip. Completed output can be sent to a session for further work.',
          },
        ),
        makeLesson('mgr-wf-5', 'Workflow Quiz', 'knowledge-check', 4,
          'Test your understanding of workflows',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s confirm you\'re ready to use workflows effectively.',
            questions: [
              {
                question: 'What\'s the main advantage of a workflow over typing individual prompts?',
                options: [
                  { text: 'Workflows are faster because they skip AI processing', correct: false },
                  { text: 'Workflows chain steps together so you define a process once and run it repeatedly', correct: true },
                  { text: 'Workflows don\'t use AI credits', correct: false },
                ],
                explanation: 'Workflows are about repeatability and consistency. Define your multi-step process once, then run it whenever needed. This is especially valuable for team-wide processes.',
              },
              {
                question: 'What happens to the output of one workflow step?',
                options: [
                  { text: 'It disappears after the step completes', correct: false },
                  { text: 'It\'s automatically available as context for the next step', correct: true },
                  { text: 'It\'s saved to a file on your desktop', correct: false },
                ],
                explanation: 'Each step\'s output feeds forward as context for subsequent steps. This is what makes workflows powerful — Step 2 can build on what Step 1 produced.',
              },
            ],
          },
        ),
      ]),

      makeModule('mgr-dashboard', 'Reading the Dashboard', 'Your command center for AI activity', ['mgr-workflows'], [
        makeLesson('mgr-dash-1', 'Understanding Widgets', 'interactive-walkthrough', 4,
          'What each dashboard widget tells you and why it matters',
          {
            kind: 'walkthrough',
            introduction: 'The Home dashboard shows widgets — small cards that each track a different aspect of your AI usage. Think of it like the dashboard in your car: you don\'t need to check every gauge constantly, but when you glance over, everything important is visible.',
            steps: [
              { title: 'Auth Status cards', description: 'Show whether Copilot and Claude are connected and ready. Green means good. If one goes red, you\'ll know immediately that something needs attention.' },
              { title: 'Recent Activity', description: 'Shows your most recent sessions, how long they lasted, and what AI was used. Useful for remembering what you worked on yesterday or reviewing your week.' },
              { title: 'Cost Tracking', description: 'Shows how much AI usage has cost today, this week, or this month. Budget bars fill up as you approach limits. This is critical for managing AI spend.', tip: 'If you manage a team budget, this widget is your early warning system.' },
              { title: 'Schedule & Learning', description: 'Shows upcoming scheduled tasks and your learning progress. Quick way to see what\'s automated and how your team is progressing through training.' },
            ],
            keyTakeaway: 'The dashboard gives you situational awareness in one glance. Check it at the start of each day to know where things stand.',
          },
        ),
        makeLesson('mgr-dash-2', 'Customizing Your Dashboard', 'guided-task', 3,
          'Arrange widgets to show what matters most to you',
          {
            kind: 'guided-task',
            introduction: 'Not everyone needs the same dashboard. You can add, remove, and rearrange widgets so your dashboard shows exactly what matters for your role.',
            goal: 'Rearrange at least one widget on your dashboard.',
            steps: [
              { title: 'Go to Home', instruction: 'Click Home in the sidebar to see your dashboard.', detail: 'The dashboard loads with a default widget layout that you can customize.' },
              { title: 'Enter edit mode', instruction: 'Look for an edit or customize button on the dashboard. This enables drag-and-drop for widget positioning.', detail: 'In edit mode, widgets show drag handles and resize grips.' },
              { title: 'Rearrange a widget', instruction: 'Drag a widget to a new position. Try moving the Cost widget to the top if budget tracking is important to you.', detail: 'Put your most-checked widgets at the top where they\'re visible without scrolling.', successCheck: 'A widget moves to its new position.' },
              { title: 'Save your layout', instruction: 'Exit edit mode. Your layout is saved automatically and will persist across app restarts.', detail: 'Each team member can have their own dashboard layout — it\'s a personal preference.' },
            ],
            celebration: 'Your dashboard now reflects your priorities. Put the metrics that matter most at the top for an at-a-glance daily check.',
          },
        ),
        makeLesson('mgr-dash-3', 'Key Metrics for Managers', 'interactive-walkthrough', 3,
          'The numbers that tell the story of AI impact',
          {
            kind: 'walkthrough',
            introduction: 'As a manager, certain metrics tell you whether AI is being used effectively and delivering value. Here are the key ones to track.',
            steps: [
              { title: 'Session count and frequency', description: 'How often is AI being used? A healthy pattern shows regular, consistent use — not spikes followed by silence. If usage drops, investigate whether people are stuck or have found the tool unhelpful.', tip: 'The Insights page has detailed charts for usage over time.' },
              { title: 'Cost per task', description: 'Track what AI costs relative to what it produces. A $0.50 AI session that replaces an hour of manual work is high-value. The Cost widget helps you spot expensive patterns.', tip: 'Costs vary by model. If a task doesn\'t need the most powerful model, switching to a lighter one saves money.' },
              { title: 'Workflow execution success rate', description: 'If you\'ve built team workflows, track how often they complete successfully. Frequent failures mean the workflow needs refinement.' },
              { title: 'Learning progress', description: 'For teams new to ClearPath, the learning widget shows who\'s progressing through training. Low engagement signals the need for more support or different training approaches.' },
            ],
            keyTakeaway: 'Track usage frequency, cost efficiency, workflow success rates, and learning engagement. These four metrics tell you whether AI adoption is on track.',
          },
        ),
      ]),

      makeModule('mgr-cost', 'Cost and ROI Tracking', 'Manage AI spend and demonstrate value', ['mgr-dashboard'], [
        makeLesson('mgr-cost-1', 'Understanding AI Costs', 'interactive-walkthrough', 4,
          'How AI pricing works and what drives your costs',
          {
            kind: 'walkthrough',
            introduction: 'AI usage costs money — specifically, you\'re charged based on how much text the AI reads and writes (measured in "tokens"). Understanding this helps you make smart decisions about which models to use and when.',
            steps: [
              { title: 'What are tokens?', description: 'Tokens are chunks of text — roughly 4 characters or 3/4 of a word. When you send a prompt, the AI reads tokens (input cost) and writes tokens back (output cost). Longer conversations cost more.', tip: 'A typical prompt exchange (question + answer) might use 1,000-3,000 tokens. At current prices, that\'s usually under $0.10.' },
              { title: 'Model pricing tiers', description: 'More capable models cost more. A lightweight model might cost $0.01 per exchange, while a premium model costs $0.10+. Use powerful models for complex tasks and lighter models for simple ones.' },
              { title: 'Where to see costs', description: 'Go to Insights and look at the Analytics tab. You\'ll see daily cost charts, per-session breakdowns, and model-by-model cost comparisons.' },
              { title: 'The cost badges in chat', description: 'After each AI response in a session, you may see a small cost badge. Click it to see token counts and cost for that specific exchange. This makes costs visible without being intrusive.' },
            ],
            keyTakeaway: 'AI costs are driven by conversation length and model choice. Use Insights to track spend, and choose models appropriate to the task complexity.',
          },
        ),
        makeLesson('mgr-cost-2', 'Setting Budgets', 'guided-task', 4,
          'Configure spending limits so there are no surprises',
          {
            kind: 'guided-task',
            introduction: 'Budget alerts warn you before spending gets out of control. You can set daily, weekly, or monthly limits. When a threshold is reached, ClearPath notifies you (and can optionally pause AI usage).',
            goal: 'Set up a budget alert for your team.',
            steps: [
              { title: 'Open budget settings', instruction: 'Go to Configure and find the Budget section (or go to Insights → Analytics → Budget).', detail: 'Budget settings are accessible from both places — Configure for setup, Insights for monitoring.' },
              { title: 'Set a daily limit', instruction: 'Enter a daily budget limit that makes sense for your usage. If you\'re unsure, start with something like $5/day for individual use or $25/day for a team.', detail: 'You can always adjust this later as you understand your actual usage patterns.', successCheck: 'A daily budget is saved and shown in the budget configuration.' },
              { title: 'Configure alert thresholds', instruction: 'Set alert thresholds — for example, notify at 75% of budget and again at 90%. You can also enable auto-pause, which stops AI usage when the budget is reached.', detail: 'Alert-only mode is good for awareness. Auto-pause is good if you have a hard spending cap.', successCheck: 'Alert thresholds are configured.' },
              { title: 'Test the notification', instruction: 'Check the notification bell — budget alerts appear there when thresholds are crossed.', detail: 'You can also set up webhook notifications to send alerts to Slack or email for team-wide visibility.' },
            ],
            celebration: 'Budget alerts are now active. You\'ll never be surprised by AI costs again — you\'ll get early warnings before limits are reached.',
          },
        ),
        makeLesson('mgr-cost-3', 'Making the Case for AI', 'interactive-walkthrough', 4,
          'How to demonstrate AI value to stakeholders',
          {
            kind: 'walkthrough',
            introduction: 'When leadership asks "is this AI tool worth it?", you need data. ClearPath tracks everything you need to build a compelling ROI story.',
            steps: [
              { title: 'Cost per task metric', description: 'Track what tasks cost via AI vs. the estimated manual time. If a 30-minute manual code review now takes 2 minutes at $0.05, that\'s a clear win. The Insights Analytics page helps you build this picture.', tip: 'Start tracking this from day one — the data gets more compelling over time.' },
              { title: 'Usage frequency', description: 'Show how often the tool is being used. Growing usage means the team is finding it valuable. Consistent daily use is better than sporadic spikes.' },
              { title: 'Task categories', description: 'Track what kinds of tasks AI handles: code reviews, documentation, analysis, bug fixes. This shows breadth of impact, not just depth.' },
              { title: 'Compliance reports', description: 'For regulated industries, show that AI usage is audited and compliant. ClearPath\'s Compliance tab generates exportable reports with full audit trails.' },
            ],
            keyTakeaway: 'Build your ROI case with three numbers: cost savings (AI vs. manual), frequency (how often it\'s used), and breadth (categories of tasks handled). ClearPath tracks all three.',
          },
        ),
      ]),

      makeModule('mgr-repos', 'Working Across Repos', 'Manage AI work across multiple projects', ['mgr-cost'], [
        makeLesson('mgr-repo-1', 'Setting Up a Workspace', 'guided-task', 4,
          'Organize multiple projects into one manageable view',
          {
            kind: 'guided-task',
            introduction: 'If your team works across multiple code repositories, workspaces let you group them together and manage them as a unit. Think of a workspace as a "team folder" that contains all the projects your team cares about.',
            goal: 'Create a workspace with at least two repositories.',
            steps: [
              { title: 'Open Workspaces', instruction: 'Go to Home and find the Workspaces section, or navigate to the Workspaces page if available.', detail: 'Workspaces are collections of repositories you manage together.' },
              { title: 'Create a workspace', instruction: 'Click "Create Workspace" and give it a descriptive name like "Backend Services" or "Q2 Projects".', detail: 'Choose a name that your team would recognize — this is a shared organizational tool.' },
              { title: 'Add repositories', instruction: 'Add at least two repositories to the workspace. You can browse for local repos or enter paths directly.', detail: 'Repositories in a workspace can be targeted by broadcasts and searches — the more repos you add, the more powerful workspace features become.', successCheck: 'Two or more repos appear in your workspace.' },
              { title: 'Review the workspace', instruction: 'Look at the workspace overview — it shows the status of each repo, recent activity, and quick actions.', detail: 'This becomes your central hub for multi-repo management.' },
            ],
            celebration: 'You have a workspace set up. Now you can manage multiple projects from one place instead of switching between them manually.',
          },
        ),
        makeLesson('mgr-repo-2', 'Broadcasting Tasks', 'guided-task', 4,
          'Send one instruction to all repos at once',
          {
            kind: 'guided-task',
            introduction: 'Broadcasting sends the same prompt to every repository in a workspace simultaneously. This is incredibly powerful for tasks like "check all repos for security vulnerabilities" or "update the copyright year in all README files".',
            goal: 'Send a broadcast prompt across your workspace.',
            steps: [
              { title: 'Open your workspace', instruction: 'Navigate to the workspace you created.', detail: 'You need at least two repos in the workspace for broadcasting to be useful.' },
              { title: 'Start a broadcast', instruction: 'Look for the "Broadcast" action and click it. Enter a prompt like: "List the main technologies used in this project."', detail: 'The same prompt will run against each repository independently, giving you per-repo results.', successCheck: 'The broadcast starts and shows progress for each repo.' },
              { title: 'Monitor progress', instruction: 'Watch as each repo processes the prompt. Results come in as each one finishes — they may complete at different times.', detail: 'Broadcasts run in parallel, so multiple repos are processed at the same time.' },
              { title: 'Review results', instruction: 'Once complete, review the per-repo results side by side. This gives you a cross-project overview from one command.', detail: 'This is especially powerful for audits, compliance checks, and team-wide updates.', successCheck: 'Results appear for each repository.' },
            ],
            celebration: 'You just issued one command across multiple projects. Broadcasting is like sending a team-wide email — one instruction, parallel execution, consolidated results.',
          },
        ),
        makeLesson('mgr-repo-3', 'Cross-Repo Search', 'guided-task', 4,
          'Search for patterns across all your projects',
          {
            kind: 'guided-task',
            introduction: 'Need to find where something is used across all your projects? Cross-repo search lets you query multiple codebases at once — great for finding dependencies, patterns, or potential issues.',
            goal: 'Search across repos in your workspace.',
            steps: [
              { title: 'Open workspace search', instruction: 'In your workspace view, look for a search function. Enter a search term relevant to your projects.', detail: 'You can search for file names, code patterns, configuration values, or any text across all repos.' },
              { title: 'Review results', instruction: 'Results show which repo each match comes from, making it easy to see the scope of whatever you\'re looking for.', detail: 'This is useful for questions like "which repos use this outdated library?" or "where are our API endpoints defined?"' },
              { title: 'Take action', instruction: 'From search results, you can open a session targeting a specific repo to work on what you found.', detail: 'Search → find → act is a powerful pattern for cross-project management.' },
            ],
            celebration: 'Cross-repo search gives you visibility across all your projects from one place. No more hunting through each project individually.',
          },
        ),
      ]),

      makeModule('mgr-compliance', 'Compliance and Security', 'Oversight and audit capabilities', ['mgr-repos'], [
        makeLesson('mgr-comp-1', 'Understanding the Audit Trail', 'interactive-walkthrough', 4,
          'Every AI action is logged and reviewable',
          {
            kind: 'walkthrough',
            introduction: 'ClearPath keeps a detailed audit log of every AI interaction — what was asked, what tools were used, what files were accessed or changed. This is essential for regulated industries and good practice for everyone.',
            steps: [
              { title: 'Opening the audit log', description: 'Go to Insights and look for the Compliance tab. The audit log shows a chronological list of all actions: sessions started, prompts sent, files modified, tools used.' },
              { title: 'Reading audit entries', description: 'Each entry shows who did it, when, what type of action, and details. You can filter by date range, action type, or user to find specific events.' },
              { title: 'Why auditing matters', description: 'Audit trails answer questions like: "What did the AI change last Tuesday?", "Has anyone accessed sensitive files?", or "What was the AI asked to do with our customer data?"', tip: 'Regular audit reviews (even quick ones) build trust with compliance teams.' },
              { title: 'Security events', description: 'Some actions are flagged as security events — like accessing protected files or exceeding permission boundaries. These stand out in the log for quick review.' },
            ],
            keyTakeaway: 'Every AI interaction is logged. The audit trail in Insights → Compliance gives you full visibility and is exportable for compliance reporting.',
          },
        ),
        makeLesson('mgr-comp-2', 'Security Guardrails', 'interactive-walkthrough', 3,
          'Protect sensitive data from AI access',
          {
            kind: 'walkthrough',
            introduction: 'You can configure rules that prevent the AI from accessing or modifying sensitive files — like environment files with passwords, credential stores, or confidential data. Think of these as security fences around sensitive areas.',
            steps: [
              { title: 'File protection patterns', description: 'In Configure, you can set file patterns that the AI cannot read or modify. Common patterns: .env files (passwords), credential files, customer data directories.' },
              { title: 'Sensitive data scanning', description: 'ClearPath can scan prompts for sensitive patterns before sending them to the AI — things like API keys, passwords, or credit card numbers accidentally pasted into a prompt.' },
              { title: 'Policy enforcement', description: 'Policies can be set to "warn" (show a notification but allow) or "block" (prevent the action entirely). Start with "warn" to see what gets flagged, then tighten to "block" for critical rules.' },
            ],
            keyTakeaway: 'Set file protection patterns and enable sensitive data scanning. Start with warnings, then tighten rules as you understand your team\'s usage patterns.',
          },
        ),
        makeLesson('mgr-comp-3', 'Exporting Compliance Reports', 'guided-task', 3,
          'Generate reports for auditors and stakeholders',
          {
            kind: 'guided-task',
            introduction: 'When compliance reviews come around, you need to produce reports showing AI usage was appropriate and controlled. ClearPath generates these for you.',
            goal: 'Export a compliance snapshot.',
            steps: [
              { title: 'Go to Compliance', instruction: 'Navigate to Insights → Compliance tab.', detail: 'This is your compliance hub — audit logs, security events, and report generation.' },
              { title: 'Generate a snapshot', instruction: 'Look for the "Export" or "Compliance Snapshot" action. Select the date range you want to cover.', detail: 'A compliance snapshot includes: all AI sessions, tools used, files accessed, security events, and active policies.', successCheck: 'A compliance report is generated.' },
              { title: 'Review before sharing', instruction: 'Review the generated report. Make sure it covers the period and scope needed.', detail: 'Reports are designed to be shareable with compliance officers, auditors, or leadership — the format is professional and comprehensive.' },
            ],
            celebration: 'You can now generate compliance reports on demand. When audit season comes, you\'re prepared.',
          },
        ),
      ]),

      makeModule('mgr-integrations', 'Connecting Project Management', 'Pull tickets and issues directly into AI sessions', ['mgr-compliance'], [
        makeLesson('mgr-int-1', 'Connecting GitHub Issues', 'guided-task', 4,
          'Link your GitHub issues so AI can work on real tasks',
          {
            kind: 'guided-task',
            introduction: 'When you connect your project management tools, you can pull real tickets and issues into AI sessions. Instead of describing a task from memory, you say "work on issue #42" and the AI gets all the context it needs.',
            goal: 'Connect or configure the GitHub integration.',
            steps: [
              { title: 'Open integrations', instruction: 'Go to Configure and find the Integrations section.', detail: 'ClearPath supports multiple project management tools. GitHub Issues is the most common starting point.' },
              { title: 'Connect GitHub', instruction: 'Follow the setup flow for GitHub. This typically uses your existing GitHub authentication.', detail: 'The integration reads issues and PRs from your repositories. It doesn\'t modify them unless you specifically ask it to.', successCheck: 'GitHub shows as connected in the integrations list.' },
              { title: 'Test it in a session', instruction: 'Start a session and try referencing a GitHub issue: "Look at issue #1 and tell me what it\'s about."', detail: 'The AI can read issue details, comments, and linked PRs to understand the full context of a task.' },
              { title: 'Using the Work Items panel', instruction: 'In the Work page, open the Work Items panel from the toolbar. Connected issues appear here for easy reference and drag-into-conversation.', detail: 'The Work Items panel is your task list inside ClearPath — issues from all connected tools in one view.' },
            ],
            celebration: 'GitHub Issues are now connected. You can reference issues directly in sessions, giving the AI full task context without manual copy-pasting.',
          },
        ),
        makeLesson('mgr-int-2', 'Connecting Jira', 'guided-task', 4,
          'Bring Jira tickets into your AI workflow',
          {
            kind: 'guided-task',
            introduction: 'For teams using Jira, this integration lets you pull Jira tickets directly into AI sessions. The setup is similar to GitHub — connect once, then reference tickets by key (like PROJ-123).',
            goal: 'Connect or understand the Jira integration setup.',
            steps: [
              { title: 'Open integrations', instruction: 'Go to Configure → Integrations and find the Jira section.', detail: 'If your team doesn\'t use Jira, you can skip this lesson — it works the same way for other tools.' },
              { title: 'Configure the connection', instruction: 'Enter your Jira instance URL and authentication credentials. Your IT team may need to provide an API token.', detail: 'ClearPath needs read access to your Jira project. Write access is optional and only needed if you want AI to update tickets.' },
              { title: 'Reference tickets in sessions', instruction: 'Once connected, you can reference tickets in chat: "Look at PROJ-123 and suggest an implementation approach."', detail: 'The AI reads the ticket description, acceptance criteria, and comments to understand the full scope.' },
              { title: 'Combined view', instruction: 'The Work Items panel shows both GitHub issues and Jira tickets together, giving you one unified task view.', detail: 'Having all tasks in one place, regardless of source, makes it easier to prioritize and delegate work to AI.' },
            ],
            celebration: 'Jira integration is configured. Your tickets are now accessible directly from ClearPath sessions.',
          },
        ),
        makeLesson('mgr-int-3', 'Pulling Tickets into Sessions', 'guided-task', 4,
          'Use real tickets as context for AI work',
          {
            kind: 'guided-task',
            introduction: 'The real power of integrations shows when you pull tickets directly into sessions. The AI gets the full ticket context — description, acceptance criteria, discussion — and can work on the task with full understanding.',
            goal: 'Pull a ticket into a session and have the AI work on it.',
            steps: [
              { title: 'Open Work Items panel', instruction: 'In the Work page, open the Work Items panel from the toolbar while you have an active session.', detail: 'The panel shows all your available tickets from connected tools.' },
              { title: 'Select a ticket', instruction: 'Find a ticket you\'d like to work on. Click it to see its details.', detail: 'You\'ll see the ticket title, description, status, assignee, and any linked items.' },
              { title: 'Send it to the session', instruction: 'Use the action to add the ticket context to your session, or reference it in your next prompt.', detail: 'Example: "Based on this ticket, outline the key requirements and suggest an implementation approach."', successCheck: 'The AI responds with ticket-aware analysis.' },
              { title: 'Work through the ticket', instruction: 'Continue the conversation to work through the ticket — planning, implementing, reviewing, or whatever the task requires.', detail: 'The AI remembers the ticket context throughout the session, so you don\'t need to re-explain it.' },
            ],
            celebration: 'You\'ve connected real project management to AI sessions. Instead of copy-pasting context, you pull tickets in directly and let the AI work with full understanding.',
          },
        ),
        makeLesson('mgr-int-4', 'Integrations Quiz', 'knowledge-check', 3,
          'Test your understanding of integrations',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s check your understanding of how integrations enhance your workflow.',
            questions: [
              {
                question: 'What\'s the main benefit of connecting project management tools like GitHub Issues or Jira?',
                options: [
                  { text: 'It makes ClearPath look more professional', correct: false },
                  { text: 'The AI gets full ticket context without you manually copy-pasting descriptions', correct: true },
                  { text: 'It replaces the need for project management tools', correct: false },
                ],
                explanation: 'Integrations bridge the gap between where tasks are defined (Jira, GitHub) and where they\'re worked on (ClearPath). The AI gets full context automatically.',
              },
              {
                question: 'Where can you see all your tickets from connected tools in one place?',
                options: [
                  { text: 'The Home dashboard', correct: false },
                  { text: 'The Work Items panel in the Work page toolbar', correct: true },
                  { text: 'The Settings page', correct: false },
                ],
                explanation: 'The Work Items panel consolidates tickets from all connected tools — GitHub Issues, Jira, etc. — into one view alongside your session.',
              },
            ],
          },
        ),
      ]),
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVELOPER TRACK — Technical deep-dives
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'developer', name: 'Developer Track', icon: '💻',
    description: 'Advanced sessions, agents, Git integration, and automation for developers',
    prerequisitePaths: ['getting-started'],
    modules: [
      makeModule('adv-sessions', 'Advanced Sessions', 'Master session modes and context management', [], [
        makeLesson('dev-sess-1', 'Session Modes', 'interactive-walkthrough', 4,
          'Normal, Plan, and Autopilot — three levels of AI autonomy',
          {
            kind: 'walkthrough',
            introduction: 'ClearPath gives you three modes that control how autonomous the AI is. Think of it like adjusting the cruise control — you can drive manually, let the car maintain speed, or enable full self-driving.',
            steps: [
              { title: 'Normal mode', description: 'The default. The AI responds to what you ask and requests permission before making changes. You\'re in full control at all times.', tip: 'Best for exploratory work, unfamiliar codebases, and when you want to understand each step.' },
              { title: 'Plan mode', description: 'The AI can analyze and plan but cannot execute changes. It will describe what it would do without actually doing it. Perfect for reviewing an approach before committing to it.', tip: 'Use Plan mode to get a roadmap before switching to Normal to execute.' },
              { title: 'Autopilot mode', description: 'The AI makes changes without asking permission for each one. Faster, but requires more trust. It will still follow any configured guardrails and tool restrictions.', tip: 'Best for well-understood, routine tasks where you\'ve already validated the approach.' },
              { title: 'Switching modes', description: 'Press Shift+Tab to cycle between modes, or click the mode indicator in the session header. You can switch mid-session — start in Plan, review the approach, then switch to Normal to execute.' },
            ],
            keyTakeaway: 'Normal = you approve each action. Plan = AI suggests but doesn\'t act. Autopilot = AI acts freely within your guardrails. Switch with Shift+Tab based on how much oversight the task needs.',
          },
        ),
        makeLesson('dev-sess-2', 'Resuming and Forking Sessions', 'guided-task', 4,
          'Pick up where you left off or branch from a previous conversation',
          {
            kind: 'guided-task',
            introduction: 'Sessions persist — you can come back to them later. Resuming picks up the conversation exactly where you stopped. Forking creates a new session that starts with all the context of an old one but lets you take a different direction.',
            goal: 'Resume a previous session or understand the resume flow.',
            steps: [
              { title: 'Find a previous session', instruction: 'In the Work page, use the session dropdown or click "All" to open the Session Manager. Find a completed session.', detail: 'The Session Manager shows all your sessions with search, filters, and sort options.' },
              { title: 'Resume the session', instruction: 'Select the session. From the welcome-back screen, click "Continue" on the session card. This starts a new session that continues from where the old one left off.', detail: 'The new session inherits the name (with " (cont)" suffix) and uses the same CLI. The conversation context from the previous session is carried forward.', successCheck: 'A new session starts with the previous session\'s context.' },
              { title: 'Understand forking', instruction: 'Forking is similar but creates a branch point — you keep the context but can take the conversation in a completely different direction.', detail: 'Think of it like branching a git history — same starting point, different future. Useful when you want to explore multiple approaches to the same problem.' },
              { title: 'When to use each', instruction: 'Resume when you\'re continuing the same task. Fork when you want to try a different approach to something you discussed.', detail: 'Most of the time, resume is what you want. Forking is an advanced technique for exploration.' },
            ],
            celebration: 'You can now pick up any session where you left off. No more re-explaining context when you return to a task.',
          },
        ),
        makeLesson('dev-sess-3', 'Managing Context', 'interactive-walkthrough', 4,
          'Keep sessions productive even for long conversations',
          {
            kind: 'walkthrough',
            introduction: 'AI has a limited "memory window" — it can only hold a certain amount of conversation at once (called the context window). Long sessions can fill this up. Here\'s how to manage it.',
            steps: [
              { title: 'Understanding context limits', description: 'Each AI model has a maximum context size. When your conversation gets long, older messages start to fall out of the AI\'s memory. You might notice it forgetting earlier instructions.', tip: 'This is normal — it\'s a technical limitation, not a bug.' },
              { title: 'The /compact command', description: 'Type /compact to compress the conversation history. The AI summarizes the key points of the conversation so far into a shorter form, freeing up space for new messages.', tip: 'ClearPath auto-compacts at 95% capacity, but you can do it manually when things feel sluggish.' },
              { title: 'The /clear command', description: 'If you\'re switching to a completely different topic, /clear wipes the conversation and starts fresh within the same session.' },
              { title: 'Strategy for long work', description: 'For multi-hour work sessions, periodically compact. For multi-day tasks, consider starting a new session and resuming — this gives you a clean context with only the most relevant history carried forward.' },
            ],
            keyTakeaway: 'Use /compact to compress long conversations, /clear for topic changes, and start new sessions for multi-day work. The AI\'s memory is finite — manage it proactively.',
          },
        ),
        makeLesson('dev-sess-4', 'Advanced Session Quiz', 'knowledge-check', 3,
          'Test your knowledge of advanced session features',
          {
            kind: 'knowledge-check',
            introduction: 'Check your understanding of modes, resuming, and context management.',
            questions: [
              {
                question: 'Which mode should you use if you want the AI to explain its approach before making any changes?',
                options: [
                  { text: 'Normal mode', correct: false },
                  { text: 'Plan mode', correct: true },
                  { text: 'Autopilot mode', correct: false },
                ],
                explanation: 'Plan mode lets the AI analyze and propose changes without executing them. It\'s perfect for reviewing an approach before committing to it.',
              },
              {
                question: 'What does /compact do?',
                options: [
                  { text: 'Deletes the session', correct: false },
                  { text: 'Compresses conversation history to free up context space', correct: true },
                  { text: 'Makes the AI respond in shorter messages', correct: false },
                ],
                explanation: '/compact summarizes the conversation so far into a compressed form. This frees up memory for the AI to continue working on new messages.',
              },
              {
                question: 'When should you start a fresh session instead of resuming?',
                options: [
                  { text: 'When you want to work on a completely different task', correct: true },
                  { text: 'Every time you close the app', correct: false },
                  { text: 'Only when the AI tells you to', correct: false },
                ],
                explanation: 'Start fresh for new tasks. Resume for continuing work on the same task. Fresh sessions give the AI clean context, while resumed sessions carry forward relevant history.',
              },
            ],
          },
        ),
      ]),

      makeModule('mastering-agents', 'Mastering Agents', 'Configure specialized AI behaviors', ['adv-sessions'], [
        makeLesson('dev-agent-1', 'Built-in vs Custom Agents', 'interactive-walkthrough', 4,
          'Understand the different types of agents available to you',
          {
            kind: 'walkthrough',
            introduction: 'Agents are pre-configured AI personalities and capabilities. Built-in agents come with the CLI tools. Custom agents are ones you create for your specific needs. Both give the AI specialized knowledge and behavior for specific tasks.',
            steps: [
              { title: 'Built-in agents', description: 'Copilot and Claude come with built-in agents like "Explore" (fast code browsing), "Task" (running builds/tests), "Code Review" (focused review), and "Plan" (implementation planning). These are well-tuned for their specific jobs.' },
              { title: 'Custom agents', description: 'You can create agents for your team\'s specific needs. A "Documentation Agent" that knows your docs style. A "Sprint Planner" that understands your project structure. Custom agents are defined in markdown files.', tip: 'Think of custom agents like job descriptions — they tell the AI what role to play.' },
              { title: 'The Agents panel', description: 'Open the Agents panel in the Work page to see all available agents. Toggle them on/off for your session. When an agent is active, the AI adopts its specialized behavior.' },
              { title: 'Agent profiles', description: 'You can save combinations of agents as profiles — for example, a "Code Review" profile that enables the review agent and disables editing tools, or a "Full Autonomy" profile for routine work.' },
            ],
            keyTakeaway: 'Built-in agents handle common tasks well. Custom agents let you specialize the AI for your team\'s unique needs. Use the Agents panel to manage which are active.',
          },
        ),
        makeLesson('dev-agent-2', 'Creating a Custom Agent', 'guided-task', 4,
          'Build an agent tailored to your workflow',
          {
            kind: 'guided-task',
            introduction: 'Custom agents are defined in .agent.md files — a simple markdown format with a frontmatter header describing the agent\'s capabilities, and a body with instructions. Let\'s create one.',
            goal: 'Create a custom agent using the Agent Creation Wizard.',
            steps: [
              { title: 'Open the Agents panel', instruction: 'Go to Work and open the Agents panel from the toolbar.', detail: 'Look for a "Create Agent" button or link.' },
              { title: 'Use the creation wizard', instruction: 'The wizard walks you through defining: name, description, what tools the agent can use, which model it should use, and its instructions (the system prompt).', detail: 'Instructions are the most important part — they tell the AI how to approach tasks. Be specific about your team\'s conventions and preferences.', successCheck: 'You fill in all wizard fields and see a preview.' },
              { title: 'Write clear instructions', instruction: 'For the agent instructions, describe: (1) what this agent specializes in, (2) how it should approach tasks, (3) what to prioritize, and (4) what to avoid.', detail: 'Example for a "Release Notes" agent: "You specialize in writing user-facing release notes. Focus on what changed from the user\'s perspective. Use clear, non-technical language. Group changes by category."' },
              { title: 'Save and test', instruction: 'Save the agent, toggle it on, and send a prompt to test it. Verify the AI\'s behavior matches your expectations.', detail: 'Iterate on the instructions until the agent behaves the way you want. Small wording changes can significantly improve results.', successCheck: 'Your custom agent appears in the agents list and can be toggled on.' },
            ],
            celebration: 'You\'ve created a custom AI specialist! This agent can be shared with your team so everyone benefits from your prompt engineering work.',
          },
        ),
        makeLesson('dev-agent-3', 'Using Agents in Sessions', 'guided-task', 4,
          'Activate agents to change how the AI approaches your task',
          {
            kind: 'guided-task',
            introduction: 'Toggling an agent on changes how the AI behaves for the rest of your session. The agent\'s instructions are added to the AI\'s context, shaping every response. Let\'s see this in practice.',
            goal: 'Toggle an agent on and observe how it changes the AI\'s behavior.',
            steps: [
              { title: 'Start a session without agents', instruction: 'Start a new session and send a prompt like: "Review the project structure and suggest improvements."', detail: 'This establishes a baseline for how the AI responds without any agent active.', successCheck: 'You get a general-purpose response.' },
              { title: 'Toggle an agent on', instruction: 'Open the Agents panel and toggle on a relevant agent — for example, "Code Review" or "Explore" if available.', detail: 'The agent becomes active for this session. You\'ll see an indicator showing which agents are enabled.', successCheck: 'An agent is shown as active in the panel.' },
              { title: 'Send the same prompt', instruction: 'Send the same or similar prompt again. Compare the response to the one without the agent.', detail: 'You should notice a difference in focus, detail level, or approach. The agent\'s specialization shapes the AI\'s behavior.' },
              { title: 'Experiment', instruction: 'Try toggling different agents for different tasks. Over time you\'ll learn which agents work best for which situations.', detail: 'You can have multiple agents active at once — their instructions combine. Be careful not to overload with too many conflicting agents.' },
            ],
            celebration: 'You\'ve seen how agents shape AI behavior. Matching the right agent to the right task gets you better, more targeted results.',
          },
        ),
        makeLesson('dev-agent-4', 'Agents Quiz', 'knowledge-check', 3,
          'Test your agent knowledge',
          {
            kind: 'knowledge-check',
            introduction: 'Check your understanding of the agent system.',
            questions: [
              {
                question: 'What\'s the difference between a built-in agent and a custom agent?',
                options: [
                  { text: 'Built-in agents are faster', correct: false },
                  { text: 'Built-in come with the CLI tools; custom ones are created by you for specific needs', correct: true },
                  { text: 'Custom agents cost more to run', correct: false },
                ],
                explanation: 'Built-in agents are general-purpose and come pre-installed. Custom agents let you create specialized behaviors for your team\'s unique needs.',
              },
              {
                question: 'How do you activate an agent for your session?',
                options: [
                  { text: 'Type the agent\'s name in the chat', correct: false },
                  { text: 'Toggle it on in the Agents panel', correct: true },
                  { text: 'Restart the application', correct: false },
                ],
                explanation: 'The Agents panel has toggle switches for each agent. Turn them on for your session and the AI adopts that agent\'s specialized behavior.',
              },
            ],
          },
        ),
      ]),

      makeModule('dev-tools', 'Tool and Permission Mastery', 'Control exactly what the AI can and cannot do', ['mastering-agents'], [
        makeLesson('dev-tool-1', 'Understanding Permissions', 'interactive-walkthrough', 4,
          'The permission system that keeps you in control',
          {
            kind: 'walkthrough',
            introduction: 'ClearPath lets the AI use "tools" — reading files, writing files, running shell commands, etc. The permission system controls which tools the AI can use and whether it needs to ask you first. This is your primary safety mechanism.',
            steps: [
              { title: 'The Tools panel', description: 'Open the Tools panel in the Work page to see all available tools and their current permission status: allowed, denied, or ask-per-use.' },
              { title: 'How permissions work', description: 'When the AI wants to use a tool, it either: (a) uses it silently (if allowed), (b) asks you first (default), or (c) is blocked (if denied). You control this per-tool.' },
              { title: 'Allow and Deny lists', description: 'The --allowedTools and --disallowedTools settings configure which tools are pre-approved or blocked. Useful for standardizing across a team.', tip: 'Allow file reading broadly, but be more selective about file writing and command execution.' },
              { title: 'Permission prompts', description: 'When the AI needs permission, a prompt appears in the chat asking you to Allow or Deny. This is where you make the call — the AI pauses until you respond.' },
            ],
            keyTakeaway: 'Permissions are your safety net. The AI can only do what you allow. Review the Tools panel to set your comfort level, and always pay attention to permission prompts.',
          },
        ),
        makeLesson('dev-tool-2', 'Permission Modes', 'interactive-walkthrough', 4,
          'Presets for common permission levels',
          {
            kind: 'walkthrough',
            introduction: 'Instead of configuring every tool individually, permission modes are presets that set a level of autonomy all at once. Think of them like security levels.',
            steps: [
              { title: 'Default mode', description: 'The AI asks permission for most actions. Good for learning what the AI does and when. You see everything before it happens.' },
              { title: 'Plan mode', description: 'Read-only. The AI can read and analyze but cannot modify anything. Perfect for exploration and planning phases.' },
              { title: 'Accept Edits mode', description: 'The AI can modify files without asking, but still asks permission for shell commands. A good middle ground for coding work.' },
              { title: 'Auto mode', description: 'The AI handles most operations autonomously, only asking for truly risky actions. For experienced users who trust the AI and have good guardrails in place.' },
              { title: 'Yolo mode (Copilot)', description: 'Everything is auto-approved. The AI acts without any permission prompts. Only use this for isolated environments, throwaway branches, or when you can easily undo changes.', tip: 'Despite the name, this is a legitimate mode for sandboxed environments and CI/CD pipelines.' },
            ],
            keyTakeaway: 'Start with Default mode. As you build trust, graduate to Accept Edits or Auto. Use Plan mode when you just want analysis. Match the mode to your risk tolerance for the task.',
          },
        ),
        makeLesson('dev-tool-3', 'MCP Server Setup', 'guided-task', 4,
          'Extend the AI\'s capabilities with external tool servers',
          {
            kind: 'guided-task',
            introduction: 'MCP (Model Context Protocol) servers add new tools to the AI. For example, an MCP server might give the AI access to your database, your CI/CD system, or a custom internal API. They\'re plugins that extend what the AI can do.',
            goal: 'View the MCP configuration and understand how servers are managed.',
            steps: [
              { title: 'Open MCP settings', instruction: 'In the Tools panel, look for the MCP section. It shows any configured MCP servers.', detail: 'MCP servers run as separate processes that the AI communicates with. They can be local or remote.' },
              { title: 'Understand available servers', instruction: 'Review the list of available or configured MCP servers. Each one provides specific tools — the name and description tell you what capabilities it adds.', detail: 'Common MCP servers: GitHub (full repo access), database connectors, API clients, custom internal tools.' },
              { title: 'Enable/disable servers', instruction: 'Toggle MCP servers on or off based on what you need. Only enable servers you trust — each one gives the AI additional capabilities.', detail: 'MCP servers appear as additional tools in the AI\'s toolbox. The same permission system applies.', successCheck: 'You can see which MCP servers are available and their status.' },
              { title: 'Adding new servers', instruction: 'To add a new MCP server, you\'ll need the server configuration (usually a JSON snippet). Your team lead or IT admin typically provides this.', detail: 'MCP is extensible — if you need the AI to interact with a custom system, an MCP server is how you bridge that gap.' },
            ],
            celebration: 'You understand how MCP extends AI capabilities. Your team can add custom integrations through MCP servers to make the AI work with your specific tools and systems.',
          },
        ),
      ]),

      makeModule('dev-workflows', 'Workflow Composition', 'Build complex multi-step automation', ['dev-tools'], [
        makeLesson('dev-wf-1', 'Chaining Complex Tasks', 'guided-task', 5,
          'Build a real-world multi-step workflow',
          {
            kind: 'guided-task',
            introduction: 'Real developer workflows often follow a pattern: explore the codebase → plan the approach → implement changes → test → review. Let\'s build this as an automated workflow.',
            goal: 'Create a 4-step workflow that follows the explore-plan-implement-test pattern.',
            steps: [
              { title: 'Open the Composer', instruction: 'Switch to Compose mode in the Work page header.', detail: 'We\'re going to build a workflow with 4 sequential steps.' },
              { title: 'Step 1: Explore', instruction: 'Add a step with: "Analyze the codebase structure. List the main components, their dependencies, and any code smells or issues you notice."', detail: 'This gives the AI a map of the codebase that subsequent steps can reference.' },
              { title: 'Step 2: Plan', instruction: 'Add a step with: "Based on the analysis, create a detailed implementation plan for improving the identified issues. List specific files to change and the changes needed."', detail: 'This step receives the Step 1 output and creates an actionable plan.' },
              { title: 'Steps 3-4: Implement & Test', instruction: 'Add an implementation step and a test step. The implementation uses the plan, and the test step verifies the changes.', detail: 'Each step builds on the previous, creating a coherent pipeline of work.', successCheck: 'A 4-step workflow is defined and ready to run.' },
            ],
            celebration: 'You\'ve built a production-quality workflow that mirrors how experienced developers work. Run it on any codebase to get analysis → planning → implementation → testing in one automated pipeline.',
          },
        ),
        makeLesson('dev-wf-2', 'Parallel Execution', 'guided-task', 5,
          'Run multiple steps simultaneously for faster results',
          {
            kind: 'guided-task',
            introduction: 'Some workflow steps don\'t depend on each other — they can run in parallel. For example, running a security audit and a code quality check at the same time. Parallel execution gets results faster.',
            goal: 'Create a workflow with parallel steps.',
            steps: [
              { title: 'Identify independent steps', instruction: 'Think about which tasks don\'t need each other\'s output. For example: security scan and performance analysis can run at the same time.', detail: 'Parallel steps are marked in the Composer — they run simultaneously instead of sequentially.' },
              { title: 'Configure parallel execution', instruction: 'In the Composer, when adding steps, look for options to run steps in parallel rather than in sequence.', detail: 'Parallel steps start at the same time and their results are collected when all finish.' },
              { title: 'Merge results', instruction: 'After parallel steps, add a sequential step that summarizes all parallel results into a consolidated report.', detail: 'Pattern: run analyses in parallel → merge into summary. This gives you speed and a clean combined output.' },
              { title: 'Run and observe', instruction: 'Run the workflow and watch the parallel steps execute simultaneously. Note how much faster it completes compared to running them sequentially.', detail: 'Parallel workflows are especially powerful for multi-repo operations — analyze all repos at once instead of one by one.', successCheck: 'Multiple steps run at the same time and complete independently.' },
            ],
            celebration: 'Parallel execution can cut workflow time dramatically. Use it whenever steps are independent of each other.',
          },
        ),
        makeLesson('dev-wf-3', 'Error Handling in Workflows', 'interactive-walkthrough', 4,
          'What happens when a step fails and how to recover',
          {
            kind: 'walkthrough',
            introduction: 'AI isn\'t perfect — workflow steps can fail. ClearPath gives you control over what happens next: retry, skip, or stop. Good error handling makes your workflows robust.',
            steps: [
              { title: 'When a step fails', description: 'The workflow pauses at the failed step. You\'ll see the error message and have three options: Retry (try again), Skip (continue with the next step), or Stop (halt the workflow).' },
              { title: 'Common failure causes', description: 'Steps fail when: the AI can\'t access needed files, a command returns an error, the prompt is ambiguous, or the context window is full. The error message usually points to the cause.' },
              { title: 'Retry vs Skip', description: 'Retry if the failure was transient (network issue, temporary error). Skip if the step isn\'t critical — later steps might still work without this one\'s output.', tip: 'You can edit the step\'s prompt before retrying to fix ambiguity issues.' },
              { title: 'Building resilient workflows', description: 'Write step prompts that handle edge cases: "If you can\'t find X, report what you did find instead." This reduces hard failures by giving the AI graceful fallback behavior.' },
            ],
            keyTakeaway: 'Workflows pause on failure and give you retry, skip, or stop options. Write resilient prompts with fallback instructions to reduce failures.',
          },
        ),
        makeLesson('dev-wf-4', 'Saving Reusable Workflows', 'guided-task', 4,
          'Turn a successful workflow into a team-wide standard',
          {
            kind: 'guided-task',
            introduction: 'When a workflow works well, save it so you and your team can run it again. Saved workflows can include template variables so they adapt to different projects.',
            goal: 'Save a workflow for reuse.',
            steps: [
              { title: 'Finalize your workflow', instruction: 'Open a workflow that you\'ve tested and are happy with.', detail: 'Make sure the prompts are clear and any project-specific details are replaced with variables.' },
              { title: 'Add variables', instruction: 'Replace project-specific values in your prompts with {{variable}} syntax. For example, replace a file path with {{target_directory}}.', detail: 'Variables make workflows reusable across different projects and contexts.' },
              { title: 'Save with a name', instruction: 'Save the workflow with a descriptive name that makes it easy to find later.', detail: 'Good names describe the outcome: "Full Code Review Pipeline" or "Weekly Security Audit".', successCheck: 'The workflow appears in your saved workflows list.' },
              { title: 'Share with team', instruction: 'Workflows can be exported as part of config bundles for team sharing via the Team Collaboration features.', detail: 'Standardized workflows ensure consistent quality regardless of who runs them.' },
            ],
            celebration: 'Your workflow is saved and reusable. A well-designed workflow is a team asset — it encodes your best practices into an automated process.',
          },
        ),
      ]),

      makeModule('dev-git', 'Git Integration', 'AI-powered version control workflows', ['dev-workflows'], [
        makeLesson('dev-git-1', 'The Git Panel', 'interactive-walkthrough', 4,
          'Visual git status alongside your AI session',
          {
            kind: 'walkthrough',
            introduction: 'The Git panel gives you visual version control information right next to your session. See what\'s changed, what\'s staged, and branch status without leaving ClearPath.',
            steps: [
              { title: 'Opening the Git panel', description: 'Click the Git icon in the Work page panel toolbar. The panel shows the current repository\'s git status.' },
              { title: 'File changes', description: 'Changed files are listed with their status — modified, added, deleted. You can see at a glance what the AI has changed during your session.' },
              { title: 'Branch info', description: 'The current branch name and its relationship to the remote (ahead/behind) are shown. This helps you stay oriented in your git workflow.' },
              { title: 'Using git context in sessions', description: 'You can reference git information in your prompts: "Review the changes I\'ve made on this branch" or "What files have changed since the last commit?" The AI can work with your git history.', tip: 'The AI can run git commands directly — ask it to create branches, stage changes, or even write commit messages.' },
            ],
            keyTakeaway: 'The Git panel gives you version control visibility alongside your AI work. Use it to track what\'s changed and reference git context in your prompts.',
          },
        ),
        makeLesson('dev-git-2', 'AI-Assisted PR Workflow', 'guided-task', 4,
          'Use AI to create high-quality pull requests',
          {
            kind: 'guided-task',
            introduction: 'One of the most powerful developer workflows: let the AI analyze your changes and help create a thorough pull request with a good description, test plan, and review notes.',
            goal: 'Use the PR builder or AI assistance to create a pull request.',
            steps: [
              { title: 'Open the Git panel', instruction: 'With your changes ready, open the Git panel to see the current status.', detail: 'Make sure you have committed changes on a branch that\'s ready for a PR.' },
              { title: 'Use the PR builder', instruction: 'Look for the PR creation feature in the Git panel, or ask the AI: "Help me create a pull request for my current changes."', detail: 'The AI reads your commit history, changed files, and diff to understand what was done.' },
              { title: 'Review the AI-generated description', instruction: 'The AI generates a PR description including: summary of changes, motivation, test plan, and any notable decisions. Review and edit as needed.', detail: 'AI-generated PR descriptions are thorough but may need human context for "why" decisions. Add your own notes.', successCheck: 'A PR description is generated that you can review.' },
              { title: 'Submit', instruction: 'Once you\'re happy with the description, submit the PR through the tool.', detail: 'The combination of AI analysis + your context creates better PRs than either alone.' },
            ],
            celebration: 'AI-assisted PRs save time on writing descriptions and ensure nothing is overlooked. The AI is great at the mechanical parts; you add the human context.',
          },
        ),
        makeLesson('dev-git-3', 'Worktrees for Parallel Development', 'interactive-walkthrough', 4,
          'Isolated environments for AI work that doesn\'t interfere with your main branch',
          {
            kind: 'walkthrough',
            introduction: 'Git worktrees let you check out multiple branches simultaneously in different directories. ClearPath can create worktrees for AI sessions, so the AI works in an isolated copy while your main branch stays clean.',
            steps: [
              { title: 'What is a worktree?', description: 'A worktree is like a parallel checkout of your repository. It\'s a separate directory with a different branch, but shares the same git history. Changes in one worktree don\'t affect the other.' },
              { title: 'Why use worktrees with AI?', description: 'When the AI makes changes, you might want those changes isolated until you\'ve reviewed them. A worktree gives the AI its own sandbox while your main working directory stays exactly as you left it.', tip: 'Especially useful for experimental or risky changes — if the AI\'s work isn\'t good, just delete the worktree.' },
              { title: 'Creating a worktree session', description: 'When starting a new session, you can opt to use a worktree. ClearPath creates the worktree, points the AI at it, and keeps your main directory clean.' },
              { title: 'Merging results', description: 'If the AI\'s work in the worktree looks good, merge the worktree branch into your main branch. If not, discard it. Either way, your main work was never at risk.' },
            ],
            keyTakeaway: 'Worktrees give AI sessions isolated environments. Your main branch stays clean while the AI experiments. Merge the good results, discard the bad.',
          },
        ),
      ]),

      makeModule('dev-files', 'File Explorer and Context', 'Control what the AI sees and works with', ['dev-git'], [
        makeLesson('dev-file-1', 'Navigating Your Codebase', 'interactive-walkthrough', 3,
          'Browse files and give the AI targeted context',
          {
            kind: 'walkthrough',
            introduction: 'The Files panel lets you browse your project\'s file structure. More importantly, it lets you control what the AI focuses on — instead of having the AI search everything, you can point it at specific files.',
            steps: [
              { title: 'Opening the Files panel', description: 'Click the folder icon in the Work page toolbar. A file tree shows your project structure.' },
              { title: 'Browsing structure', description: 'Expand directories to see their contents. Files show type indicators and modification dates. This is a quick way to orient yourself in a project.' },
              { title: 'File watching', description: 'ClearPath can watch for file changes in real time. If the AI (or another tool) modifies files, you\'ll see the updates reflected in the Files panel.', tip: 'This helps you track what the AI is actually changing during a session.' },
              { title: 'AI actions on files', description: 'Right-click a file to see AI-powered actions: Explain (what does this file do?), Review (find issues), Generate Tests (create test cases), and Refactor (improve the code).' },
            ],
            keyTakeaway: 'The Files panel is your window into the codebase. Use it to browse, track changes, and trigger targeted AI actions on specific files.',
          },
        ),
        makeLesson('dev-file-2', 'Focus Mode', 'guided-task', 4,
          'Narrow the AI\'s attention to specific files',
          {
            kind: 'guided-task',
            introduction: 'By default, the AI can see your entire project. Focus Mode lets you narrow its attention to specific files — useful when you want targeted analysis without the AI getting distracted by unrelated code.',
            goal: 'Select specific files and constrain the AI\'s scope.',
            steps: [
              { title: 'Open the Files panel', instruction: 'Open the Files panel in your Work page.', detail: 'You need an active session for focus mode to take effect.' },
              { title: 'Select files', instruction: 'Click on specific files or folders to select them. Look for a selection mode or checkboxes that let you multi-select.', detail: 'Selected files become the AI\'s focused context — it will prioritize these when answering questions or making changes.', successCheck: 'One or more files are selected/highlighted.' },
              { title: 'Send a focused prompt', instruction: 'With files selected, send a prompt like: "Review these files for potential bugs." The AI focuses its analysis on your selection.', detail: 'Focus mode is especially powerful for large projects where the AI might otherwise get overwhelmed by the codebase size.' },
              { title: 'Remove focus', instruction: 'Deselect the files to return to normal mode where the AI can see everything.', detail: 'Toggle focus as needed — focus for targeted work, unfocus for broad questions.' },
            ],
            celebration: 'Focus mode gives you precision control over AI attention. For large codebases, this is essential for getting relevant, targeted results.',
          },
        ),
        makeLesson('dev-file-3', 'Drag and Drop', 'guided-task', 3,
          'The fastest way to give the AI file context',
          {
            kind: 'guided-task',
            introduction: 'The quickest way to tell the AI about a specific file: drag it from the Files panel into the chat input. The file\'s content becomes part of your next message.',
            goal: 'Drag a file into the session input.',
            steps: [
              { title: 'Open Files panel alongside session', instruction: 'Have both the Files panel open and an active session visible.', detail: 'The split view lets you browse files while chatting.' },
              { title: 'Drag a file', instruction: 'Click and drag a file from the Files panel to the message input area at the bottom of the session.', detail: 'The file\'s path (and optionally content) will be attached to your next message, giving the AI specific context.', successCheck: 'The file reference appears in or near the input area.' },
              { title: 'Send with context', instruction: 'Type a prompt that references the file, like: "Explain what this file does and suggest improvements." Then send.', detail: 'The AI now has the exact file you\'re asking about — no ambiguity, no searching.', successCheck: 'The AI responds with analysis specific to the dragged file.' },
            ],
            celebration: 'Drag and drop is the fastest way to give the AI context. Browse, drag, ask — it takes seconds.',
          },
        ),
      ]),

      makeModule('dev-kb', 'Knowledge Base', 'Auto-generated documentation for your projects', ['dev-files'], [
        makeLesson('dev-kb-1', 'Generating Documentation', 'guided-task', 4,
          'Let AI analyze your project and generate documentation',
          {
            kind: 'guided-task',
            introduction: 'The Knowledge Base feature analyzes your project and generates structured documentation automatically — architecture overviews, API references, dependency maps, and more. It\'s like having a technical writer analyze your entire codebase.',
            goal: 'Generate a knowledge base for a project.',
            steps: [
              { title: 'Open the Knowledge panel', instruction: 'Open the Knowledge Base panel from the Work page toolbar.', detail: 'The Knowledge Base stores generated documentation in the .clear-path/knowledge-base/ directory.' },
              { title: 'Generate documentation', instruction: 'Click the generate action. The AI will analyze the project structure, code patterns, and existing docs to create comprehensive documentation.', detail: 'This can take a few minutes for large projects. The AI reads through files, identifies patterns, and writes documentation sections.', successCheck: 'Documentation sections begin appearing in the Knowledge panel.' },
              { title: 'Browse the sections', instruction: 'Generated documentation is organized into sections: Architecture, API Reference, Dependencies, Setup Guide, etc. Browse through them to see what was generated.', detail: 'Each section can be edited — the AI provides a starting point, and you refine it.' },
              { title: 'Review accuracy', instruction: 'AI-generated docs are good starting points but may contain inaccuracies. Review key sections for correctness, especially API details and architecture descriptions.', detail: 'Think of it as a first draft from a new team member — helpful but needs expert review.' },
            ],
            celebration: 'You have auto-generated project documentation. Even if it needs refinement, it\'s dramatically faster than writing from scratch.',
          },
        ),
        makeLesson('dev-kb-2', 'Using Quick Answer', 'guided-task', 4,
          'Ask questions about your codebase and get instant answers',
          {
            kind: 'guided-task',
            introduction: 'Quick Answer lets you query the Knowledge Base with natural language questions. Instead of searching through code, ask "Where is the authentication handled?" or "What database does this project use?" and get instant answers.',
            goal: 'Ask a question and get an answer from the Knowledge Base.',
            steps: [
              { title: 'Open the Knowledge panel', instruction: 'Make sure you have a generated knowledge base, then open the Knowledge panel.', detail: 'Quick Answer works best with a recently generated knowledge base.' },
              { title: 'Ask a question', instruction: 'In the Q&A section, type a question about your project. Try something like: "What are the main components of this project?"', detail: 'Questions are answered based on the generated documentation — the AI searches its analysis to find the answer.', successCheck: 'An answer appears with relevant information from the knowledge base.' },
              { title: 'Drill deeper', instruction: 'Ask follow-up questions to drill into specific areas. The Q&A supports conversational exploration.', detail: 'This is incredibly useful for onboarding new team members or quickly understanding unfamiliar code.' },
              { title: 'When to regenerate', instruction: 'If the project has changed significantly since the last generation, regenerate the knowledge base to keep answers current.', detail: 'Think of the knowledge base as a snapshot — it\'s accurate as of when it was generated.' },
            ],
            celebration: 'Quick Answer turns your codebase into a queryable knowledge system. Ask any question, get instant answers grounded in the actual code.',
          },
        ),
        makeLesson('dev-kb-3', 'Keeping Docs Current', 'interactive-walkthrough', 4,
          'Strategies for maintaining accurate project documentation',
          {
            kind: 'walkthrough',
            introduction: 'Documentation is only useful if it\'s accurate. Here\'s how to keep your AI-generated knowledge base current as the project evolves.',
            steps: [
              { title: 'Regular regeneration', description: 'Regenerate the knowledge base after significant changes — major feature additions, architectural shifts, or dependency updates. Weekly regeneration is a good cadence for active projects.' },
              { title: 'Editing generated content', description: 'You can edit any section of the knowledge base directly. If the AI got something wrong, fix it manually. Your edits are preserved until the next full regeneration.' },
              { title: 'Combining AI and human docs', description: 'Use AI generation for the structure and breadth, then add human-written context for the "why" behind decisions. AI captures "what" very well but often misses the reasoning.', tip: 'A good pattern: AI generates → human reviews and adds context → AI regenerates periodically → human reviews new sections.' },
              { title: 'Team contribution', description: 'Encourage your team to update the knowledge base when they discover inaccuracies. Shared documentation improves when everyone contributes.' },
            ],
            keyTakeaway: 'Regenerate weekly during active development. Edit AI-generated content to add human context. The knowledge base gets better over time with both AI and human contributions.',
          },
        ),
      ]),

      makeModule('dev-scheduling', 'Scheduling and Automation', 'Set up recurring AI tasks that run automatically', ['dev-kb'], [
        makeLesson('dev-sched-1', 'Creating a Scheduled Task', 'guided-task', 4,
          'Set up a task that runs on a schedule',
          {
            kind: 'guided-task',
            introduction: 'Scheduled tasks run automatically on a recurring basis — daily, weekly, or on a custom cron schedule. Great for routine maintenance like nightly test runs, weekly security scans, or daily report generation.',
            goal: 'Create a scheduled task.',
            steps: [
              { title: 'Open the Schedule tab', instruction: 'In the Work page, switch to the "Schedule" tab in the header.', detail: 'The Schedule view shows all configured scheduled tasks and their execution history.' },
              { title: 'Create a new task', instruction: 'Click the create action and define: task name, CLI to use, the prompt to run, and the schedule (frequency).', detail: 'Example: Name "Nightly Tests", schedule "Daily at 11pm", prompt "Run all tests and report any failures with suggested fixes."', successCheck: 'A scheduled task is created and shows in the list.' },
              { title: 'Set the schedule', instruction: 'Choose a frequency — common options include daily, weekly, or custom cron expressions for precise scheduling.', detail: 'Start with a conservative schedule (weekly) and increase frequency if the task proves valuable.' },
              { title: 'Review the first run', instruction: 'After the task runs for the first time, check its output to make sure it\'s doing what you expect.', detail: 'Scheduled task outputs are stored in the execution history so you can review them later.' },
            ],
            celebration: 'You have your first automated AI task! It will run on schedule without any manual intervention.',
          },
        ),
        makeLesson('dev-sched-2', 'Managing Schedules', 'interactive-walkthrough', 4,
          'Monitor execution history and handle missed runs',
          {
            kind: 'walkthrough',
            introduction: 'Scheduled tasks need monitoring — you want to know they\'re running successfully and catch failures early.',
            steps: [
              { title: 'The schedule dashboard', description: 'The Schedule tab shows all scheduled tasks with their last run status (success, failed, running) and next scheduled execution time.' },
              { title: 'Execution history', description: 'Click any scheduled task to see its execution history — when it ran, how long it took, and whether it succeeded or failed. Failed runs show the error details.' },
              { title: 'Handling failures', description: 'If a task fails, check the error output. Common issues: the AI couldn\'t access needed files, the prompt was too vague, or an external service was unavailable. Fix the issue and it will run correctly next time.' },
              { title: 'Pausing and resuming', description: 'You can pause a scheduled task without deleting it. Useful during deployments or maintenance windows when you don\'t want automated AI work running.' },
            ],
            keyTakeaway: 'Check your scheduled tasks regularly — review execution history for failures and adjust as needed. A well-maintained schedule is a powerful automation tool.',
          },
        ),
        makeLesson('dev-sched-3', 'Automating Workflows', 'guided-task', 4,
          'Run complex workflows on a schedule',
          {
            kind: 'guided-task',
            introduction: 'The ultimate automation: running a multi-step workflow on a schedule. This combines the power of workflows (multi-step processes) with scheduling (automatic execution).',
            goal: 'Schedule a workflow to run automatically.',
            steps: [
              { title: 'Have a saved workflow', instruction: 'Make sure you have a workflow saved from the Composer. If not, create a simple one first.', detail: 'Scheduled workflows run exactly like manual workflows, just triggered by the schedule instead of you clicking "Run".' },
              { title: 'Schedule the workflow', instruction: 'In the Schedule tab, create a new scheduled task and select the workflow as the task to run.', detail: 'You can fill in any workflow variables with default values that will be used for each scheduled run.' },
              { title: 'Set notifications', instruction: 'Configure notifications so you\'re alerted when the workflow completes or fails. Check the notification preferences.', detail: 'You don\'t need to watch scheduled workflows — let the notifications come to you.', successCheck: 'A scheduled workflow is configured with notifications.' },
              { title: 'Monitor over time', instruction: 'Check the execution history periodically to ensure the workflow is running smoothly and producing useful results.', detail: 'Scheduled workflows are the pinnacle of automation — define once, run forever, monitor occasionally.' },
            ],
            celebration: 'You\'ve set up fully automated AI workflows. This is the kind of automation that saves hours every week while maintaining consistent quality.',
          },
        ),
      ]),
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // POWER USER TRACK — Advanced capabilities
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'power-user', name: 'Power User Track', icon: '⚡',
    description: 'Advanced workflow patterns, agent engineering, and optimization for experienced users',
    prerequisitePaths: ['manager', 'developer'],
    modules: [
      makeModule('pu-adv-workflows', 'Advanced Workflow Patterns', 'Complex architectures for sophisticated automation', [], [
        makeLesson('pu-wf-1', 'Conditional Workflows', 'guided-task', 5,
          'Build workflows that branch based on AI analysis results',
          {
            kind: 'guided-task',
            introduction: 'Not every workflow should follow a straight line. Conditional workflows branch based on what the AI finds — like a flowchart where the next step depends on the outcome of the current one.',
            goal: 'Create a workflow with conditional branching.',
            steps: [
              { title: 'Design a conditional flow', instruction: 'Plan a workflow where Step 1 analyzes something, and the next step depends on the result. Example: "Check if tests pass. If yes, generate a release note. If no, diagnose and fix the failures."', detail: 'Conditional logic in the prompt itself is the simplest approach — the AI reads the result and decides what to do.' },
              { title: 'Implement in the Composer', instruction: 'Create the workflow steps. In the conditional step, write the prompt to include branching logic: "If the previous step found issues, fix them. If no issues were found, proceed with..."', detail: 'The AI follows the conditional instructions based on the actual output from the previous step.' },
              { title: 'Test both branches', instruction: 'Run the workflow in scenarios that trigger each branch to make sure both paths work correctly.', detail: 'Good testing of conditional workflows means testing all paths, not just the happy path.', successCheck: 'The workflow correctly follows different paths based on results.' },
              { title: 'Save the pattern', instruction: 'Save the conditional workflow as a template for your team.', detail: 'Conditional patterns are reusable: the same if/else structure works for many different analysis → action workflows.' },
            ],
            celebration: 'Conditional workflows add intelligence to your automation. The AI doesn\'t just follow a script — it adapts its behavior based on what it finds.',
          },
        ),
        makeLesson('pu-wf-2', 'Cross-Repo Workflows', 'guided-task', 5,
          'Orchestrate work across multiple repositories',
          {
            kind: 'guided-task',
            introduction: 'Cross-repo workflows send steps to different repositories — update a shared library, then update all services that use it, then run integration tests. This is enterprise-scale automation.',
            goal: 'Create a workflow that targets multiple repositories.',
            steps: [
              { title: 'Plan the cross-repo flow', instruction: 'Identify a multi-repo task. Example: "Update a dependency version across all repos, then verify each one builds."', detail: 'Cross-repo workflows use workspaces — each step targets a different repo in the workspace.' },
              { title: 'Configure repo targets', instruction: 'In the Composer, when adding steps, specify which repository each step targets.', detail: 'Some steps might broadcast to all repos (update dependency), while others target specific ones (run integration tests in the main service).' },
              { title: 'Handle coordination', instruction: 'Order the steps so dependencies are respected — update the library first, then update consumers, then test.', detail: 'Cross-repo workflows require careful step ordering to avoid inconsistencies.' },
              { title: 'Test on a subset', instruction: 'Before running across all repos, test on 2-3 repos to verify the workflow works correctly.', detail: 'Start small, verify, then scale up. Rolling out across all repos without testing risks widespread issues.', successCheck: 'A workflow targets multiple repos and completes successfully.' },
            ],
            celebration: 'Cross-repo workflows are the pinnacle of automation at scale. One workflow, many repos, coordinated execution.',
          },
        ),
        makeLesson('pu-wf-3', 'Workflow Templates for Teams', 'guided-task', 5,
          'Design parameterized workflows that anyone on the team can run',
          {
            kind: 'guided-task',
            introduction: 'The most impactful workflows are ones your whole team uses. Parameterized templates with clear variable names and descriptions make workflows accessible to everyone — not just the person who built them.',
            goal: 'Create a team-ready workflow template with good documentation.',
            steps: [
              { title: 'Choose a workflow to standardize', instruction: 'Pick a workflow that your team runs repeatedly. Good candidates: code review processes, release preparation, sprint closeout tasks.', detail: 'The best team workflows encode tribal knowledge that currently lives in people\'s heads.' },
              { title: 'Add clear variables', instruction: 'Replace project-specific values with descriptive variables: {{target_branch}}, {{release_version}}, {{reviewer_checklist}}.', detail: 'Variable names should be self-explanatory. Add descriptions that explain what to fill in.' },
              { title: 'Write usage instructions', instruction: 'Add a description to the workflow explaining: when to use it, what variables to fill in, and what output to expect.', detail: 'Your team members will see this description before running the workflow. Make it clear enough that someone new can use it.', successCheck: 'A documented workflow template with clear variables and instructions.' },
              { title: 'Share via config bundle', instruction: 'Export the workflow template as part of a team config bundle so others can import and use it.', detail: 'This is how you scale best practices — build once, share widely, everyone benefits.' },
            ],
            celebration: 'You\'ve created a team workflow standard. This is leadership through tooling — making good practices easy to follow.',
          },
        ),
      ]),

      makeModule('pu-agents', 'Custom Agents Deep Dive', 'Advanced agent design and orchestration', ['pu-adv-workflows'], [
        makeLesson('pu-ag-1', 'Agent Markdown Files', 'interactive-walkthrough', 5,
          'Understand the .agent.md format for full control over agent behavior',
          {
            kind: 'walkthrough',
            introduction: 'Under the hood, custom agents are markdown files with structured frontmatter. Understanding this format gives you full control over agent behavior, including features not exposed in the wizard.',
            steps: [
              { title: 'File structure', description: 'An .agent.md file has YAML frontmatter (between --- markers) with configuration, and a body with instructions. The frontmatter controls capabilities; the body controls behavior.' },
              { title: 'Key frontmatter fields', description: 'Name, description, model (which AI to use), tools (which tools the agent can access), and triggers (when to auto-activate). These define the agent\'s technical capabilities.' },
              { title: 'Writing effective instructions', description: 'The body of the file is the agent\'s system prompt. Be specific about: what the agent specializes in, how to approach tasks, what format to use for responses, and what to avoid.', tip: 'Longer, more specific instructions produce more consistent behavior. Don\'t be afraid of a 500-word agent description.' },
              { title: 'File locations', description: 'Agent files can be placed in .claude/agents/ (project-level) or ~/.claude/agents/ (global). Project agents are shared with the team via version control.' },
            ],
            keyTakeaway: 'Agent markdown files give you fine-grained control. Master the frontmatter for capabilities, the body for behavior. Store in your repo to share with the team.',
          },
        ),
        makeLesson('pu-ag-2', 'Multi-Agent Orchestration', 'guided-task', 5,
          'Use multiple agents together on complex tasks',
          {
            kind: 'guided-task',
            introduction: 'Some tasks benefit from multiple specialized agents working together — one analyzes architecture, another reviews security, a third checks test coverage. Multi-agent orchestration lets you divide complex work among specialists.',
            goal: 'Run a task with multiple agents contributing.',
            steps: [
              { title: 'Identify the agents needed', instruction: 'Think about a complex task and which perspectives would help. For a full code review, you might want: a security agent, a performance agent, and a code quality agent.', detail: 'Each agent brings a specialized lens to the same codebase.' },
              { title: 'Toggle multiple agents', instruction: 'In the Agents panel, toggle on multiple agents for your session.', detail: 'When multiple agents are active, their instructions combine. The AI tries to satisfy all agent requirements.' },
              { title: 'Delegate to sub-agents', instruction: 'Alternatively, use sub-agent delegation to run each specialist in parallel: "&security review" and "&performance review" as separate background tasks.', detail: 'Parallel sub-agents are faster — each runs independently and you combine results.', successCheck: 'Multiple agents or sub-agents working on the same codebase from different angles.' },
              { title: 'Synthesize results', instruction: 'In your main session, ask the AI to synthesize findings from all the specialist reviews into a consolidated report.', detail: 'The synthesis step is where multi-agent work becomes greater than the sum of its parts — patterns emerge that no single specialist would catch.' },
            ],
            celebration: 'Multi-agent orchestration multiplies AI effectiveness. Each specialist finds what it\'s tuned for, and the synthesis reveals cross-cutting insights.',
          },
        ),
        makeLesson('pu-ag-3', 'Agent Skills', 'guided-task', 5,
          'Attach specialized skills to agents for domain-specific capabilities',
          {
            kind: 'guided-task',
            introduction: 'Skills are additional capability modules that can be attached to agents. They give agents domain-specific knowledge or behavior — like giving a team member access to specialized training materials.',
            goal: 'Create or attach a skill to an agent.',
            steps: [
              { title: 'Open the Skills panel', instruction: 'In the Work page, open the Skills panel from the toolbar.', detail: 'Skills are separate from agents — they\'re modular capabilities that can be mixed and matched.' },
              { title: 'Explore available skills', instruction: 'Browse the skills list to see what\'s available. Each skill has a scope (which files/contexts it applies to), triggers (when it activates), and the tools it provides.', detail: 'Skills can be auto-invoked based on triggers — for example, a testing skill that activates whenever you\'re working on test files.' },
              { title: 'Create a skill', instruction: 'Use the skill wizard to create a new skill. Define its purpose, the instructions, which tools it needs, and when it should trigger.', detail: 'Example: A "Database Migration" skill that activates when SQL files are involved, knows your migration conventions, and can generate migration scripts.', successCheck: 'A new skill is created and visible in the skills list.' },
              { title: 'Attach to an agent', instruction: 'Skills can be linked to agents so they\'re always available when that agent is active. Configure this in the agent\'s settings.', detail: 'Agent + Skills = a fully specialized AI teammate with both personality (agent) and capabilities (skills).' },
            ],
            celebration: 'Skills add depth to your agents. An agent defines how the AI approaches work; skills define what specific capabilities it has. Together, they create powerful, specialized AI teammates.',
          },
        ),
      ]),

      makeModule('pu-templates', 'Template Engineering', 'Design effective, reusable prompt templates', ['pu-agents'], [
        makeLesson('pu-tpl-1', 'Designing Effective Templates', 'interactive-walkthrough', 4,
          'Principles for templates that consistently produce great results',
          {
            kind: 'walkthrough',
            introduction: 'Great templates are like great meeting agendas — they structure the interaction for optimal results. Here are the principles that make the difference between a mediocre template and one that consistently produces excellent output.',
            steps: [
              { title: 'Be specific about output format', description: 'Tell the AI exactly what format you want: "Respond as a markdown table with columns: Issue, Severity, File, Recommendation." Specific format instructions eliminate ambiguity.', tip: 'Templates with format instructions produce 3-5x more consistent output than those without.' },
              { title: 'Include context about why', description: 'Don\'t just say what to do — explain why. "Review this code for security issues because we handle financial data" produces better analysis than just "Review this code."' },
              { title: 'Use constraints productively', description: '"Limit your response to the 5 most critical findings" prevents information overload. "Focus only on {{scope}}" keeps the analysis targeted. Constraints improve quality by reducing noise.' },
              { title: 'Test and iterate', description: 'Run your template 3-5 times with different inputs. If the output quality varies significantly, the template needs more specific instructions. The best templates produce consistently good output regardless of input.', tip: 'Track which templates your team uses most — those are the ones worth perfecting.' },
            ],
            keyTakeaway: 'Great templates specify: what to analyze, why it matters, what format to use, and what constraints to apply. Test them multiple times and refine until output is consistently good.',
          },
        ),
        makeLesson('pu-tpl-2', 'Template Variables and Defaults', 'guided-task', 4,
          'Create flexible templates with typed variables and smart defaults',
          {
            kind: 'guided-task',
            introduction: 'Advanced templates use variables with types and default values. This makes templates easier to use (good defaults) and more reliable (the right kind of input).',
            goal: 'Create a template with variables that have meaningful defaults.',
            steps: [
              { title: 'Plan your variables', instruction: 'Think about what changes between uses of this template. Those are your variables. Common ones: file path, review focus area, output format, scope constraint.', detail: 'Good variable design: few variables (3-5), clear names, useful defaults.' },
              { title: 'Set smart defaults', instruction: 'For each variable, set a default value that works for the most common case. Users can override when needed.', detail: 'Example: {{review_focus}} with default "security and performance" covers the common case, but can be changed to just "security" for focused reviews.', successCheck: 'Variables have default values filled in.' },
              { title: 'Add descriptions', instruction: 'Each variable should have a brief description: "The file or directory to analyze" or "Focus area for the review (e.g., security, performance, readability)".', detail: 'Descriptions help team members who didn\'t create the template understand what to fill in.' },
              { title: 'Test with defaults', instruction: 'Run the template using only the defaults. If it produces useful output without changing anything, your defaults are good.', detail: 'The ideal template is useful with defaults and customizable for specific needs.', successCheck: 'The template runs well with default values and can be customized.' },
            ],
            celebration: 'Well-designed variables with smart defaults make templates accessible to everyone — fill in what you need, use defaults for the rest.',
          },
        ),
        makeLesson('pu-tpl-3', 'Sharing Templates Across Teams', 'guided-task', 4,
          'Export, import, and distribute templates organization-wide',
          {
            kind: 'guided-task',
            introduction: 'The most valuable templates are the ones used across the entire team. ClearPath\'s import/export system lets you distribute templates as easily as sharing a document.',
            goal: 'Export a template and understand the import process.',
            steps: [
              { title: 'Select templates to share', instruction: 'In the Templates panel, find templates you want to share with the team. These should be well-tested and documented.', detail: 'Only share templates that have been tested and produce consistent, useful results.' },
              { title: 'Export', instruction: 'Use the export function to package templates for sharing. This creates a file that others can import.', detail: 'Exports include the template body, variables, defaults, descriptions, and usage stats.' },
              { title: 'Distribute to team', instruction: 'Share the export file through your team\'s preferred channel — email, Slack, shared drive, or version control.', detail: 'For larger organizations, consider maintaining a shared template repository that everyone imports from.' },
              { title: 'Import process', instruction: 'Team members import the file through the Templates panel import function. Templates are added to their local library.', detail: 'Imported templates can be customized locally without affecting the shared version.', successCheck: 'Templates are exportable and the import process is understood.' },
            ],
            celebration: 'Shared templates are multiplied value — one person\'s great prompt engineering benefits the entire team. Build a culture of template sharing.',
          },
        ),
      ]),

      makeModule('pu-analytics', 'Advanced Analytics', 'Deep insights into AI cost and productivity', ['pu-templates'], [
        makeLesson('pu-ana-1', 'Cost Optimization', 'interactive-walkthrough', 4,
          'Reduce AI costs without reducing value',
          {
            kind: 'walkthrough',
            introduction: 'AI costs add up over time. Smart optimization means using the right model for each task — not always the most expensive one. Here\'s how to optimize without sacrificing quality.',
            steps: [
              { title: 'Model cost differences', description: 'Different models have dramatically different costs. A task that costs $0.50 on a premium model might cost $0.05 on a lighter one. The lighter model is often sufficient for simple tasks.' },
              { title: 'Task-model matching', description: 'Use expensive models for: complex reasoning, nuanced analysis, code generation. Use cheaper models for: summarization, formatting, simple questions. Match the model to the task complexity.', tip: 'ClearPath\'s /model command makes switching models mid-session easy.' },
              { title: 'Context management', description: 'Long conversations cost more because the AI processes all previous messages each time. Use /compact regularly and start fresh sessions for new tasks instead of reusing long conversations.' },
              { title: 'Template efficiency', description: 'Well-crafted templates reduce token usage by being concise and specific. A 200-word template that gets great results is cheaper than a vague 50-word prompt that requires follow-ups.' },
            ],
            keyTakeaway: 'Optimize costs by matching model to task complexity, managing context length, and using efficient templates. Small optimizations compound over time.',
          },
        ),
        makeLesson('pu-ana-2', 'Productivity Metrics', 'interactive-walkthrough', 4,
          'Measure the real impact of AI on your team\'s productivity',
          {
            kind: 'walkthrough',
            introduction: 'Beyond cost, you want to understand productivity impact. How much time is AI saving? What tasks is it handling? ClearPath tracks the data you need to tell this story.',
            steps: [
              { title: 'Task frequency analysis', description: 'In Insights → Analytics, review which types of tasks are run most often. High-frequency tasks with high success rates are your biggest wins.' },
              { title: 'Time savings estimation', description: 'Compare AI task completion time to estimated manual time. If a code review takes 2 minutes via AI vs. 30 minutes manually, that\'s 28 minutes saved per review.' },
              { title: 'Model usage patterns', description: 'Track which models are used for which tasks. If expensive models are being used for simple tasks, there\'s an optimization opportunity.' },
              { title: 'Team adoption curves', description: 'Track how usage changes over time. Healthy adoption shows steady growth in both frequency and variety of tasks. Declining usage signals training or tooling issues to address.' },
            ],
            keyTakeaway: 'Track task frequency, time savings, model usage, and adoption trends. These metrics tell the complete story of AI\'s impact on your team.',
          },
        ),
        makeLesson('pu-ana-3', 'Building Executive Reports', 'guided-task', 4,
          'Create compelling reports for leadership',
          {
            kind: 'guided-task',
            introduction: 'Leadership wants to know: is this tool worth the investment? Building reports from ClearPath\'s analytics gives you the data to answer definitively.',
            goal: 'Generate data for an executive-ready report.',
            steps: [
              { title: 'Gather the data', instruction: 'In Insights → Analytics, review the available charts and data for the period you want to report on.', detail: 'Key data points: total sessions, cost, estimated time saved, task categories, team adoption rate.' },
              { title: 'Calculate ROI', instruction: 'Compare total AI cost to estimated time savings (hours × hourly rate). This gives a concrete ROI number.', detail: 'Example: $200/month AI cost, 40 hours/month saved at $50/hour = $2,000 in productivity. ROI: 10x.', successCheck: 'You can articulate the cost vs. value equation.' },
              { title: 'Export the data', instruction: 'Use export functions in the Analytics tab to download charts and data for inclusion in presentations.', detail: 'ClearPath\'s compliance reports also contain useful data points about usage scope and security.' },
              { title: 'Frame the narrative', instruction: 'Structure the report as: investment (cost), return (time saved), breadth (categories of tasks), and trajectory (adoption growth).', detail: 'Lead with the ROI number. Support with specific examples of high-impact tasks. Show growth trend to justify continued investment.' },
            ],
            celebration: 'You have the data and framework for a compelling executive report. This is how you secure continued AI investment for your team.',
          },
        ),
      ]),

      makeModule('pu-policy', 'Policy and Compliance Design', 'Enterprise security and governance', ['pu-analytics'], [
        makeLesson('pu-pol-1', 'Creating Team Policies', 'guided-task', 4,
          'Design policies that protect your organization',
          {
            kind: 'guided-task',
            introduction: 'Policies define organizational rules for AI usage — what files are off-limits, what actions require approval, what data cannot be sent to AI. They\'re the guardrails that make AI safe for enterprise use.',
            goal: 'Create a policy with meaningful restrictions.',
            steps: [
              { title: 'Open the Policy editor', instruction: 'Navigate to Insights → Compliance and find the Policy section.', detail: 'Policies are defined as rules with enforcement levels.' },
              { title: 'Define file protections', instruction: 'Create rules that protect sensitive file patterns: .env files, credential stores, customer data directories.', detail: 'Use glob patterns like *.env, credentials/**, customer-data/**. These prevent AI from reading or modifying matching files.' },
              { title: 'Set enforcement level', instruction: 'Choose between "warn" (notify but allow) and "block" (prevent the action). Start with "warn" to understand what gets flagged.', detail: 'Starting with "warn" lets you tune the policy before it blocks real work. Move to "block" once you\'re confident the rules are right.', successCheck: 'A policy with file protection rules is created.' },
              { title: 'Test the policy', instruction: 'In a session, try to reference a protected file and verify the policy triggers correctly.', detail: 'Test both positive (policy catches the issue) and negative (policy doesn\'t block legitimate work) cases.' },
            ],
            celebration: 'Your policy protects sensitive resources while allowing productive AI work. This is the foundation of secure AI adoption.',
          },
        ),
        makeLesson('pu-pol-2', 'Distributing Policies', 'guided-task', 4,
          'Share policies across your organization',
          {
            kind: 'guided-task',
            introduction: 'Policies are only effective if everyone follows them. ClearPath\'s export system lets you distribute policies as part of config bundles, ensuring consistent security across the team.',
            goal: 'Export a policy for team distribution.',
            steps: [
              { title: 'Finalize the policy', instruction: 'Make sure your policy has been tested and is ready for team deployment.', detail: 'Review all rules one more time. A poorly-configured policy can block productive work.' },
              { title: 'Export as config bundle', instruction: 'Use the Team Collaboration features to export your policy as part of a config bundle that includes settings, policies, and templates.', detail: 'Config bundles are the standard way to distribute ClearPath configurations across a team.' },
              { title: 'Communicate to the team', instruction: 'Let your team know about the new policy: what it protects, why it exists, and what to do if they encounter a policy block.', detail: 'Good communication prevents frustration. People are more likely to accept restrictions they understand.' },
              { title: 'Monitor compliance', instruction: 'After deployment, check the audit log for policy violations. This shows whether the policy is working and whether anyone needs help understanding the rules.', detail: 'Regular monitoring turns a static policy into an active security posture.', successCheck: 'The policy is exported and ready for distribution.' },
            ],
            celebration: 'Organization-wide policy distribution ensures consistent security. Combined with monitoring, this creates a robust governance framework.',
          },
        ),
        makeLesson('pu-pol-3', 'Audit Log Investigation', 'guided-task', 4,
          'Trace AI activity for security reviews',
          {
            kind: 'guided-task',
            introduction: 'When a security question comes up — "What did the AI access?" or "Who ran this command?" — the audit log has the answers. Let\'s practice investigating.',
            goal: 'Conduct a basic audit trail investigation.',
            steps: [
              { title: 'Open the audit log', instruction: 'Go to Insights → Compliance and open the audit log.', detail: 'The audit log records every AI action: sessions, prompts, tool uses, file access, and configuration changes.' },
              { title: 'Filter by date and type', instruction: 'Use the filters to narrow down to a specific time period or action type. For example, filter to "file access" actions in the last week.', detail: 'Filtering is essential — the full audit log can be very long. Always start by narrowing the scope.' },
              { title: 'Trace a specific event', instruction: 'Find a specific event and trace it: who initiated it, what session it was part of, what was the context, and what was the result.', detail: 'Each audit entry links to its session, so you can see the full conversation that led to any action.', successCheck: 'You can trace an event from the audit log back to its originating session.' },
              { title: 'Export findings', instruction: 'If the investigation is for a security review, export the relevant entries for documentation.', detail: 'Audit exports can be filtered to specific events, making security reports focused and relevant.' },
            ],
            celebration: 'You can now investigate AI activity through the audit trail. This capability is essential for security reviews, incident response, and compliance audits.',
          },
        ),
      ]),

      makeModule('pu-local', 'Local Models and Offline Work', 'Run AI locally without internet', ['pu-policy'], [
        makeLesson('pu-local-1', 'Setting Up Ollama', 'guided-task', 5,
          'Configure a local AI model for offline or private work',
          {
            kind: 'guided-task',
            introduction: 'Ollama lets you run AI models on your own machine — no internet required, no data sent to cloud servers. This is ideal for sensitive work, air-gapped environments, or when you want to experiment without usage costs.',
            goal: 'Understand the Ollama setup process and connect it to ClearPath.',
            steps: [
              { title: 'Install Ollama', instruction: 'If not already installed, download Ollama from its website and install it. Your IT team can help with this.', detail: 'Ollama runs as a service on your machine. It provides an API that ClearPath connects to, similar to how it connects to Copilot or Claude.' },
              { title: 'Pull a model', instruction: 'Use Ollama to download a model. Popular choices: llama3 for general use, codellama for coding tasks. The Configure page shows available models.', detail: 'Models vary in size and capability. Larger models need more RAM and disk space but produce better results. Start with a mid-size model.' },
              { title: 'Connect in ClearPath', instruction: 'In Configure, find the Local Models section. ClearPath auto-detects running Ollama instances and lists available models.', detail: 'Once connected, local models appear as an option when starting new sessions — alongside Copilot and Claude.', successCheck: 'A local model appears in ClearPath\'s model list.' },
              { title: 'Test it', instruction: 'Start a session using the local model and send a prompt. Compare the response quality to cloud models.', detail: 'Local models are typically less capable than cloud models but work offline and at no per-use cost. They\'re a trade-off between capability and privacy/cost.' },
            ],
            celebration: 'You have a local AI running on your own hardware. No internet needed, no data leaves your machine, and no per-use costs. Perfect for sensitive work and experimentation.',
          },
        ),
        makeLesson('pu-local-2', 'Cloud vs Local Trade-offs', 'knowledge-check', 3,
          'Know when to use cloud models vs. local models',
          {
            kind: 'knowledge-check',
            introduction: 'Choosing between cloud and local models depends on your priorities. Let\'s test your understanding of the trade-offs.',
            questions: [
              {
                question: 'When is a local model the better choice?',
                options: [
                  { text: 'When you need the most powerful AI available', correct: false },
                  { text: 'When working with sensitive data that shouldn\'t leave your machine', correct: true },
                  { text: 'When the task is very complex and nuanced', correct: false },
                ],
                explanation: 'Local models keep all data on your machine — nothing is sent to cloud servers. This makes them ideal for sensitive data, classified environments, or privacy-critical work.',
              },
              {
                question: 'What\'s the main trade-off of using local models?',
                options: [
                  { text: 'They cost more per use', correct: false },
                  { text: 'They require internet', correct: false },
                  { text: 'They\'re typically less capable than the best cloud models', correct: true },
                ],
                explanation: 'Local models are generally smaller and less capable than top-tier cloud models. They work well for routine tasks but may struggle with complex reasoning or large-scale analysis.',
              },
              {
                question: 'Can you switch between local and cloud models in the same session?',
                options: [
                  { text: 'Yes, using the /model command', correct: true },
                  { text: 'No, you must start a new session', correct: false },
                  { text: 'Only if you restart the app', correct: false },
                ],
                explanation: 'The /model command lets you switch between any available model mid-session — cloud or local. Start with a local model for sensitive analysis, then switch to cloud for a complex follow-up question.',
              },
            ],
          },
        ),
      ]),
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN TRACK — Team setup and governance
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'admin', name: 'Admin Track', icon: '🔧',
    description: 'Team configuration, security, workspace management, and adoption tracking',
    prerequisitePaths: [],
    modules: [
      makeModule('admin-team', 'Team Configuration', 'Set up ClearPath for your team', [], [
        makeLesson('admin-team-1', 'Creating Config Bundles', 'guided-task', 4,
          'Package your configuration for easy team distribution',
          {
            kind: 'guided-task',
            introduction: 'A config bundle is a package of ClearPath settings, policies, templates, and agent configurations that you can distribute to your team. Instead of everyone configuring their own instance from scratch, they import your bundle and are immediately set up with team standards.',
            goal: 'Create a config bundle with team-standard settings.',
            steps: [
              { title: 'Open Team Collaboration', instruction: 'Navigate to Configure and find the Team Collaboration section.', detail: 'This section has tools for sharing configurations across team members.' },
              { title: 'Select what to include', instruction: 'Choose which configurations to bundle: settings, policies, templates, agent definitions, and/or skill configurations.', detail: 'Include everything you want standardized. Leave out personal preferences that should vary by user.', successCheck: 'Configuration items are selected for the bundle.' },
              { title: 'Export the bundle', instruction: 'Click Export to create the config bundle file.', detail: 'The bundle is a single file that encapsulates all selected configurations. Share it via your team\'s preferred channel.' },
              { title: 'Document what\'s included', instruction: 'Write a brief description of what the bundle contains and any setup steps needed after import.', detail: 'Good documentation makes the difference between a bundle that gets used and one that gets ignored.' },
            ],
            celebration: 'Your config bundle captures team standards in a shareable format. New team members can import it and be up and running with correct settings immediately.',
          },
        ),
        makeLesson('admin-team-2', 'Onboarding New Members', 'interactive-walkthrough', 4,
          'Guide new team members through their first ClearPath setup',
          {
            kind: 'walkthrough',
            introduction: 'When someone new joins the team and needs to use ClearPath, a smooth onboarding experience makes the difference between adoption and abandonment. Here\'s the recommended flow.',
            steps: [
              { title: 'First Run Wizard', description: 'ClearPath has a built-in first-run wizard that appears on first launch. It introduces the app, explains the basics, and lets users choose a preset (Conservative, Balanced, or Power User).', tip: 'Recommend "Balanced" for most team members. "Conservative" for those who want maximum control.' },
              { title: 'Import config bundle', description: 'After the wizard, have new members import the team config bundle. This configures their instance with team-standard settings, templates, and policies.' },
              { title: 'Authenticate', description: 'Walk them through connecting to Copilot and/or Claude. The Getting Started learning path covers this, but a quick walkthrough helps.', tip: 'Have auth credentials or tokens ready before the onboarding session.' },
              { title: 'Assign learning path', description: 'Point them to the Learning Center. The Getting Started path is mandatory. After that, recommend the path that matches their role.', tip: 'Set a goal: "Complete Getting Started by end of this week, then start the Manager Track."' },
            ],
            keyTakeaway: 'Smooth onboarding: First Run Wizard → Import config bundle → Authenticate → Start learning path. Have auth credentials ready in advance.',
          },
        ),
        makeLesson('admin-team-3', 'The Agent Marketplace', 'interactive-walkthrough', 4,
          'Browse and install community-created agents',
          {
            kind: 'walkthrough',
            introduction: 'The Agent Marketplace is where you can find and install agents created by the community or your organization. Instead of building everything from scratch, leverage what others have already built and refined.',
            steps: [
              { title: 'Browsing the marketplace', description: 'Open the Agents panel and look for the Marketplace section. Agents are organized by category: Code Review, Documentation, Security, DevOps, etc.' },
              { title: 'Evaluating agents', description: 'Each marketplace agent shows: description, author, usage stats, and reviews. Read the description carefully to understand what the agent does and how it\'s configured.', tip: 'Start with highly-rated agents in categories relevant to your team.' },
              { title: 'Installing agents', description: 'Click Install to add an agent to your local library. You can then toggle it on/off like any other agent.' },
              { title: 'Customizing installed agents', description: 'Installed agents can be customized — modify the instructions, add tools, or adjust the model. Think of marketplace agents as starting points that you tailor to your team\'s needs.' },
            ],
            keyTakeaway: 'The marketplace saves time by providing pre-built, community-tested agents. Install, customize to your needs, and share with your team.',
          },
        ),
      ]),

      makeModule('admin-integrations', 'Integration Administration', 'Connect ClearPath to external services', ['admin-team'], [
        makeLesson('admin-int-1', 'Connecting All Platforms', 'guided-task', 4,
          'Set up connections to GitHub, Jira, and other platforms',
          {
            kind: 'guided-task',
            introduction: 'ClearPath can integrate with multiple platforms simultaneously. As an admin, you\'ll set up these connections so the entire team has access to project management, issue tracking, and documentation tools through ClearPath.',
            goal: 'Review and configure available integrations.',
            steps: [
              { title: 'Survey available integrations', instruction: 'Go to Configure → Integrations. Review the list of available platforms: GitHub, Jira, Confluence, ServiceNow, and others.', detail: 'Each integration has a different authentication method. Some use OAuth, others use API tokens.' },
              { title: 'Connect the highest-priority platform', instruction: 'Start with the platform your team uses most. Follow the authentication flow for that platform.', detail: 'For GitHub, it often uses your existing GitHub authentication. For Jira, you typically need a team API token.' },
              { title: 'Test the connection', instruction: 'After connecting, verify it works: try pulling an issue or listing repos through ClearPath.', detail: 'Test with a non-sensitive issue first to confirm data flows correctly.', successCheck: 'The integration shows as connected and you can pull data through it.' },
              { title: 'Document the setup', instruction: 'Record what was configured, which credentials were used, and any special settings. This is critical for maintenance and troubleshooting.', detail: 'Integration configurations often need updating when credentials rotate or API versions change.' },
            ],
            celebration: 'Your team now has direct access to project management tools through ClearPath. This bridges the gap between task tracking and AI-assisted work.',
          },
        ),
        makeLesson('admin-int-2', 'Token Management', 'interactive-walkthrough', 4,
          'Securely manage API tokens and credentials',
          {
            kind: 'walkthrough',
            introduction: 'Integrations need API tokens or credentials to function. Managing these securely is a core admin responsibility. Here\'s how ClearPath handles credentials and what you need to know.',
            steps: [
              { title: 'Where tokens are stored', description: 'ClearPath stores integration tokens in the system keychain (on macOS) or encrypted storage. They\'re never written to plain-text configuration files.', tip: 'Never share tokens in chat messages, emails, or documentation. Always use secure credential management.' },
              { title: 'Token rotation', description: 'API tokens should be rotated periodically (every 90 days is a common policy). Set a reminder to update tokens before they expire. Expired tokens will cause integration failures.' },
              { title: 'Scope principle', description: 'Create tokens with the minimum permissions needed. Read-only access is sufficient for most ClearPath integrations. Only grant write access if the team actively uses AI to create issues or PRs.', tip: 'Start with read-only. Upgrade to read-write only when needed.' },
              { title: 'Environment variables', description: 'Some tokens can be set via environment variables (GH_TOKEN, ANTHROPIC_API_KEY). This is useful for CI/CD and automated environments where interactive login isn\'t possible.' },
            ],
            keyTakeaway: 'Store tokens securely, rotate them regularly, grant minimum permissions, and use environment variables for automated environments.',
          },
        ),
        makeLesson('admin-int-3', 'Testing Connections', 'guided-task', 4,
          'Verify integrations work and troubleshoot issues',
          {
            kind: 'guided-task',
            introduction: 'After setting up integrations, test them thoroughly. A broken integration is worse than no integration — team members will try to use it and get frustrated when it fails.',
            goal: 'Test an integration end-to-end.',
            steps: [
              { title: 'Check connection status', instruction: 'Go to Configure → Integrations and verify each connection shows a "Connected" status.', detail: 'Status indicators show: connected (green), disconnected (red), or authentication expired (yellow).' },
              { title: 'Test a basic operation', instruction: 'For each integration, try a simple operation: list recent issues, fetch a repo list, or pull a specific item.', detail: 'Basic operations test both authentication and permissions.', successCheck: 'The operation returns real data from the connected platform.' },
              { title: 'Test in a session', instruction: 'Start a session and try referencing integrated data: "List the open issues from project X" or "What\'s in Jira ticket PROJ-1?"', detail: 'This tests the full pipeline: ClearPath → integration → external platform → response back to AI.' },
              { title: 'Troubleshoot failures', instruction: 'If something fails, check: (1) token hasn\'t expired, (2) permissions are sufficient, (3) the platform is accessible (firewall/VPN). The error message usually points to the issue.', detail: 'Common fixes: refresh the token, grant additional permissions, or ensure network access to the platform\'s API.' },
            ],
            celebration: 'Your integrations are tested and working. Regular health checks (monthly) catch issues before your team encounters them.',
          },
        ),
        makeLesson('admin-int-4', 'Integration Health Monitoring', 'interactive-walkthrough', 3,
          'Keep integrations running smoothly over time',
          {
            kind: 'walkthrough',
            introduction: 'Integrations need ongoing maintenance. Tokens expire, APIs change, and network configurations shift. Proactive monitoring prevents surprise failures.',
            steps: [
              { title: 'Health dashboard', description: 'ClearPath\'s dashboard can show integration health widgets — last successful connection, response time, and any errors. Add this widget to your admin dashboard.' },
              { title: 'Proactive alerts', description: 'Configure notifications for integration failures. When a connection drops, you want to know immediately — not when a team member reports it.', tip: 'Set up webhook notifications to your admin Slack channel for integration alerts.' },
              { title: 'Scheduled health checks', description: 'Create a scheduled task that tests each integration periodically. This catches issues before they impact the team.' },
              { title: 'Token expiry calendar', description: 'Track when each token expires. Set reminders to rotate tokens a week before expiry. A spreadsheet or calendar reminder works fine for this.', tip: 'Token expiry is the #1 cause of integration failures. Track it proactively.' },
            ],
            keyTakeaway: 'Monitor integration health with dashboard widgets and proactive alerts. Track token expiry dates. Catch problems before your team does.',
          },
        ),
      ]),

      makeModule('admin-workspaces', 'Workspace Administration', 'Organize repositories for teams and projects', ['admin-integrations'], [
        makeLesson('admin-ws-1', 'Designing Workspaces', 'guided-task', 4,
          'Create workspace structures that match your organization',
          {
            kind: 'guided-task',
            introduction: 'Workspaces group repositories together. How you organize them affects how effectively your team can use features like broadcasting and cross-repo search. Design workspaces that match your team\'s actual work boundaries.',
            goal: 'Design and create a workspace structure.',
            steps: [
              { title: 'Map your team structure', instruction: 'Think about how work is organized in your team: by service? by product? by team? Workspaces should align with how people actually work.', detail: 'Common patterns: one workspace per product, one per team, one per "area of ownership". Choose what matches your org.' },
              { title: 'Create workspaces', instruction: 'Create workspaces for each grouping you identified. Give them clear names that teams will recognize.', detail: 'Example: "Payment Services" (containing payment-api, payment-gateway, payment-webhook repos)', successCheck: 'Workspaces are created with descriptive names.' },
              { title: 'Add repos to workspaces', instruction: 'Add the relevant repositories to each workspace. A repo can belong to multiple workspaces if it\'s shared across teams.', detail: 'Getting the repo-to-workspace mapping right is the most important part. Review it with team leads.' },
              { title: 'Document the structure', instruction: 'Create a brief guide explaining the workspace structure and which repos are in which workspace.', detail: 'When new repos are created, assign them to workspaces as part of the setup process.' },
            ],
            celebration: 'Your workspace structure mirrors how your team works. Broadcasting, search, and management features will now align with natural team boundaries.',
          },
        ),
        makeLesson('admin-ws-2', 'Batch Operations', 'guided-task', 3,
          'Perform bulk actions across workspace repos',
          {
            kind: 'guided-task',
            introduction: 'Workspaces enable batch operations — actions applied to all repos at once. This is an admin power tool for maintenance, consistency checks, and coordinated updates.',
            goal: 'Perform a batch operation across workspace repos.',
            steps: [
              { title: 'Open a workspace', instruction: 'Navigate to a workspace with multiple repos.', detail: 'Batch operations act on all repos in the workspace.' },
              { title: 'Choose a batch action', instruction: 'Look for batch operations like: pull latest changes, check branch status, or run a broadcast prompt.', detail: 'Common admin batch tasks: "Pull latest across all repos", "Check for outdated dependencies", "Verify CI status".', successCheck: 'A batch operation runs across multiple repos.' },
              { title: 'Review results', instruction: 'Check the results for each repo. Batch operations show per-repo status so you can identify which repos need attention.', detail: 'Look for repos that failed or had unexpected results. These may need individual attention.' },
            ],
            celebration: 'Batch operations save enormous time for admin tasks. What would take 20 minutes across 10 repos manually takes 30 seconds with a batch operation.',
          },
        ),
        makeLesson('admin-ws-3', 'Workspace Best Practices', 'knowledge-check', 3,
          'Test your workspace administration knowledge',
          {
            kind: 'knowledge-check',
            introduction: 'Confirm your understanding of workspace design and management.',
            questions: [
              {
                question: 'How should workspaces be organized?',
                options: [
                  { text: 'Alphabetically by repo name', correct: false },
                  { text: 'Matching how teams actually work — by product, team, or area of ownership', correct: true },
                  { text: 'One workspace per developer', correct: false },
                ],
                explanation: 'Workspaces should match natural work boundaries. When a workspace aligns with a team or product, broadcasting and cross-repo features are most useful.',
              },
              {
                question: 'What\'s the benefit of batch operations in workspaces?',
                options: [
                  { text: 'They make the dashboard look better', correct: false },
                  { text: 'They apply actions across all repos at once, saving significant time', correct: true },
                  { text: 'They\'re required before you can use any workspace features', correct: false },
                ],
                explanation: 'Batch operations let you perform the same action across all workspace repos simultaneously. Tasks like updating dependencies, checking status, or running consistency checks become dramatically faster.',
              },
            ],
          },
        ),
      ]),

      makeModule('admin-security', 'Security Best Practices', 'Protect your organization\'s data and processes', ['admin-workspaces'], [
        makeLesson('admin-sec-1', 'File Protection Patterns', 'guided-task', 4,
          'Prevent AI from accessing sensitive files',
          {
            kind: 'guided-task',
            introduction: 'File protection patterns are glob rules that prevent the AI from reading or modifying certain files. This is your first line of defense for sensitive data like credentials, environment files, and confidential documents.',
            goal: 'Configure file protection patterns.',
            steps: [
              { title: 'Identify sensitive patterns', instruction: 'List the file types and paths that contain sensitive data in your repos. Common ones: .env, *.key, *.pem, credentials/**, config/secrets/**.', detail: 'Think about: API keys, database passwords, certificates, customer data, financial data, proprietary algorithms.' },
              { title: 'Configure the rules', instruction: 'In Configure or the Policy editor, add file protection rules for each sensitive pattern.', detail: 'Use glob patterns: *.env matches all .env files anywhere, **/.env matches .env files in subdirectories, secrets/** matches everything in the secrets folder.', successCheck: 'File protection rules are configured.' },
              { title: 'Test the protections', instruction: 'In a session, try to ask the AI about a protected file. Verify the protection kicks in.', detail: 'The AI should either be blocked from accessing the file or show a warning, depending on your enforcement level.' },
              { title: 'Document for the team', instruction: 'Share the protection patterns with your team so they understand what\'s protected and why.', detail: 'Team members should know: these files are protected, if you need AI to work with them you\'ll need admin approval.' },
            ],
            celebration: 'File protections are in place. Sensitive data is shielded from AI access across your team.',
          },
        ),
        makeLesson('admin-sec-2', 'Prompt Scanning', 'interactive-walkthrough', 4,
          'Catch sensitive data before it\'s sent to AI',
          {
            kind: 'walkthrough',
            introduction: 'Sometimes people accidentally paste sensitive data into prompts — API keys, passwords, or personal information. Prompt scanning detects these patterns before the data is sent to the AI.',
            steps: [
              { title: 'How it works', description: 'When a user sends a prompt, ClearPath scans the text for patterns that look like sensitive data: API keys (long alphanumeric strings), passwords in configuration, credit card numbers, etc.' },
              { title: 'Configuring patterns', description: 'You can customize what\'s detected. Add patterns for your organization\'s specific formats — internal token formats, employee IDs, or project codes that shouldn\'t be shared with AI.' },
              { title: 'Warn vs Block', description: 'Like file protections, prompt scanning can warn (let the user decide) or block (prevent sending). Warnings are good for education; blocks are good for compliance-critical data.' },
              { title: 'Education value', description: 'Prompt scanning is also educational — when someone gets a warning, they learn what shouldn\'t go to AI. Over time, the team develops better habits and warnings decrease.', tip: 'Review warning logs periodically to identify training opportunities.' },
            ],
            keyTakeaway: 'Prompt scanning catches accidental exposure of sensitive data. Configure it for your organization\'s specific sensitive patterns. Start with warnings to educate, then block for critical data.',
          },
        ),
        makeLesson('admin-sec-3', 'Security Event Response', 'guided-task', 4,
          'Review and respond to security events',
          {
            kind: 'guided-task',
            introduction: 'Security events are flagged activities that may indicate a problem — attempts to access protected files, policy violations, or unusual usage patterns. Here\'s how to review and respond to them.',
            goal: 'Review security events in the audit log.',
            steps: [
              { title: 'Open security events', instruction: 'Go to Insights → Compliance and filter the audit log to security events only.', detail: 'Security events are flagged with higher severity and stand out in the log.' },
              { title: 'Assess each event', instruction: 'For each event, determine: was this intentional? is it a real concern? does it need follow-up?', detail: 'Many events are benign — someone accidentally referenced a protected file. Some may indicate training needs or policy gaps.', successCheck: 'You can identify and assess security events.' },
              { title: 'Take action', instruction: 'For legitimate concerns: contact the team member, adjust policies if needed, or escalate to security team. For training needs: point the person to relevant learning content.', detail: 'Most security events are learning opportunities, not incidents. Use them constructively.' },
              { title: 'Track trends', instruction: 'Over time, look for patterns. Increasing events of the same type signal a systemic issue — maybe the policy needs adjusting or the team needs additional training.', detail: 'Trend analysis is more valuable than individual event review. Look for patterns, not just incidents.' },
            ],
            celebration: 'You can now monitor, assess, and respond to security events. Regular review (weekly) keeps your security posture strong.',
          },
        ),
      ]),

      makeModule('admin-adoption', 'Measuring Team Adoption', 'Track and drive usage across your team', ['admin-security'], [
        makeLesson('admin-adopt-1', 'Reading Adoption Metrics', 'interactive-walkthrough', 4,
          'Understand your team\'s AI adoption status',
          {
            kind: 'walkthrough',
            introduction: 'Adoption metrics tell you how well ClearPath is being used across your team. Low adoption means low ROI. Understanding the metrics helps you identify where to focus support and encouragement.',
            steps: [
              { title: 'The adoption funnel', description: 'Think of adoption as a funnel: Installed → Configured → First Session → Regular Use → Power User. Track how many team members are at each stage.' },
              { title: 'Usage frequency', description: 'Track sessions per user per week. Healthy adoption shows regular, consistent use. Sporadic use suggests people aren\'t finding enough value or don\'t know how to use the tool effectively.' },
              { title: 'Feature breadth', description: 'Are people using only basic chat, or are they leveraging templates, workflows, delegation, and other features? Broader feature use indicates deeper adoption and higher value.' },
              { title: 'Learning progress', description: 'The Learning Center tracks progress per user. Low learning completion often correlates with low adoption — people who don\'t learn the features don\'t use them.', tip: 'The single most impactful thing you can do for adoption: ensure everyone completes the Getting Started learning path.' },
            ],
            keyTakeaway: 'Track adoption through the funnel: installed → configured → first use → regular use → power use. Focus support on the stages where people are getting stuck.',
          },
        ),
        makeLesson('admin-adopt-2', 'Driving Adoption', 'knowledge-check', 4,
          'Strategies for increasing team-wide AI usage',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s test your understanding of adoption strategies.',
            questions: [
              {
                question: 'A team member installed ClearPath but hasn\'t used it in two weeks. What\'s the most effective next step?',
                options: [
                  { text: 'Send them a reminder email', correct: false },
                  { text: 'Sit with them for 15 minutes, show them a workflow relevant to their actual work, and help them succeed', correct: true },
                  { text: 'Require daily usage in their performance review', correct: false },
                ],
                explanation: 'Hands-on, relevant help is the #1 driver of adoption. People need to experience value firsthand in the context of their real work. Generic reminders rarely work.',
              },
              {
                question: 'What\'s the best indicator that adoption is successful?',
                options: [
                  { text: 'Everyone has the app installed', correct: false },
                  { text: 'Regular, consistent usage across a variety of task types', correct: true },
                  { text: 'High spending on AI credits', correct: false },
                ],
                explanation: 'Successful adoption means the tool is a regular part of work across different tasks. Installation without usage isn\'t adoption. High spending without breadth might mean only one person is using it heavily.',
              },
              {
                question: 'Learning Center progress is low across the team. What should you do?',
                options: [
                  { text: 'Disable the learning center since nobody uses it', correct: false },
                  { text: 'Make time for team learning sessions and set path completion goals', correct: true },
                  { text: 'Nothing — learning is optional', correct: false },
                ],
                explanation: 'Low learning progress correlates with low feature adoption. Schedule dedicated learning time (even 30 minutes/week), set completion goals, and celebrate progress. People who learn the features use them.',
              },
            ],
          },
        ),
      ]),
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE DISCOVERY — Learn about locked features, unlock them when ready
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'feature-discovery', name: 'Feature Discovery', icon: '🔓',
    description: 'Learn about advanced features that are locked by default. Complete each training to understand what the feature does, when to use it, and unlock it for your workspace.',
    prerequisitePaths: ['getting-started'],
    recommended: true,
    modules: [

      // ── Composer & Workflows ──────────────────────────────────────────────
      makeModule('fd-composer', 'Composer & Multi-Step Workflows', 'Learn how to chain AI tasks into automated workflows', [], [
        makeLesson('fd-composer-1', 'What Is the Composer?', 'interactive-walkthrough', 4,
          'Understand multi-step workflows and when they matter',
          {
            kind: 'walkthrough',
            introduction: 'The Composer lets you chain multiple AI tasks into a single automated workflow. Instead of running one prompt at a time, you design a sequence — Step 1 feeds into Step 2, which feeds into Step 3 — and ClearPath runs them all in order. This is how you turn repetitive multi-step processes into one-click automations.',
            steps: [
              { title: 'What problem does it solve?', description: 'Many real tasks require multiple AI interactions: analyze data, then summarize findings, then draft an email about it. Without the Composer, you\'d manually copy output from one session and paste it into the next. The Composer eliminates that friction.', tip: 'Think about tasks where you find yourself saying "now take that and do this with it."' },
              { title: 'How it works', description: 'You add steps to a workflow canvas. Each step has a prompt. When you run the workflow, ClearPath executes Step 1, captures its output, and passes it as context to Step 2. Steps can run in sequence (one after another) or in parallel (simultaneously, for independent tasks).' },
              { title: 'Sequential vs. parallel', description: 'Sequential steps depend on the previous step\'s output — like "analyze then summarize." Parallel steps are independent — like "check documentation quality" and "review test coverage" at the same time. Parallel steps save time when tasks don\'t depend on each other.' },
              { title: 'Templates in workflows', description: 'Each workflow step can use a template. This means you can build tested, reliable prompt templates and wire them together into complex workflows. Change the template once, every workflow using it gets the update.' },
              { title: 'Saving and reusing workflows', description: 'Finished workflows can be saved and rerun. Your weekly status report? Build it once as a workflow, run it every Monday. Sprint retrospective prep? One-click. Onboarding checklist? Automated.' },
            ],
            keyTakeaway: 'The Composer turns repetitive multi-step AI tasks into saved, rerunnable workflows. Each step feeds into the next, and you can mix templates for consistency.',
          },
        ),
        makeLesson('fd-composer-2', 'When to Use Workflows vs. Single Sessions', 'interactive-walkthrough', 3,
          'Know when a workflow is the right tool and when a simple session is better',
          {
            kind: 'walkthrough',
            introduction: 'Not every task needs a workflow. Understanding when to use the Composer versus a regular session saves you time and prevents over-engineering simple tasks.',
            steps: [
              { title: 'Use a single session when...', description: 'The task is conversational — you\'re exploring, asking follow-up questions, or the output depends on your judgment at each step. Example: "Help me brainstorm marketing angles for our new product." You want to react and steer in real time.' },
              { title: 'Use a workflow when...', description: 'The steps are predictable and repeatable. You know what Step 1, 2, and 3 are every time. Example: "Pull metrics, analyze trends, draft weekly report." The same structure works every week — only the data changes.' },
              { title: 'The hybrid approach', description: 'Start with a single session to figure out the right prompts. Once you\'ve refined them, save them as templates and wire them into a workflow. This way you design interactively but execute automatically.' },
              { title: 'Real examples', description: 'Good workflow candidates: weekly/monthly reports, code review checklists, client onboarding sequences, sprint planning prep, documentation generation. Bad candidates: creative brainstorming, debugging investigations, exploratory analysis.' },
            ],
            keyTakeaway: 'Single sessions are for exploration. Workflows are for repetition. Design interactively, then automate the proven process.',
          },
        ),
        makeLesson('fd-composer-3', 'Composer Knowledge Check — Unlock Feature', 'knowledge-check', 3,
          'Test your understanding and unlock the Composer',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s verify you understand the Composer before we unlock it. Answer these questions to enable multi-step workflows in your workspace.',
            questions: [
              {
                question: 'What does the Composer do that a regular session cannot?',
                options: [
                  { text: 'It uses a more powerful AI model', correct: false },
                  { text: 'It chains multiple AI tasks where each step feeds into the next automatically', correct: true },
                  { text: 'It lets you write code directly', correct: false },
                  { text: 'It replaces the need for agents', correct: false },
                ],
                explanation: 'The Composer chains sequential and parallel AI steps into automated workflows. Each step\'s output becomes the next step\'s input — eliminating manual copy-paste between sessions.',
              },
              {
                question: 'When is a workflow better than a single session?',
                options: [
                  { text: 'When you want to brainstorm ideas', correct: false },
                  { text: 'When the task has predictable, repeatable steps you run regularly', correct: true },
                  { text: 'When the task is very simple', correct: false },
                  { text: 'Always — workflows are better for everything', correct: false },
                ],
                explanation: 'Workflows shine for repeatable processes with known steps. For one-off exploration or interactive conversations, a single session is faster and more flexible.',
              },
              {
                question: 'What happens to Step 1\'s output in a sequential workflow?',
                options: [
                  { text: 'It disappears after Step 1 finishes', correct: false },
                  { text: 'It gets emailed to your manager', correct: false },
                  { text: 'It\'s automatically passed as context to Step 2', correct: true },
                  { text: 'You have to manually copy it', correct: false },
                ],
                explanation: 'In a sequential workflow, ClearPath automatically captures each step\'s output and provides it as context to the next step. No manual intervention needed.',
              },
            ],
          },
        ),
      ]),

      // ── Scheduler ─────────────────────────────────────────────────────────
      makeModule('fd-scheduler', 'Scheduled Tasks', 'Automate tasks on a recurring schedule', [], [
        makeLesson('fd-scheduler-1', 'What Is the Scheduler?', 'interactive-walkthrough', 4,
          'Understand how to run AI tasks automatically on a schedule',
          {
            kind: 'walkthrough',
            introduction: 'The Scheduler lets you run AI tasks automatically at set times — daily, weekly, or on custom cron schedules. Think of it as setting an alarm clock for your AI assistant: "Every Monday at 9am, pull last week\'s metrics and draft a status report."',
            steps: [
              { title: 'Why schedule AI tasks?', description: 'Many tasks are time-based: weekly reports, daily standup summaries, monthly reviews, nightly code scans. Instead of remembering to run them manually, the Scheduler handles it for you. The AI runs while you focus on higher-value work.', tip: 'Start by identifying one task you do on a fixed schedule — that\'s your first candidate.' },
              { title: 'How scheduling works', description: 'You create a scheduled job with: (1) a prompt or workflow to run, (2) a schedule (daily at 9am, every Monday, first of the month, etc.), and (3) optional agent/skill context. ClearPath spawns a CLI session at the scheduled time and runs the task.' },
              { title: 'Cron expressions simplified', description: 'Schedules use cron format, but you don\'t need to memorize it. ClearPath provides presets: "Every day at 9am", "Every Monday", "Every first of the month", and a custom option where you pick day/time from dropdowns.' },
              { title: 'Job history and results', description: 'Every scheduled run is logged with its output, duration, and status (success, failed, timeout). You can review past runs to verify the AI is producing correct results before trusting it with more critical tasks.' },
              { title: 'Budget awareness', description: 'Scheduled tasks consume API credits just like manual sessions. The Scheduler respects your budget limits — if you\'re close to a ceiling, it will warn you. You can set per-job limits so a runaway task doesn\'t drain your budget.' },
            ],
            keyTakeaway: 'The Scheduler automates time-based AI tasks so they run without manual intervention. Always review job history when first setting up a new scheduled task.',
          },
        ),
        makeLesson('fd-scheduler-2', 'Scheduler Knowledge Check — Unlock Feature', 'knowledge-check', 3,
          'Test your understanding and unlock the Scheduler',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s make sure you understand the Scheduler before enabling it. Complete this check to unlock scheduled tasks.',
            questions: [
              {
                question: 'What does the Scheduler do?',
                options: [
                  { text: 'It schedules meetings on your calendar', correct: false },
                  { text: 'It runs AI tasks automatically at set times without manual intervention', correct: true },
                  { text: 'It speeds up the AI model', correct: false },
                  { text: 'It manages your team\'s work assignments', correct: false },
                ],
                explanation: 'The Scheduler spawns CLI sessions at configured times (daily, weekly, etc.) to run AI tasks automatically. You define what to run and when.',
              },
              {
                question: 'What should you do when first setting up a scheduled task?',
                options: [
                  { text: 'Set it to run every hour immediately', correct: false },
                  { text: 'Review job history after the first few runs to verify output quality', correct: true },
                  { text: 'Disable budget limits so it runs faster', correct: false },
                  { text: 'Nothing — set it and forget it', correct: false },
                ],
                explanation: 'Always review initial runs before trusting automated output. Verify the AI produces correct results, then let it run autonomously. Budget limits protect you from runaway costs.',
              },
              {
                question: 'How do scheduled tasks affect your API budget?',
                options: [
                  { text: 'They\'re free — scheduled tasks don\'t use credits', correct: false },
                  { text: 'They use credits like manual sessions and respect budget limits', correct: true },
                  { text: 'They use double the credits', correct: false },
                  { text: 'They bypass all budget controls', correct: false },
                ],
                explanation: 'Scheduled tasks consume API credits just like any other session. The Scheduler respects your configured budget ceilings and can be given per-job limits.',
              },
            ],
          },
        ),
      ]),

      // ── Sub-Agents ────────────────────────────────────────────────────────
      makeModule('fd-subagents', 'Sub-Agents & Background Tasks', 'Delegate work to background AI processes', [], [
        makeLesson('fd-subagents-1', 'What Are Sub-Agents?', 'interactive-walkthrough', 5,
          'Understand how to delegate tasks to background AI processes',
          {
            kind: 'walkthrough',
            introduction: 'Sub-agents are background AI processes that work independently while you continue your main conversation. Think of them as junior team members you can dispatch: "Go research this while I work on something else." They run in parallel, report back when done, and you review their work.',
            steps: [
              { title: 'The delegation model', description: 'In a regular session, you and the AI take turns — you send a prompt, wait for a response, send another. With sub-agents, you can say "go do this in the background" and immediately continue your main task. The sub-agent works independently and reports back.', tip: 'Use the & prefix or /delegate command to spawn a sub-agent from any session.' },
              { title: 'What sub-agents are good for', description: 'Research tasks ("find all places we use deprecated API X"), long-running analysis ("review every file in this directory for security issues"), and independent work streams ("draft the API docs while I write tests"). Anything that doesn\'t need your real-time input.' },
              { title: 'The Fleet Status panel', description: 'The Sub-Agents page shows all running and completed background tasks. You can see their status, output, and duration. You can kill a sub-agent if it\'s stuck or taking too long.' },
              { title: 'Resource awareness', description: 'Each sub-agent is a separate CLI process consuming its own API credits. Running 5 sub-agents simultaneously uses 5x the resources of a single session. Always be intentional about how many you spawn.', tip: 'Start with one sub-agent at a time until you understand the cost implications.' },
              { title: 'Reviewing sub-agent output', description: 'Sub-agents produce output logs you can review. Always check the results — sub-agents work unsupervised, so their output needs your judgment before acting on it. Think of it as reviewing a report from a team member.' },
            ],
            keyTakeaway: 'Sub-agents let you parallelize AI work. Use them for independent, well-defined tasks. Always review their output and be mindful of costs — each one is a separate session.',
          },
        ),
        makeLesson('fd-subagents-2', 'Sub-Agent Knowledge Check — Unlock Feature', 'knowledge-check', 3,
          'Test your understanding and unlock Sub-Agents',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s verify you understand sub-agents before enabling them.',
            questions: [
              {
                question: 'What is a sub-agent?',
                options: [
                  { text: 'A smaller, less capable AI model', correct: false },
                  { text: 'A background AI process that works independently while you continue your main task', correct: true },
                  { text: 'A shortcut for typing prompts', correct: false },
                  { text: 'Another name for a saved template', correct: false },
                ],
                explanation: 'Sub-agents are independent background processes. You delegate a task, they work on it without blocking your main session, and report back when done.',
              },
              {
                question: 'Why should you be careful about running many sub-agents simultaneously?',
                options: [
                  { text: 'They slow down your internet connection', correct: false },
                  { text: 'Each sub-agent uses its own API credits, multiplying resource consumption', correct: true },
                  { text: 'They can\'t run simultaneously', correct: false },
                  { text: 'There\'s no reason to be careful', correct: false },
                ],
                explanation: 'Each sub-agent is a separate CLI process with its own API usage. Five simultaneous sub-agents use roughly 5x the credits of one session. Be intentional about parallelism.',
              },
              {
                question: 'What should you always do with sub-agent output?',
                options: [
                  { text: 'Immediately act on it without checking', correct: false },
                  { text: 'Delete it', correct: false },
                  { text: 'Review it carefully before acting — sub-agents work unsupervised', correct: true },
                  { text: 'Forward it to your manager', correct: false },
                ],
                explanation: 'Sub-agents work without your real-time guidance. Always review their output like you would review work from a team member — verify before acting.',
              },
            ],
          },
        ),
      ]),

      // ── Knowledge Base ────────────────────────────────────────────────────
      makeModule('fd-knowledgebase', 'Knowledge Base', 'Auto-generate project documentation the AI can reference', [], [
        makeLesson('fd-kb-1', 'What Is the Knowledge Base?', 'interactive-walkthrough', 4,
          'Understand how auto-generated documentation helps AI work better',
          {
            kind: 'walkthrough',
            introduction: 'The Knowledge Base is ClearPath\'s auto-generated documentation system. It analyzes your project and produces structured documentation — architecture overviews, file summaries, dependency maps, and more. This documentation then feeds into your AI sessions as context, so the AI understands your project deeply without you having to explain everything from scratch.',
            steps: [
              { title: 'The problem it solves', description: 'Every time you start a new AI session, the AI starts with zero knowledge about your project. You end up re-explaining the same architecture, the same conventions, the same context. The Knowledge Base eliminates this by providing persistent, structured project knowledge.' },
              { title: 'How generation works', description: 'ClearPath scans your project files and auto-generates up to 10 documentation sections: architecture overview, file index, dependency map, API endpoints, coding conventions, and more. You can edit any section and regenerate as the project evolves.' },
              { title: 'Browsing and searching', description: 'The Knowledge Base has a section browser (like chapters in a book) and full-text search. You can quickly find information about any part of your project.' },
              { title: 'Q&A mode', description: 'You can ask natural language questions about the Knowledge Base content — "How does authentication work in this project?" — and get answers drawn from the generated documentation.' },
              { title: 'When to regenerate', description: 'After major project changes (new modules, architecture shifts, dependency updates), regenerate the Knowledge Base so it stays current. Think of it like updating your team\'s wiki after a big release.' },
            ],
            keyTakeaway: 'The Knowledge Base gives your AI persistent project understanding. Generate it once, keep it updated, and every session starts with deep context instead of a blank slate.',
          },
        ),
        makeLesson('fd-kb-2', 'Knowledge Base Knowledge Check — Unlock Feature', 'knowledge-check', 3,
          'Test your understanding and unlock the Knowledge Base',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s verify you understand the Knowledge Base before enabling it.',
            questions: [
              {
                question: 'What problem does the Knowledge Base solve?',
                options: [
                  { text: 'It makes the AI faster', correct: false },
                  { text: 'It eliminates the need to re-explain project context in every new session', correct: true },
                  { text: 'It replaces your project\'s README', correct: false },
                  { text: 'It stores your chat history', correct: false },
                ],
                explanation: 'The Knowledge Base provides persistent project documentation that feeds into AI sessions as context. Instead of re-explaining your architecture every time, the AI already knows.',
              },
              {
                question: 'When should you regenerate the Knowledge Base?',
                options: [
                  { text: 'Every time you start a session', correct: false },
                  { text: 'Never — it\'s always up to date', correct: false },
                  { text: 'After major project changes like new modules, architecture shifts, or dependency updates', correct: true },
                  { text: 'Only when it breaks', correct: false },
                ],
                explanation: 'The Knowledge Base is a snapshot. After significant project changes, regenerate it so the AI has current information. Minor changes don\'t require regeneration.',
              },
            ],
          },
        ),
      ]),

      // ── Voice ─────────────────────────────────────────────────────────────
      makeModule('fd-voice', 'Voice Commands', 'Control ClearPath with your voice', [], [
        makeLesson('fd-voice-1', 'What Are Voice Commands?', 'interactive-walkthrough', 3,
          'Understand how voice input works in ClearPath',
          {
            kind: 'walkthrough',
            introduction: 'Voice Commands let you speak to ClearPath instead of typing. Your speech is converted to text and sent as a prompt — useful for quick questions, hands-free operation, or when typing is inconvenient. It also supports audio notifications so you hear when tasks complete.',
            steps: [
              { title: 'How it works', description: 'Click the microphone icon to start recording. Speak your prompt naturally. ClearPath uses speech-to-text to convert your words and sends them as a regular prompt. The AI responds in text (not audio) in the chat.' },
              { title: 'When voice is useful', description: 'Quick queries while multitasking ("What\'s the status of the build?"), dictating long descriptions, hands-free use while reviewing documents on another screen, or accessibility needs.' },
              { title: 'Voice command mapping', description: 'Certain phrases map to app actions: "start a new session" opens a session, "go to settings" navigates to Configure. These voice shortcuts mirror keyboard shortcuts for accessibility.' },
              { title: 'Audio notifications', description: 'When enabled, ClearPath plays audio cues for events: task completion, errors, and permission requests. Useful when you\'re not watching the screen.' },
            ],
            keyTakeaway: 'Voice is an input method, not a different AI. Everything you can type, you can say. Audio notifications keep you informed when you\'re not looking at the screen.',
          },
        ),
        makeLesson('fd-voice-2', 'Voice Knowledge Check — Unlock Feature', 'knowledge-check', 2,
          'Test your understanding and unlock Voice Commands',
          {
            kind: 'knowledge-check',
            introduction: 'Quick check before unlocking Voice Commands.',
            questions: [
              {
                question: 'How does Voice input work in ClearPath?',
                options: [
                  { text: 'It uses a separate AI that understands only voice', correct: false },
                  { text: 'Speech is converted to text and sent as a regular prompt', correct: true },
                  { text: 'It replaces keyboard input entirely', correct: false },
                  { text: 'It only works with specific phrases', correct: false },
                ],
                explanation: 'Voice is a speech-to-text input method. Your spoken words become text prompts processed by the same AI. Everything you can type, you can say.',
              },
              {
                question: 'What are audio notifications useful for?',
                options: [
                  { text: 'Making the app louder', correct: false },
                  { text: 'Replacing visual notifications entirely', correct: false },
                  { text: 'Alerting you when tasks complete or need attention while you\'re not watching the screen', correct: true },
                  { text: 'Nothing — they\'re just for fun', correct: false },
                ],
                explanation: 'Audio notifications are useful when you\'re multitasking or not looking at the screen — you\'ll hear when a task finishes, errors occur, or permissions are needed.',
              },
            ],
          },
        ),
      ]),

      // ── Compliance Logs ───────────────────────────────────────────────────
      makeModule('fd-compliance', 'Compliance & Audit Logs', 'Track every action for governance and compliance', [], [
        makeLesson('fd-compliance-1', 'What Are Compliance Logs?', 'interactive-walkthrough', 5,
          'Understand audit logging and why it matters for your organization',
          {
            kind: 'walkthrough',
            introduction: 'Compliance Logs record every significant action taken in ClearPath — sessions started, prompts sent, tools used, files accessed, configuration changes, and policy violations. This audit trail is essential for organizations that need to demonstrate governance over AI tool usage.',
            steps: [
              { title: 'Why audit logging matters', description: 'In regulated industries (finance, healthcare, government) or security-conscious organizations, you need to prove who did what, when, and why. Compliance logs answer: "What AI prompts were sent?", "What files did the AI access?", "Who changed the security policy?", "Were there any policy violations?"' },
              { title: 'What gets logged', description: 'Six categories: Session events (start, stop, duration), Prompt events (every input sent to AI), Tool events (file reads, writes, shell commands), File events (files created, modified, deleted), Config events (settings and policy changes), Policy events (violations, blocks, overrides).' },
              { title: 'Security event tracking', description: 'Specific high-risk actions are flagged as security events: permission escalations, sensitive file access, policy overrides, and unusual usage patterns. These are surfaced separately for quick review.' },
              { title: 'File pattern protection', description: 'You can define file patterns (like *.env, credentials.*, secrets/*) that trigger alerts when accessed. This creates a second layer of awareness beyond what the CLI\'s built-in permissions provide.' },
              { title: 'Compliance snapshot export', description: 'You can export the full audit log as a JSON file for external compliance tools, auditors, or your security team. This is how you demonstrate governance to stakeholders who don\'t use ClearPath.' },
              { title: 'Policy enforcement modes', description: 'Policies can operate in "monitor" mode (log but don\'t block), "warn" mode (show warning, let user proceed), or "enforce" mode (block the action). Start with monitor to understand patterns, then tighten as needed.' },
            ],
            keyTakeaway: 'Compliance logs create an audit trail for every AI interaction. Start with monitor mode to understand patterns, then enforce policies based on real data. Export snapshots for auditors.',
          },
        ),
        makeLesson('fd-compliance-2', 'Compliance Knowledge Check — Unlock Feature', 'knowledge-check', 3,
          'Test your understanding and unlock Compliance Logs',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s verify you understand compliance logging before enabling it.',
            questions: [
              {
                question: 'What do compliance logs record?',
                options: [
                  { text: 'Only error messages', correct: false },
                  { text: 'Every significant action: sessions, prompts, tool use, file access, config changes, and policy events', correct: true },
                  { text: 'Only what the AI says back to you', correct: false },
                  { text: 'Keyboard shortcuts you use', correct: false },
                ],
                explanation: 'Compliance logs capture six categories of events across all AI interactions, configuration changes, and policy enforcement actions.',
              },
              {
                question: 'What is the recommended approach when first enabling compliance policies?',
                options: [
                  { text: 'Start in enforce mode to block everything suspicious', correct: false },
                  { text: 'Start in monitor mode to understand patterns, then tighten based on real data', correct: true },
                  { text: 'Don\'t set any policies — just review logs manually', correct: false },
                  { text: 'Only enable logging for one person', correct: false },
                ],
                explanation: 'Monitor mode gives you visibility without disruption. Once you understand normal usage patterns, you can create targeted policies and move to warn or enforce mode.',
              },
              {
                question: 'How do you share compliance data with auditors or security teams?',
                options: [
                  { text: 'Take screenshots', correct: false },
                  { text: 'Read them the logs over the phone', correct: false },
                  { text: 'Export a compliance snapshot as JSON for external tools and auditors', correct: true },
                  { text: 'Give them access to the app', correct: false },
                ],
                explanation: 'The compliance snapshot export produces a structured JSON file that external compliance tools, auditors, and security teams can process and review.',
              },
            ],
          },
        ),
      ]),

      // ── Plugins ───────────────────────────────────────────────────────────
      makeModule('fd-plugins', 'Plugin Management', 'Extend ClearPath with third-party plugins', [], [
        makeLesson('fd-plugins-1', 'What Are Plugins?', 'interactive-walkthrough', 4,
          'Understand how plugins extend ClearPath\'s capabilities',
          {
            kind: 'walkthrough',
            introduction: 'Plugins extend what ClearPath and the underlying CLIs can do. They add new tools, data sources, and capabilities — like connecting to Jira, Slack, databases, or custom internal systems. Think of them as apps for your AI assistant.',
            steps: [
              { title: 'How plugins work', description: 'Plugins are loaded from directories on your file system. They follow the MCP (Model Context Protocol) standard, which means they provide tools that the AI can call during sessions. When a plugin is loaded, the AI gains new abilities.' },
              { title: 'Examples of plugin capabilities', description: 'A Jira plugin lets the AI create and update tickets. A Slack plugin lets it send messages. A database plugin lets it query your data. A custom plugin could connect to any internal API your team uses.' },
              { title: 'MCP server configuration', description: 'ClearPath manages MCP server connections — these are the plugin backends. You can add servers via JSON configuration, enable/disable them per session, and see which tools each server provides.' },
              { title: 'Security considerations', description: 'Plugins can access external systems and data. Only install plugins from trusted sources. Review what tools a plugin provides before enabling it. ClearPath\'s permission system applies to plugin tools just like built-in tools.', tip: 'The AI still needs your approval to use plugin tools unless you\'re in auto-approve mode.' },
            ],
            keyTakeaway: 'Plugins extend the AI\'s capabilities by connecting to external systems. Only install from trusted sources, and review what tools each plugin provides.',
          },
        ),
        makeLesson('fd-plugins-2', 'Plugin Knowledge Check — Unlock Feature', 'knowledge-check', 2,
          'Test your understanding and unlock Plugin Management',
          {
            kind: 'knowledge-check',
            introduction: 'Quick check before unlocking Plugin Management.',
            questions: [
              {
                question: 'What do plugins do in ClearPath?',
                options: [
                  { text: 'They change the app\'s visual theme', correct: false },
                  { text: 'They add new tools and capabilities the AI can use, like connecting to external systems', correct: true },
                  { text: 'They replace the built-in AI models', correct: false },
                  { text: 'They speed up the application', correct: false },
                ],
                explanation: 'Plugins provide new tools (via MCP protocol) that extend what the AI can do — connecting to Jira, Slack, databases, or custom APIs.',
              },
              {
                question: 'What is the most important consideration when installing a plugin?',
                options: [
                  { text: 'Whether it has a nice icon', correct: false },
                  { text: 'Only install from trusted sources and review what tools it provides', correct: true },
                  { text: 'Install as many as possible for maximum capability', correct: false },
                  { text: 'Plugins are always safe — no review needed', correct: false },
                ],
                explanation: 'Plugins can access external systems and data. Only install from trusted sources, review their tool list, and remember that ClearPath\'s permission system still applies.',
              },
            ],
          },
        ),
      ]),

      // ── Environment Variables ──────────────────────────────────────────────
      makeModule('fd-envvars', 'Environment Variables', 'Configure environment variables for CLI sessions', [], [
        makeLesson('fd-envvars-1', 'What Are Environment Variables?', 'interactive-walkthrough', 4,
          'Understand how environment variables configure CLI behavior',
          {
            kind: 'walkthrough',
            introduction: 'Environment variables are configuration values that the CLI tools read when they start. They control things like API keys, default models, proxy settings, and feature flags. ClearPath lets you manage these from a UI instead of editing terminal configuration files.',
            steps: [
              { title: 'Why they matter', description: 'Environment variables control how the CLI connects to AI services. GH_TOKEN authenticates GitHub Copilot. ANTHROPIC_API_KEY authenticates Claude Code. HTTP_PROXY routes through corporate proxies. Without the right variables, the CLI can\'t function.' },
              { title: 'Common variables', description: 'GH_TOKEN / GITHUB_TOKEN — GitHub authentication. ANTHROPIC_API_KEY — Claude API key. COPILOT_CUSTOM_INSTRUCTIONS_DIRS — Extra instruction directories. CLAUDE_CODE_MODEL — Default Claude model. HTTP_PROXY / HTTPS_PROXY — Corporate proxy settings.' },
              { title: 'The editor interface', description: 'ClearPath provides a key-value editor where you can add, edit, and remove environment variables. Values are stored encrypted and injected into CLI sessions when they launch. You never need to edit .bashrc or .zshrc.' },
              { title: 'Security awareness', description: 'Environment variables often contain secrets (API keys, tokens). ClearPath encrypts stored values, but be careful about sharing configuration exports. Never put secrets in plain text files or share them in messages.', tip: 'ClearPath masks secret values in the UI by default. Click to reveal.' },
            ],
            keyTakeaway: 'Environment variables configure how CLI tools authenticate and behave. ClearPath manages them securely in a UI so you don\'t need terminal expertise.',
          },
        ),
        makeLesson('fd-envvars-2', 'Environment Variables Knowledge Check — Unlock Feature', 'knowledge-check', 2,
          'Test your understanding and unlock Environment Variables',
          {
            kind: 'knowledge-check',
            introduction: 'Quick check before unlocking Environment Variable management.',
            questions: [
              {
                question: 'What do environment variables control in the CLI tools?',
                options: [
                  { text: 'The color of the app', correct: false },
                  { text: 'Authentication, default models, proxy settings, and feature flags', correct: true },
                  { text: 'How fast your internet is', correct: false },
                  { text: 'The AI\'s personality', correct: false },
                ],
                explanation: 'Environment variables configure CLI behavior: API authentication, model defaults, proxy routing, and various feature toggles.',
              },
              {
                question: 'Why should you be careful with environment variable values?',
                options: [
                  { text: 'They\'re case-sensitive', correct: false },
                  { text: 'They often contain secrets like API keys and tokens that must be kept secure', correct: true },
                  { text: 'They use a lot of memory', correct: false },
                  { text: 'They can\'t be changed once set', correct: false },
                ],
                explanation: 'Many environment variables contain secrets (API keys, auth tokens). ClearPath encrypts them, but never share exports or put secrets in plain text.',
              },
            ],
          },
        ),
      ]),

      // ── Webhooks ──────────────────────────────────────────────────────────
      makeModule('fd-webhooks', 'Webhooks', 'Send notifications to external services', [], [
        makeLesson('fd-webhooks-1', 'What Are Webhooks?', 'interactive-walkthrough', 4,
          'Understand how webhooks push ClearPath events to external services',
          {
            kind: 'walkthrough',
            introduction: 'Webhooks send HTTP notifications from ClearPath to external services when events happen. When a task completes, a budget limit is hit, or a policy violation occurs, ClearPath can POST a message to Slack, Teams, PagerDuty, or any system that accepts webhooks.',
            steps: [
              { title: 'How webhooks work', description: 'You configure a webhook URL (like a Slack incoming webhook). You select which events trigger it (task completion, errors, budget alerts, policy violations). When the event occurs, ClearPath sends a formatted HTTP POST to your URL with event details.' },
              { title: 'Common use cases', description: 'Slack/Teams notifications when scheduled tasks complete. PagerDuty alerts for security events. Custom dashboards that aggregate AI usage data. Email notifications via webhook-to-email services. CI/CD triggers when code review agents finish.' },
              { title: 'Event types', description: 'You can trigger on: session events (start/stop/error), budget events (threshold reached, limit exceeded), policy events (violations, blocks), scheduled task events (success/failure), and notification events (any ClearPath notification).' },
              { title: 'Testing and reliability', description: 'Always test webhooks before relying on them. ClearPath shows delivery status and response codes for each webhook call. If a webhook fails, it logs the error but doesn\'t retry automatically — check your endpoint configuration.', tip: 'Use a service like webhook.site to test your URL before connecting production systems.' },
            ],
            keyTakeaway: 'Webhooks push ClearPath events to external services. Always test endpoints before relying on them for critical alerts.',
          },
        ),
        makeLesson('fd-webhooks-2', 'Webhook Knowledge Check — Unlock Feature', 'knowledge-check', 2,
          'Test your understanding and unlock Webhooks',
          {
            kind: 'knowledge-check',
            introduction: 'Quick check before unlocking Webhooks.',
            questions: [
              {
                question: 'What do webhooks do in ClearPath?',
                options: [
                  { text: 'They let external services control ClearPath', correct: false },
                  { text: 'They send HTTP notifications to external services when events happen', correct: true },
                  { text: 'They download updates for the app', correct: false },
                  { text: 'They connect to social media', correct: false },
                ],
                explanation: 'Webhooks are outbound notifications — ClearPath POSTs event data to your configured URL when specific events occur.',
              },
              {
                question: 'What should you always do before relying on a webhook for critical alerts?',
                options: [
                  { text: 'Configure as many events as possible', correct: false },
                  { text: 'Test the endpoint to verify it receives and processes messages correctly', correct: true },
                  { text: 'Disable all other notification methods', correct: false },
                  { text: 'Nothing — webhooks always work', correct: false },
                ],
                explanation: 'Always test webhook endpoints before relying on them. Verify delivery status and response codes. Failed webhooks are logged but not automatically retried.',
              },
            ],
          },
        ),
      ]),

      // ── Experimental Features & PR Scores ────────────────────────────────
      makeModule('fd-experimental', 'Experimental Features & PR Scores', 'Access cutting-edge features still in development', [], [
        makeLesson('fd-experimental-1', 'What Are Experimental Features?', 'interactive-walkthrough', 5,
          'Understand what experimental means and what PR Scores do',
          {
            kind: 'walkthrough',
            introduction: 'Experimental features are capabilities that are still being refined. They work, but may change, have rough edges, or lack polish. Enabling them gives you early access to powerful functionality — but you should understand what you\'re opting into.',
            steps: [
              { title: 'What "experimental" means', description: 'Experimental features have been built and tested internally but haven\'t gone through the same level of user validation as core features. They may change behavior between updates, have incomplete documentation, or occasionally produce unexpected results. They won\'t break your data or settings.', tip: 'Think of them as beta features — functional but evolving.' },
              { title: 'PR Scores', description: 'The flagship experimental feature is PR Scores — a system that scores GitHub pull requests from 0-100 based on size, complexity, review patterns, cycle time, and code quality signals. You can browse repos, view PR lists, score individual or batch PRs, and drill into score breakdowns.' },
              { title: 'Score breakdown', description: 'Each PR score breaks down into weighted dimensions: size and complexity (are PRs too large?), review coverage (is everything reviewed?), cycle time (how long from open to merge?), description quality (is context provided?), and test coverage signals. Each dimension gets a sub-score.' },
              { title: 'AI-powered code review', description: 'From any scored PR, you can launch an AI Review session. ClearPath pipes the PR context (score, breakdown, file changes) into a CLI session for AI-powered code review. The AI already knows the score, so it focuses on the areas that need attention.' },
              { title: 'Team analytics', description: 'The repo-level dashboard shows score distribution, trend over time, author comparison, and cycle time charts. This helps engineering managers identify patterns — are PRs getting larger? Is review coverage declining? Which team members consistently ship high-quality PRs?' },
              { title: 'Why it\'s experimental', description: 'PR scoring algorithms are being tuned. Weight distributions may change. New scoring dimensions may be added. The UI may evolve. Your scores and data are preserved across updates, but the scoring criteria may shift as we learn what matters most.' },
            ],
            keyTakeaway: 'Experimental features give you early access to powerful tools that are still being refined. PR Scores provide data-driven insights into pull request quality. Features may change between updates.',
          },
        ),
        makeLesson('fd-experimental-2', 'Experimental Features Knowledge Check — Unlock Feature', 'knowledge-check', 3,
          'Test your understanding and unlock Experimental Features',
          {
            kind: 'knowledge-check',
            introduction: 'Let\'s verify you understand experimental features before enabling them.',
            questions: [
              {
                question: 'What does "experimental" mean for ClearPath features?',
                options: [
                  { text: 'They\'re dangerous and might delete your files', correct: false },
                  { text: 'They\'re functional but still evolving — may change behavior between updates', correct: true },
                  { text: 'They\'re only available on weekends', correct: false },
                  { text: 'They\'re more expensive to use', correct: false },
                ],
                explanation: 'Experimental features work but are still being refined. They won\'t break your data, but may change behavior, have rough edges, or evolve between updates.',
              },
              {
                question: 'What does a PR Score measure?',
                options: [
                  { text: 'How popular the repository is', correct: false },
                  { text: 'Size, complexity, review coverage, cycle time, and description quality of pull requests', correct: true },
                  { text: 'How many lines of code were changed', correct: false },
                  { text: 'Whether the code compiles', correct: false },
                ],
                explanation: 'PR Scores evaluate multiple dimensions: size/complexity, review coverage, cycle time, description quality, and test coverage signals — producing a 0-100 composite score.',
              },
              {
                question: 'What should you expect when using experimental features?',
                options: [
                  { text: 'Perfect stability and no changes', correct: false },
                  { text: 'Features may change between updates, but your data is preserved', correct: true },
                  { text: 'Features will be removed without notice', correct: false },
                  { text: 'You need special permission from your manager', correct: false },
                ],
                explanation: 'Experimental features evolve. Scoring algorithms, UI layouts, and behavior may change as improvements are made. Your data and settings are always preserved.',
              },
            ],
          },
        ),
      ]),

    ],
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAllLessons(): Lesson[] {
  const lessons: Lesson[] = []
  for (const path of PATHS) {
    for (const mod of path.modules) {
      lessons.push(...mod.lessons)
    }
  }
  return lessons
}

function getProgress(): {
  completed: number; total: number; percentage: number
  pathProgress: Record<string, { completed: number; total: number; percentage: number }>
} {
  const completedMap = store.get('completedLessons')
  const all = getAllLessons()
  const completed = all.filter((l) => completedMap[l.id]).length
  const total = all.length

  const pathProgress: Record<string, { completed: number; total: number; percentage: number }> = {}
  for (const path of PATHS) {
    const pathLessons = path.modules.flatMap((m) => m.lessons)
    const pathCompleted = pathLessons.filter((l) => completedMap[l.id]).length
    pathProgress[path.id] = {
      completed: pathCompleted,
      total: pathLessons.length,
      percentage: pathLessons.length > 0 ? Math.round((pathCompleted / pathLessons.length) * 100) : 0,
    }
  }

  return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0, pathProgress }
}

function isPathUnlocked(_pathId: string): boolean {
  // All paths are always unlocked — users can invest time in any track as needed
  return true
}

function getNextLesson(): Lesson | null {
  const completedMap = store.get('completedLessons')
  for (const path of PATHS) {
    if (!isPathUnlocked(path.id)) continue
    for (const mod of path.modules) {
      for (const lesson of mod.lessons) {
        if (!completedMap[lesson.id]) return lesson
      }
    }
  }
  return null
}

function updateStreak(): { lastDate: string; count: number } {
  const today = new Date().toISOString().slice(0, 10)
  const streak = store.get('streak')
  if (streak.lastDate === today) return streak // Already counted today

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const newStreak = streak.lastDate === yesterday
    ? { lastDate: today, count: streak.count + 1 }
    : { lastDate: today, count: 1 }
  store.set('streak', newStreak)
  return newStreak
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerLearnHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('learn:get-paths', () => {
    const completedMap = store.get('completedLessons')
    return PATHS.map((p) => ({
      ...p,
      unlocked: isPathUnlocked(p.id),
      progress: getProgress().pathProgress[p.id],
      completedLessonIds: Object.keys(completedMap),
    }))
  })

  ipcMain.handle('learn:get-progress', () => {
    const progress = getProgress()
    return {
      ...progress,
      streak: store.get('streak'),
      totalTimeMinutes: store.get('totalTimeMinutes'),
      selectedPath: store.get('selectedPath'),
      nextLesson: getNextLesson(),
      dismissed: store.get('dismissed'),
    }
  })

  ipcMain.handle('learn:complete-lesson', (_e, args: { lessonId: string; score?: number; skipped?: boolean; timeMinutes?: number }) => {
    const completed = store.get('completedLessons')
    completed[args.lessonId] = {
      completedAt: Date.now(),
      score: args.score,
      skipped: args.skipped,
    }
    store.set('completedLessons', completed)

    if (args.timeMinutes) {
      store.set('totalTimeMinutes', store.get('totalTimeMinutes') + args.timeMinutes)
    }

    // Auto-unlock feature flags when completing discovery lessons (not skipped)
    if (!args.skipped) {
      const flagsToUnlock = LESSON_FLAG_UNLOCKS[args.lessonId]
      if (flagsToUnlock) {
        try {
          const flagStore = new Store<{ flags: Record<string, boolean>; activePresetId: string | null }>({
            name: 'clear-path-feature-flags',
            encryptionKey: getStoreEncryptionKey(),
            defaults: { flags: {}, activePresetId: 'all-on' },
          })
          const current = flagStore.get('flags')
          for (const flag of flagsToUnlock) {
            current[flag] = true
          }
          flagStore.set('flags', current)
          flagStore.set('activePresetId', null) // Custom mode since we changed flags
        } catch { /* flag store unavailable — skip unlock */ }
      }
    }

    updateStreak()
    return getProgress()
  })

  ipcMain.handle('learn:select-path', (_e, args: { pathId: string }) => {
    store.set('selectedPath', args.pathId)
    return { success: true }
  })

  ipcMain.handle('learn:get-achievements', () => {
    const unlocked = store.get('achievements')
    return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: !!unlocked[a.id], unlockedAt: unlocked[a.id]?.unlockedAt }))
  })

  ipcMain.handle('learn:unlock-achievement', (_e, args: { id: string }) => {
    const achievements = store.get('achievements')
    if (!achievements[args.id]) {
      achievements[args.id] = { unlockedAt: Date.now() }
      store.set('achievements', achievements)
    }
    return { success: true }
  })

  ipcMain.handle('learn:record-help-click', (_e, args: { panelId: string }) => {
    const clicked = store.get('helpClicked')
    if (!clicked.includes(args.panelId)) {
      clicked.push(args.panelId)
      store.set('helpClicked', clicked)
    }
    return { success: true }
  })

  ipcMain.handle('learn:get-help-clicked', () => store.get('helpClicked'))

  ipcMain.handle('learn:dismiss', () => {
    store.set('dismissed', true)
    return { success: true }
  })

  ipcMain.handle('learn:reset', () => {
    store.set('completedLessons', {})
    store.set('selectedPath', null)
    store.set('streak', { lastDate: '', count: 0 })
    store.set('totalTimeMinutes', 0)
    store.set('achievements', {})
    store.set('helpClicked', [])
    store.set('dismissed', false)
    return { success: true }
  })
}
