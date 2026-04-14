# Extension Migration Process

Step-by-step process for migrating a ClearPathAI extension between SDK versions.

## Pre-Migration Checklist

1. **Backup** — Ensure extension source is version-controlled
2. **Read release notes** — Check CHANGELOG.md in extension-sdk/ for breaking changes
3. **Check compatibility** — Verify the target SDK version is compatible with the app version
4. **Test current state** — Ensure the extension works before starting migration

## Migration Workflow

### 1. Update Manifest

Check for:
- New required fields added in target version
- Changed field formats or validation rules
- New permission names (old ones may be deprecated)
- Changed contribution schemas

### 2. Update Main Process Code

Check for:
- Changed `ExtensionMainContext` API
- Renamed or removed `ctx.store` methods
- New `ctx.registerHandler` requirements
- Changed `ctx.invoke` channel names

### 3. Update Renderer Code

Check for:
- Changed SDK client API (`useSDK()` return type changes)
- New or renamed namespace methods
- Changed MessagePort message types
- Updated event names

### 4. Update Dependencies

If the extension has its own build:
- Update `@clearpath/extension-sdk` in package.json
- Run `npm install`
- Check TypeScript compilation

### 5. Validate

Run the extension validation:
```bash
# Build the app
npm run build

# Run unit tests
npm run test

# Check manifest is valid
node -e "require('./extensions/<ext-id>/clearpath-extension.json')"
```

## Post-Migration

- Update the extension's `version` field in the manifest
- Update any documentation or README
- Test all contributed UI (navigation, panels, widgets, hooks)
- Verify IPC handlers respond correctly
