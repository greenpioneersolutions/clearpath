# ClearPath → (COMPANY) Enterprise Tailoring — Prompt Pack

## Read This First

This repo (**ClearPath**, at `github.com/greenpioneersolutions/clearpath`) was built **outside of work, on personal time, with personal resources.** It is open source under the MIT license. I'm handing it over so we can bring it inside (COMPANY) and tailor it for internal use.

**Your job:** work through the prompts below, in order, to turn the generic open-source app into a (COMPANY)-branded, (COMPANY)-configured internal tool. Each prompt is self-contained — you can run them one at a time in a Claude Code (or Copilot CLI) session with the repo open.

> **This pack was revised with full access to the codebase.** An earlier draft assumed everything was a hardcoded find-and-replace. It isn't — the app already ships a runtime white-label system, a build-time feature-lock mechanism, and a compliance/audit layer. The prompts below use those existing systems instead of fighting them, and they call out the three things (auto-update feed, code-signing, audit routing) that an enterprise security review will actually stop you on. Where a prompt names a specific file, function, or IPC channel, that target was verified against the current source.

### Before you start — do this one thing

This whole file uses `(COMPANY)` as a placeholder everywhere the company name needs to go. **Do a find-and-replace across this file** — replace every `(COMPANY)` with the actual company name — before you start working. That single swap tailors every prompt at once.

> The same `(COMPANY)` placeholder convention is what the prompts themselves tell you to apply inside the codebase, so the app, the docs, and the config all end up consistent.

### Notes on scope

- **Run them in order.** They're grouped by dependency — identity/branding first, governance/security next, distribution, then content, with a security-review reference at the end. The build/distribution group assumes branding and governance are done.
- **Delete anything that doesn't fit.** If a prompt doesn't make sense for where we are right now, just remove it. Don't force it.
- **Reuse, don't rebuild.** Several features the original draft wanted to "add" already exist (branding presets, policy export/import, feature-flag presets, audit logging). The prompts point you at them. Don't reimplement what's already there.
- **The "Optional / Later" section at the bottom** has extras pulled out of the main list. We're deliberately *not* doing spending caps, internal MCP servers, team config bundles, custom cost reporting, or Slack/Teams integration right now — we want people to just use the tool freely first and layer governance in later once we see how it actually gets used.

### How the groups map to the codebase (read this once)

A few facts that change how the prompts work — knowing these up front saves you from doing things the hard way:

- **Branding is runtime, not hardcoded.** App name, tagline, wordmark, all colors, custom logo, and border-radius are driven by a `BrandingConfig` in `src/main/ipc/brandingHandlers.ts`, applied as `--brand-*` CSS variables, and editable in-app at **Configure → Advanced → Branding** (`/configure?tab=branding`). There are 8 bundled presets. So "(COMPANY) colors" = **ship a preset**, not a global hex sweep.
- **The real lockdown lever is the build, not a setting.** Building with `CLEARPATH_FLAGS_LOCKED=1` (`npm run build:locked`) makes every in-app feature toggle inert and hides off-by-default surfaces. That's how you ship a controlled internal build.
- **Compliance/audit already exists and is on.** `src/main/ipc/complianceHandlers.ts` logs actions, archives to JSONL, and can export a snapshot. It does **not** rotate/retain or block — those are config decisions for us.
- **There is no app-level login, SSO, or RBAC.** Auth is purely CLI-token detection. Real enforcement comes from distributing a locked build via MDM, not from in-app permissions. Plan accordingly and don't promise RBAC we don't have.

---

## Group A — Identity & Branding

### A1. Rename the app (build-time identity only)

**What it does:** Changes the parts of the app identity that are baked in at build time and *cannot* be set at runtime — the installer name, bundle ID, window title, installer icons, and the on-disk data folder.

**Target files:** `package.json` (`name`, `productName`, `build.appId`), `src/renderer/index.html` (the `<title>` tag), the `BrowserWindow` title in `src/main/index.ts`, and the `clear-path-*` electron-store key prefix (used in 110+ `new Store({ name: 'clear-path-…' })` references and in `src/main/utils/storeEncryption.ts`). Also the `'Clear Path'` author strings baked into bundled templates in `src/main/ipc/teamHandlers.ts`.

