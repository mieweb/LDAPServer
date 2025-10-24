# Attic Directory

This directory contains code that has been removed from the active codebase but preserved for historical reference.

## Contents

### `legacy-src/`
- **Date Archived**: September 2024
- **Reason**: Replaced by modular architecture (npm/ + server/)
- **Description**: Original monolithic LDAP server implementation
- **Migration**: All functionality moved to:
  - Core interfaces and utilities → `npm/` (@ldap-gateway/core package)
  - Server implementation → `server/` (ldap-gateway-server package)
- **Safe to Delete**: After 6 months (March 2025) if no issues reported

## Guidelines
- Review quarterly for cleanup opportunities
- Document why code was archived
- Include migration notes for reference
- Set deletion timeline for old archives