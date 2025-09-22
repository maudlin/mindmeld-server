#!/bin/bash
# Pre-commit Health Check (Lightweight)
# Runs essential health checks before commit

set -e

echo "🔍 Pre-commit Health Check"
echo "=========================="
echo ""

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Exit codes
HEALTH_ISSUES=0

# Quick circular dependency check
echo -e "${BLUE}🔄 Checking for circular dependencies...${NC}"
if command_exists npx && npm list madge >/dev/null 2>&1; then
    CIRCULAR_OUTPUT=$(npx madge --circular --extensions js src/ 2>&1)
    if echo "$CIRCULAR_OUTPUT" | grep -q "Found.*circular"; then
        echo -e "${RED}❌ Circular dependencies found!${NC}"
        echo "$CIRCULAR_OUTPUT"
        HEALTH_ISSUES=$((HEALTH_ISSUES + 1))
    else
        echo -e "${GREEN}✅ No circular dependencies${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping circular dependency check (tools not available)${NC}"
fi
echo ""

# Quick security check
echo -e "${BLUE}🔒 Checking for security vulnerabilities...${NC}"
if npm audit --audit-level=high > /dev/null 2>&1; then
    echo -e "${GREEN}✅ No high-severity vulnerabilities${NC}"
else
    echo -e "${RED}❌ Security vulnerabilities found!${NC}"
    echo "Run 'npm audit' for details."
    HEALTH_ISSUES=$((HEALTH_ISSUES + 1))
fi
echo ""

# Quick test check
echo -e "${BLUE}🧪 Running tests...${NC}"
if npm test > /dev/null 2>&1; then
    echo -e "${GREEN}✅ All tests passing${NC}"
else
    echo -e "${RED}❌ Tests are failing!${NC}"
    echo "Fix tests before committing."
    HEALTH_ISSUES=$((HEALTH_ISSUES + 1))
fi
echo ""

# Check for common issues in staged files
echo -e "${BLUE}📝 Checking staged files...${NC}"
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.js$' || true)

if [ -n "$STAGED_FILES" ]; then
    # Check for console.log statements (excluding test files)
    CONSOLE_LOGS=$(echo "$STAGED_FILES" | grep -v test | xargs grep -l "console\.log" 2>/dev/null || true)
    if [ -n "$CONSOLE_LOGS" ]; then
        echo -e "${YELLOW}⚠️  Console.log statements found in:${NC}"
        echo "$CONSOLE_LOGS" | sed 's/^/    /'
        echo "Consider removing debug statements before commit."
    fi
    
    # Check for TODO comments
    TODO_COUNT=$(echo "$STAGED_FILES" | xargs grep -c "TODO\|FIXME\|XXX" 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')
    if [ "$TODO_COUNT" -gt 0 ]; then
        echo -e "${YELLOW}ℹ️  $TODO_COUNT TODO/FIXME comments in staged files${NC}"
    fi
    
    # Check for large files
    LARGE_FILES=$(echo "$STAGED_FILES" | xargs wc -l 2>/dev/null | awk '$1 > 200 {print $2, "(" $1 " lines)"}' | head -3)
    if [ -n "$LARGE_FILES" ]; then
        echo -e "${YELLOW}⚠️  Large files detected:${NC}"
        echo "$LARGE_FILES" | sed 's/^/    /'
        echo "Consider breaking down large modules."
    fi
    
    echo -e "${GREEN}✅ Staged files checked${NC}"
else
    echo -e "${YELLOW}ℹ️  No JavaScript files staged${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}📊 Pre-commit Summary${NC}"
if [ "$HEALTH_ISSUES" -eq 0 ]; then
    echo -e "${GREEN}🎉 All checks passed! Ready to commit.${NC}"
    echo ""
    echo "💡 Tip: Run './scripts/health-check-server.sh' for full health analysis"
    exit 0
else
    echo -e "${RED}❌ $HEALTH_ISSUES issue(s) found.${NC}"
    echo ""
    echo "🔧 Fix the issues above before committing."
    echo "💡 Or run with --no-verify to skip pre-commit checks"
    exit 1
fi