> **Note — colors, logo, tagline, and wordmark are NOT here.** Those are runtime branding (see A2). This prompt is only the build-time identity that the white-label UI can't touch.

> **⚠️ Caveat — this orphans existing local data.** Renaming `productName` and the `clear-path-*` store prefix changes the app's `userData` directory (e.g. `~/Library/Application Support/clear-path/`). Any sessions/settings/costs/audit logs already stored under the old name will no longer load. Do this rename **once, early, before anyone has real data in the app**, and accept the reset.

**Prompt:**
> Rename this application's **build-time identity** from "ClearPathAI" / "clear-path" to "(COMPANY) AI Workspace" / "(COMPANY)-prefix". Specifically update: `package.json` `name`, `productName`, and `build.appId`; the `<title>` in `src/renderer/index.html`; the `BrowserWindow` title in `src/main/index.ts`; the `clear-path-*` electron-store key prefix everywhere it appears (every `new Store({ name: … })` plus `src/main/utils/storeEncryption.ts`); and the `'Clear Path'` author strings in the bundled templates in `src/main/ipc/teamHandlers.ts`. Do **not** touch colors, the in-app logo, tagline, or wordmark — those are runtime branding handled separately. Warn me explicitly about the `userData` directory change and confirm we're doing this before anyone has stored data. Show me a summary of every file you changed and flag anything ambiguous.

---

### A2. Ship the (COMPANY) brand preset

**What it does:** Adds a (COMPANY)-branded theme to the app's existing runtime branding system and makes it the default on first launch. This replaces the old "find-and-replace 5 hex values" approach — the app drives all colors through CSS variables, so a global hex sweep is the wrong tool.

**Target file:** `src/main/ipc/brandingHandlers.ts` — the `BRAND_PRESETS` array (8 presets live here) and `DEFAULT_BRANDING`.

> **Context:** A `BrandingConfig` covers `appName`, `appTagline`, `wordmarkParts` (3 strings), 19 color values (brand palette + UI palette + light/dark surfaces), `borderRadius`, and an optional custom logo. `BrandingContext.tsx` applies it live as `--brand-*` CSS variables. Users can fine-tune everything at **Configure → Advanced → Branding** (`/configure?tab=branding`). There is no JSON import/export for branding, so we bundle the preset in code.

**Prompt:**
> Add a new brand preset called "(COMPANY)" to the `BRAND_PRESETS` array in `src/main/ipc/brandingHandlers.ts`, following the exact shape of the existing presets (`id`, `name`, `preview` array, and a `config` partial of `BrandingConfig`). Populate the full `config` — `appName`, `appTagline`, `wordmarkParts`, all 19 color fields (brand + UI + light/dark surfaces), and `borderRadius` — with (COMPANY)'s brand values. Then make "(COMPANY)" the first-launch default by updating `DEFAULT_BRANDING` (or auto-applying the preset on first run) so a fresh install opens already branded. Ask me for (COMPANY)'s exact hex values, tagline, and how the wordmark should split into three parts if I haven't given them. Confirm the preset shows up in the White Label UI and applies cleanly. Don't do a global hex find-and-replace — use the preset system.

---

### A3. Replace the installer icons

**What it does:** Swaps the icons electron-builder bakes into the actual installed `.dmg` / `.exe` / `.AppImage`. (The *in-app* logo is handled by the brand preset / custom-logo upload from A2 — this is only the OS-level app icon.)

**Target files:** the icon files in the `build/` directory referenced by the `build` block in `package.json` — `build/icon.icns` (macOS), `build/icon.ico` (Windows), `build/icon.png` (Linux).

