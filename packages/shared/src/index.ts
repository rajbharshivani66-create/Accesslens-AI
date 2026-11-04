export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';
export type Status = 'open' | 'in_review' | 'resolved';

export interface Project {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export interface Scan {
  id: string;
  projectId: string;
  status: 'queued' | 'in_progress' | 'completed';
  score: number;
  startedAt: string;
  completedAt?: string | null;
}

export interface Finding {
  id: string;
  scanId: string;
  title: string;
  severity: Severity;
  status: Status;
}

export const appModules = [
  'Authentication',
  'Dashboard',
  'Projects',
  'Accessibility Scanner',
  'Findings',
  'AI Explainer',
  'AI Fix Suggestions',
  'Verification',
  'Jira Integration',
  'Analytics',
  'Team Management',
  'Notifications',
  'Audit Logs',
  'Visual Agent'
] as const;
