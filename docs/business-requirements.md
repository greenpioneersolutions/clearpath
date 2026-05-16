# ClearPath AI — Business Requirements Document

**Audience:** Internal executive / board
**Ask:** Approve enterprise go-to-market motion for ClearPath AI
**Status:** Complete draft v1
**Last updated:** 2026-05-15

---

## 1. Executive Summary

The most powerful general-purpose tool in the history of knowledge work is currently locked behind a command-line interface. Inside thirty days, the cost structure for using that tool changes fundamentally: both Anthropic and OpenAI are moving from flat-rate subscriptions to consumption-based pricing. Organizations that have not built efficiency tooling will see AI costs grow uncapped, unmeasurable, and ungoverned.

ClearPath AI is the layer that solves this. It is a control surface around GitHub Copilot CLI and Claude Code CLI that delivers three things no CLI can deliver on its own:

- **Reach** — AI access expands from the ~10% of an organization that can use a terminal to the ~80% that performs knowledge work. The product is built for non-technical users without sacrificing power-user surface.
- **Restraint** — per-turn token visibility, hard-cap budget auto-pause, local-model routing for cheap workloads, and context-reuse mechanics measurably reduce token consumption — the unit AI providers actually bill under consumption pricing. Modeled savings: 30–50% reduction in token spend per active seat.
- **Resilience** — audit trail, policy enforcement, sensitive-data scanning, signed config bundles, and multi-repo workspaces are shipped today — not roadmap. The hooks an enterprise IT and compliance team need to approve rollout are already in the product.

### The Ask

This document asks the board to **approve an enterprise go-to-market motion** for ClearPath AI: positioning, pricing, security-review preparation (SOC 2, SSO, deployment patterns), and a sales motion targeting 10,000–100,000-seat enterprises in the next four quarters.

### The Headline ROI

At a hypothesized baseline of $20–50/seat/month in AI consumption (to be validated against published consumption rates), modeled mid-case savings produce:

| Scenario | Seats | Annualized AI-spend savings | Plus addressable productivity value* |
|---|---|---|---|
| Mid-enterprise | 10,000 | **$720K – $3M** | $26M – $52M |
| Fortune-100 scale | 100,000 | **$7.2M – $30M** | $262M – $525M |

*Productivity value = the dollar value of the 70% of headcount newly able to use AI, at conservative assumptions (1 hour/week recovered, blended knowledge-worker labor cost). Detailed model in §7.

Payback at any defensible ClearPath seat price is measured in **months, not years**, on the cost-savings line alone. Productivity value is upside.

### Why Now

Three forces converge in a thirty-day window:

1. **Pricing model shift.** Consumption pricing makes AI efficiency a P&L line item for the first time.
2. **Capability ceiling lifted.** Frontier CLIs (Copilot, Claude Code) now do work that justifies enterprise rollout — the blocker is no longer model quality, it is the surface around it.
3. **Build complete.** Twenty-eight implementation arcs have shipped. The core product is enterprise-ready; what remains is GTM execution.

The rest of this document tells the origin story (§2), establishes the market inflection (§3), defines who ClearPath reaches (§4), grounds the value claims in shipped code (§5), models the token-economics ROI engine (§6), develops the enterprise ROI case at scale (§7), inventories what exists today (§8), names the open risks honestly (§9), and provides vertical and competitive context in the appendix (§10).

---

## 2. Origin Story — Why ClearPath Exists

ClearPath did not start as a product idea. It started as a problem I kept watching happen.

The capability now sitting inside GitHub Copilot CLI and Claude Code is, plainly, the most powerful general-purpose tool any knowledge worker has ever had access to. A non-technical operator can describe a workflow in plain English and have it executed, audited, repeated, and improved — work that would have taken a meeting, a ticket, an engineer, and a week now happens in an afternoon. The frontier models are not the bottleneck anymore. **The bottleneck is everything that surrounds them.**

I learned this the hard way. Every time I tried to put this power in the hands of someone non-technical — a colleague, an operator, a manager who would clearly benefit — the same thing happened. They did not fail at the AI. They failed at *getting to* the AI. They opened a terminal and froze. They got an authentication URL and did not know what to paste where. They ran a command and saw an error message written for engineers. They wanted to share what they had figured out with a teammate and had nowhere to put it. They wanted to come back tomorrow and could not remember what they had done yesterday. They wanted to ask their IT department for access and were told no, because IT had no way to grant the access safely.

Every one of these moments was a person who *wanted* AI in their workflow and was turned away at the door.

I started cataloguing what kept stopping them, and a pattern emerged. The roadblocks were not random. They clustered into three walls.

### The Literacy Wall

The CLIs assume an engineer's mental model. They reward the user who already knows what a flag is, what a working directory is, what a permission scope is, what a token is. For everyone else, every interaction is a request to learn a new vocabulary in order to do their actual job. A finance analyst who wants AI help drafting a model does not want to learn what `--allowedTools` does. A legal associate does not want to understand permission modes. They want to do their work. The CLIs were built by engineers, for engineers, and they show it.

Training is the conventional answer to a literacy wall — but training scales linearly with headcount, and the half-life of a CLI training session is measured in days. The right answer is not to teach every knowledge worker to be a developer. The right answer is to build the surface that makes the developer's tool legible to everyone else.

### The Access Wall

Even when a non-technical user could get past the literacy wall, the organization could not let them through. There is no enterprise IT department in the world that will hand a knowledge worker a tool that can read arbitrary files, execute arbitrary shell commands, and call third-party APIs — without an audit trail, without policy enforcement, without a way to see what was done in their name. CLIs are user-scoped by design. They were never meant to be governed at the org level. They have no concept of who is in compliance, who is on a budget, what data is sensitive, what tools are approved.

The result: in every organization I watched try to roll out AI, the security and compliance review became the choke point. Not because security teams were obstructive — because the tool genuinely was ungovernable. Saying yes was the wrong answer, and saying no was the only safe answer. Both outcomes mean the AI does not get deployed.

### The Cost Wall

The third wall was the quietest one, and it is about to become the loudest. Under flat-rate AI subscriptions, inefficient usage was invisible. A user could leave an agent looping on a dead-end task for hours and the bill did not change. That era ends in the next thirty days. Both Anthropic and OpenAI are moving to consumption-based pricing, and once they do, every sloppy prompt, every runaway agent, every redundantly re-encoded context window shows up on the monthly bill. The orgs that are about to deploy AI at scale have no instrumentation for this — no per-user budgets, no per-session costs, no auto-pause when a budget is hit, no visibility at all. They are walking into a metered world with flat-rate habits.

### Why The CLIs Cannot Solve This Themselves

It is worth saying directly: GitHub Copilot CLI and Claude Code are not flawed products. They are excellent. They are also, by deliberate design, *engineer tools.* They optimize for the engineer's workflow — terminal-native, flag-driven, single-user, single-machine. Asking the CLIs to solve the literacy wall, the access wall, and the cost wall would mean rebuilding them as something they were not designed to be. That is not the right move for Anthropic or for GitHub.

