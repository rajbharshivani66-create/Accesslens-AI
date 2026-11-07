ALTER TABLE "Scan"
  ADD COLUMN "requestedById" TEXT,
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "pageCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "incompleteCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "requestedPaths" TEXT[] NOT NULL DEFAULT ARRAY['/']::TEXT[];

CREATE INDEX "Scan_status_startedAt_idx" ON "Scan"("status", "startedAt");
CREATE INDEX "Scan_requestedById_idx" ON "Scan"("requestedById");

ALTER TABLE "Scan"
  ADD CONSTRAINT "Scan_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "UserProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Finding"
  ADD COLUMN "ruleId" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "impact" TEXT,
  ADD COLUMN "wcagTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "helpUrl" TEXT,
  ADD COLUMN "failureSummary" TEXT,
  ADD COLUMN "violationCount" INTEGER NOT NULL DEFAULT 1;
