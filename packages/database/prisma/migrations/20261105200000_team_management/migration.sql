ALTER TYPE "TeamMemberRole" RENAME VALUE 'EDITOR' TO 'DEVELOPER';

CREATE TYPE "InvitationEmailStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING', 'ACCEPTED', 'FAILED');

CREATE TABLE "TeamInvitation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "role" "TeamMemberRole" NOT NULL DEFAULT 'DEVELOPER',
    "emailStatus" "InvitationEmailStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamInvitation_tokenHash_key" ON "TeamInvitation"("tokenHash");
CREATE INDEX "TeamInvitation_teamId_expiresAt_idx" ON "TeamInvitation"("teamId", "expiresAt");
CREATE INDEX "TeamInvitation_createdById_createdAt_idx" ON "TeamInvitation"("createdById", "createdAt");
CREATE UNIQUE INDEX "TeamInvitation_pending_team_email_key"
    ON "TeamInvitation"("teamId", LOWER("email"))
    WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "TeamInvitation"
    ADD CONSTRAINT "TeamInvitation_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamInvitation"
    ADD CONSTRAINT "TeamInvitation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "UserProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamInvitation" ENABLE ROW LEVEL SECURITY;

DROP POLICY "project_owner_access" ON "Project";

CREATE POLICY "project_owner_access"
ON "Project"
FOR ALL
TO authenticated
USING (
    "teamId" IS NULL
    AND EXISTS (
        SELECT 1
        FROM "UserProfile"
        WHERE "UserProfile"."id" = "Project"."ownerId"
          AND "UserProfile"."authUserId" = auth.uid()
    )
)
WITH CHECK (
    "teamId" IS NULL
    AND EXISTS (
        SELECT 1
        FROM "UserProfile"
        WHERE "UserProfile"."id" = "Project"."ownerId"
          AND "UserProfile"."authUserId" = auth.uid()
    )
);