What is needed is a layer above the CLIs. A surface that preserves their power, removes the prerequisites their power demands, and adds the controls that organizations cannot deploy without. The CLIs do not need to change. The thing that wraps them does.

### What ClearPath Became

ClearPath is that wrapping layer. The build has followed the three walls in order:

- The first arc — **shell and adapters** — established that the CLIs could be process-managed, swappable, and surfaced through a single consistent UI. This was the foundation everything else needed.
- The second arc — **the daily surface** — answered the literacy wall. Chat-based interaction, install-from-app flows, friendly authentication, templates, notes, onboarding, learning paths. A non-technical user can now sit down at ClearPath and do useful work in their first session without touching a terminal.
- The third arc — **the organization layer** — answered the access wall and laid the groundwork for the cost wall. Audit logging, policy enforcement, sensitive-data scanning, multi-repo workspaces, team config bundles, budget alerts, per-session cost tracking. The hooks an enterprise needs to say yes are now in place.

What started as an accessibility project became a governance project. Both turn out to be the same project. Neither one matters without the other: AI access without governance is a security incident waiting to happen, and governance without access is a policy document nobody uses. ClearPath is built on the conviction that they are inseparable, and that the organization that delivers both wins.

The next sections make the case for what that win looks like — for the user, for the buyer, and for us.

---

## 3. Market Inflection — The Consumption-Pricing Window

For the first three years of the LLM era, AI cost was a fixed line item. An organization paid a per-seat subscription, and whether a user prompted ten times a day or a thousand, the bill was the same. This obscured a fact that is about to become inescapable: **AI usage varies by one to two orders of magnitude across users, and the heaviest users are not always the most valuable ones.**

### What Is About to Change

Both major AI providers are moving to consumption-based pricing within the next thirty days. The mechanics are:

- **Per-token billing.** Every input token and every output token has a price. Costs scale linearly with usage.
- **Model-tiered pricing.** Frontier models (Claude Opus, GPT-5) are 5–10× the price of mid-tier models (Claude Sonnet, GPT-4o), which are themselves 10× the price of small models.
- **No flat ceiling.** A single runaway agent left looping overnight can generate a five-figure bill that no subscription cap would have prevented.

This is not a price increase per se — for efficient users, costs may actually go down. It is a shift in *who pays for what.* The 10% of users generating 90% of the consumption now pay 90% of the cost. Organizations that have no way to identify, measure, or govern that 10% are about to discover them via their monthly invoice.

### The Hypothesized Current Baseline

Industry-watcher estimates place current per-seat AI spend (across Copilot Business, ChatGPT Enterprise, Claude for Work, and direct API consumption) at roughly **$20–$50/seat/month** for organizations that have rolled out AI broadly. This figure is hypothesized, not measured, and ClearPath should commit to validating it against published consumption rates once both providers finalize their pricing. The savings argument in §6 is constructed as a *percentage of baseline*, so the thesis survives if the true baseline turns out to be higher or lower.

What is *not* in dispute: under consumption pricing, the variance widens. The same $20–$50 average becomes a distribution where the median seat spends $5–$10 and the 95th-percentile seat spends $200–$500. Without efficiency tooling, organizations will discover this distribution after the fact.

### Why a Wrapper Is Critical Now, Not Before

The case for an efficiency layer was harder to make under flat-rate pricing because the savings were invisible — they showed up as performance, not as dollars. Consumption pricing converts that invisible value into a measurable line on the P&L. Three things become true simultaneously:

1. **The savings become quantifiable.** A 30% reduction in tokens-per-task now equals 30% of the AI bill, every month, forever.
2. **The variance becomes a risk.** A single user's runaway session can blow a quarterly budget. Auto-pause and per-session ceilings stop being convenience features and start being controls a CFO requires.
3. **The audit trail becomes operationally necessary.** When AI spend is a line item, finance needs to know what drove it. "We spent $400K on AI this quarter" requires answering "doing what, for whom, with what outcome."

These are not problems the CLIs were designed to solve. They are surface-layer problems — visibility, governance, cost attribution — which is exactly the layer ClearPath occupies.

### Why CLIs Alone Cannot Close This Gap

GitHub Copilot CLI and Claude Code are user-scoped tools. They run on one machine, for one user, against one provider account. They have no concept of an organization, no shared budget, no aggregated audit log, no central policy. Adding all of that to the CLIs themselves would compromise what makes them excellent — they would become enterprise platforms instead of developer tools. The right architectural answer is the same one that emerged in every prior wave of developer-tool-to-enterprise-platform evolution: keep the powerful core, wrap it in the surface the enterprise needs. ClearPath is that wrapping pattern applied to AI CLIs.

The thirty-day window is not arbitrary. It is the moment at which the cost wall becomes visible to every CFO. Organizations that are positioned to *see* their AI usage, *govern* it, and *optimize* it on day one of the new pricing regime will outperform those that wait six months to react. ClearPath should be in market before that window closes.

---

## 4. Users Across the Spectrum

ClearPath is horizontal. The product was not built for a single industry or a single role — it was built for the gap between AI capability and AI access, which exists in every organization that does knowledge work.

That said, an internal board audience needs the reach to be concrete. The four archetypes below cover the spectrum from total AI-novice to power user. The argument the section makes is that ClearPath serves *all four* — not by being everything to everyone, but because the same surface (a control layer over the CLIs) creates different value for different users.

### Archetype 1 — The Non-Technical SMB Operator

**Who:** Owner-operators, ops managers, marketers, finance leads at small and mid-sized businesses. They run the company day-to-day but cannot hire engineers to integrate AI into their workflows. They have heard ChatGPT can help, they have probably tried it once or twice, and they have not yet found a way to use AI as a serious productivity tool.

**Their pain:**
- They cannot use the CLI. They opened a terminal once and closed it.
- They cannot pay an engineer to wire AI into their workflow.
- They have tried web chatbots and run into limits: no access to their files, no persistent context, no way to chain steps.
- They are paying for AI subscriptions whose value they cannot quantify.

**ClearPath's answer:**
- **Install-from-app flow.** [`AuthManager.ts`](../src/main/auth/AuthManager.ts) detects missing CLIs and installs them via the app — no terminal required. If Node.js is missing or outdated, the app installs a managed Node via the OS package manager.
- **Friendly authentication.** When a CLI needs to authenticate, the app detects the auth URL, opens the user's browser automatically, and shows a "we opened your browser, paste the code there" panel. No copy-pasting tokens.
- **Templates library.** Pre-built templates for common workflows (code review, meeting summary, document analysis, email drafting) let beginners start with proven prompts instead of a blank input box.
- **Notes for personal context.** [`Notes.tsx`](../src/renderer/src/pages/Notes.tsx) lets the user capture takeaways from one session and attach them to the next, building a personal context library without managing files or knowledge bases.
- **Progressive disclosure.** [`progressiveDisclosure.ts`](../src/renderer/src/lib/progressiveDisclosure.ts) hides advanced features (policies, MCP servers, scheduler) for new users and reveals them as the user's stage advances. The first-run experience is clean; the surface deepens as the user grows.
- **Friendly error translation.** When a CLI emits an engineer-facing error, ClearPath translates it into a status message a non-developer can act on.

