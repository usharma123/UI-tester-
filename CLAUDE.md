# Claude Code Project Instructions

## Package Manager
This project uses **Bun** as the package manager and runtime. Always use:
- `bun install` for dependencies
- `bun test` for running tests
- `bun run <script>` for npm scripts
- `bun build` for building

**Never use npm or yarn commands.**

## Project Structure
- `src/` - Source code (TypeScript)
- `tests/` - Test files (*.test.ts)
- `docs/` - VitePress documentation
- `dist/` - Built output

## Testing
Tests use Node.js built-in test runner with tsx. Run with:
```bash
bun test
```

## Build
```bash
bun run build
```
