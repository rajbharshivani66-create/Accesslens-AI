ALTER TABLE "AIExplanation"
  ADD COLUMN "rootCause" TEXT,
  ADD COLUMN "wcagExplanation" TEXT,
  ADD COLUMN "testInstructions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "FixSuggestion"
  ADD COLUMN "htmlSuggestion" TEXT,
  ADD COLUMN "jsxSuggestion" TEXT;