**What success looks like:** An SMB operator completes a useful task — say, generating a draft marketing plan from their company's existing materials — in their first session, without ever opening a terminal. They return the next day, attach the notes from their first session, and build on the work.

### Archetype 2 — The Legal / Compliance Analyst

**Who:** Associates, paralegals, in-house counsel, compliance officers, audit staff. Their work is text-heavy and pattern-recognition-heavy — exactly the work AI excels at — and yet they have the most restrictive access to AI in most organizations because their data is the most sensitive.

**Their pain:**
- They want AI for contract review, regulatory research, deposition summarization, eDiscovery prep.
- Their organization will not approve AI tools that lack audit trails — because legal needs to be able to demonstrate what AI did, when, with what data.
- They cannot use general chatbots because pasting confidential documents into a third-party web UI is a policy violation.
- They have heard about credential leakage incidents and PII exposure via AI prompts, and they do not want to be the cautionary tale.

**ClearPath's answer:**
- **Audit log of every action.** [`complianceHandlers.ts`](../src/main/ipc/complianceHandlers.ts) logs every prompt, every tool invocation, every config change, every policy violation. The log auto-archives to dated JSONL files in the user's config directory. Compliance teams can query by action type, time window, or content.
- **Sensitive-data scanning at the prompt boundary.** Before any prompt is sent to the CLI, ClearPath's regex scan detects AWS keys, API tokens, GitHub secrets, emails, connection strings, and PII patterns. Matches trigger notifications and are logged as security events.
- **Policy presets and enforcement.** [`policyHandlers.ts`](../src/main/ipc/policyHandlers.ts) ships three built-in presets (Cautious, Standard, Unrestricted) and supports custom org policies with per-session budget caps, blocked tools, blocked file patterns, allowed-model whitelists, and concurrent-agent limits. Violations are blocked at action-validation time and logged.
- **Signed config bundles.** [`teamHandlers.ts`](../src/main/ipc/teamHandlers.ts) uses HMAC-SHA256 with a machine-derived key to sign config bundles. An organization can publish an IT-approved configuration (agents, MCP servers, policies, flag overrides) and distribute it knowing tampering will be detected.

**What success looks like:** A compliance officer can answer the question "what did our legal team do with AI last quarter?" in five minutes by querying the audit log. A general counsel can approve AI rollout to the legal team knowing that policy violations will be prevented at the prompt boundary, not discovered after the fact.

### Archetype 3 — The Finance / Consulting Analyst

**Who:** Investment analysts, management consultants, accountants, FP&A staff, audit teams. They run repeated workflows — quarterly reports, client deliverables, market analyses, valuation models — and the work is high-volume, high-stakes, and bills by the hour.

**Their pain:**
- They have AI productivity wins they cannot make repeatable. The prompt that worked great last quarter is buried in chat history; nobody else on the team has it.
- Their work is billable by client or engagement, and they need to attribute AI costs to the right cost center. No tool does this.
- They run the same analysis pattern across multiple companies / clients / time periods, and re-explaining the context to AI every time is both tedious and wasteful.
- They are skeptical of AI accuracy and want to verify intermediate steps before committing.

**ClearPath's answer:**
- **Templates with usage analytics.** [`PromptTemplate`](../src/renderer/src/types/template.ts) tracks `usageCount` and `totalCost` per template. The team's best prompts become institutional assets. Analysts can compare templates and identify which produce reliable results at acceptable cost.
- **Scheduler for recurring workflows.** [`SchedulePanel.tsx`](../src/renderer/src/components/scheduler/SchedulePanel.tsx) supports cron-based job execution with per-job budget and turn limits. The "every Monday morning, summarize last week's filings for these portfolio companies" workflow runs autonomously.
- **Per-engagement cost tracking.** [`costHandlers.ts`](../src/main/ipc/costHandlers.ts) exposes `cost:by-session`, `cost:by-model`, and `cost:by-agent` queries with CSV export. Cost can be rolled up by client engagement, by analyst, by deliverable type — supporting both internal cost attribution and (where appropriate) client billing.
- **Workspaces for client isolation.** [`Workspaces.tsx`](../src/renderer/src/pages/Workspaces.tsx) groups repos and contexts per client / engagement, preventing cross-contamination of confidential client data.
- **Composer for multi-step workflows with verification.** Multi-step prompt orchestration lets the analyst inspect each step's output before authorizing the next, preserving the verification discipline finance work requires.

**What success looks like:** A consulting team's best prompts become firm assets, used across hundreds of engagements. Per-engagement AI cost is line-itemed and either absorbed or passed through, with full audit trail. The team's weekly client reports generate themselves overnight.

### Archetype 4 — The Senior Developer / Power User

**Who:** Engineers who already use Copilot CLI or Claude Code directly. They could absolutely keep using the CLI; they do not need ClearPath to be productive.

**Their pain (which they may not know they have):**
- Their personal context lives in their terminal scrollback. When they switch machines or come back after a vacation, it is gone.
- Their best agent configurations, custom prompts, and MCP server setups are not shared across the team. Every engineer reinvents them.
- They have no view into their own AI spend until the monthly invoice arrives.
- When they need to onboard a teammate to a workflow, they end up writing instructions for the CLI rather than just sharing the workflow.

**ClearPath's answer:**
- **Full-power flag builder with command export.** [`FlagBuilder.tsx`](../src/renderer/src/components/settings/FlagBuilder.tsx) exposes every CLI flag visually. [`LaunchCommandPreview.tsx`](../src/renderer/src/components/settings/LaunchCommandPreview.tsx) generates the exact CLI command as the user adjusts flags, with copy-to-terminal — power users can build complex invocations in the UI and run them anywhere.
- **Composer for multi-step orchestration.** [`Composer.tsx`](../src/renderer/src/components/composer/Composer.tsx) chains prompts, sub-agents, and verification steps into reusable workflows.
- **MCP catalog and management.** Browse, install, configure MCP servers from a curated catalog or paste custom commands. Per-CLI auto-registration; secrets stored in OS keychain.
- **Sub-agent monitor.** [`CLIManager.spawnSubAgent()`](../src/main/cli/CLIManager.ts) and the sub-agent monitor surface every background task's status, output, cost, and exit code in real time.
- **Team marketplace.** Shared agents, signed config bundles, and shared folders let the team's best work propagate without becoming tribal knowledge.
- **Persistent personal context.** Notes and ClearMemory (opt-in) carry context across machines, sessions, and machines.

**What success looks like:** The senior developer keeps the CLI on the side for shell-script tasks, but lives in ClearPath for any work that benefits from persistence, sharing, or visibility. They become the internal advocate that pulls the team onto the product.

### The Spectrum Conclusion