**Prompt:**
> Replace the installer icons in the `build/` directory with (COMPANY)-branded versions: `build/icon.icns` (macOS), `build/icon.ico` (Windows), `build/icon.png` (Linux). Keep the same filenames and the dimensions/format electron-builder expects so the `build` block in `package.json` keeps resolving. The in-app logo is already handled by the brand preset and the White Label custom-logo upload, so this is only the OS-level app icon. If I haven't given you the (COMPANY) icon source yet, tell me exactly what dimensions and formats you need for each platform slot (including the master resolution to generate the `.icns`/`.ico` from).

---

## Group B — Governance & Security

### B1. Build the (COMPANY) policy preset

**What it does:** Adds a (COMPANY)-specific policy preset alongside the built-in Cautious / Standard / Unrestricted options and makes it the default.

**Target file:** `src/main/ipc/policyHandlers.ts`.

> **Context — budgets already exist.** The built-in presets set spending caps (`policy-standard` is $10/session, $50/day; `policy-cautious` is $2/session). Since we're intentionally leaving usage **uncapped** for now, the (COMPANY) preset must set `maxBudgetPerSession` and `maxBudgetPerDay` to `null` — not omit them. A `PolicyRules` object also defines `blockedTools`, `blockedFilePatterns`, `requiredPermissionMode`, `allowedModels`, `maxConcurrentAgents`, and `maxTurnsPerSession`. Note that policy violations are **logged as warnings, not blocked** — the action still proceeds.

**Prompt:**
> Add a new policy preset called "(COMPANY) Standard" to `src/main/ipc/policyHandlers.ts`, alongside the existing `policy-cautious` / `policy-standard` / `policy-unrestricted` presets, following the same `PolicyRules` shape. Set `maxBudgetPerSession` and `maxBudgetPerDay` to `null` — we are intentionally leaving spending uncapped. Define `blockedFilePatterns` tuned to (COMPANY)'s sensitive paths and `blockedTools` appropriate for non-developer users (ask me which directories, file patterns, and tools to restrict), and pick a sensible `requiredPermissionMode`. Make "(COMPANY) Standard" the default active preset on first launch. Remind me that violations are warn-only in this app, not hard blocks.

---

### B2. Configure sensitive-data scanning patterns

**What it does:** Adds (COMPANY)-specific regex patterns so the app warns before sensitive internal data goes to the AI.

**Target file:** `src/main/ipc/complianceHandlers.ts` — the built-in pattern set (~lines 28–35) used by the `compliance:scan-text` handler.

> **Context:** There are already 6 built-in patterns (AWS key, generic API key, GitHub token, Slack token, DB connection string, email). Scanning is **warn-only and manual** (triggered via `compliance:scan-text`, not on every keystroke) — a match logs a `security-warning` audit entry and fires a notification; it does not block submission. That matches our "don't frustrate users on day one" stance.

