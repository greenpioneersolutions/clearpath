# Migration Template: vX.Y.Z → vA.B.C

Use this template when documenting a new SDK version migration.

## Version Details

| | Value |
|---|---|
| **From** | vX.Y.Z |
| **To** | vA.B.C |
| **Release Date** | YYYY-MM-DD |
| **Breaking** | Yes/No |

## Breaking Changes

### 1. [Change Title]

**What changed**: Description of what was changed in the SDK.

**Before** (vX.Y.Z):
```json
// or code example showing old behavior
```

**After** (vA.B.C):
```json
// or code example showing new behavior
```

**Migration**:
1. Find all instances of [old pattern]
2. Replace with [new pattern]
3. Verify [validation step]

### 2. [Next Change Title]
...

## New Features (Non-Breaking)

### [Feature Name]
**What**: Description
**How to adopt**: Steps to use the new feature (optional, not required for migration)

## Deprecations

### [Deprecated API]
**Status**: Deprecated in vA.B.C, will be removed in vD.E.F
**Replacement**: [New API]
**Action**: Update when convenient, no urgency

## Validation Checklist

- [ ] Manifest validates against new schema
- [ ] All IPC handlers registered successfully
- [ ] Renderer components load without errors
- [ ] Storage operations work correctly
- [ ] Session hooks fire as expected
- [ ] Context providers return valid data