The four archetypes look different but share one thing: every one of them is held back from AI by something that is not the AI itself. The non-technical operator is held back by the terminal. The legal analyst is held back by governance gaps. The finance analyst is held back by lack of persistence and attribution. The senior developer is held back by the missing shared layer.

ClearPath is a control surface, not training wheels. It removes the friction at each point on the spectrum without removing the power. **A basic user gets superpowers they never had. A power user gets a control surface that beats their previous workflow.** Both ends win.

---

## 5. Business Value Pillars

The user archetypes in §4 are concrete examples. The business case underneath them rests on five horizontal value pillars. Each pillar is grounded in code that already exists in the shipped product — this is not a roadmap.

| Pillar | Business outcome | Primary mechanism | Evidence |
|---|---|---|---|
| **Cost Discipline (token-first)** | Predictable AI consumption under metered pricing | Per-turn token visibility + budget enforcement (UI in redesign, backend live) | [`CLIManager.estimateCostFromOutput()`](../src/main/cli/CLIManager.ts), [`costHandlers.ts:cost:check-budget`](../src/main/ipc/costHandlers.ts) |
| **Accessibility** | AI reaches 80% of headcount, not 10% | Install-from-app + friendly UX + progressive disclosure | [`Onboarding.tsx`](../src/renderer/src/components/onboarding/Onboarding.tsx), [`AuthManager.ts`](../src/main/auth/AuthManager.ts), [`progressiveDisclosure.ts`](../src/renderer/src/lib/progressiveDisclosure.ts) |
| **Governance** | IT and compliance can approve AI rollout | Audit log + policy enforcement + sensitive-data scan | [`complianceHandlers.ts`](../src/main/ipc/complianceHandlers.ts), [`policyHandlers.ts`](../src/main/ipc/policyHandlers.ts), [`teamHandlers.ts`](../src/main/ipc/teamHandlers.ts) |
| **Productivity** | Repeated work becomes automated, multi-step work becomes orchestrated | Composer + Scheduler + sub-agents | [`Composer.tsx`](../src/renderer/src/components/composer/Composer.tsx), [`SchedulePanel.tsx`](../src/renderer/src/components/scheduler/SchedulePanel.tsx), [`CLIManager.spawnSubAgent()`](../src/main/cli/CLIManager.ts) |
| **Knowledge Retention** | Context persists across sessions, machines, and team members | Notes + Knowledge Base + ClearMemory | [`Notes.tsx`](../src/renderer/src/pages/Notes.tsx), [`ClearMemoryService.ts`](../src/main/clearmemory/ClearMemoryService.ts) |

### Pillar 1 — Cost Discipline (Token-First)

Under consumption pricing, every AI prompt has a token cost, and most organizations have no idea what theirs is. ClearPath converts AI consumption from an invisible variable into an instrumented, capped, and attributable line item — anchored on tokens, the unit providers actually bill. Every turn emits a per-token, per-model record to the cost backend. Daily, weekly, and monthly token budgets enforce ceilings at the user, team, or organization level, with deduped threshold alerts at 50/75/90% and a hard auto-pause at 100%. Token records are exportable for finance attribution; dollar conversion is derivable from current provider rate cards but is intentionally not the primary unit (see §6 Mechanic 1 for the rationale). **Business outcome:** AI becomes a managed consumption line instead of a surprise on the monthly invoice.

### Pillar 2 — Accessibility

Most enterprise software wins or loses on whether the user who needs it can actually get to it. ClearPath's first-run experience walks a non-technical user from "I have nothing installed" to "I am running my first AI session" without ever opening a terminal — the CLIs install themselves through the app, authentication opens the browser automatically, the first session uses pre-built templates so the user starts with a working prompt. Progressive disclosure keeps the surface clean for new users and reveals depth as they grow. **Business outcome:** AI reaches the 70%+ of an organization's knowledge workers who today have no path into the CLI.

### Pillar 3 — Governance

The single biggest blocker to enterprise AI rollout is the security and compliance review, and it is a blocker because the CLIs have no governance surface. ClearPath delivers what an enterprise IT and compliance team needs to approve deployment: every action logged and archived to dated JSONL files, every prompt scanned for credentials and PII before transmission, policy presets enforced at action-validation time, signed config bundles preventing tampered configurations from spreading. None of this requires custom integration — it ships in the product. **Business outcome:** Procurement, security review, and compliance approval timelines compress from months to weeks. AI rollout actually happens.

### Pillar 4 — Productivity

Beyond simple cost reduction, ClearPath multiplies the value of every AI hour through orchestration. Multi-step Composer workflows chain prompts and sub-agents with verification gates between steps. The Scheduler runs recurring jobs on cron, with per-job budgets and turn limits. The sub-agent monitor lets a user delegate work to background processes and check on progress without context-switching. Templates capture repeatable patterns so the team's best prompts become institutional knowledge. **Business outcome:** AI shifts from being a per-question tool to being a workflow execution layer.

### Pillar 5 — Knowledge Retention

AI without memory is a goldfish — every session starts from zero, every context paste is paid for again. ClearPath provides three layers of persistence: in-session Notes for personal capture, project-scoped Knowledge Base for structured project context, and the optional ClearMemory integration for cross-session semantic memory. Context attaches to new sessions by reference (no re-encoding cost) and is auditable at attach-time so users always know what context shaped a given prompt. **Business outcome:** Organizations build durable knowledge assets out of their AI work instead of throwing it away at the end of every session.

---

## 6. Token Economics — The ROI Engine

ClearPath drives measurable savings under consumption pricing through five mechanics, each of which already exists in the shipped product. The savings model below is built from first principles; ClearPath does not yet have production telemetry, and the doc commits in §9 to validating these estimates against pilot-cohort data before public claims.

The mechanics, in descending order of estimated impact:

### Mechanic 1 — Visibility Ends Overspend (Token-First)

The single most reliable cost-reduction technique in any metered system is making consumption visible at the moment it occurs. ClearPath instruments every turn through [`CLIManager.estimateCostFromOutput()`](../src/main/cli/CLIManager.ts), which captures token counts, model used, and provider — feeding the cost backend that persists per-turn records for analytics and budget enforcement.

A note on the unit. An earlier ClearPath iteration surfaced *dollar* cost estimates per turn in the chat UI alongside token counts. That dollar UI was removed in v1.10.0 because derived dollar estimates carry inherent imprecision — tokenizer variance across models, frequent provider rate changes, undocumented promo pricing — that made the numbers look authoritative without actually being. Showing a confident "$0.043" when the real number could be anywhere from $0.038 to $0.051 is worse than showing nothing: it trains users to make decisions on numbers that don't hold. The replacement, shipping as part of the enterprise GTM motion, is **token-first** — exact counts the provider returns directly, with dollar conversion available at the reporting layer where rate-card snapshots can be applied consistently. Tokens are also the right unit conceptually under consumption pricing: it's how providers bill.

