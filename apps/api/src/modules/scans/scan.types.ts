export type ScanState = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export type ScanSeverity = 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR';

export interface ScanFindingInput {
  title: string;
  ruleId: string;
  description: string;
  impact: string | null;
  severity: ScanSeverity;
  selector: string | null;
  snippet: string | null;
  pageUrl: string;
  wcag: string | null;
  wcagTags: string[];
  helpUrl: string | null;
  failureSummary: string | null;
  violationCount: number;
}

export interface ScanOutput {
  findings: ScanFindingInput[];
  incompleteCount: number;
  pageCount: number;
  passedCount?: number;
  durationMs?: number;
  pages?: ScanPageOutput[];
}

export interface ScanPageOutput {
  requestedUrl: string;
  finalUrl: string;
  title: string | null;
  durationMs: number;
  passedCount: number;
  incompleteCount: number;
}

export interface ScanPageDetails extends ScanPageOutput {
  id: string;
  status: 'COMPLETED';
  createdAt: Date;
}

export interface ScanSummary {
  id: string;
  projectId: string;
  status: ScanState;
  score: number;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  pageCount: number;
  incompleteCount: number;
  passedCount: number;
  durationMs: number | null;
  paths: string[];
  findingCount: number;
  createdAt: Date;
}

export interface ScanDetails extends ScanSummary {
  pages: ScanPageDetails[];
  findings: Array<ScanFindingInput & { id: string; status: string; createdAt: Date }>;
}

export interface ScanWithProject extends ScanSummary {
  projectUrl: string;
  requestedById: string | null;
  verificationForFindingId: string | null;
}

export interface ScanRepository {
  createScan(userId: string, projectId: string, paths: string[]): Promise<ScanSummary | null>;
  claimNextScan(): Promise<ScanWithProject | null>;
  failStaleScans(startedBefore: Date): Promise<number>;
  listProjectScans(
    userId: string,
    projectId: string,
    skip: number,
    take: number
  ): Promise<{ items: ScanSummary[]; total: number } | null>;
  listScans(userId: string, skip: number, take: number): Promise<{ items: ScanSummary[]; total: number }>;
  getScan(userId: string, scanId: string): Promise<ScanDetails | null>;
  completeScan(scanId: string, result: ScanOutput): Promise<void>;
  failScan(scanId: string, message: string, durationMs?: number): Promise<void>;
}

export interface AccessibilityScanner {
  scan(projectUrl: string, paths: string[]): Promise<ScanOutput>;
}
