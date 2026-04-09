# String Substitutions

Variables available in skill content. These are replaced before Claude sees the prompt.

| Variable | Expands to |
|----------|-----------|
| `$ARGUMENTS` | Full argument string as typed after `/skill-name` |
| `$ARGUMENTS[N]` | Nth argument (0-based). Multi-word args require quotes. |
| `$N` | Shorthand for `$ARGUMENTS[N]` (`$0` = first arg, `$1` = second, etc.) |
| `${CLAUDE_SESSION_ID}` | Current session UUID |
| `${CLAUDE_SKILL_DIR}` | Absolute path to the skill's directory |

---

## Argument parsing

Indexed arguments use shell-style quoting:
- `/migrate-component SearchBar React Vue` makes `$0` = `SearchBar`, `$1` = `React`, `$2` = `Vue`
- `/fix-issue "multi word arg"` makes `$0` = `multi word arg`

If `$ARGUMENTS` is not present anywhere in the content, arguments are appended automatically as `ARGUMENTS: <value>`.

---

## Usage examples

### Full argument string
```markdown
Fix GitHub issue $ARGUMENTS following our coding standards.
```
When invoked as `/fix-issue 123`, Claude receives: "Fix GitHub issue 123 following our coding standards."

### Positional arguments
```markdown
Migrate the `$0` component from $1 to $2.
```
When invoked as `/migrate SearchBar React Vue`, Claude receives: "Migrate the `SearchBar` component from React to Vue."

### Skill-relative paths
```markdown
Run the helper script:
```bash
python ${CLAUDE_SKILL_DIR}/scripts/helper.py $ARGUMENTS
```
```

### Session-scoped logging
```markdown
Log the following to logs/${CLAUDE_SESSION_ID}.log:
$ARGUMENTS
```