The behavioral effect is the same. This is the dynamic that drives 10–20% reductions in metered utilities (electricity, water) the moment a real-time meter is installed. **The act of measuring changes behavior.** Users self-regulate when they can see the meter run — whether the meter reads in kWh or dollars. ClearPath's bet is that engineers and analysts can reason about tokens directly; finance can reason about the rolled-up dollar reports. Neither audience benefits from a per-turn estimate that pretends to a precision it does not have.

**Estimated lift: 10–20% reduction** from observability alone, across all users.

### Mechanic 2 — Budget Auto-Pause Hard-Caps Overruns

The 95th-percentile user under consumption pricing is not 5× the median user — they can be 50× or 100× the median. A single agent left looping on a dead-end task can generate a four-figure token bill in hours. ClearPath's [`cost:check-budget`](../src/main/ipc/costHandlers.ts) handler enforces daily, weekly, and monthly token thresholds with deduped alerts at 50/75/90% and a hard stop at 100%. The agent simply stops spawning new turns when the user hits their cap. The backend logic is in place today; the user-facing budget UI is part of the token-first redesign described in Mechanic 1 and ships as part of the enterprise GTM motion.

This eliminates the long-tail of runaway sessions that disproportionately drive total consumption. In any distribution where token spend is concentrated in the top decile of users, capping that decile produces a step-function reduction in total consumption without affecting the median user at all.

**Estimated lift: 15–25% reduction** from eliminating long-tail runaway sessions.

### Mechanic 3 — Local-Model Routing for Cheap Workloads

Not every AI workload requires Claude Opus. Summarizing a meeting transcript, generating a templated refactor, drafting boilerplate email, extracting structured data from a document — these are tasks that an 8-billion-parameter local model running on the user's laptop handles competently for *zero* marginal cost. ClearPath's [`LocalModelAdapter`](../src/main/cli/LocalModelAdapter.ts) auto-discovers Ollama and LM Studio servers and routes appropriate workloads to them.

The savings here are mechanical: every turn that runs locally is a turn that does not bill the cloud provider. If 20–40% of an organization's AI workload is routable to local inference, the cloud bill drops by that proportion of total turn count (weighted by model — local routing typically displaces mid-tier work, not frontier-model work, so the dollar impact is somewhat less than the turn-count impact).

**Estimated lift: 10–20% reduction** in cloud AI spend, depending on workload mix.

### Mechanic 4 — Context Reuse Reduces Re-Encoding

Under consumption pricing, every input token is billed. Every time a user pastes the same project context, the same coding standards document, the same client background brief into a new session, they pay to re-encode it. ClearPath's Notes system ([`Notes.tsx`](../src/renderer/src/pages/Notes.tsx)) and Knowledge Base let users persist that context once and attach it by reference. The framing in [`noteHandlers.ts`](../src/main/ipc/noteHandlers.ts) `notes:get-bundle-for-prompt` prepends the bundled context only once per session and never re-transmits it on subsequent turns within the session — chips on user bubbles audit *what was attached* without re-sending the body each turn.

Templates ([`PromptTemplate`](../src/renderer/src/types/template.ts)) capture reusable prompt patterns with usage analytics, so users can identify which templates are token-efficient and which are bloated.

**Estimated lift: 10–15% reduction** in input-token cost across sessions that share context. Higher for organizations with strong knowledge-management discipline.

### Mechanic 5 — Plan Mode and Permission Gates Prevent Dead-End Exploration

Autonomous agents are powerful and expensive. A long-running agent that goes down a wrong path can burn an enormous number of tokens before it self-corrects. ClearPath supports plan mode (read-only exploration before committing to changes), permission gates on file writes and shell execution, and the multi-step Composer that lets users verify intermediate output before authorizing the next step. The combined effect is that fewer agent-hours are spent on paths the user would have rejected if asked.

This is the hardest mechanic to quantify precisely — the savings depend on the user's autonomy preference and the task's branching factor — but it is a real and meaningful effect at the long tail of agentic workloads.

**Estimated lift: 5–10% reduction** in autonomous-agent token spend.

### Combined Estimate

The mechanics are not strictly additive — they overlap (a user who self-regulates from visibility is less likely to need auto-pause; a user who routes locally is using fewer cloud tokens for context reuse to reduce). After accounting for overlap, the modeled mid-case is:

> **30–50% reduction in metered AI spend per active seat**, attributable to ClearPath.

The lower bound (30%) holds if only Mechanics 1 and 2 land effectively. The upper bound (50%) requires Mechanics 3 and 4 to also work for the organization's workload mix. A pilot cohort across 2–3 customer organizations would tighten this range significantly.

### Honesty Footnote

These numbers are modeled, not measured. ClearPath has not yet collected production telemetry from a paying enterprise customer. The savings argument is grounded in:

- **Public benchmarks** on how metered-utility behavior changes once meters are visible.
- **Industry observations** on the distribution of AI usage (heavy-tail concentration).
- **First-principles math** on local-model routing displacing cloud turns.
- **Documented features** in the shipped product that implement each mechanic.

The doc commits to validating these estimates via a pilot program before making them public claims. The risk that the true savings come in at 20% rather than 30–50% is real, but the conclusion is robust: at 10k–100k seats, even a 15% reduction in AI spend produces a defensible ROI case (worked in §7).

---

## 7. Enterprise ROI Model

The §6 savings model — 30–50% reduction in per-seat token consumption — translates into materially different annual outcomes at the scale this GTM motion targets. This section develops the ROI in three layers, with worked examples at 10k-seat and 100k-seat scales.

**Unit clarification.** The mechanics in §6 act on *tokens* — the unit AI providers actually bill under consumption pricing. The dollar figures in this section are derived by applying provider rate cards to the modeled token reduction. The board should read these dollar amounts as "token savings × current rates" rather than as direct dollar measurements, consistent with the token-first product decision described in §6 Mechanic 1. If provider rates change after publication, the underlying token-savings claim survives; only the dollar conversion needs to be refreshed.

### Layer 1 — Direct Cost Savings

Direct savings are the simplest layer: §6 mid-case applied to the hypothesized $20–$50/seat/month baseline.

| Baseline | Mid-case savings/seat/month | Mid-case savings/seat/year |
|---|---|---|
| $20 baseline | $6 – $10 | $72 – $120 |
| $35 baseline (midpoint) | $10.50 – $17.50 | $126 – $210 |
| $50 baseline | $15 – $25 | $180 – $300 |

Applied to seat counts:

| Seats | Annual savings at $20 baseline | Annual savings at $50 baseline |
|---|---|---|
| 10,000 | **$720K – $1.2M** | **$1.8M – $3M** |
| 100,000 | **$7.2M – $12M** | **$18M – $30M** |

A 100k-seat Fortune-100 deployment at the high end of the baseline range produces $18–30M in annual AI-spend reduction. Even at the low end of both baseline and savings, the 10k-seat deployment produces $720K/year — well above any reasonable ClearPath seat cost.

### Layer 2 — Avoided Cost (Governance Incidents)

