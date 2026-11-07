ALTER TYPE "FindingStatus" ADD VALUE IF NOT EXISTS 'IGNORED';
ALTER TABLE "Finding" ADD COLUMN "assignedToId" TEXT;
CREATE INDEX "Finding_assignedToId_status_idx" ON "Finding"("assignedToId", "status");
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;