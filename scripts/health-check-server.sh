#!/bin/bash
# MindMeld Server Architecture Health Check
# Run this script weekly or before major releases

set -e

echo "🏥 MindMeld Server Architecture Health Check"
echo "============================================"
echo ""

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print section headers
print_section() {
    echo -e "${BLUE}📊 $1${NC}"
    echo "----------------------------------------"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if analysis tools are available
print_section "Checking Analysis Tools"
if ! command_exists npx; then
    echo -e "${RED}❌ npx not found. Please install Node.js${NC}"
    exit 1
fi

# Install analysis dependencies if not present
if ! npm list madge >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Installing analysis tools...${NC}"
    npm install --no-save madge jscpd depcheck npm-check-updates
fi

echo -e "${GREEN}✅ Analysis tools ready${NC}"
echo ""

# Calculate contextual thresholds based on project size
calculate_thresholds() {
    local total_files=$(find src/ -name "*.js" | wc -l)
    if [ "$total_files" -lt 30 ]; then
        MAX_DEPS=5
        MAX_FILE_SIZE=120
        MAX_DUPLICATION=2
        echo "📏 Project size: Small ($total_files files) - using conservative thresholds"
    elif [ "$total_files" -lt 100 ]; then
        MAX_DEPS=8
        MAX_FILE_SIZE=150
        MAX_DUPLICATION=5
        echo "📏 Project size: Medium ($total_files files) - using standard thresholds"
    else
        MAX_DEPS=12
        MAX_FILE_SIZE=200
        MAX_DUPLICATION=8
        echo "📏 Project size: Large ($total_files files) - using relaxed thresholds"
    fi
    echo "   Max dependencies per module: $MAX_DEPS"
    echo "   Max file size: $MAX_FILE_SIZE lines"
    echo "   Max duplication threshold: $MAX_DUPLICATION%"
    echo ""
}

# Graduated scoring functions
calculate_circular_dep_score() {
    local circular_output=$(npx madge --circular --extensions js src/ 2>&1)
    local circular_count=0
    
    if echo "$circular_output" | grep -q "Found.*circular"; then
        circular_count=$(echo "$circular_output" | grep -o '[0-9]\+ circular' | grep -o '[0-9]\+' | head -1)
        circular_count=${circular_count:-1}
    fi
    
    echo "$circular_output" >&2
    
    if [ "$circular_count" -eq 0 ]; then
        echo 100
    elif [ "$circular_count" -le 1 ]; then
        echo 80  # Single circular dep - manageable
    elif [ "$circular_count" -le 3 ]; then
        echo 50  # Few circular deps - concerning
    else
        echo 20  # Many circular deps - critical issue
    fi
}

calculate_complexity_score() {
    local summary_output=$(npx madge --summary src/ 2>/dev/null || echo "Analysis failed")
    echo "$summary_output" >&2
    
    local complex_modules=$(echo "$summary_output" | head -10 | awk -v max="$MAX_DEPS" '$1 > max {count++} END {print count+0}')
    local very_complex=$(echo "$summary_output" | head -10 | awk -v max="$MAX_DEPS" '$1 > max*2 {count++} END {print count+0}')
    
    if [ "$complex_modules" -eq 0 ]; then
        echo 100
    elif [ "$very_complex" -gt 0 ]; then
        echo 30  # Very complex modules present
    elif [ "$complex_modules" -le 2 ]; then
        echo 75  # Few complex modules
    elif [ "$complex_modules" -le 5 ]; then
        echo 55  # Several complex modules
    else
        echo 25  # Many complex modules
    fi
}

calculate_duplication_score() {
    local dup_output=$(npx jscpd --min-lines=5 --min-tokens=50 --format=cli src/ 2>/dev/null || echo "No duplications")
    echo "$dup_output" >&2
    
    local dup_percentage=0
    if echo "$dup_output" | grep -q "duplications found"; then
        dup_percentage=$(echo "$dup_output" | grep -o '[0-9.]\+%' | head -1 | tr -d '%' || echo "0")
        dup_percentage=${dup_percentage%.*}  # Remove decimal part
    fi
    
    if [ "$dup_percentage" -eq 0 ]; then
        echo 100
    elif [ "$dup_percentage" -le "$MAX_DUPLICATION" ]; then
        echo 85  # Acceptable duplication
    elif [ "$dup_percentage" -le $((MAX_DUPLICATION * 2)) ]; then
        echo 65  # Moderate duplication
    elif [ "$dup_percentage" -le $((MAX_DUPLICATION * 3)) ]; then
        echo 40  # High duplication
    else
        echo 20  # Excessive duplication
    fi
}

# Set contextual thresholds
calculate_thresholds

# 1. Circular Dependencies Check
print_section "Circular Dependencies Analysis"
echo "Command: npx madge --circular --extensions js src/"
echo ""

CIRCULAR_SCORE=$(calculate_circular_dep_score)
if [ "$CIRCULAR_SCORE" -eq 100 ]; then
    echo -e "${GREEN}✅ No circular dependencies found (Score: $CIRCULAR_SCORE/100)${NC}"
elif [ "$CIRCULAR_SCORE" -ge 80 ]; then
    echo -e "${YELLOW}⚠️  Minor circular dependencies detected (Score: $CIRCULAR_SCORE/100)${NC}"
    echo "Consider refactoring to improve architecture."
elif [ "$CIRCULAR_SCORE" -ge 50 ]; then
    echo -e "${RED}❌ Several circular dependencies detected (Score: $CIRCULAR_SCORE/100)${NC}"
    echo "This is hindering architectural progress."
else
    echo -e "${RED}🚨 CRITICAL: Severe circular dependencies detected (Score: $CIRCULAR_SCORE/100)${NC}"
    echo "Immediate refactoring required - architecture is compromised."
fi
echo ""

# 2. Module Complexity Analysis
print_section "Module Complexity Analysis"
echo "Command: npx madge --summary src/"
echo ""

COMPLEXITY_SCORE=$(calculate_complexity_score)
if [ "$COMPLEXITY_SCORE" -eq 100 ]; then
    echo -e "${GREEN}✅ Module complexity under control (Score: $COMPLEXITY_SCORE/100)${NC}"
elif [ "$COMPLEXITY_SCORE" -ge 75 ]; then
    echo -e "${YELLOW}⚠️  Some modules approaching complexity threshold (Score: $COMPLEXITY_SCORE/100)${NC}"
    echo "Consider refactoring modules with >$MAX_DEPS dependencies."
elif [ "$COMPLEXITY_SCORE" -ge 55 ]; then
    echo -e "${YELLOW}⚠️  Several complex modules detected (Score: $COMPLEXITY_SCORE/100)${NC}"
    echo "Multiple modules exceed recommended dependency count."
else
    echo -e "${RED}❌ High module complexity detected (Score: $COMPLEXITY_SCORE/100)${NC}"
    echo "Many modules are too complex - refactoring needed."
fi
echo ""

# 3. Code Duplication Check
print_section "Code Duplication Analysis"
echo "Command: npx jscpd --min-lines=5 --min-tokens=50 --format=cli src/"
echo ""

DUPLICATION_SCORE=$(calculate_duplication_score)
if [ "$DUPLICATION_SCORE" -eq 100 ]; then
    echo -e "${GREEN}✅ No significant code duplication found (Score: $DUPLICATION_SCORE/100)${NC}"
elif [ "$DUPLICATION_SCORE" -ge 85 ]; then
    echo -e "${GREEN}✅ Acceptable level of code duplication (Score: $DUPLICATION_SCORE/100)${NC}"
    echo "Duplication is within acceptable limits (<=$MAX_DUPLICATION%)."
elif [ "$DUPLICATION_SCORE" -ge 65 ]; then
    echo -e "${YELLOW}⚠️  Moderate code duplication detected (Score: $DUPLICATION_SCORE/100)${NC}"
    echo "Consider refactoring to reduce duplication."
elif [ "$DUPLICATION_SCORE" -ge 40 ]; then
    echo -e "${YELLOW}⚠️  High code duplication detected (Score: $DUPLICATION_SCORE/100)${NC}"
    echo "Significant duplication is affecting maintainability."
else
    echo -e "${RED}❌ Excessive code duplication detected (Score: $DUPLICATION_SCORE/100)${NC}"
    echo "Critical duplication levels - immediate refactoring needed."
fi
echo ""

# 4. Server Architecture Validation
print_section "Express Server Architecture Health"
check_server_architecture() {
    local server_score=100
    local issues=0
    
    # Check core server structure
    if [ ! -f "src/index.js" ] && [ ! -f "src/server.js" ] && [ ! -f "src/app.js" ]; then
        echo -e "${RED}❌ No main server entry point found${NC}"
        server_score=$((server_score - 40))
        issues=$((issues + 1))
    else
        echo -e "${GREEN}✅ Server entry point found${NC}"
    fi
    
    # Check for modular structure
    required_dirs=("config" "core" "modules" "utils")
    for dir in "${required_dirs[@]}"; do
        if [ ! -d "src/$dir" ]; then
            echo -e "${YELLOW}⚠️  $dir directory missing${NC}"
            server_score=$((server_score - 10))
            issues=$((issues + 1))
        else
            echo -e "${GREEN}✅ $dir directory found${NC}"
        fi
    done
    
    # Check for proper middleware organization
    if [ -f "src/core/middleware.js" ] || [ -d "src/core/middleware" ] || [ -d "src/middleware" ]; then
        echo -e "${GREEN}✅ Middleware organization found${NC}"
    else
        echo -e "${YELLOW}⚠️  No dedicated middleware organization${NC}"
        server_score=$((server_score - 15))
    fi
    
    # Check for route organization
    if [ -d "src/modules" ]; then
        route_files=$(find src/modules -name "*route*" -o -name "*controller*" 2>/dev/null | wc -l)
        if [ "$route_files" -gt 0 ]; then
            echo -e "${GREEN}✅ Modular route organization found ($route_files route files)${NC}"
        else
            echo -e "${YELLOW}⚠️  Limited route organization in modules${NC}"
            server_score=$((server_score - 10))
        fi
    fi
    
    # Check for error handling
    if find src/ -name "*.js" -exec grep -l "error.*handler\|errorHandler" {} \; 2>/dev/null | head -1 | grep -q .; then
        echo -e "${GREEN}✅ Error handling found${NC}"
    else
        echo -e "${YELLOW}⚠️  Limited error handling patterns${NC}"
        server_score=$((server_score - 10))
    fi
    
    echo $server_score
}

SERVER_SCORE=$(check_server_architecture | tail -1)
echo ""

# 5. API Layer Violations
print_section "API Architecture Layer Violations"
check_api_layer_violations() {
    local violations=0
    
    # Check if routes directly import database/model files
    if find src/ -path "*route*" -o -path "*controller*" | xargs grep -l "require.*sqlite\|import.*sqlite\|require.*db\|import.*\.db" 2>/dev/null | head -1 | grep -q .; then
        echo -e "${YELLOW}⚠️  Routes/Controllers directly accessing database${NC}"
        find src/ -path "*route*" -o -path "*controller*" | xargs grep -l "require.*sqlite\|import.*sqlite" 2>/dev/null | head -3 | sed 's/^/    /'
        violations=$((violations + 1))
    fi
    
    # Check for business logic in routes
    if find src/ -path "*route*" -name "*.js" -exec grep -l "SELECT\|INSERT\|UPDATE\|DELETE" {} \; 2>/dev/null | head -1 | grep -q .; then
        echo -e "${YELLOW}⚠️  SQL queries found directly in routes${NC}"
        violations=$((violations + 1))
    fi
    
    # Check for middleware importing business services directly
    if find src/ -path "*middleware*" -name "*.js" -exec grep -l "require.*service\|import.*service" {} \; 2>/dev/null | head -1 | grep -q .; then
        echo -e "${YELLOW}⚠️  Middleware directly importing services${NC}"
        violations=$((violations + 1))
    fi
    
    if [ "$violations" -eq 0 ]; then
        echo -e "${GREEN}✅ No obvious API layer violations detected${NC}"
        echo 100
    elif [ "$violations" -le 2 ]; then
        echo "Consider reviewing API layer boundaries."
        echo 75
    else
        echo "Multiple layer violations suggest architectural issues."
        echo 45
    fi
}

API_LAYER_SCORE=$(check_api_layer_violations | tail -1)
echo ""

# 6. Module Boundary Analysis
print_section "Module Boundary Analysis"
check_module_boundaries() {
    local cross_module=0
    
    if [ -d "src/modules" ]; then
        module_dirs=$(find src/modules -mindepth 1 -maxdepth 1 -type d 2>/dev/null)
        if [ -n "$module_dirs" ]; then
            echo "Checking for cross-module imports..."
            echo "$module_dirs" | while read module_dir; do
                module_name=$(basename "$module_dir")
                # Find files in other modules importing from this module
                other_modules=$(echo "$module_dirs" | grep -v "$module_dir")
                if [ -n "$other_modules" ]; then
                    echo "$other_modules" | while read other_module; do
                        if find "$other_module" -name "*.js" -exec grep -l "require.*$module_name\|import.*$module_name" {} \; 2>/dev/null | head -1 | grep -q .; then
                            echo -e "${YELLOW}⚠️  $(basename "$other_module") imports from $module_name${NC}"
                            cross_module=$((cross_module + 1))
                        fi
                    done
                fi
            done
        fi
    else
        echo -e "${YELLOW}ℹ️  No modules directory found - skipping module boundary check${NC}"
        echo 90
        return
    fi
    
    if [ "$cross_module" -eq 0 ]; then
        echo -e "${GREEN}✅ Module boundaries appear well-maintained${NC}"
        echo 100
    elif [ "$cross_module" -le 2 ]; then
        echo "Minor cross-module coupling detected."
        echo 80
    elif [ "$cross_module" -le 4 ]; then
        echo "Moderate cross-module coupling - review module boundaries."
        echo 60
    else
        echo "Significant cross-module coupling - module design needs attention."
        echo 35
    fi
}

MODULE_SCORE=$(check_module_boundaries | tail -1)
echo ""

# 7. Dependency Health Check
print_section "Dependency Health Check"
echo "Command: npx depcheck"
echo ""
DEPCHECK_OUTPUT=$(npx depcheck 2>/dev/null || true)
if echo "$DEPCHECK_OUTPUT" | grep -q "Unused"; then
    echo -e "${YELLOW}⚠️  Unused dependencies found:${NC}"
    echo "$DEPCHECK_OUTPUT" | head -10
    DEP_HEALTH_SCORE=70
else
    echo -e "${GREEN}✅ All dependencies are in use${NC}"
    DEP_HEALTH_SCORE=100
fi
echo ""

# 8. Security Health
print_section "Security Health"
echo "Command: npm audit"
echo ""

if npm audit --audit-level=critical > /dev/null 2>&1; then
    if npm audit --audit-level=high > /dev/null 2>&1; then
        if npm audit --audit-level=moderate > /dev/null 2>&1; then
            echo -e "${GREEN}✅ No security vulnerabilities found${NC}"
            SECURITY_SCORE=100
        else
            echo -e "${YELLOW}⚠️  Low-severity vulnerabilities detected${NC}"
            echo "Run 'npm audit' for details."
            SECURITY_SCORE=85
        fi
    else
        echo -e "${YELLOW}⚠️  Moderate security vulnerabilities detected${NC}"
        echo "Run 'npm audit fix' to address issues."
        SECURITY_SCORE=60
    fi
else
    echo -e "${RED}❌ High-severity security vulnerabilities detected${NC}"
    echo "Run 'npm audit fix' immediately."
    SECURITY_SCORE=30
fi
echo ""

# 9. Test Coverage Check
print_section "Test Coverage Status"
if npm run test:coverage > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Tests passing with coverage${NC}"
    TEST_SCORE=100
elif npm test > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Tests passing but coverage check failed${NC}"
    echo "Consider running 'npm run test:coverage' separately."
    TEST_SCORE=80
else
    echo -e "${RED}❌ Tests are failing${NC}"
    echo "Fix failing tests before deployment."
    TEST_SCORE=30
fi
echo ""

# 10. Configuration Management
print_section "Configuration Management Health"
check_config_health() {
    local config_score=100
    
    # Check for environment configuration
    if [ -f ".env.example" ] || [ -f ".env.template" ]; then
        echo -e "${GREEN}✅ Environment template found${NC}"
    else
        echo -e "${YELLOW}⚠️  No .env.example template${NC}"
        config_score=$((config_score - 15))
    fi
    
    # Check for configuration validation
    if find src/ -name "*.js" -exec grep -l "process\.env\|config\|dotenv" {} \; | head -1 | grep -q .; then
        echo -e "${GREEN}✅ Configuration usage found${NC}"
    else
        echo -e "${YELLOW}⚠️  Limited configuration management${NC}"
        config_score=$((config_score - 10))
    fi
    
    # Check for hardcoded values
    hardcoded_count=$(find src/ -name "*.js" -exec grep -l "localhost:\|127\.0\.0\.1\|password.*=\|api.*key.*=" {} \; 2>/dev/null | wc -l)
    if [ "$hardcoded_count" -gt 3 ]; then
        echo -e "${YELLOW}⚠️  Potential hardcoded values detected ($hardcoded_count files)${NC}"
        config_score=$((config_score - 20))
    else
        echo -e "${GREEN}✅ Limited hardcoded values${NC}"
    fi
    
    echo $config_score
}

CONFIG_SCORE=$(check_config_health | tail -1)
echo ""

# Overall Health Score Calculation
print_section "Overall Server Architecture Health"

# Calculate weighted scores (server-specific weights)
ARCHITECTURE_WEIGHT=20  # Circular deps
COMPLEXITY_WEIGHT=15    # Module complexity
QUALITY_WEIGHT=12       # Code duplication
SECURITY_WEIGHT=18      # Security vulnerabilities
SERVER_WEIGHT=15        # Server architecture
API_WEIGHT=10          # API layer violations
MODULE_WEIGHT=5        # Module boundaries
TEST_WEIGHT=5          # Test coverage

# Calculate component scores
ARCH_COMPONENT=$(( (CIRCULAR_SCORE * ARCHITECTURE_WEIGHT) / 100 ))
COMPLEXITY_COMPONENT=$(( (COMPLEXITY_SCORE * COMPLEXITY_WEIGHT) / 100 ))
QUALITY_COMPONENT=$(( (DUPLICATION_SCORE * QUALITY_WEIGHT) / 100 ))
SECURITY_COMPONENT=$(( (SECURITY_SCORE * SECURITY_WEIGHT) / 100 ))
SERVER_COMPONENT=$(( (SERVER_SCORE * SERVER_WEIGHT) / 100 ))
API_COMPONENT=$(( (API_LAYER_SCORE * API_WEIGHT) / 100 ))
MODULE_COMPONENT=$(( (MODULE_SCORE * MODULE_WEIGHT) / 100 ))
TEST_COMPONENT=$(( (TEST_SCORE * TEST_WEIGHT) / 100 ))

# Final weighted score
HEALTH_SCORE=$(( ARCH_COMPONENT + COMPLEXITY_COMPONENT + QUALITY_COMPONENT + SECURITY_COMPONENT + SERVER_COMPONENT + API_COMPONENT + MODULE_COMPONENT + TEST_COMPONENT ))

echo "📊 Component Scores:"
echo "   Architecture (Circular Deps): $CIRCULAR_SCORE/100 (weight: $ARCHITECTURE_WEIGHT%)"
echo "   Server Structure: $SERVER_SCORE/100 (weight: $SERVER_WEIGHT%)"
echo "   Complexity: $COMPLEXITY_SCORE/100 (weight: $COMPLEXITY_WEIGHT%)"
echo "   Code Quality: $DUPLICATION_SCORE/100 (weight: $QUALITY_WEIGHT%)"
echo "   Security: $SECURITY_SCORE/100 (weight: $SECURITY_WEIGHT%)"
echo "   API Layers: $API_LAYER_SCORE/100 (weight: $API_WEIGHT%)"
echo "   Module Boundaries: $MODULE_SCORE/100 (weight: $MODULE_WEIGHT%)"
echo "   Tests: $TEST_SCORE/100 (weight: $TEST_WEIGHT%)"
echo ""

if [ "$HEALTH_SCORE" -ge 90 ]; then
    echo -e "${GREEN}🏆 EXCELLENT (Score: $HEALTH_SCORE/100)${NC}"
    echo "Your server architecture is in great shape!"
elif [ "$HEALTH_SCORE" -ge 75 ]; then
    echo -e "${GREEN}✅ GOOD (Score: $HEALTH_SCORE/100)${NC}" 
    echo "Minor improvements recommended."
elif [ "$HEALTH_SCORE" -ge 60 ]; then
    echo -e "${YELLOW}⚠️  NEEDS ATTENTION (Score: $HEALTH_SCORE/100)${NC}"
    echo "Consider addressing the issues above."
elif [ "$HEALTH_SCORE" -ge 40 ]; then
    echo -e "${RED}❌ POOR (Score: $HEALTH_SCORE/100)${NC}"
    echo "Significant architectural issues need addressing."
else
    echo -e "${RED}🚨 CRITICAL ISSUES (Score: $HEALTH_SCORE/100)${NC}"
    echo "Immediate attention required - architecture debt is high."
fi

echo ""
echo "💡 Server-Specific Next Steps:"
echo "  1. Address any circular dependencies first"
echo "  2. Ensure proper separation between routes/services/data layers"
echo "  3. Review module boundaries and dependencies"
echo "  4. Run security audits regularly: 'npm audit'"
echo "  5. Maintain test coverage above 80%"
echo "  6. Use environment variables for configuration"
echo ""
echo "📅 Health check completed: $(date)"
echo "🔄 Rerun with: ./scripts/health-check-server.sh"