ClearPath's compliance surface — sensitive-data regex scanning in [`complianceHandlers.ts`](../src/main/ipc/complianceHandlers.ts), policy enforcement via [`policyHandlers.ts`](../src/main/ipc/policyHandlers.ts), audit logging of every prompt and tool invocation — prevents an entire class of incidents that an ungoverned AI deployment is exposed to:

- **Credential leakage into prompts.** The sensitive-data scan detects AWS keys, API tokens, GitHub PATs, connection strings, and PII at the prompt boundary, blocking them before they enter the model context.
- **Unauthorized tool execution.** Policy presets restrict which tools, which files, which models a user can invoke. Violations are logged as security events.
- **Compliance audit failures.** The audit trail at [`complianceHandlers.ts`](../src/main/ipc/complianceHandlers.ts) auto-archives every action to dated JSONL files, providing the evidence trail regulated industries require.

Published industry benchmarks (IBM *Cost of a Data Breach* reports, etc.) place the average cost of a credential-leak incident at **$4–5M**, including remediation, notification, and regulatory exposure. ClearPath does not need to prevent many incidents per year to pay for itself on this layer alone. A single prevented credential leak across a 10k-seat deployment exceeds the entire annual ClearPath spend at any defensible seat price.

This layer is modeled conservatively in the worked examples below (one prevented incident per 25k seats per year — a low estimate given the volume of AI prompts at that scale and the documented incidence of credentials being pasted into chatbots).

### Layer 3 — Value Creation (Headcount Multiplier)

This is the largest layer by far, and the most easily missed.

Today, in most organizations, AI access is concentrated in the engineering function. Engineers are roughly 10% of headcount at a typical knowledge-work enterprise. The other 90% — analysts, operators, marketers, legal, finance, customer success, HR, product, sales — has limited or no useful access to frontier AI tools, despite their work being equally amenable to AI augmentation. ClearPath's accessibility surface (the §2 Literacy Wall demolition) expands the addressable AI-user base from ~10% to ~80% of headcount.

The dollar value of that expansion depends on assumptions about per-user productivity uplift. Using deliberately conservative inputs:

- Newly enabled headcount: 70% of total seats (10% already had access; 20% are not knowledge workers for this purpose).
- Productivity uplift per newly-enabled user: 1 hour/week recovered through AI augmentation.
- Blended knowledge-worker loaded labor cost: $75–$150/hour.
- Working weeks per year: 50.

Per newly-enabled user, annual value:
- Low end: $75 × 1 hr × 50 weeks = **$3,750/user/year**
- High end: $150 × 1 hr × 50 weeks = **$7,500/user/year**

Applied to seat counts (70% of seats newly enabled):

| Seats | Newly enabled | Annual value (low) | Annual value (high) |
|---|---|---|---|
| 10,000 | 7,000 | **$26.25M** | **$52.5M** |
| 100,000 | 70,000 | **$262.5M** | **$525M** |

These numbers will look implausibly large to a skeptical reader, and that is appropriate — the productivity-uplift assumption is the most fragile input in the model. The argument the doc makes is not "you will recover exactly $26M in productivity," but rather: **the value-creation layer is one to two orders of magnitude larger than the direct-cost-savings layer, and any non-trivial productivity uplift across newly-enabled headcount dwarfs the entire AI bill.**

The board does not need to believe the high end. The board needs to believe that *some* productivity value accrues to expanding AI access from 10% to 80% of an enterprise — and that value sits on top of the cost-savings case made in Layer 1.

### Combined Worked Examples

Pulling the layers together at the midpoint of all assumption ranges:

**Mid-enterprise scenario — 10,000 seats**
- Layer 1 (direct cost savings, $35 baseline midpoint): $1.26M – $2.1M/year
- Layer 2 (one prevented incident per 25k seats × 0.4 scaling): ~$1.6M annualized
- Layer 3 (productivity value, low end): $26M/year
- **Combined annual value: $29M – $30M**

**Fortune-100 scenario — 100,000 seats**
- Layer 1: $12.6M – $21M/year
- Layer 2 (4 prevented incidents/year): $16–20M
- Layer 3 (productivity value, low end): $262M/year
- **Combined annual value: $290M – $303M**

### Payback Analysis

ClearPath's enterprise seat price is part of the GTM motion this document asks the board to approve and is therefore not yet fixed. For payback analysis, the doc models against a hypothetical $5–$15/seat/month enterprise price (defensible for an enterprise-grade developer/productivity tool with the compliance surface ClearPath provides).

At the low end of every assumption — $20 baseline, 30% savings, $15/seat/month ClearPath price, no productivity value counted, no incidents prevented — ClearPath at 10k seats costs $1.8M/year and produces $720K/year in direct savings: an apparent net cost of $1.08M.

At the same low end but with Layer 2 included (one prevented incident every two years, $4M/incident, so $2M/year amortized), ClearPath produces $720K + $2M = $2.72M of value against $1.8M cost: **net positive in year one even at the low end, before counting any productivity value at all.**

At the midpoint of assumptions, the math is not close. At the high end it is not even a discussion.

### Why Ranges, Not Point Estimates

The board will reasonably ask why this document does not produce a single ROI number. The answer is in §6: the savings mechanics are modeled, the baseline is hypothesized, and the productivity assumptions are deliberately conservative. A range that holds across all reasonable assumptions is more defensible than a precise number that does not. The decision this document asks the board to make — approve the enterprise GTM motion — is the right decision across the entire range. ClearPath's job after approval is to tighten the range via pilot deployment, not to defend a number it cannot yet measure.

---

## 8. What Exists Today

The thesis in §1 — that ClearPath is enterprise-ready and what remains is GTM execution — rests on what has actually shipped. This section inventories the build.

The product has been built across three arcs that map directly to the three walls in §2. The arcs are sequential and load-bearing: each one depends on the foundation of the prior.

### Arc 1 — Shell and Adapters (Foundation)

The first arc proved that the CLIs could be wrapped, process-managed, and surfaced through a single consistent UI. The key deliverables:

- **Electron application shell** with React + TypeScript renderer, IPC bridge, window management, sidebar navigation, workspace selector.
- **CLIManager service** with adapter pattern. The `ICLIAdapter` interface in [`src/main/cli/types.ts`](../src/main/cli/types.ts) abstracts every CLI interaction. Three adapters exist today: `CopilotAdapter` and `ClaudeCodeAdapter` (child-process), and `LocalModelAdapter` (HTTP for Ollama / LM Studio). Adding a fourth CLI is a new adapter file, not a UI rewrite.
- **Authentication infrastructure.** [`AuthManager.ts`](../src/main/auth/AuthManager.ts) detects CLI installation, handles auth status with TTL caching, installs CLIs from inside the app via `npm install -g`, installs a managed Node when the system Node is too old, detects auth URLs in CLI output and opens the browser automatically.

This arc is the cost-wall foundation: per-turn token telemetry, message log persistence, and the streaming output parser all live here. None of the daily-surface or organization-layer features could exist without it.

### Arc 2 — Daily Surface (Literacy Wall)

The second arc made the product usable by non-technical humans. The deliverables:

