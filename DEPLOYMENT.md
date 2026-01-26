# Production Deployment Guide

Complete guide for deploying the UI-tester QA Agent to production with all bells and whistles.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Convex Production Setup](#convex-production-setup)
- [Clerk Authentication Setup](#clerk-authentication-setup)
- [Docker Containerization](#docker-containerization)
- [Deployment Options](#deployment-options)
  - [Railway (Recommended)](#option-1-railway-recommended)
  - [Fly.io](#option-2-flyio)
  - [AWS ECS](#option-3-aws-ecs)
  - [DigitalOcean App Platform](#option-4-digitalocean-app-platform)
- [CI/CD Pipeline](#cicd-pipeline)
- [Monitoring & Observability](#monitoring--observability)
- [Security Hardening](#security-hardening)
- [Scaling Considerations](#scaling-considerations)
- [Backup & Disaster Recovery](#backup--disaster-recovery)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Production Architecture                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│   │   Cloudflare │────▶│   Load       │────▶│   Container  │        │
│   │   (CDN/WAF)  │     │   Balancer   │     │   Cluster    │        │
│   └──────────────┘     └──────────────┘     └──────────────┘        │
│                                                    │                │
│                              ┌─────────────────────┼────────────┐   │
│                              │                     │            │   │
│                              ▼                     ▼            ▼   │
│                        ┌──────────┐         ┌──────────┐  ┌──────┐  │
│                        │  Express │         │  Express │  │  ... │  │
│                        │  Server  │         │  Server  │  │      │  │
│                        │ +Playwright        │ +Playwright │      │  │
│                        └────┬─────┘         └────┬─────┘  └──────┘  │
│                             │                    │                  │
│          ┌──────────────────┼────────────────────┼─────────────┐    │
│          │                  │                    │             │    │
│          ▼                  ▼                    ▼             ▼    │
│   ┌────────────┐    ┌────────────┐      ┌────────────┐  ┌────────┐  │
│   │   Convex   │    │  OpenRouter│      │   Clerk    │  │ Object │  │
│   │  (Backend) │    │   (LLM)    │      │   (Auth)   │  │ Storage│  │
│   └────────────┘    └────────────┘      └────────────┘  └────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Components:**
- **Express Server**: Node.js backend serving API and static React frontend
- **Playwright**: Headless Chromium for browser automation
- **Convex**: Serverless database and backend functions
- **Clerk**: Authentication and user management
- **OpenRouter**: LLM API for test planning and judging

---

## Prerequisites

Before deploying, ensure you have:

- [ ] Node.js 20+ installed locally
- [ ] pnpm package manager (`npm install -g pnpm`)
- [ ] Docker and Docker Compose installed
- [ ] Accounts created:
  - [ ] [Convex](https://convex.dev) account
  - [ ] [Clerk](https://clerk.com) account
  - [ ] [OpenRouter](https://openrouter.ai) account with API credits
  - [ ] Cloud provider account (Railway, Fly.io, AWS, etc.)

---

## Environment Configuration

### Required Environment Variables

Create a `.env.production` file (never commit this):

```bash
# ═══════════════════════════════════════════════════════════════════
# REQUIRED - Application will not start without these
# ═══════════════════════════════════════════════════════════════════

# OpenRouter API (LLM for test planning/judging)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Convex Backend
CONVEX_DEPLOYMENT=prod:your-convex-deployment
CONVEX_URL=https://your-deployment.convex.cloud

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ═══════════════════════════════════════════════════════════════════
# OPTIONAL - Customize behavior (defaults shown)
# ═══════════════════════════════════════════════════════════════════

# Server Configuration
PORT=3000
NODE_ENV=production

# LLM Configuration
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5

# QA Test Defaults
MAX_STEPS=20
GOALS="homepage UX + primary CTA + form validation + keyboard accessibility"
MAX_PAGES=50
STEPS_PER_PAGE=5
PARALLEL_BROWSERS=5

# Timeouts (milliseconds)
BROWSER_TIMEOUT=60000
NAVIGATION_TIMEOUT=45000
ACTION_TIMEOUT=15000
MAX_RETRIES=3
RETRY_DELAY_MS=1000

# Features
AUDITS_ENABLED=true
STRICT_MODE=false
CAPTURE_BEFORE_AFTER=true
VIEWPORTS=desktop,tablet,mobile
DEBUG=false

# Storage (for containerized deployments)
SCREENSHOT_DIR=/app/data/screenshots
REPORT_DIR=/app/data/reports
```

### Environment Variable Security

**Never commit secrets to git.** Use your platform's secret management:

| Platform | Secret Management |
|----------|-------------------|
| Railway | Dashboard → Variables |
| Fly.io | `fly secrets set KEY=value` |
| AWS | Secrets Manager / Parameter Store |
| DigitalOcean | App Spec environment variables |

---

## Convex Production Setup

### 1. Create Production Deployment

```bash
# Login to Convex
npx convex login

# Create production deployment
npx convex deploy --prod

# Note the deployment URL (e.g., https://your-app.convex.cloud)
```

### 2. Configure Production Environment

In the Convex Dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add your Clerk keys:
   ```
   CLERK_ISSUER_URL=https://your-clerk-instance.clerk.accounts.dev
   CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-instance.clerk.accounts.dev
   ```

### 3. Set Up Auth Provider

Update `convex/auth.config.ts` for production:

```typescript
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

### 4. Deploy Convex Functions

```bash
# Deploy to production
npx convex deploy

# Verify deployment
npx convex dashboard
```

---

## Clerk Authentication Setup

### 1. Create Production Instance

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Create a new **Production** application
3. Configure allowed origins:
   ```
   https://your-domain.com
   https://www.your-domain.com
   ```

### 2. Configure OAuth Providers (Optional)

Enable social login providers:
- Google
- GitHub
- Microsoft

### 3. Set Up Webhooks

Create a webhook endpoint for user sync:
- URL: `https://your-domain.com/api/webhooks/clerk`
- Events: `user.created`, `user.updated`, `user.deleted`

### 4. JWT Templates

Create a JWT template for Convex:
- Name: `convex`
- Claims:
  ```json
  {
    "sub": "{{user.id}}"
  }
  ```

---

## Docker Containerization

### Dockerfile

Create `Dockerfile` in project root:

```dockerfile
# ═══════════════════════════════════════════════════════════════════
# Stage 1: Build Frontend
# ═══════════════════════════════════════════════════════════════════
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy frontend package files
COPY frontend/package.json frontend/pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN pnpm build

# ═══════════════════════════════════════════════════════════════════
# Stage 2: Build Backend
# ═══════════════════════════════════════════════════════════════════
FROM node:20-slim AS backend-builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies (including dev for TypeScript compilation)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# ═══════════════════════════════════════════════════════════════════
# Stage 3: Production Runtime
# ═══════════════════════════════════════════════════════════════════
FROM node:20-slim AS production

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    libu2f-udev \
    libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Install Playwright and browsers
RUN pnpm exec playwright install chromium
RUN pnpm exec playwright install-deps chromium

# Copy built frontend from builder
COPY --from=frontend-builder /app/frontend/dist ./dist

# Copy backend source (using tsx for runtime compilation)
COPY --from=backend-builder /app/src ./src
COPY --from=backend-builder /app/tsconfig.json ./

# Re-add tsx for runtime TypeScript execution
RUN pnpm add tsx

# Create data directories
RUN mkdir -p /app/data/screenshots /app/data/reports

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "--import", "tsx", "src/web/server.ts"]
```

### Docker Compose (for local testing)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  ui-tester:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env.production
    volumes:
      # Persist screenshots and reports
      - ui-tester-data:/app/data
    restart: unless-stopped
    # Resource limits for Playwright
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G

volumes:
  ui-tester-data:
```

### Build and Test Locally

```bash
# Build the image
docker build -t ui-tester:latest .

# Run locally
docker run -p 3000:3000 --env-file .env.production ui-tester:latest

# Or with docker-compose
docker-compose up --build
```

---

## Deployment Options

### Option 1: Railway (Recommended)

Railway offers the simplest deployment with excellent Playwright support.

#### Setup

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Create Project:**
   ```bash
   railway init
   ```

3. **Configure railway.json:**
   ```json
   {
     "$schema": "https://railway.app/railway.schema.json",
     "build": {
       "builder": "DOCKERFILE",
       "dockerfilePath": "Dockerfile"
     },
     "deploy": {
       "startCommand": "node --import tsx src/web/server.ts",
       "healthcheckPath": "/health",
       "healthcheckTimeout": 300,
       "restartPolicyType": "ON_FAILURE",
       "restartPolicyMaxRetries": 3
     }
   }
   ```

4. **Set Environment Variables:**
   ```bash
   railway variables set OPENROUTER_API_KEY=sk-or-...
   railway variables set CONVEX_URL=https://...
   railway variables set CLERK_SECRET_KEY=sk_live_...
   # ... set all required variables
   ```

5. **Deploy:**
   ```bash
   railway up
   ```

6. **Set Up Custom Domain:**
   - Go to Railway Dashboard → Settings → Domains
   - Add your custom domain
   - Configure DNS CNAME record

#### Railway Resource Recommendations

| Plan | vCPUs | Memory | Concurrent Tests |
|------|-------|--------|------------------|
| Hobby | 2 | 2GB | 1-2 |
| Pro | 4 | 4GB | 3-5 |
| Team | 8 | 8GB | 5-10 |

---

### Option 2: Fly.io

Fly.io offers global edge deployment with persistent volumes.

#### Setup

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create fly.toml:**
   ```toml
   app = "ui-tester-prod"
   primary_region = "ord"  # Chicago - choose nearest to your users

   [build]
     dockerfile = "Dockerfile"

   [env]
     PORT = "3000"
     NODE_ENV = "production"

   [http_service]
     internal_port = 3000
     force_https = true
     auto_stop_machines = false  # Keep running for Playwright
     auto_start_machines = true
     min_machines_running = 1

     [http_service.concurrency]
       type = "connections"
       hard_limit = 25
       soft_limit = 20

   [[vm]]
     cpu_kind = "shared"
     cpus = 2
     memory_mb = 4096  # 4GB for Playwright

   [mounts]
     source = "ui_tester_data"
     destination = "/app/data"
   ```

3. **Create and Deploy:**
   ```bash
   # Launch app
   fly launch --no-deploy

   # Create persistent volume
   fly volumes create ui_tester_data --size 10 --region ord

   # Set secrets
   fly secrets set OPENROUTER_API_KEY=sk-or-...
   fly secrets set CONVEX_URL=https://...
   fly secrets set CLERK_SECRET_KEY=sk_live_...

   # Deploy
   fly deploy
   ```

4. **Custom Domain:**
   ```bash
   fly certs add your-domain.com
   ```

---

### Option 3: AWS ECS

For enterprise deployments with maximum control.

#### Infrastructure (Terraform)

Create `infrastructure/main.tf`:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Variables
variable "aws_region" {
  default = "us-east-1"
}

variable "app_name" {
  default = "ui-tester"
}

# VPC
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"

  name = "${var.app_name}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

# ECR Repository
resource "aws_ecr_repository" "app" {
  name                 = var.app_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "app" {
  family                   = var.app_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 2048  # 2 vCPU
  memory                   = 4096  # 4 GB
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = var.app_name
      image = "${aws_ecr_repository.app.repository_url}:latest"

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" }
      ]

      secrets = [
        { name = "OPENROUTER_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:OPENROUTER_API_KEY::" },
        { name = "CONVEX_URL", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:CONVEX_URL::" },
        { name = "CLERK_SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:CLERK_SECRET_KEY::" }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/${var.app_name}"
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

# ECS Service
resource "aws_ecs_service" "app" {
  name            = var.app_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = var.app_name
    container_port   = 3000
  }
}

# Application Load Balancer
resource "aws_lb" "app" {
  name               = "${var.app_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
}

resource "aws_lb_target_group" "app" {
  name        = "${var.app_name}-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 10
    timeout             = 30
    interval            = 60
  }
}

# Outputs
output "alb_dns_name" {
  value = aws_lb.app.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}
```

#### Deploy to AWS

```bash
# Initialize Terraform
cd infrastructure
terraform init

# Plan and apply
terraform plan
terraform apply

# Build and push Docker image
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker build -t ui-tester .
docker tag ui-tester:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/ui-tester:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/ui-tester:latest

# Force new deployment
aws ecs update-service --cluster ui-tester-cluster --service ui-tester --force-new-deployment
```

---

### Option 4: DigitalOcean App Platform

Good balance of simplicity and control.

#### App Spec

Create `.do/app.yaml`:

```yaml
name: ui-tester
region: nyc
features:
  - buildpack-stack=ubuntu-22

services:
  - name: web
    dockerfile_path: Dockerfile
    source_dir: /
    github:
      repo: your-username/UI-tester-
      branch: main
      deploy_on_push: true
    instance_size_slug: professional-m  # 2 vCPU, 4GB RAM
    instance_count: 1
    http_port: 3000
    health_check:
      http_path: /health
      initial_delay_seconds: 30
      period_seconds: 30
      timeout_seconds: 10
      success_threshold: 1
      failure_threshold: 3
    envs:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3000"
      - key: OPENROUTER_API_KEY
        type: SECRET
        value: ${OPENROUTER_API_KEY}
      - key: CONVEX_URL
        type: SECRET
        value: ${CONVEX_URL}
      - key: CONVEX_DEPLOYMENT
        type: SECRET
        value: ${CONVEX_DEPLOYMENT}
      - key: CLERK_SECRET_KEY
        type: SECRET
        value: ${CLERK_SECRET_KEY}
      - key: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
        value: ${CLERK_PUBLISHABLE_KEY}
```

---

## CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test

      - name: Type check
        run: pnpm exec tsc --noEmit

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-railway:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway
        run: railway up --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

  # Alternative: Deploy to Fly.io
  # deploy-fly:
  #   needs: build
  #   runs-on: ubuntu-latest
  #   if: github.ref == 'refs/heads/main'
  #   steps:
  #     - uses: actions/checkout@v4
  #     - uses: superfly/flyctl-actions/setup-flyctl@master
  #     - run: flyctl deploy --remote-only
  #       env:
  #         FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-convex:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Deploy Convex
        run: npx convex deploy --prod
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
```

### Required Secrets

Add these to GitHub repository secrets:

| Secret | Description |
|--------|-------------|
| `RAILWAY_TOKEN` | Railway API token |
| `FLY_API_TOKEN` | Fly.io API token |
| `CONVEX_DEPLOY_KEY` | Convex deployment key |

---

## Monitoring & Observability

### Health Check Endpoint

Add to `src/web/server.ts`:

```typescript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {
      convex: 'unknown',
      playwright: 'unknown'
    }
  };

  try {
    // Check Convex connectivity
    // Add your Convex health check here
    health.checks.convex = 'healthy';
  } catch (error) {
    health.checks.convex = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Quick Playwright check
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    health.checks.playwright = 'healthy';
  } catch (error) {
    health.checks.playwright = 'unhealthy';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

### Logging with Pino

Install and configure structured logging:

```bash
pnpm add pino pino-http
```

Create `src/utils/logger.ts`:

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
```

### Application Performance Monitoring

**Option A: Sentry (Recommended)**

```bash
pnpm add @sentry/node
```

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

**Option B: Datadog**

```bash
pnpm add dd-trace
```

```typescript
import tracer from 'dd-trace';
tracer.init({ service: 'ui-tester' });
```

### Uptime Monitoring

Set up external monitoring with:
- [Better Uptime](https://betteruptime.com)
- [UptimeRobot](https://uptimerobot.com)
- [Checkly](https://www.checklyhq.com)

Monitor:
- `https://your-domain.com/health` - Health endpoint
- `https://your-domain.com` - Main application

---

## Security Hardening

### 1. Helmet Middleware

```bash
pnpm add helmet
```

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://clerk.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.convex.cloud", "https://*.clerk.com"],
    },
  },
}));
```

### 2. Rate Limiting

```bash
pnpm add express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
```

### 3. Input Validation

Already using Zod - ensure all API inputs are validated:

```typescript
import { z } from 'zod';

const RunRequestSchema = z.object({
  url: z.string().url(),
  goals: z.string().max(1000).optional(),
  maxSteps: z.number().int().min(1).max(100).optional(),
});
```

### 4. Security Headers Checklist

- [x] HTTPS only (force redirect)
- [x] HSTS enabled
- [x] X-Content-Type-Options: nosniff
- [x] X-Frame-Options: DENY
- [x] Content-Security-Policy configured
- [x] Rate limiting enabled
- [x] Input validation on all endpoints
- [x] Secrets in environment variables

### 5. Dependency Scanning

Add to CI pipeline:

```yaml
- name: Security audit
  run: pnpm audit --audit-level=high
```

---

## Scaling Considerations

### Horizontal Scaling

For high traffic, scale horizontally:

```yaml
# Railway
railway scale web=3

# Fly.io
fly scale count 3

# AWS ECS
aws ecs update-service --desired-count 3
```

### Playwright Resource Requirements

Each Playwright browser instance requires:
- ~500MB RAM minimum
- 0.5 vCPU

For `PARALLEL_BROWSERS=5`:
- Minimum: 4GB RAM, 2 vCPU
- Recommended: 8GB RAM, 4 vCPU

### Queue-Based Architecture (Advanced)

For heavy workloads, consider a queue-based architecture:

```
┌──────────┐     ┌─────────┐     ┌──────────────┐
│   API    │────▶│  Queue  │────▶│   Workers    │
│  Server  │     │ (Redis) │     │ (Playwright) │
└──────────┘     └─────────┘     └──────────────┘
```

This separates request handling from test execution, allowing independent scaling.

---

## Backup & Disaster Recovery

### Convex Data

Convex provides automatic backups. For additional protection:

1. Enable point-in-time recovery in Convex Dashboard
2. Set up scheduled exports:
   ```bash
   npx convex export --path ./backups/$(date +%Y%m%d).zip
   ```

### Screenshots & Reports

For containerized deployments, use object storage:

**AWS S3:**
```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });

async function uploadScreenshot(buffer: Buffer, key: string) {
  await s3.send(new PutObjectCommand({
    Bucket: 'ui-tester-screenshots',
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
  }));
}
```

### Disaster Recovery Plan

1. **RTO (Recovery Time Objective)**: 1 hour
2. **RPO (Recovery Point Objective)**: 24 hours

**Recovery Steps:**
1. Deploy new instance from container registry
2. Restore Convex from latest backup
3. Update DNS to point to new instance
4. Verify health checks pass

---

## Troubleshooting

### Common Issues

#### Playwright fails to launch browser

**Symptoms:**
```
Error: Failed to launch chromium because executable doesn't exist
```

**Solution:**
Ensure Playwright browsers are installed in Dockerfile:
```dockerfile
RUN pnpm exec playwright install chromium
RUN pnpm exec playwright install-deps chromium
```

#### Out of memory errors

**Symptoms:**
```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
```

**Solution:**
1. Increase container memory (minimum 4GB for Playwright)
2. Reduce `PARALLEL_BROWSERS`
3. Add memory limit to Node.js:
   ```bash
   NODE_OPTIONS="--max-old-space-size=3072"
   ```

#### SSE connections dropping

**Symptoms:**
- Real-time updates stop working
- Events don't reach frontend

**Solution:**
1. Ensure load balancer timeout > 120s
2. Check for proxy buffering (disable it):
   ```nginx
   proxy_buffering off;
   proxy_cache off;
   ```

#### Convex connection errors

**Symptoms:**
```
Error: Failed to connect to Convex
```

**Solution:**
1. Verify `CONVEX_URL` is correct
2. Check Convex deployment status
3. Ensure server can reach `*.convex.cloud`

### Debug Mode

Enable detailed logging:
```bash
DEBUG=true
LOG_LEVEL=debug
```

### Support Resources

- **Convex Discord**: [discord.gg/convex](https://discord.gg/convex)
- **Clerk Support**: [clerk.com/support](https://clerk.com/support)
- **Playwright Issues**: [github.com/microsoft/playwright/issues](https://github.com/microsoft/playwright/issues)

---

## Quick Start Checklist

```bash
# 1. Prerequisites
pnpm install
npx playwright install

# 2. Configure environment
cp .env.example .env.production
# Edit .env.production with your values

# 3. Deploy Convex
npx convex deploy --prod

# 4. Build Docker image
docker build -t ui-tester:latest .

# 5. Deploy (choose one)
railway up                    # Railway
fly deploy                    # Fly.io
docker-compose up -d          # Self-hosted

# 6. Verify deployment
curl https://your-domain.com/health
```

---

---

## Stripe Monetization Integration

This section outlines a complete plan for integrating Stripe Link payments with the existing Convex credit system (`remainingRuns`).

### Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Stripe Monetization Flow                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐     ┌──────────────┐     ┌─────────────┐                 │
│   │  User    │────▶│  Stripe      │────▶│   Stripe    │                 │
│   │  Clicks  │     │  Checkout    │     │   Link      │                 │
│   │  "Buy"   │     │  Session     │     │  (1-click)  │                 │
│   └──────────┘     └──────────────┘     └──────────────┘                │
│                                                │                        │
│                                                ▼                        │
│   ┌──────────┐     ┌──────────────┐     ┌─────────────┐                 │
│   │  Convex  │◀────│   Webhook    │◀────│   Payment   │                 │
│   │  Credits │     │   Handler    │     │   Success   │                 │
│   │  Updated │     │   (HTTP)     │     │             │                 │
│   └──────────┘     └──────────────┘     └─────────────┘                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Stripe Link** provides a fast, one-click checkout experience by saving customer payment details. Returning customers can pay with just their email.

### Pricing Tiers

| Tier | Runs | Price | Per-Run Cost | Best For |
|------|------|-------|--------------|----------|
| Starter | 10 | $9 | $0.90 | Trying it out |
| Pro | 50 | $39 | $0.78 | Regular use |
| Team | 200 | $129 | $0.65 | Teams & agencies |
| Enterprise | Unlimited | Custom | - | Contact sales |

### Phase 1: Schema Updates

#### 1.1 Update Convex Schema

Update `convex/schema.ts`:

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    remainingRuns: v.number(),
    // NEW: Stripe fields
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("trialing")
    )),
    subscriptionTier: v.optional(v.union(
      v.literal("starter"),
      v.literal("pro"),
      v.literal("team"),
      v.literal("enterprise")
    )),
    lifetimeCreditsUsed: v.optional(v.number()),
    lifetimePurchases: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_stripe_customer", ["stripeCustomerId"]),

  // NEW: Purchase history
  purchases: defineTable({
    userId: v.id("users"),
    stripeSessionId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
    productType: v.union(v.literal("credits"), v.literal("subscription")),
    tier: v.union(
      v.literal("starter"),
      v.literal("pro"),
      v.literal("team"),
      v.literal("enterprise")
    ),
    creditsAdded: v.number(),
    amountPaid: v.number(), // in cents
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("refunded")
    ),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_user", ["userId"])
    .index("by_session", ["stripeSessionId"])
    .index("by_status", ["status"]),

  // Existing tables...
  runs: defineTable({
    // ... existing fields
  }),

  screenshots: defineTable({
    // ... existing fields
  }),
});
```

### Phase 2: Stripe Configuration

#### 2.1 Create Stripe Products

In Stripe Dashboard, create products:

```bash
# Using Stripe CLI
stripe products create \
  --name="UI Tester - Starter Pack" \
  --description="10 QA test runs" \
  --metadata[tier]=starter \
  --metadata[credits]=10

stripe prices create \
  --product=prod_xxx \
  --unit-amount=900 \
  --currency=usd \
  --metadata[tier]=starter \
  --metadata[credits]=10

# Repeat for Pro and Team tiers...
```

**Product Configuration:**

| Product | Price ID | Amount | Credits |
|---------|----------|--------|---------|
| Starter | `price_starter_xxx` | $9.00 | 10 |
| Pro | `price_pro_xxx` | $39.00 | 50 |
| Team | `price_team_xxx` | $129.00 | 200 |

#### 2.2 Environment Variables

Add to `.env.production`:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Product Price IDs
STRIPE_PRICE_STARTER=price_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PRICE_PRO=price_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PRICE_TEAM=price_xxxxxxxxxxxxxxxxxxxxxxxx

# URLs
STRIPE_SUCCESS_URL=https://your-domain.com/purchase/success
STRIPE_CANCEL_URL=https://your-domain.com/pricing
```

### Phase 3: Backend Implementation

#### 3.1 Install Stripe SDK

```bash
pnpm add stripe
```

#### 3.2 Create Stripe Utility

Create `src/utils/stripe.ts`:

```typescript
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

export const PRICE_CONFIG = {
  starter: {
    priceId: process.env.STRIPE_PRICE_STARTER!,
    credits: 10,
    amount: 900,
  },
  pro: {
    priceId: process.env.STRIPE_PRICE_PRO!,
    credits: 50,
    amount: 3900,
  },
  team: {
    priceId: process.env.STRIPE_PRICE_TEAM!,
    credits: 200,
    amount: 12900,
  },
} as const;

export type PriceTier = keyof typeof PRICE_CONFIG;
```

#### 3.3 Create Checkout Endpoint

Add to `src/web/server.ts`:

```typescript
import { stripe, PRICE_CONFIG, PriceTier } from '../utils/stripe.js';

// Create Stripe Checkout Session with Link enabled
app.post('/api/checkout/create-session', async (req, res) => {
  try {
    const { tier, userId, userEmail } = req.body;

    if (!tier || !PRICE_CONFIG[tier as PriceTier]) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    const config = PRICE_CONFIG[tier as PriceTier];

    // Get or create Stripe customer
    let customerId: string | undefined;

    if (userEmail) {
      const existingCustomers = await stripe.customers.list({
        email: userEmail,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: { convexUserId: userId },
        });
        customerId = customer.id;
      }
    }

    // Create Checkout Session with Stripe Link enabled
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      payment_method_types: ['card', 'link'], // Enable Stripe Link!
      line_items: [
        {
          price: config.priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.STRIPE_CANCEL_URL,
      metadata: {
        tier,
        credits: config.credits.toString(),
        convexUserId: userId,
      },
      // Stripe Link configuration
      payment_method_options: {
        link: {
          persistent_token: customerId ? undefined : null, // Save for returning customers
        },
      },
      // Show order summary
      submit_type: 'pay',
      billing_address_collection: 'auto',
      // Allow promotion codes
      allow_promotion_codes: true,
      // Automatic tax calculation (if configured)
      // automatic_tax: { enabled: true },
    });

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get session status (for success page)
app.get('/api/checkout/session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    res.json({
      status: session.payment_status,
      customerEmail: session.customer_details?.email,
      tier: session.metadata?.tier,
      credits: session.metadata?.credits,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
});
```

#### 3.4 Webhook Handler

Add webhook endpoint to `src/web/server.ts`:

```typescript
import express from 'express';

// IMPORTANT: Webhook needs raw body for signature verification
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleSuccessfulPayment(session);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleExpiredSession(session);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.error('Payment failed:', paymentIntent.id);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleRefund(charge);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);

async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  const { tier, credits, convexUserId } = session.metadata || {};

  if (!credits || !convexUserId) {
    console.error('Missing metadata in session:', session.id);
    return;
  }

  const creditsToAdd = parseInt(credits, 10);

  // Call Convex mutation to add credits
  await convexClient.mutation(api.purchases.completePurchase, {
    sessionId: session.id,
    paymentIntentId: session.payment_intent as string,
    userId: convexUserId,
    tier: tier as any,
    creditsToAdd,
    amountPaid: session.amount_total || 0,
    currency: session.currency || 'usd',
    customerEmail: session.customer_details?.email || undefined,
    stripeCustomerId: session.customer as string,
  });

  console.log(`Added ${creditsToAdd} credits for user ${convexUserId}`);
}

async function handleExpiredSession(session: Stripe.Checkout.Session) {
  const { convexUserId } = session.metadata || {};

  if (convexUserId) {
    await convexClient.mutation(api.purchases.markPurchaseFailed, {
      sessionId: session.id,
      reason: 'Session expired',
    });
  }
}

async function handleRefund(charge: Stripe.Charge) {
  // Handle refund - potentially deduct credits
  console.log('Refund received for charge:', charge.id);
  // Implement credit deduction logic if needed
}
```

#### 3.5 Convex Purchase Functions

Create `convex/purchases.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// Record a pending purchase (called when checkout starts)
export const createPendingPurchase = mutation({
  args: {
    sessionId: v.string(),
    tier: v.union(
      v.literal("starter"),
      v.literal("pro"),
      v.literal("team"),
      v.literal("enterprise")
    ),
    creditsToAdd: v.number(),
  },
  handler: async (ctx, { sessionId, tier, creditsToAdd }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .first();

    if (!user) throw new Error("User not found");

    await ctx.db.insert("purchases", {
      userId: user._id,
      stripeSessionId: sessionId,
      productType: "credits",
      tier,
      creditsAdded: creditsToAdd,
      amountPaid: 0, // Will be updated by webhook
      currency: "usd",
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

// Complete purchase (called by webhook)
export const completePurchase = internalMutation({
  args: {
    sessionId: v.string(),
    paymentIntentId: v.string(),
    userId: v.string(),
    tier: v.union(
      v.literal("starter"),
      v.literal("pro"),
      v.literal("team"),
      v.literal("enterprise")
    ),
    creditsToAdd: v.number(),
    amountPaid: v.number(),
    currency: v.string(),
    customerEmail: v.optional(v.string()),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the purchase record
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_session", (q) => q.eq("stripeSessionId", args.sessionId))
      .first();

    // Find user by Convex ID or email
    let user = await ctx.db.get(args.userId as any);

    if (!user && args.customerEmail) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.customerEmail))
        .first();
    }

    if (!user) {
      console.error("User not found for purchase:", args.sessionId);
      return;
    }

    // Update or create purchase record
    if (purchase) {
      await ctx.db.patch(purchase._id, {
        stripePaymentIntentId: args.paymentIntentId,
        amountPaid: args.amountPaid,
        currency: args.currency,
        status: "completed",
        completedAt: Date.now(),
      });
    } else {
      // Create purchase record if it doesn't exist (edge case)
      await ctx.db.insert("purchases", {
        userId: user._id,
        stripeSessionId: args.sessionId,
        stripePaymentIntentId: args.paymentIntentId,
        productType: "credits",
        tier: args.tier,
        creditsAdded: args.creditsToAdd,
        amountPaid: args.amountPaid,
        currency: args.currency,
        status: "completed",
        createdAt: Date.now(),
        completedAt: Date.now(),
      });
    }

    // Add credits to user
    const currentRuns = user.remainingRuns || 0;
    const lifetimePurchases = (user.lifetimePurchases || 0) + 1;

    await ctx.db.patch(user._id, {
      remainingRuns: currentRuns + args.creditsToAdd,
      stripeCustomerId: args.stripeCustomerId,
      lifetimePurchases,
    });

    console.log(
      `Added ${args.creditsToAdd} credits to user ${user._id}. New balance: ${currentRuns + args.creditsToAdd}`
    );
  },
});

// Mark purchase as failed
export const markPurchaseFailed = internalMutation({
  args: {
    sessionId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, { sessionId, reason }) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_session", (q) => q.eq("stripeSessionId", sessionId))
      .first();

    if (purchase) {
      await ctx.db.patch(purchase._id, {
        status: "failed",
        metadata: { failureReason: reason },
      });
    }
  },
});

// Get user's purchase history
export const getPurchaseHistory = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .first();

    if (!user) return [];

    return await ctx.db
      .query("purchases")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});

// Admin: Get all purchases (for dashboard)
export const getAllPurchases = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit = 100 }) => {
    // Add admin check here
    let query = ctx.db.query("purchases");

    if (status) {
      query = query.withIndex("by_status", (q) =>
        q.eq("status", status as any)
      );
    }

    return await query.order("desc").take(limit);
  },
});
```

### Phase 4: Frontend Implementation

#### 4.1 Install Stripe.js

```bash
cd frontend
pnpm add @stripe/stripe-js
```

#### 4.2 Create Pricing Component

Create `frontend/src/components/Pricing.tsx`:

```tsx
import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { useUser } from '@clerk/clerk-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const TIERS = [
  {
    name: 'Starter',
    tier: 'starter',
    price: 9,
    credits: 10,
    perRun: '0.90',
    features: ['10 QA test runs', 'All test types', 'PDF reports', 'Email support'],
    popular: false,
  },
  {
    name: 'Pro',
    tier: 'pro',
    price: 39,
    credits: 50,
    perRun: '0.78',
    features: [
      '50 QA test runs',
      'All test types',
      'PDF reports',
      'Priority support',
      'API access',
    ],
    popular: true,
  },
  {
    name: 'Team',
    tier: 'team',
    price: 129,
    credits: 200,
    perRun: '0.65',
    features: [
      '200 QA test runs',
      'All test types',
      'PDF reports',
      'Dedicated support',
      'API access',
      'Team sharing',
    ],
    popular: false,
  },
];

export function Pricing() {
  const { user, isLoaded } = useUser();
  const currentUser = useQuery(api.users.getCurrentUser);
  const [loading, setLoading] = useState<string | null>(null);

  const handlePurchase = async (tier: string) => {
    if (!user) {
      // Redirect to sign in
      window.location.href = '/sign-in?redirect=/pricing';
      return;
    }

    setLoading(tier);

    try {
      const response = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
          userId: currentUser?._id,
          userEmail: user.primaryEmailAddress?.emailAddress,
        }),
      });

      const { url, error } = await response.json();

      if (error) {
        throw new Error(error);
      }

      // Redirect to Stripe Checkout (with Link enabled)
      window.location.href = url;
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="py-12 px-4">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold">Choose Your Plan</h2>
        <p className="text-gray-600 mt-2">
          Pay once, use anytime. No subscriptions required.
        </p>
        {currentUser && (
          <p className="text-sm text-gray-500 mt-4">
            Current balance: <strong>{currentUser.remainingRuns}</strong> runs
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {TIERS.map((plan) => (
          <div
            key={plan.tier}
            className={`rounded-2xl p-8 ${
              plan.popular
                ? 'bg-blue-600 text-white ring-4 ring-blue-600 ring-offset-2'
                : 'bg-white border border-gray-200'
            }`}
          >
            {plan.popular && (
              <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1 rounded-full">
                Most Popular
              </span>
            )}

            <h3 className="text-2xl font-bold mt-4">{plan.name}</h3>

            <div className="mt-4">
              <span className="text-4xl font-bold">${plan.price}</span>
              <span className={plan.popular ? 'text-blue-100' : 'text-gray-500'}>
                {' '}one-time
              </span>
            </div>

            <p className={`text-sm mt-2 ${plan.popular ? 'text-blue-100' : 'text-gray-500'}`}>
              {plan.credits} runs • ${plan.perRun}/run
            </p>

            <ul className="mt-6 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <svg
                    className={`w-5 h-5 ${plan.popular ? 'text-blue-200' : 'text-green-500'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handlePurchase(plan.tier)}
              disabled={loading === plan.tier}
              className={`w-full mt-8 py-3 px-4 rounded-lg font-semibold transition ${
                plan.popular
                  ? 'bg-white text-blue-600 hover:bg-blue-50'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading === plan.tier ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Processing...
                </span>
              ) : (
                `Buy ${plan.credits} Runs`
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="text-center mt-8 text-sm text-gray-500">
        <p>Secure payment powered by Stripe</p>
        <p className="mt-1">
          Returning customer? Use <strong>Stripe Link</strong> for 1-click checkout
        </p>
      </div>
    </div>
  );
}
```

#### 4.3 Create Success Page

Create `frontend/src/pages/PurchaseSuccess.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export function PurchaseSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [sessionData, setSessionData] = useState<any>(null);
  const currentUser = useQuery(api.users.getCurrentUser);

  useEffect(() => {
    if (sessionId) {
      fetch(`/api/checkout/session/${sessionId}`)
        .then((res) => res.json())
        .then(setSessionData)
        .catch(console.error);
    }
  }, [sessionId]);

  if (!sessionData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mt-6">Payment Successful!</h1>

        <p className="text-gray-600 mt-2">
          Thank you for your purchase. Your credits have been added to your account.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mt-6">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Plan</span>
            <span className="font-medium capitalize">{sessionData.tier}</span>
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span className="text-gray-500">Credits Added</span>
            <span className="font-medium">{sessionData.credits}</span>
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span className="text-gray-500">New Balance</span>
            <span className="font-bold text-green-600">
              {currentUser?.remainingRuns ?? '...'} runs
            </span>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <Link
            to="/dashboard"
            className="block w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Start Testing
          </Link>
          <Link
            to="/purchase-history"
            className="block w-full py-3 px-4 border border-gray-200 rounded-lg font-semibold hover:bg-gray-50 transition"
          >
            View Purchase History
          </Link>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          A receipt has been sent to {sessionData.customerEmail}
        </p>
      </div>
    </div>
  );
}
```

#### 4.4 Add Low Balance Warning

Create `frontend/src/components/LowBalanceWarning.tsx`:

```tsx
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Link } from 'react-router-dom';

export function LowBalanceWarning() {
  const remainingRuns = useQuery(api.users.getRemainingRuns);

  if (remainingRuns === null || remainingRuns === undefined || remainingRuns > 3) {
    return null;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-3">
        <svg
          className="w-5 h-5 text-amber-600 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1">
          <p className="text-sm text-amber-800">
            {remainingRuns === 0 ? (
              <strong>You're out of test runs!</strong>
            ) : (
              <>
                Only <strong>{remainingRuns}</strong> test run{remainingRuns !== 1 && 's'} remaining
              </>
            )}
          </p>
        </div>
        <Link
          to="/pricing"
          className="text-sm font-semibold text-amber-700 hover:text-amber-900"
        >
          Buy More
        </Link>
      </div>
    </div>
  );
}
```

### Phase 5: Webhook Security

#### 5.1 Stripe Webhook Configuration

In Stripe Dashboard:

1. Go to **Developers** → **Webhooks**
2. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

#### 5.2 Idempotency

Ensure webhook handlers are idempotent:

```typescript
// Check if already processed
const existingPurchase = await ctx.db
  .query("purchases")
  .withIndex("by_session", (q) => q.eq("stripeSessionId", sessionId))
  .first();

if (existingPurchase?.status === "completed") {
  console.log("Purchase already processed, skipping");
  return;
}
```

### Phase 6: Testing

#### 6.1 Test Cards

Use Stripe test cards:

| Scenario | Card Number |
|----------|-------------|
| Success | `4242 4242 4242 4242` |
| Decline | `4000 0000 0000 0002` |
| 3D Secure | `4000 0025 0000 3155` |

#### 6.2 Test Stripe Link

1. Use test mode in Stripe Dashboard
2. Enable Link in payment method settings
3. Use test email for Link: `test@example.com`

#### 6.3 Webhook Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test events
stripe trigger checkout.session.completed
```

### Phase 7: Go Live Checklist

- [ ] Switch Stripe keys from test to live
- [ ] Update webhook endpoint to production URL
- [ ] Verify all products/prices exist in live mode
- [ ] Test a real purchase with a real card
- [ ] Set up Stripe Radar for fraud protection
- [ ] Configure email receipts in Stripe Dashboard
- [ ] Set up tax collection if required (Stripe Tax)
- [ ] Add terms of service and refund policy links
- [ ] Test refund flow
- [ ] Set up revenue reporting/dashboards

### Stripe Link Benefits

1. **Faster Checkout**: Returning customers pay with 1 click
2. **Higher Conversion**: Up to 7% increase in checkout conversion
3. **Secure**: Customers don't re-enter payment details
4. **Automatic**: No additional code required - enabled via payment method types

### Revenue Analytics

Track in Stripe Dashboard:
- Monthly Recurring Revenue (if adding subscriptions later)
- Gross Volume
- Successful payments
- Average order value
- Customer lifetime value

---

## Cost Estimates

| Provider | Config | Monthly Cost |
|----------|--------|--------------|
| Railway | 2 vCPU, 4GB RAM | ~$20-40 |
| Fly.io | 2 vCPU, 4GB RAM | ~$30-50 |
| DigitalOcean | Professional-M | ~$40 |
| AWS ECS | 2 vCPU, 4GB Fargate | ~$60-100 |
| Convex | Free tier | $0 |
| Clerk | Free tier (10k MAU) | $0 |
| OpenRouter | Usage-based | ~$10-50 |

**Estimated total: $30-150/month** depending on usage and provider choice.
