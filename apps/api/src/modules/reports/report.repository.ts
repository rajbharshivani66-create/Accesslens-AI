export interface ReportFinding {
  id: string;
  project: string;
  severity: string;
  status: string;
  title: string;
  ruleId: string;
  wcag: string | null;
  pageUrl: string | null;
  createdAt: Date;
}

export interface ReportRepository {
  listFindings(userId: string, projectId?: string, take?: number): Promise<ReportFinding[]>;
}
