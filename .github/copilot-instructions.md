# AI Coding Guidelines for LDAPServer

## Architecture Overview
This is an LDAP gateway server built with Node.js and ldapjs that bridges LDAP authentication to various backends (MySQL/MongoDB/Proxmox). It separates **directory lookups** (user/group info) from **authentication** (password validation).

Key components:
- `src/server.js`: Main LDAP server with bind/search handlers
- `src/auth/providers/`: Pluggable auth (`dbBackend.js`, `ldapBackend.js`, `proxmoxBackend.js`) and directory (`DBDirectory.js`, `ProxmoxDirectory.js`) providers
- `src/services/`: `databaseServices.js` (unified DB access), `authService.js`, `notificationService.js` (MFA)
- `src/handlers/searchHandlers.js`: LDAP search logic for users/groups



## Code Quality Principles

### 🎯 DRY (Don't Repeat Yourself)
- **Never duplicate code**: If you find yourself copying code, extract it into a reusable function
- **Single source of truth**: Each piece of knowledge should have one authoritative representation
- **Refactor mercilessly**: When you see duplication, eliminate it immediately
- **Shared utilities**: Common patterns should be abstracted into utility functions

### 💋 KISS (Keep It Simple, Stupid)
- **Simple solutions**: Prefer the simplest solution that works
- **Avoid over-engineering**: Don't add complexity for hypothetical future needs
- **Clear naming**: Functions and variables should be self-documenting
- **Small functions**: Break down complex functions into smaller, focused ones
- **Readable code**: Code should be obvious to understand at first glance

### 🧹 Folder Philosophy
- **Clear purpose**: Every folder should have a main thing that anchors its contents.
- **No junk drawers**: Don’t leave loose files without context or explanation.
- **Explain relationships**: If it’s not elegantly obvious how files fit together, add a README or note.
- **Immediate clarity**: Opening a folder should make its organizing principle clear at a glance.

### 🔄 Refactoring Guidelines
- **Continuous improvement**: Refactor as you work, not as a separate task
- **Safe refactoring**: Always run tests before and after refactoring
- **Incremental changes**: Make small, safe changes rather than large rewrites
- **Preserve behavior**: Refactoring should not change external behavior
- **Code reviews**: All refactoring should be reviewed for correctness

### ⚰️ Dead Code Management
- **Immediate removal**: Delete unused code immediately when identified
- **Historical preservation**: Move significant dead code to `.attic/` directory with context
- **Documentation**: Include comments explaining why code was moved to attic
- **Regular cleanup**: Review and clean attic directory periodically
- **No accumulation**: Don't let dead code accumulate in active codebase

## Documentation Preferences

### Diagrams and Visual Documentation
- **Always use Mermaid diagrams** instead of ASCII art for workflow diagrams, architecture diagrams, and flowcharts
- Use appropriate Mermaid diagram types:
  - `graph TB` or `graph LR` for workflow architectures 
  - `flowchart TD` for process flows
  - `sequenceDiagram` for API interactions
  - `gitgraph` for branch/release strategies
- Include styling with `classDef` for better visual hierarchy
- Add descriptive comments and emojis sparingly for clarity

### Documentation Standards
- Keep documentation DRY (Don't Repeat Yourself) - reference other docs instead of duplicating
- Use clear cross-references between related documentation files
- Update the main architecture document when workflow structure changes

## Working with GitHub Actions Workflows

### Development Philosophy
- **Script-first approach**: All workflows should call scripts that can be run locally
- **Local development parity**: Developers should be able to run the exact same commands locally as CI runs
- **Simple workflows**: GitHub Actions should be thin wrappers around scripts, not contain complex logic
- **Easy debugging**: When CI fails, developers can reproduce the issue locally by running the same script

## Quick Reference

### Code Quality Checklist
- [ ] **DRY**: No code duplication - extracted reusable functions?
- [ ] **KISS**: Simplest solution that works?
- [ ] **Naming**: Self-documenting function/variable names?
- [ ] **Size**: Functions small and focused?
- [ ] **Dead Code**: Removed or archived appropriately?
- [ ] **Accessibility**: ARIA labels and semantic HTML implemented?
- [ ] **I18N**: User-facing text externalized for translation?

### Before Committing
1. Run tests: `npm test`
2. Check for unused code: Review imports and functions
3. Verify DRY: Look for duplicated logic
4. Simplify: Can any function be made simpler?
5. Archive/Delete: Handle any dead code appropriately


## Critical Workflows
- **Local development**: Run `./launch.sh` (starts Docker MySQL/client, installs deps, runs server)
- **Stop services**: `./shutdown.sh` (kills Node process, stops Docker)
- **Testing**: `ldapsearch -x -H ldaps://localhost:636 -b "dc=mieweb,dc=com" "(uid=test)"` and `ssh test@localhost -p 2222`
- **Deployment**: Use Terraform in `terraform/` for AWS EC2 with security group (ports 22, 636, 3000)

## Project-Specific Patterns
- **Backend separation**: Always implement both auth and directory providers (see `authProviderInterface.js`, `DirectoryProviderInterface.js`)
- **Environment config**: All settings via `.env` (e.g., `AUTH_BACKEND=db`, `DIRECTORY_BACKEND=mysql`)
- **LDAP entry mapping**: Use `ldapUtils.js` to create entries with standard attributes (posixAccount, inetOrgPerson)
- **Database queries**: Use connection pooling in drivers (`mysql.js`, `mongoDb.js`); groups store `member_uids` as JSON arrays
- **UID/GID mapping**: For WebChart, `uidNumber` from "LDAP UID Number" observation or `user_id + 10000`; `gidNumber` from `realms.id`
- **Custom ldapjs**: Uses forked ldapjs (`@ldapjs/controls`, `ldapjs` in package.json) for specific fixes
- **Logging**: Winston logger throughout; debug LDAP operations in `server.js` bind/search handlers
- **Error handling**: Async/await with try/catch; release DB connections in `finally` blocks
- **MFA integration**: Optional notification service sends push notifications via `NotificationService.sendAuthenticationNotification()`

## Examples
- **Adding auth backend**: Extend `AuthProvider` class, implement `authenticate(username, password, req)` (see `dbBackend.js`)
- **Directory provider**: Implement `findUser()`, `getAllUsers()`, etc. (see `DBDirectory.js` delegating to `DatabaseService`)
- **LDAP search**: Parse filters with `utils.js` functions like `getUsernameFromFilter()`; detect user/group requests
- **Proxmox integration**: Reads `user.cfg`/`shadow.cfg` files directly for user data and auth

Follow the provider pattern for new backends. Test with SSSD/LDAP clients. Use existing Docker setup for consistent environments.