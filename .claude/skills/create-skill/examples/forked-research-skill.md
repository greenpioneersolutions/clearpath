# Pattern: Forked Research Skill (Isolated Context)

**Use when:** The skill performs read-only investigation that benefits from isolated context and won't pollute the main conversation.

**Key settings:** `context: fork`, `agent: Explore`, pre-populated with live shell data.

---

## Complete SKILL.md

```yaml
---
name: pr-review
description: Review the current pull request for correctness, test coverage, and breaking changes. Fetches live PR data and runs in an isolated context.
argument-hint: [focus-area]
context: fork
agent: Explore
allowed-tools: Bash(gh *) Read Grep Glob
---

# PR Review

## Pull request context

- **Diff:** !`gh pr diff 2>/dev/null || echo "(not on a PR branch)"`
- **Description:** !`gh pr view --json title,body,labels 2>/dev/null || echo "(no PR)"`
- **Comments:** !`gh pr view --comments 2>/dev/null | head -100`
- **Changed files:** !`gh pr diff --name-only 2>/dev/null`
- **CI status:** !`gh pr checks 2>/dev/null | head -20`

## Your task

Review this pull request$ARGUMENTS. For each category below, report PASS, WARN, or FAIL with specific line references.

### Correctness
- Does the implementation match the PR description?
- Are there obvious logic errors or off-by-one issues?
- Are null/undefined/empty cases handled?

### Test coverage
- Are new code paths covered by tests?
- Are edge cases tested?
- Do existing tests still make sense?

### Breaking changes
- Does this change any public API signatures?
- Does this change any database schema in a non-backwards-compatible way?
- Does this change any environment variables or config keys?

### Security
- Is any user input validated before use?
- Are any secrets or credentials exposed?
- Are any new dependencies introduced? Are they reputable?

End with: **Overall: APPROVE / REQUEST CHANGES / NEEDS DISCUSSION** with a one-sentence summary.
```

---

## Why this pattern works

- `context: fork` runs in isolation -- long PR diffs don't pollute the main conversation
- `agent: Explore` uses a fast, read-only agent optimized for codebase analysis
- Shell injection (`` !`gh pr diff` ``) pre-loads PR data before Claude starts -- no tool calls wasted
- Structured output format (PASS/WARN/FAIL) makes results scannable

---

## Directory structure for this pattern

```
pr-review/
├── SKILL.md              # Core review workflow (as above)
├── references/
│   ├── review-checklist.md   # Detailed review criteria by category
│   └── security-patterns.md  # Security anti-patterns to flag
└── examples/
    ├── approved-review.md    # Example of an APPROVE output
    └── changes-requested.md  # Example of REQUEST CHANGES output
```
