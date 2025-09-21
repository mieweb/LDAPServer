# GitHub Secrets Setup

To enable the full CI/CD pipeline, configure these secrets in your GitHub repository:

## Required Secrets

### NPM Publishing
- **`NPM_TOKEN`**: npm automation token for publishing `@ldap-gateway/core`
  - Go to https://www.npmjs.com/settings/tokens
  - Create "Automation" token
  - Add to repository secrets

### Homebrew Formula Updates
- **`HOMEBREW_TAP_TOKEN`**: GitHub personal access token for updating homebrew tap
  - Go to GitHub Settings → Developer settings → Personal access tokens
  - Create token with `repo` permissions for your homebrew-tap repository
  - Add to repository secrets

## Environment Setup

### GitHub Environment
Create a `npm-publish` environment in your repository:
1. Go to Settings → Environments
2. Create `npm-publish` environment  
3. Add `NPM_TOKEN` secret to this environment
4. Optionally add protection rules (require reviewers for releases)

## Workflow Triggers

### Automatic Builds
- **Push to main**: Runs CI tests and builds
- **Pull requests**: Runs CI tests only
- **Tags (`v*`)**: Full release pipeline with GitHub release and npm publish

### Manual Triggers
- Use "Run workflow" button in Actions tab for manual testing

## Release Process

### Creating a Release
```bash
# Update version in package.json files
npm version patch  # or minor, major

# Tag and push
git add .
git commit -m "Release v1.0.1"
git tag v1.0.1
git push origin main --tags
```

This will trigger the full pipeline:
1. Build core package
2. Build server package  
3. Create binary
4. Build .deb/.rpm packages
5. Create GitHub release with assets
6. Publish to npm
7. Update Homebrew formula (for stable releases)

### Release Assets
Each release includes:
- `ldap-gateway-X.Y.Z.tar.gz`: Universal binary release
- `ldap-gateway_X.Y.Z_amd64.deb`: Debian/Ubuntu package
- `ldap-gateway_X.Y.Z_arm64.deb`: Debian/Ubuntu ARM package  
- `ldap-gateway-X.Y.Z-1.amd64.rpm`: RHEL/CentOS package
- `ldap-gateway-X.Y.Z-1.arm64.rpm`: RHEL/CentOS ARM package
- `checksums.txt`: SHA256 checksums for verification