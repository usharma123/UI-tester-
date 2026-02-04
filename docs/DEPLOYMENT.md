# Deployment Guide

This guide walks you through deploying the UI QA documentation website.

## Prerequisites

- GitHub repository: `usharma123/UI-tester-`
- Vercel account (free tier works fine)
- Or GitHub Pages (alternative)

## Option 1: Deploy to Vercel (Recommended)

Vercel is already configured via `vercel.json`. Follow these steps:

### Step 1: Install Vercel CLI (if not already installed)

```bash
npm install -g vercel
# or
bun add -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Link Your Project

From the project root:

```bash
vercel link
```

This will:
- Ask if you want to link to an existing project or create a new one
- Set up the project configuration

### Step 4: Deploy

```bash
vercel --prod
```

Or deploy from the dashboard:
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Vercel will auto-detect the VitePress framework from `vercel.json`
4. Click "Deploy"

### Step 5: Configure Custom Domain (Optional)

1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

### Automatic Deployments

Once connected to GitHub, Vercel will automatically deploy:
- **Production**: Every push to `main` branch
- **Preview**: Every pull request gets a preview deployment

## Option 2: Deploy to GitHub Pages

### Step 1: Update VitePress Config

Add base URL to `docs/.vitepress/config.ts`:

```typescript
export default defineConfig({
  base: '/UI-tester-/', // Replace with your repo name if different
  // ... rest of config
})
```

### Step 2: Create GitHub Actions Workflow

Create `.github/workflows/docs.yml`:

```yaml
name: Deploy Docs

on:
  push:
    branches:
      - main
    paths:
      - 'docs/**'
      - '.github/workflows/docs.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      
      - name: Install dependencies
        run: bun install
      
      - name: Build docs
        run: bun run docs:build
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/.vitepress/dist
```

### Step 3: Enable GitHub Pages

1. Go to your repository settings
2. Navigate to "Pages"
3. Source: "GitHub Actions"
4. Save

### Step 4: Push Changes

```bash
git add .
git commit -m "Add docs deployment"
git push
```

## Option 3: Manual Deployment

### Build Locally

```bash
bun run docs:build
```

The built files will be in `docs/.vitepress/dist/`

### Deploy to Any Static Host

Upload the contents of `docs/.vitepress/dist/` to:
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront
- Any static hosting service

## Verification

After deployment, verify:

1. ✅ All pages load correctly
2. ✅ Navigation works
3. ✅ Code blocks render properly
4. ✅ Images load (check logo.svg)
5. ✅ Search functionality works
6. ✅ Links to GitHub/npm are correct

## Troubleshooting

### Build Fails

- Check that all dependencies are installed: `bun install`
- Verify Node.js/Bun version: `node --version` (should be 18+)

### Assets Not Loading

- Check `base` URL in VitePress config matches your deployment path
- Verify `vercel.json` output directory is correct: `docs/.vitepress/dist`

### Vercel Deployment Issues

- Ensure `vercel.json` is in the root directory
- Check build logs in Vercel dashboard
- Verify `installCommand` and `buildCommand` are correct

## Updating Documentation

After making changes to docs:

1. **Local preview**: `bun run docs:dev`
2. **Build test**: `bun run docs:build`
3. **Commit and push**: Changes will auto-deploy (if using Vercel/GitHub Actions)

## Current Configuration

- **Framework**: VitePress
- **Build Command**: `bun run docs:build`
- **Output Directory**: `docs/.vitepress/dist`
- **Install Command**: `bun install`

The `vercel.json` file is already configured for Vercel deployment.