**Prompt:**
> Add custom sensitive-data scanning patterns for (COMPANY) to the built-in pattern set in `src/main/ipc/complianceHandlers.ts` (the array used by `compliance:scan-text`, around lines 28–35). Add regex patterns for (COMPANY)-specific formats: internal project IDs, employee IDs, proprietary system names, internal URL patterns, and any credential formats our security team flags — ask me for the actual patterns. Keep them **warn-only** (the existing behavior — match logs a `security-warning` and notifies, doesn't block). Give each pattern a clear, human-readable label that shows up in the warning. Don't change the warn-vs-block behavior.

---

### B3. Lock the build down for distribution

**What it does:** Produces a controlled internal build where regular users can see the rules but can't change feature flags or unlock hidden surfaces. This replaces the original draft's "store a policies-locked boolean" idea — the app already has a stronger, build-time lock.

**Target files:** `features.json` (the source of truth for all flags), built via `npm run build:locked` (`CLEARPATH_FLAGS_LOCKED=1`). Optionally a small read-only tweak to the Policies tab on the Configure screen.

> **Context — the flag-lock build is the real lever.** `CLEARPATH_FLAGS_LOCKED=1` (see `scripts/generate-feature-flags.mjs` + `src/renderer/src/contexts/FeatureFlagContext.tsx`) makes all in-app flag setters inert, empties the preset list, and hides off-by-default features. Several governance surfaces are OFF by default and must be turned ON in `features.json` if we want them visible: `showPolicies`, `showComplianceLogs`, `showDataManagement`. There are also ready-made flag presets (`manager`, `demo`, `essentials`) you can start from. **Honest limitation:** there is no app-level login/SSO/RBAC — a determined local user could still edit the on-disk JSON. Real enforcement is shipping this locked build through (COMPANY)'s MDM, not an in-app flag.

**Prompt:**
> Set up a locked internal build for (COMPANY). First, edit `features.json` to the feature set we want regular users to see — turn ON `showPolicies`, `showComplianceLogs`, and `showDataManagement` if we want governance visible, and turn OFF anything we don't want non-developers touching (ask me, or start from the `manager` preset). Then document and confirm the locked build path: `npm run build:locked` (which sets `CLEARPATH_FLAGS_LOCKED=1`) makes all feature toggles inert and hides off-by-default surfaces. As an honor-system layer on top, add a read-only mode to the Policies tab on the Configure screen so the rules render but the editing controls are disabled, with a visible "locked" banner/icon so it reads as intentional. Be explicit in your summary that this app has **no RBAC/SSO** and that the locked build distributed via MDM is the actual enforcement — don't imply per-user permissions exist.

---

### B4. Turn on audit retention + routing

**What it does:** Makes the existing audit log enterprise-grade by deciding retention and where the log ships. Audit logging is already on; this is about not letting it grow forever and getting it somewhere your security team can see it.

**Target file:** `src/main/ipc/complianceHandlers.ts` (audit log + archive), plus an operational decision about log shipping.

> **Context:** Audit logging is **always on** — it records 7 action types (session, prompt, tool-approval, file-change, config-change, policy-violation, security-warning), keeps up to 10,000 entries in memory, and overflow is appended to dated JSONL files in `audit-archive/` under the app's `userData` dir. The compliance store is protected from the data-wipe handlers. **Gaps to close:** there is no time-based retention or rotation (the JSONL files grow unbounded), and nothing ships them off the machine. `compliance:export-snapshot` exists for point-in-time exports.

**Prompt:**
> Make the audit logging in `src/main/ipc/complianceHandlers.ts` enterprise-ready. It's already on and archives to dated JSONL files in the `audit-archive/` directory, but there's no retention/rotation and nothing ships the logs off-box. Add a configurable retention policy (max age and/or max total size for the JSONL archive, with safe cleanup), and add a mechanism to ship audit entries to (COMPANY)'s log destination — ask me whether that's a SIEM endpoint (e.g. Splunk HTTP collector), a network share, or just the existing `compliance:export-snapshot` on a schedule. Keep the existing protection that prevents audit logs from being cleared via the data-management handlers. Tell me where the archive lives per-OS so our security team can find it.

---

### B5. Decide extension governance

**What it does:** Sets policy for the app's sandboxed extension system before rollout — and flags a real integration opportunity.

**Target:** the extension system (`src/renderer/src/components/extensions/`, the `extension-sdk/`, and the sample extensions under `extensions/`).

> **Context:** The app sandboxes UI add-on extensions in iframes and ships sample extensions (including a `backstage-explorer` that points at internal developer-portal integration). For an internal rollout, *which* extensions are allowed is a governance surface — and Backstage/internal-portal integration may be a (COMPANY) win worth prioritizing.

**Prompt:**
> Review the extension system (`extension-sdk/`, `src/renderer/src/components/extensions/`, and the samples in `extensions/`) and propose an extension-governance approach for (COMPANY): an allowlist of approved extensions for the internal build, where that allowlist should live, and whether extension loading should be locked in the distributed build. Separately, assess the `backstage-explorer` sample as an internal developer-portal integration — tell me what it does today and what it would take to point it at (COMPANY)'s Backstage instance. Don't build anything yet; give me the options and a recommendation.

---

## Group C — Distribution & Build

> **Do this group after branding and governance are settled** — you don't want to cut signed, distributable builds until the app is actually (COMPANY)-branded and locked.

### C1. Repoint or disable auto-update (do this first — it's a leak)

**What it does:** Stops the internal build from phoning the public open-source release feed.

**Target file:** `src/main/index.ts` (the `autoUpdater` block, ~lines 680–760).

> **⚠️ Why this is urgent:** The updater runs unconditionally — `autoDownload = true`, `autoInstallOnAppQuit = true`, and `checkForUpdates()` fires ~5s after launch, in **all** builds with no dev/prod gate. There is **no `setFeedURL` and no `repository` field in `package.json`**, so electron-updater infers the feed from git config → the **public `greenpioneersolutions/clearpath` repo**. Left as-is, a (COMPANY) internal build will check the public repo for updates and could auto-download a public release over the internal build. This must be repointed or disabled before any internal distribution.

**Prompt:**
> Fix the auto-updater in `src/main/index.ts` so the internal (COMPANY) build does not phone the public `greenpioneersolutions/clearpath` release feed. Two acceptable approaches — ask me which we want: (1) **repoint** — add an explicit `autoUpdater.setFeedURL({ provider: 'generic', url: '<(COMPANY) internal release URL>' })` and make sure our build/publish step uploads electron-builder's `latest*.yml` metadata alongside the artifacts so updates resolve; or (2) **disable** — gate the entire updater block behind an env var / feature flag so internal builds ship with auto-update off and we distribute new versions via MDM. Whichever we pick, also add a dev/prod gate so it never runs in development. Explain the trade-off and confirm the feed no longer resolves to the public repo.

---

### C2. Set up code-signing + notarization

**What it does:** Makes the built artifacts installable on managed (COMPANY) machines. Unsigned Electron apps get blocked by macOS Gatekeeper, Windows SmartScreen, and most MDM allowlists — so without this, you can build artifacts nobody can install.

**Target file:** `package.json` (`build.mac` / `build.win`), plus signing/notarization credentials and possibly an `afterSign` hook.

> **Context:** The app is currently **unsigned**. `build.mac` and `build.win` have no `identity`, `certificateFile`, `hardenedRuntime`, `entitlements`, or `notarize` configuration. Notarization isn't wired up at all — electron-builder supports it via the `build.mac.notarize` config (it pulls in `@electron/notarize` transitively, so you don't need to add it as a direct dependency).

