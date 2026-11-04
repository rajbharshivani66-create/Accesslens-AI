# AccessLens AI Architecture

This document defines the high-level application structure and deployment boundaries.

## Frontend
- Next.js App Router
- React components and feature modules
- Tailwind UI styling
- Dashboard and project reporting screens

## Backend
- Express service with validation and error handling
- Service modules for scanning, AI, Jira, analytics, and team management

## Database
- Supabase Postgres + Prisma ORM
- Standardized models for projects, scans, findings, verification, notifications, and team memberships

## Visual agent
- Development-only top-layer overlay
- Disabled in production by default
- Safe removal script and build isolation
