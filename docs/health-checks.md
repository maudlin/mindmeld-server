# Server Health Checks

This document describes the architecture health check system for the MindMeld Server.

## Overview

The health check system provides automated analysis of code quality, architecture integrity, and potential issues. There are two main health check scripts:

1. **Full Health Check** (`scripts/health-check-server.sh`) - Comprehensive analysis
2. **Pre-commit Health Check** (`scripts/pre-commit-health.sh`) - Lightweight checks for commits

## Full Health Check

Run the complete health analysis with:

```bash
npm run health:check
```

Or directly:

```bash
bash scripts/health-check-server.sh
```

### What it checks:

#### 🏗️ Architecture Analysis

- **Circular Dependencies**: Detects import cycles that can cause runtime issues
- **Module Complexity**: Identifies modules with too many dependencies
- **Code Duplication**: Finds repeated code patterns that need refactoring

#### 🖥️ Server-Specific Checks

- **Server Architecture**: Validates Express.js server structure
- **API Layer Violations**: Ensures proper separation between routes/services/data
- **Module Boundaries**: Checks for cross-module coupling issues

#### 🔒 Security & Quality

- **Security Vulnerabilities**: Runs `npm audit` for dependency security
- **Test Coverage**: Validates that tests are passing with coverage
- **Configuration Management**: Checks for proper environment variable usage

### Scoring System

The health check provides a weighted score (0-100) with the following breakdown:

- **Architecture (20%)**: Circular dependencies
- **Security (18%)**: Vulnerability scanning
- **Server Structure (15%)**: Express.js architecture
- **Complexity (15%)**: Module dependency analysis
- **Code Quality (12%)**: Duplication detection
- **API Layers (10%)**: Layer violation detection
- **Module Boundaries (5%)**: Cross-module coupling
- **Tests (5%)**: Test execution and coverage

### Score Interpretation

- **90-100**: 🏆 **Excellent** - Architecture is in great shape
- **75-89**: ✅ **Good** - Minor improvements recommended
- **60-74**: ⚠️ **Needs Attention** - Consider addressing issues
- **40-59**: ❌ **Poor** - Significant issues need fixing
- **0-39**: 🚨 **Critical** - Immediate attention required

## Pre-commit Health Check

A lightweight version runs automatically before each commit via Husky:

```bash
npm run health:pre-commit
```

### Quick Checks:

- ✅ Circular dependencies
- 🔒 High-severity security vulnerabilities
- 🧪 Test execution
- 📝 Staged file analysis (console.log, TODOs, file size)

This ensures basic quality gates before code enters the repository.

## Integration with Development Workflow

### Pre-commit Hooks

The pre-commit health check is automatically integrated with Husky and runs during:

- `git commit` (automatic via `.husky/pre-commit`)
- Manual execution with `npm run health:pre-commit`

### CI/CD Integration

Consider running the full health check in CI/CD pipelines:

- Weekly scheduled runs for architectural drift detection
- Before major releases for comprehensive quality assessment
- Integration with pull request workflows

### Development Best Practices

1. **Run full health check weekly**: `npm run health:check`
2. **Address circular dependencies immediately** - They cause runtime issues
3. **Maintain security hygiene** - Run `npm audit fix` regularly
4. **Keep modules focused** - Break down complex modules (>8-12 dependencies)
5. **Monitor code duplication** - Refactor when duplication exceeds thresholds

## Troubleshooting

### Common Issues

**Circular Dependencies:**

```bash
# Fix by extracting common dependencies or using dependency injection
npx madge --circular --extensions js src/
```

**Security Vulnerabilities:**

```bash
# Fix automatically where possible
npm audit fix

# Or manually review and update
npm audit
```

**Test Failures:**

```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test suites
npm run test:admin
```

### Tool Dependencies

The health check requires these npm packages (installed automatically):

- `madge` - Dependency analysis
- `jscpd` - Code duplication detection
- `depcheck` - Unused dependency detection

## Customization

### Adjusting Thresholds

Edit `scripts/health-check-server.sh` to modify:

- `MAX_DEPS` - Maximum dependencies per module
- `MAX_FILE_SIZE` - Maximum lines per file
- `MAX_DUPLICATION` - Maximum acceptable code duplication percentage

### Adding Custom Checks

You can extend the health check by adding new functions:

```bash
# Add to scripts/health-check-server.sh
check_custom_metric() {
    # Your custom logic here
    local score=100
    echo $score
}

CUSTOM_SCORE=$(check_custom_metric | tail -1)
```

## Continuous Improvement

The health check system should evolve with your codebase:

1. **Monitor trends** - Track scores over time
2. **Adjust thresholds** - Based on project size and complexity
3. **Add new checks** - For emerging architectural patterns
4. **Review weekly** - Use as input for technical debt planning

Remember: The goal is improving code quality and maintainability, not achieving perfect scores.