**Answer these before running the prompt:**
- Does (COMPANY) have an Apple Developer ID Application certificate (for macOS signing) and an Apple ID / app-specific password or API key for notarization?
- Does (COMPANY) have a Windows code-signing certificate (and is it a file/PFX, an HSM/token, or Azure Trusted Signing)?
- Where do those credentials live, and can the build machine access them (env vars, keychain, secrets store)?
- Are we signing on developer machines, on the Jenkins agent (see C4), or both?

**Prompt:**
> Configure code-signing and notarization in `package.json` so (COMPANY)'s builds install cleanly on managed machines. For macOS: set `build.mac.hardenedRuntime`, `entitlements`/`entitlementsInherit`, the signing `identity`, and notarization via electron-builder's `build.mac.notarize` config (electron-builder bundles `@electron/notarize` transitively, so no new direct dependency is needed) — or an `afterSign` hook if we need custom handling. For Windows: configure code-signing in `build.win` for whatever certificate type we have. Before writing anything, confirm with me: (1) the Apple Developer ID + notarization credentials, (2) the Windows certificate type and location, (3) where credentials live and whether the build machine can reach them, and (4) whether signing happens on dev machines, the Jenkins agent, or both. Flag clearly that without signing, Gatekeeper/SmartScreen/MDM will block installation.

---

### C3. Clarify and document local build commands

**What it does:** Makes it dead-simple for someone at (COMPANY) to build a release artifact on their own machine, since we don't have GitHub Actions access internally.

**Target files:** `README.md`, the scripts block in `package.json`, and (optionally) a new `BUILDING.md`.

