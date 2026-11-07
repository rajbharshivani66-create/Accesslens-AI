CREATE TYPE "ScanPageStatus" AS ENUM ('COMPLETED');

ALTER TABLE "Scan"
  ADD COLUMN "passedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "durationMs" INTEGER;

CREATE TABLE "ScanPage" (
  "id" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "requestedUrl" TEXT NOT NULL,
  "finalUrl" TEXT NOT NULL,
  "title" TEXT,
  "status" "ScanPageStatus" NOT NULL DEFAULT 'COMPLETED',
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "passedCount" INTEGER NOT NULL DEFAULT 0,
  "incompleteCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScanPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScanPage_scanId_requestedUrl_key" ON "ScanPage"("scanId", "requestedUrl");
CREATE INDEX "ScanPage_scanId_createdAt_idx" ON "ScanPage"("scanId", "createdAt");
ALTER TABLE "ScanPage" ADD CONSTRAINT "ScanPage_scanId_fkey"
  FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScanPage" ENABLE ROW LEVEL SECURITY;
