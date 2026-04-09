# Pattern: Reference Skill (Auto-Invoked Background Knowledge)

**Use when:** The skill encodes conventions, style guides, or domain knowledge Claude should apply automatically when working in a relevant context.

**Key settings:** `user-invocable: false` (hidden from `/` menu), `paths` to limit scope.

---

## Complete SKILL.md

```yaml
---
name: api-conventions
description: REST API design conventions for this codebase. Activates when working on API routes, controllers, or OpenAPI specs.
user-invocable: false
paths: "src/api/**, src/routes/**, **/*.openapi.yaml"
---

# API Conventions

Apply these conventions whenever writing or reviewing API code.

## Naming
- Routes use kebab-case: `/user-profiles`, not `/userProfiles`
- Resource names are plural nouns: `/users`, `/orders`
- Actions use verbs only for non-CRUD operations: `/orders/{id}/cancel`

## Response format
All responses use this envelope:
```json
{
  "data": <payload>,
  "meta": { "requestId": "...", "timestamp": "..." },
  "error": null
}
```

## Error handling
- 400: Validation errors (include field-level detail)
- 401: Auth required
- 403: Auth succeeded but access denied
- 404: Resource not found
- 409: Conflict (duplicate, stale update)
- 422: Business rule violation
- 500: Internal -- never expose stack traces

## Versioning
Version in URL path: `/v1/users`, `/v2/users`. Never in headers.
```

---

## Why this pattern works

- `user-invocable: false` keeps it off the `/` menu -- users don't need to invoke style guides
- `paths` ensures it only loads when editing relevant files, saving context budget
- Content is written as **standing guidelines**, not one-time steps
- No side effects, read-only knowledge -- Claude applies it passively

---

## Directory structure for this pattern

```
api-conventions/
├── SKILL.md              # Core conventions (as above)
├── references/
│   ├── error-codes.md    # Full error code catalog
│   ├── pagination.md     # Pagination patterns
│   └── auth-headers.md   # Authentication header specs
└── examples/
    ├── crud-endpoint.md  # Full CRUD example
    └── webhook.md        # Webhook endpoint example
```