**Prompt:**
> Audit the build scripts in `package.json` and write crystal-clear local build documentation for non-CLI-native users at (COMPANY). We do NOT have GitHub Actions access, so everything has to be runnable on a local machine. Document: (1) all prerequisites (exact Node version, platform requirements, any global tools); (2) step-by-step commands to build a release artifact for each platform — use the **real** script names in this repo (`npm run package`, `npm run package:mac`, `npm run package:win`, `npm run package:linux`, and note `npm run build:locked` for the locked internal build from B3); and (3) exactly where the output artifact lands (the electron-builder output directory) so someone can find the `.exe` / `.dmg` / `.AppImage` and store or distribute it without guessing. Put this in the README and, if it's substantial, a dedicated `BUILDING.md`. Write it so someone who has never opened a terminal could follow it. Cross-reference the signing step (C2) so people don't ship unsigned artifacts by accident.

---

### C4. Build a Jenkins pipeline for release artifacts

**What it does:** Creates a Jenkins pipeline to build, sign, and store release artifacts, since (COMPANY) uses Jenkins internally (no GitHub Actions).

**Target:** a new `Jenkinsfile` at the repo root.

**Answer these before running the prompt:**
- What Jenkins agent label does (COMPANY) use? (e.g. `windows`, `macos`, or a specific node name)
- Do we need all three platforms, or just Windows since this is internal enterprise?
- Where do artifacts get stored — Jenkins' built-in archive, a network share, or an internal repo like Nexus / Artifactory? (If we repointed auto-update in C1, this is also where `latest*.yml` + artifacts must land.)
- Is code-signing (C2) done in this pipeline or separately?

**Prompt:**
> Create a declarative `Jenkinsfile` at the repo root to build, sign, and store (COMPANY)'s release artifacts. We use Jenkins internally and do NOT have GitHub Actions. Include stages for: checkout, `npm install`, lint/type-check (whatever scripts exist), the locked build (`npm run build:locked`) + `npm run package` for the target platform(s), code-signing (per C2, if done here), and archiving the resulting artifact from electron-builder's output dir (use `archiveArtifacts`, or push to our internal artifact store — ask me which). If we repointed auto-update to an internal feed in C1, make sure this pipeline also publishes electron-builder's `latest*.yml` metadata next to the artifacts. Add a success/failure notification stage. Before you write it, confirm with me: (1) the Jenkins agent label, (2) which platforms we need, (3) where artifacts/metadata go, and (4) whether signing happens here or separately. Build around my answers — don't assume.

---

## Group D — Content & Roles

### D1. Update tagline + marketing copy

**What it does:** Rewrites the public-facing copy from the open-source origin story to (COMPANY)'s internal voice — and leans into the differentiators that actually matter inside an enterprise.

**Target files:** `README.md`, `ENTERPRISE.md`, the onboarding first-run wizard in `src/renderer/src/components/onboarding/`, and the Learn page intro in `src/renderer/src/pages/Learn.tsx`. (The in-app app name/tagline themselves come from the brand preset in A2 — this is the longer-form narrative copy.)

> **Differentiators worth foregrounding:** (1) **Air-gapped / zero-egress** — the app has a `LocalModelAdapter` (Ollama / LM Studio), so it can run with no data leaving the machine; for any data-residency-sensitive team that's a headline. (2) **Non-terminal users** — the whole point is letting PMs/analysts/leads use approved CLIs without a terminal.

**Prompt:**
> Rewrite the user-facing copy to reflect (COMPANY)'s internal AI initiative instead of the open-source origin story. Replace the tagline "No code. No confusion. Just go." and all "Why ClearPathAI Exists" narrative in `README.md`, `ENTERPRISE.md`, the onboarding wizard (`src/renderer/src/components/onboarding/`), and the Learn page intro (`src/renderer/src/pages/Learn.tsx`). Speak in (COMPANY)'s voice and tie to our internal AI goals. Foreground two real differentiators: that the app can run **air-gapped against local models** (Ollama/LM Studio via the `LocalModelAdapter`) with zero data egress, and that it lets **non-technical team members** use our approved CLIs without a terminal. Keep it concise. Ask me for our initiative name and key talking points if they aren't provided.

---

### D2. Build a (COMPANY)-standard prompt template library

