#!/bin/bash
# Version bump script for @usharma124/ui-qa

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_ROOT"

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}Current version: ${CURRENT_VERSION}${NC}"

# Check if version type provided
if [ -z "$1" ]; then
  echo -e "${YELLOW}Usage: ./scripts/bump-version.sh [patch|minor|major]${NC}"
  echo ""
  echo "Examples:"
  echo "  ./scripts/bump-version.sh patch   # 1.0.1 → 1.0.2"
  echo "  ./scripts/bump-version.sh minor   # 1.0.1 → 1.1.0"
  echo "  ./scripts/bump-version.sh major   # 1.0.1 → 2.0.0"
  exit 1
fi

BUMP_TYPE=$1

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo -e "${RED}Error: Invalid bump type. Use patch, minor, or major${NC}"
  exit 1
fi

# Update package.json version (without git tag for now)
npm version $BUMP_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}New version: ${NEW_VERSION}${NC}"

# Update hardcoded version in src/cli-ink.tsx
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/const PACKAGE_VERSION = \".*\"/const PACKAGE_VERSION = \"$NEW_VERSION\"/" src/cli-ink.tsx
else
  # Linux
  sed -i "s/const PACKAGE_VERSION = \".*\"/const PACKAGE_VERSION = \"$NEW_VERSION\"/" src/cli-ink.tsx
fi

echo -e "${GREEN}✓ Updated version in package.json${NC}"
echo -e "${GREEN}✓ Updated version in src/cli-ink.tsx${NC}"

# Build
echo -e "${YELLOW}Building package...${NC}"
bun run build

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Build successful${NC}"
else
  echo -e "${RED}✗ Build failed${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}Version bump complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Commit: git add package.json src/cli-ink.tsx dist/"
echo "  3. Tag: git tag v${NEW_VERSION}"
echo "  4. Push: git push && git push --tags"
echo "  5. Publish: npm publish"
