---
name: extension-migration
description: Migrate ClearPathAI extensions between SDK versions. Guides through manifest, API, and permission changes. Invoke: /extension-migration [from-version] [to-version]
argument-hint: <from-version> [to-version]
disable-model-invocation: true
allowed-tools: Read Glob Write Edit Bash Grep
---

# ClearPathAI Extension Migration Guide

Helps migrate extensions between versions of the `@clearpath/extension-sdk`. Run this when upgrading extensions to a new SDK version.

**Current SDK Version**: 0.2.0

## Usage

```
/extension-migration 0.1.0 0.2.0    # Migrate from 0.1.0 to 0.2.0
/extension-migration 0.1.0           # Migrate from 0.1.0 to latest (0.2.0)
```

## Instructions

### Step 1: Identify target extensions

Scan for extensions to migrate:
- Check `extensions/` directory for bundled extensions
- Check `~/.config/clear-path/extensions/` for user-installed extensions
- Read each `clearpath-extension.json` to identify current version compatibility

### Step 2: Determine migration path

Parse arguments:
- `$0` = source version (required)
- `$1` = target version (defaults to current SDK version: 0.2.0)

Look up the migration path in the migration registry below.

### Step 3: Apply migrations sequentially

For each version step in the path, apply the documented changes:
1. Update manifest fields (new required fields, changed formats)
2. Update API calls (renamed methods, changed signatures)
3. Update permissions (new permissions, renamed permissions)
4. Update contribution schemas (new fields, changed formats)
5. Test the extension loads and activates

### Step 4: Validate

After migration:
1. Verify manifest passes validation (check against manifest-reference in extension-sdk skill)
2. Verify all IPC channels follow namespace rules
3. Run `npm run build` to ensure app compiles
4. Run `npm run test` to check for regressions

## Migration Registry

### No migrations available yet

The SDK is currently at v0.2.0. As new versions are released, migration entries will be added here in this format:

```
### v0.2.0 → v0.3.0
**Release date**: YYYY-MM-DD

#### Breaking Changes
- [Change description]

#### Migration Steps
1. [Step description]

#### New Features (optional adoption)
- [Feature description]
```

When migrations are added, each will also get a dedicated file in `references/` with detailed before/after examples.

## Reference materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/migration-process.md](references/migration-process.md) | Step-by-step migration process | Running any migration |

## Examples

| File | Pattern | Use when... |
|------|---------|-------------|
| [examples/migration-template.md](examples/migration-template.md) | Template for documenting a new migration | Adding a new version migration entry |