**What it does:** Replaces the generic built-in templates with (COMPANY)-specific ones.

**Target file:** `src/main/ipc/templateHandlers.ts` and the template data it serves.

**Prompt:**
> Replace or augment the built-in prompt templates in `src/main/ipc/templateHandlers.ts` with (COMPANY)-specific ones. Build templates for our common workflows — examples: PR review checklist, sprint planning, incident response, documentation in our format, standup summary, architecture decision record. Use the existing `{{variable}}` syntax for fill-in-the-blank fields. Ask me which workflows matter most to our teams and what our internal conventions are for each. Keep the category structure clean and remove any built-in templates that don't apply to us. (Note: the bundled-template author names currently say "Clear Path" — those should already be renamed by A1; if not, fix them here.)

---

### D3. Create role-based agent definitions

**What it does:** Writes AI agent definitions that encode (COMPANY)'s standards for each role.

**Target:** the `.agent.md` files served by the Agents feature (`src/renderer/src/pages/Agents.tsx`).

**Prompt:**
> Create role-based agent definition files (`.agent.md`) for (COMPANY)'s key roles. At minimum: a developer agent (encoding our coding standards, architecture patterns, and testing requirements), a PM agent (our ticket/sprint workflow and stakeholder communication style), and an analyst agent (our data governance, reporting format, and approved tools). Follow the existing agent-definition format used by the app. Ask me for our actual standards and conventions per role — don't invent them. Name the files clearly (e.g. `company-developer.agent.md`).

---

### D4. Rewrite the Getting Started learning path

**What it does:** Rewrites the 16-lesson onboarding path to reference (COMPANY)'s real tools and policies.

**Target file:** `src/main/ipc/learnHandlers.ts` (the Getting Started path).

**Prompt:**
> Rewrite the "Getting Started" learning path (16 lessons) in `src/main/ipc/learnHandlers.ts` so it references (COMPANY)'s actual environment: our Jira instance, our GitHub org, our Copilot license tier, our AI governance policy, and real workflow examples from our engineering teams. Keep the existing lesson structure (walkthrough / guided-task / knowledge-check) — just replace the content. Ask me for the specifics where you need them rather than guessing.

---

### D5. Customize the role-based learning paths

**What it does:** Tailors the Manager, Developer, and Admin learning tracks to (COMPANY)'s org and tools.

**Target file:** same `learnHandlers.ts` — the Manager (36 lessons), Developer (32 lessons), and Admin (19 lessons) paths.

**Prompt:**
> Tailor the role-based learning paths in `src/main/ipc/learnHandlers.ts` — Manager, Developer, and Admin — to (COMPANY)'s actual org structure, team names, internal tools, and approval/escalation workflows. The Admin track specifically should reference (COMPANY)'s software distribution system (Jamf / Intune / SCCM — ask me which) and our IT ticketing/support process. Keep the lesson structure intact and replace only the content. Flag any lessons that no longer apply so I can decide whether to cut them.

---

### D6. Configure Jira / Confluence integration defaults

**What it does:** Pre-fills (COMPANY)'s internal tool URLs so users don't have to hunt for them. (This is just pre-filling defaults — not building a live API integration.)

**Target:** the integration connection settings (integration handlers in `src/main/ipc/`).

**Prompt:**
> Pre-fill the integration connection defaults with (COMPANY)'s internal URLs so users don't have to look them up: our Jira base URL, our Confluence space key, and our ServiceNow instance URL (ask me for the real values). Leave the per-user auth/token fields empty — just remove the friction of finding the URLs. This is only about setting sensible default field values, not building or testing a live API connection. If any of these tools aren't ones we actually use, skip them and tell me which you skipped.

---

## Group E — Security-Review Reference

This section isn't a prompt — it's a fact sheet to hand a (COMPANY) security reviewer so the architecture questions get fast, accurate answers. All of the following is verified against the current code.

