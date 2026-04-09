# Pattern: Skill with Arguments and Supporting Scripts

**Use when:** The skill needs to generate files, run scripts, or pass structured data to external tools.

**Key settings:** `$0`/`$1` for positional args, `${CLAUDE_SKILL_DIR}` for script paths.

---

## Complete SKILL.md

```yaml
---
name: generate-migration
description: Generate a database migration file from a description. Use when adding tables, columns, or indexes. Example: /generate-migration "add user_preferences table"
argument-hint: "<description>"
disable-model-invocation: true
allowed-tools: Read Glob Write Bash
---

# Generate Migration

Create a new database migration file from a plain-language description.

## Usage
`/generate-migration "add profile_picture_url to users table"`

**Description received:** `$ARGUMENTS`

## Steps

1. Find the migrations directory:
```!
find . -type d -name "migrations" | grep -v node_modules | head -5
```

2. Find the latest migration to determine the next version number:
```!
ls -1 migrations/ 2>/dev/null | sort | tail -5
```

3. Read 2-3 recent migrations to understand the format and conventions:
   - Use `Read` on the most recent files

4. Generate the next migration filename following the existing pattern
   (e.g., `20260401_001_add_profile_picture_url_to_users.sql`)

5. Write the migration file with:
   - **Up migration**: SQL to apply the change
   - **Down migration**: SQL to reverse it (if the project uses reversible migrations)
   - Comments explaining non-obvious decisions

6. If the project has a migration runner script, print the command to apply it:
   `npm run db:migrate` or equivalent

7. Report the created file path and a summary of what it does.

## Reference materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/sql-conventions.md](references/sql-conventions.md) | SQL type and naming rules | Writing migration SQL |
| [references/rollback-patterns.md](references/rollback-patterns.md) | Safe rollback strategies | Writing down migrations |
```

---

## Why this pattern works

- `disable-model-invocation: true` -- migrations are side effects, user must trigger
- Shell injection discovers the migration directory and latest file at load time
- `$ARGUMENTS` passes the user's description directly into the workflow
- Reference table lets Claude selectively load only the SQL/rollback docs it needs
- `allowed-tools` includes `Write` for creating the migration file

---

## Using ${CLAUDE_SKILL_DIR} for bundled scripts

```markdown
Run the validation script:
```bash
python ${CLAUDE_SKILL_DIR}/scripts/validate_schema.py $ARGUMENTS
```
```

`${CLAUDE_SKILL_DIR}` resolves to the skill's directory regardless of the user's working directory.

---

## Directory structure for this pattern

```
generate-migration/
├── SKILL.md                  # Core workflow (as above)
├── references/
│   ├── sql-conventions.md    # SQL type mappings and naming rules
│   └── rollback-patterns.md  # Safe rollback strategies
├── scripts/
│   └── validate_schema.py    # Schema validation script
└── examples/
    ├── add-table.md          # Example: creating a new table
    └── add-column.md         # Example: adding a column
```
