ALTER TABLE "JiraIntegration" DROP CONSTRAINT IF EXISTS "JiraIntegration_userId_projectKey_key";
ALTER TABLE "JiraIntegration" ADD COLUMN "cloudId" TEXT;
ALTER TABLE "JiraIntegration" ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "JiraIntegration" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE UNIQUE INDEX "JiraIntegration_userId_cloudId_key" ON "JiraIntegration"("userId", "cloudId");
CREATE TABLE "JiraOAuthState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "accessTokenCiphertext" TEXT,
  "refreshTokenCiphertext" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "sites" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "callbackUsedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JiraOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JiraOAuthState_stateHash_key" ON "JiraOAuthState"("stateHash");
CREATE INDEX "JiraOAuthState_userId_expiresAt_idx" ON "JiraOAuthState"("userId", "expiresAt");
ALTER TABLE "JiraOAuthState" ADD CONSTRAINT "JiraOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