### How secrets and tokens are handled
- **No raw token storage by design.** The app never stores AI provider tokens itself. `src/main/auth/AuthManager.ts` only *detects* auth — it reads `ANTHROPIC_API_KEY` / `GH_TOKEN` from the environment or the CLIs' own config files and probes validity. Tokens stay with the CLI tools, not the app.
- **Secrets that the app does hold** (e.g. MCP server credentials) go through `src/main/utils/credentialStore.ts`, which uses Electron `safeStorage` (macOS Keychain / Windows DPAPI / Linux libsecret). On Linux without libsecret it degrades to an explicit unsafe mode.
- **Store encryption at rest:** electron-store data is encrypted with a machine-bound AES key derived in `src/main/utils/storeEncryption.ts` (SHA-256 over user + host + username). This is app-layer "encryption at rest," not full-disk encryption — note that for the reviewer.

### Data residency & deletion
- All user data lives locally under the app's `userData` directory (sessions, settings, costs, notifications, notes, etc.) — nothing leaves the machine unless a cloud model is used. With the `LocalModelAdapter` (Ollama/LM Studio) the app can run fully air-gapped.
- `src/main/ipc/dataManagementHandlers.ts` provides per-store clear, a factory-reset ("clear all"), and storage stats. **Audit/compliance logs are deliberately protected from both** so they can't be wiped from the UI.

### Access control — honest statement
- **There is no app-level authentication, SSO, or RBAC.** The app runs as whoever launched it; policy rules are global, not per-user. Enforcement for an internal deployment comes from distributing the **locked build** (B3) via MDM — not from in-app permissions. Don't represent per-user roles we don't have.

### Before distribution — supply-chain / license review
- Run a dependency vulnerability pass (`npm audit`) and resolve or document criticals.
- Generate an SBOM and run a license scan across `node_modules` to confirm everything is compatible with internal distribution (the app itself is MIT).
- Pin/lockfile review: confirm `package-lock.json` is committed and the build installs from it.

**Prompt (optional, to generate the artifacts):**
> Produce a security-review packet for (COMPANY): run `npm audit` and summarize findings by severity, generate an SBOM (e.g. via `npm sbom` or CycloneDX) and a license summary of all dependencies, and write a one-page "data handling" doc that states where data is stored, how secrets are encrypted (`credentialStore.ts` / `storeEncryption.ts`), the no-raw-token-storage design, and the honest "no RBAC/SSO — enforcement is the locked MDM build" position. Don't soften the access-control limitation.

---

## Optional / Later

We're deliberately holding off on the items below. The philosophy right now is: **let people use the tool freely first, then add governance once we see how it actually gets used.** Only pick these up if they turn out to be quick wins; otherwise skip them.

### (Optional) Microsoft Teams notifications

We use Teams, not Slack, and we don't currently have API access set up for it. The app has webhook notification support built in (it ships with Slack + generic JSON webhook delivery). Teams supports incoming webhooks, so *if* we ever stand one up, this is doable — but it's not worth the effort until we have a webhook URL and a reason to send notifications somewhere other than the local app.

> **Prompt (only if we decide to do it):** Add a Microsoft Teams notification target to the webhook notification system (NotificationManager, `src/main/notifications/`). Teams incoming webhooks accept a specific JSON card payload format — implement a Teams adapter that formats notifications into that payload. Make the Teams webhook URL configurable and let me choose which notification types route to Teams vs. stay local-only. Ask me for the webhook URL when we have one.

### Things we are NOT doing right now (documented so the decision is on record)

- **Custom budget limits / spending caps** — note these already *exist* in the policy presets; "uncapped" means we set them to `null` in the (COMPANY) preset (B1), not that the feature is missing. Revisit if finance wants chargeback later.
- **Internal MCP server connections** — we don't have internal APIs wired up for this yet. The Connections/MCP feature is fully built when we're ready.
- **Team config bundles** — not until we've settled what a standard config even looks like.
- **Custom cost-reporting export format** — no finance/chargeback process to match yet.

If any of these become relevant later, they're straightforward to add back — the app already has the underlying features; it's just configuration.

---

*Built outside of work on personal time. Open source (MIT). Bringing it in to tailor for (COMPANY).*
