export type FindingWorkflowStatus = 'OPEN' | 'IN_REVIEW' | 'IGNORED' | 'RESOLVED';
export type FindingSeverity = 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR';

export interface FindingFilters {
  page: number;
  pageSize: number;
  projectId?: string;
  scanId?: string;
  severity?: FindingSeverity;
  status?: FindingWorkflowStatus;
  wcag?: string;
  search?: string;
  sortBy?: 'createdAt' | 'severity' | 'status' | 'ruleId';
  sortOrder?: 'asc' | 'desc';
}

export interface FindingAccess {
  writable: boolean;
  canResolve: boolean;
  projectId: string;
  projectName: string;
  teamId: string | null;
  teamName: string | null;
  scanId: string;
  scanStatus: string;
  score: number;
  pageUrl: string | null;
  requestedPaths: string[];
  assignee: { id: string; fullName: string | null; email: string } | null;
}

export interface FindingItem {
  id: string;
  ruleId: string;
  title: string;
  description: string | null;
  impact: string | null;
  severity: FindingSeverity;
  status: FindingWorkflowStatus;
  assignedToId: string | null;
  selector: string | null;
  snippet: string | null;
  pageUrl: string | null;
  wcag: string | null;
  wcagTags: string[];
  helpUrl: string | null;
  failureSummary: string | null;
  violationCount: number;
  createdAt: Date;
  updatedAt: Date;
  access: FindingAccess;
}

export interface VerificationHistoryItem {
  id: string;
  scanId: string;
  findingId: string | null;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  outcome: 'RESOLVED' | 'REMAINING' | 'REGRESSED' | null;
  ruleId: string | null;
  title: string | null;
  pageUrl: string | null;
  resolvedCount: number;
  regressionCount: number;
  scoreDelta: number;
  createdAt: Date;
  scanStatus: string;
  projectId: string;
  projectName: string;
}

export interface FindingRepository {
  list(userId: string, filters: FindingFilters): Promise<{ items: FindingItem[]; total: number }>;
  get(userId: string, findingId: string): Promise<FindingItem | null>;
  updateStatus(userId: string, findingId: string, status: FindingWorkflowStatus): Promise<FindingItem | null>;
  assign(userId: string, findingId: string, assignedToId: string | null): Promise<FindingItem | null>;
  startVerification(userId: string, findingId: string): Promise<{ id: string; projectId: string; status: string } | null>;
  listVerifications(userId: string, findingId?: string): Promise<VerificationHistoryItem[]>;
}
