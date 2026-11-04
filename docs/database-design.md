# Database Design

## Core entities
- UserProfile
- Project
- Scan
- Finding
- AIExplanation
- FixSuggestion
- VerificationRun
- JiraIntegration
- JiraIssue
- Team
- TeamMember
- Notification
- ActivityLog

## Notes
The Prisma schema is defined in `packages/database/prisma/schema.prisma` and includes relation metadata, indexes, and unique constraints.

## Authentication model
Authentication is handled by Supabase Auth and should not duplicate passwords in the application tables.