- **Chat-based conversation UI** with markdown rendering, mode indicators (normal / plan / autopilot), slash-command autocomplete, session manager.
- **Onboarding and learning.** First-run wizard, learning paths, guided tasks, training tooltips, friendly error translation, knowledge checks.
- **Agents.** Built-in and custom file-based agents, agent creation wizard, profile management.
- **Project memory editor.** CodeMirror-based editor for CLAUDE.md, AGENTS.md, and Copilot settings files, with context-usage visualization.
- **Tool and permission controls.** Visual toggles for permission modes, allowed/excluded tools, permission-request handler with Allow/Deny.
- **Sub-agent monitor.** List, view, kill, pause, resume background tasks. Real-time output streams.
- **Settings and flag builder.** Every CLI flag exposed visually. Launch command preview with copy-to-terminal.
- **Cost tracking visible to user.** Per-turn cost, session totals, daily/weekly/monthly views.
- **Notifications.** Bell with unread count, severity-tiered inbox, webhook delivery.
- **Knowledge base.** Auto-generation, section editing, full-text search, Q&A.
- **Templates.** Library, variable hydration, usage analytics, import/export.
- **Skills.** Per-skill enable/disable, wizard, trigger configuration.
- **Notes.** Top-level surface, categories, tags, attachment to next session, audit-trail chips.

This arc is what a non-technical user actually touches. It is the answer to the Literacy Wall.

### Arc 3 — Organization Layer (Access Wall)

The third arc made the product deployable inside an enterprise. The deliverables:

- **Compliance and audit.** Every action logged. Daily JSONL archive in user config directory. Sensitive-data scanning. Security event tracking.
- **Policy enforcement.** Three built-in presets (Cautious, Standard, Unrestricted) plus custom policies with budget caps, blocked tools/files, model whitelists, concurrent-agent limits.
- **Workspaces.** Multi-repo grouping, broadcast prompts, workspace-scoped MCP and plugins, activity feed.
- **Team collaboration.** Config bundle sharing with HMAC-SHA256 signing, shared folder sync, agent marketplace with 5 built-in agents.
- **Connections / MCP management.** Registry-and-sync architecture with bundled catalog of 10 servers, OS-keychain-backed secrets vault, multi-CLI sync, external-changes detection.
- **Plugins.** Auto-discovery from CLI default install dirs, per-CLI enable/disable, custom path support.
- **Scheduler.** Cron-based execution with per-job budget and turn limits, history with execution logs.
- **Cost analytics and budgets.** Daily/weekly/monthly ceilings with threshold alerts and auto-pause. By-session, by-model, by-agent breakdowns. CSV export.
- **Compliance UI and policy editor.** Audit log viewer with search, policy preset editor.
- **Optional ClearMemory integration.** Cross-session semantic memory engine, opt-in behind feature flag, owned by main process with auto-restart.

This arc is what an enterprise IT and compliance team evaluates. It is the answer to the Access Wall and the foundation for the Cost Wall.

### Feature Flag System (Org Rollout Control)

Cross-cutting all three arcs: a centralized feature-flag system in [`features.json`](../src/renderer/src/config/features.json) with build-time stripping. An organization can ship ClearPath with the advanced surfaces disabled for entry-level users and enabled for power users — the unused code is removed at build time, not just hidden at runtime. This is the foundation for tiered enterprise rollout.

### What This Inventory Demonstrates

The product is not a prototype. It is twenty-eight implementation arcs of working software with persistent data, integrated CLIs, real cost tracking, real compliance tooling, and a full UI surface. The thesis of this document — that the GTM motion is what comes next — depends on the truth of this inventory. The inventory holds.

---

## 9. Risks and Open Questions

A document that asks the board to commit to an enterprise GTM motion owes the board an honest enumeration of what could go wrong. The risks below are not exhaustive, but they are the ones a serious board reader will raise, and addressing them up front is faster than answering them under cross-examination.

### Modeled assumptions that need validation

- **The $20–$50/seat/month baseline (§3) is hypothesized.** Published consumption-pricing rates from Anthropic and OpenAI will land in the next thirty days. ClearPath must validate the baseline against those rates before any external claim is made.
- **The 30–50% savings range (§6) has no production telemetry behind it.** A pilot program across 2–3 customer organizations is the right way to tighten the range. The doc commits to running pilots before publishing the savings claim externally.
- **The productivity uplift in Layer 3 of the ROI model (§7) is the most fragile input.** Even at the low end (1 hour/week per newly-enabled user), the value-creation layer dominates the ROI case. The board does not need to believe the high end, but a hostile reader can challenge the low end. Pilot data on actual productivity outcomes will be needed.

### Gaps in enterprise-readiness

- **No SOC 2 attestation yet.** Enterprise procurement at 10k+ seats requires SOC 2 Type II at minimum. The GTM motion this document approves must include the audit timeline.
- **No SSO integration yet.** Enterprise identity providers (Okta, Azure AD, etc.) are required for org-scale deployment. This is a known build item, not yet shipped.
- **No standardized deployment patterns.** ClearPath is a desktop application today. Enterprise rollout may require MDM packaging, group-policy integration, or a managed-service variant.
- **Token-first cost UI is not yet shipped.** The original dollar-denominated cost UI was removed in v1.10.0 because derived dollar estimates were not accurate enough to put in front of users (tokenizer variance, frequent rate changes, promo pricing). The cost backend continues to collect per-turn token data uninterrupted. The replacement token-first UI — per-turn token meter, per-session token rollup, daily/weekly/monthly token budgets with auto-pause, finance-friendly rolled-up dollar reports — is part of the GTM motion this document approves. The §6 / §7 savings model assumes this UI ships before the consumption-pricing transition. If it does not, Mechanic 1 (Visibility) and Mechanic 2 (Auto-Pause) lifts will not be realized at customer sites.

### Competitive response

- **Microsoft (GitHub Copilot Enterprise) is the largest exogenous risk.** Microsoft can extend Copilot Enterprise into the surface ClearPath occupies. The defensible position is depth of governance + dual-CLI support + verticalized templates — areas where Microsoft's single-CLI focus and slower enterprise iteration cycle work against them.
- **Anthropic (Claude Enterprise) is the secondary competitive risk.** Anthropic is building enterprise surface around Claude directly. The defensible position is multi-CLI (Claude + Copilot + local), the governance/compliance depth, and the non-technical UX investment Anthropic is unlikely to prioritize.
- **Cursor, Replit Agent, and similar tools occupy adjacent but distinct positions.** Detail in §10 appendix.

### Distribution and go-to-market

- **Enterprise procurement is slow.** A 10k-seat deal takes 6–12 months. The GTM motion needs to begin now to land revenue inside the consumption-pricing window's commercial impact (the 6–12 months after providers complete the pricing shift).
- **Sales motion not yet built.** ClearPath has not yet been through a security review with a major enterprise. The first few will be expensive in cycle time; subsequent ones get faster.

### Product dependencies

