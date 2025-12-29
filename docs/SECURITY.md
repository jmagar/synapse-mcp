# Security

## Command Injection Prevention

### Fixed Vulnerabilities

#### CVE-INTERNAL-2025-001: SSH Command Injection in compose.ts
- **Severity:** CRITICAL (CVSS 9.1)
- **CWE:** CWE-78 (Improper Neutralization of Special Elements)
- **Status:** FIXED (2025-12-24)

**Summary:** The `composeExec()` function concatenated user-controlled arguments into a shell command string, allowing arbitrary command execution on remote Docker hosts.

**Fix:**
1. Replaced shell string concatenation with execFile argument arrays
2. Added `validateComposeArgs()` to reject shell metacharacters
3. Applied same fix to `listComposeProjects()` and `getComposeStatus()`

**Testing:**
- 10 attack vector tests covering all shell metacharacters
- 4 edge case tests for legitimate argument patterns
- 1 end-to-end integration test

**Validation:**
```bash
pnpm test src/services/compose.test.ts -t "Security"
pnpm test src/services/compose.integration.test.ts
```

### Security Checklist for Compose Operations

- [x] User input validated before execution
- [x] Shell metacharacters rejected
- [x] execFile used with argument arrays (not shell strings)
- [x] Project names validated with strict regex
- [x] Service names validated with strict regex
- [x] Argument length limits enforced (DoS prevention)
- [x] Comprehensive test coverage for attack vectors

### Safe Argument Patterns

**Allowed characters in extraArgs:**
- Alphanumeric: `a-zA-Z0-9`
- Separators: `-_.=/:`
- Whitespace: ` ` (space)

**Rejected characters (shell metacharacters):**
- Command chaining: `;`, `|`, `&&`, `||`
- Substitution: `` ` ``, `$()`
- Redirection: `<`, `>`, `<<`, `>>`
- Expansion: `*`, `?`, `{`, `}`, `[`, `]`
- Quoting: `"`, `'`, `\`
- Control: `\n`, `\r`, `\t`