- **ClearPath sits on top of third-party CLIs.** GitHub and Anthropic both control breaking changes that could disrupt the adapter layer. The adapter pattern in Arc 1 insulates the UI from breaking changes, but a major CLI rewrite would require adapter rework. Mitigation: stay current on both CLIs' roadmaps, maintain testing across adapter versions.

These risks are real. None are fatal. The aggregate risk profile is one where execution speed inside the consumption-pricing window matters more than any individual risk in isolation — which is the case for moving on GTM now rather than waiting for any single risk to fully resolve.

---

## 10. Appendix

### A. Vertical Deep-Dives

**Non-technical SMB (small / mid-sized business).** Owners and operators with no engineering function. AI today is a hobbyist tool for them — they have tried ChatGPT, found it limited, given up. ClearPath's wedge: zero-CLI install, friendly auth, templates as the on-ramp, Notes as personal knowledge capture. Pricing this segment requires a different model than enterprise — likely a self-serve tier that converts on workflow stickiness. This segment validates the "AI for everyone" thesis publicly and produces the testimonials the enterprise sales motion needs.

**Legal and compliance-heavy industries.** Law firms, in-house legal teams, regulatory affairs, compliance, audit. The volume of structured text work is enormous; AI applicability is high; rollout has been blocked by governance gaps. ClearPath's wedge: audit trail + sensitive-data scanning + policy enforcement gives general counsel and compliance officers the controls they need to approve deployment. Vertical-specific templates (contract review, redlining, regulatory research, deposition prep) should ship as part of the enterprise GTM motion to accelerate adoption.

**Finance and consulting (professional services).** Investment management, management consulting, accounting firms, FP&A. Workflows are highly repeated, billable, and pattern-driven — ideal for templates and Scheduler. The per-engagement cost attribution capability is unique to ClearPath versus competitors and directly addresses how these firms bill clients. Vertical templates: financial model boilerplate, market analysis, client deliverable generation, weekly portfolio updates.

### B. Competitive Landscape

| Tool | Positioning | Where it competes with ClearPath | Where it does not |
|---|---|---|---|
| **GitHub Copilot Enterprise** | IDE-first AI coding tool, Microsoft enterprise platform | Same buyer (enterprise CIO/CTO), same governance ask | Single-CLI; IDE-only surface; engineer-focused, weak on non-technical UX |
| **Cursor** | AI-native IDE | Developer productivity claim | IDE-bound; no non-technical surface; no CLI agent governance; no compliance layer |
| **Replit Agent** | Web-based agentic coding | Agentic AI for non-engineers in code domain | Sandbox/educational positioning; no enterprise governance; no integration with Copilot/Claude CLIs |
| **ChatGPT / Claude direct** | Web chatbot | "AI in your work" claim | No agentic tool use; no file access; no governance; no audit trail; no cost attribution |
| **Internal LLM platforms (bedrock, etc.)** | Self-hosted AI on managed infrastructure | Enterprise AI rollout | Lagging frontier models; no agentic CLI surface; no consumer-grade UX |
| **ClearPath AI** | Control surface for CLI agents + governance layer | — | The only product positioned at the intersection of (a) frontier CLI agent power, (b) non-technical accessibility, (c) enterprise governance |

**The wedge:** No competing product sits at the intersection of *frontier CLI agent capability* + *non-technical UX* + *enterprise governance.* Microsoft's offering is the closest, but is single-CLI and IDE-bound. The other players occupy adjacent positions that do not overlap with ClearPath's full surface.

### C. Feature → Business Benefit Matrix

| Shipped Feature | Business Benefit | User Archetype Served |
|---|---|---|
| Install-from-app + browser auth | Onboarding time: minutes, not days | All, especially SMB |
| Per-turn cost visibility | Behavior change → 10–20% AI spend reduction | All |
| Budget auto-pause | Eliminates runaway-session cost spikes | All; CFO-relevant |
| Local-model routing | 10–20% reduction in cloud AI spend | All |
| Notes + Knowledge Base + ClearMemory | Context persists; 10–15% input-token reduction | All |
| Audit log with JSONL archive | Compliance approval; SOC2 / regulated industry rollout | Legal, compliance, finance |
| Sensitive-data scan at prompt boundary | Prevents credential / PII leakage incidents | All; legal-critical |
| Policy presets and enforcement | IT can grant tool access with controls | All; IT/security-critical |
| Signed config bundles | Tamper-evident distribution of org configs | Enterprise IT |
| Workspaces (multi-repo) | Client/engagement isolation | Consulting, agencies |
| Templates with usage analytics | Best prompts become institutional assets | All; analytics-heavy |
| Scheduler (cron) | Recurring workflows execute autonomously | Finance, ops, consulting |
| Composer (multi-step) | Verified, chained workflows | Power users, regulated industries |
| Flag builder + command export | Power-user productivity without CLI-flag memorization | Senior developers |
| Sub-agent monitor | Parallel work, visible status | Power users |
| Onboarding + Learning paths | Skill ramp without dedicated training | Non-technical, SMB |
| Progressive disclosure | Clean surface for beginners, depth for power users | All |
| Plugins management | Extensibility without manual configuration | All |
| MCP catalog + secrets vault | Tool integration with secure credential handling | All |
| Feature flag system (build-time strip) | Tiered enterprise rollout | Enterprise IT |
| Team marketplace + shared folders | Best agents propagate across teams | Teams of all sizes |
| Notifications + webhooks | External system integration (Slack, email) | Ops, compliance |

### D. Glossary

- **Agent** — A configured AI persona with a defined role, prompt, tool set, and model. Distinct from a "session" (the conversation) and a "sub-agent" (a delegated background task).
- **Audit trail** — A chronological log of every user-initiated and AI-initiated action. ClearPath's audit trail is archived to dated JSONL files in the user's config directory.
- **CLI (Command-Line Interface)** — A text-based interface to a software tool, accessed via a terminal. Both Copilot CLI and Claude Code are CLIs.
- **Composer** — ClearPath's multi-step workflow orchestration UI. Chains prompts, sub-agents, and verification gates.
- **Consumption pricing** — A pricing model where the customer pays for actual AI usage (typically per-token) rather than a flat subscription rate.
- **Context window** — The amount of text an AI model can process in a single request. Costs are charged per token consumed.
- **MCP (Model Context Protocol)** — A protocol for extending AI tool capabilities with external integrations (filesystem access, database queries, third-party APIs, etc.).
- **Permission mode** — A setting that controls how aggressively the AI executes actions without user confirmation. Modes range from "ask before every action" (plan) to "auto-approve everything" (yolo).
- **Policy preset** — A pre-defined set of restrictions (allowed models, tool access, file patterns, budget caps, concurrent agents) that an organization can apply to user sessions.
- **Sub-agent** — A background AI task delegated by the main session. Runs independently, reports status back to the spawning session.
- **Token** — The basic unit of AI input and output, roughly equivalent to 3-4 characters of English text. AI providers bill per million tokens.
- **Workspace** — A grouped set of repositories or contexts, used to isolate work across clients, projects, or engagements.

---

*End of document, draft v1.*
