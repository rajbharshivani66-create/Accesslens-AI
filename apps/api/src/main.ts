import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { z } from 'zod';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const projectSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  description: z.string().optional()
});

const mockData = {
  projects: [
    { id: 'proj_001', name: 'Northstar Commerce', url: 'https://northstar.example.com', description: 'Customer storefront' },
    { id: 'proj_002', name: 'Harbor Studio', url: 'https://harbor.example.com', description: 'Creative brand site' }
  ],
  scans: [
    { id: 'scan_001', projectId: 'proj_001', status: 'completed', score: 96, startedAt: '2026-11-04T10:00:00Z', completedAt: '2026-11-04T10:04:00Z' },
    { id: 'scan_002', projectId: 'proj_002', status: 'in_progress', score: 88, startedAt: '2026-11-04T09:40:00Z', completedAt: null }
  ],
  findings: [
    { id: 'finding_001', scanId: 'scan_001', severity: 'critical', title: 'Image missing alt text', status: 'open' },
    { id: 'finding_002', scanId: 'scan_001', severity: 'serious', title: 'Button without accessible name', status: 'in_review' }
  ],
  notifications: [
    { id: 'n_001', type: 'scan_completed', read: false, text: 'Northstar Commerce scan has finished.' },
    { id: 'n_002', type: 'jira_created', read: true, text: 'Jira bug created for contrast issue.' }
  ],
  analytics: {
    overview: {
      totalWebsites: 18,
      totalScans: 126,
      accessibilityScore: 92,
      criticalIssues: 3,
      seriousIssues: 14,
      moderateIssues: 26,
      minorIssues: 11,
      resolvedFindings: 82,
      unresolvedFindings: 42
    },
    trends: [
      { month: 'Jul', score: 78 },
      { month: 'Aug', score: 81 },
      { month: 'Sep', score: 84 },
      { month: 'Oct', score: 89 },
      { month: 'Nov', score: 92 }
    ]
  }
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'accesslens-api' });
});

app.post('/api/auth/register', (req, res) => {
  const result = authSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  return res.status(201).json({
    user: { email: result.data.email },
    message: 'User registered successfully.'
  });
});

app.post('/api/auth/login', (req, res) => {
  const result = authSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  return res.json({
    accessToken: 'demo-access-token',
    refreshToken: 'demo-refresh-token',
    user: { email: result.data.email, role: 'admin' }
  });
});

app.post('/api/auth/logout', (_req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

app.get('/api/projects', (_req, res) => {
  res.json({ items: mockData.projects });
});

app.post('/api/projects', (req, res) => {
  const result = projectSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const project = {
    id: `proj_${Math.random().toString(36).slice(2, 8)}`,
    name: result.data.name,
    url: result.data.url,
    description: result.data.description ?? ''
  };

  mockData.projects.push(project);
  res.status(201).json(project);
});

app.get('/api/scans', (_req, res) => {
  res.json({ items: mockData.scans });
});

app.post('/api/scans', (req, res) => {
  const projectId = z.string().min(1).safeParse(req.body?.projectId ?? '');
  if (!projectId.success) {
    return res.status(400).json({ error: 'A valid projectId is required.' });
  }

  const scan = {
    id: `scan_${Math.random().toString(36).slice(2, 8)}`,
    projectId: projectId.data,
    status: 'queued',
    score: 0,
    startedAt: new Date().toISOString(),
    completedAt: null
  };

  mockData.scans.unshift(scan);
  res.status(202).json({ scan, message: 'Scan queued successfully.' });
});

app.get('/api/scans/:scanId/findings', (req, res) => {
  const findings = mockData.findings.filter((finding) => finding.scanId === req.params.scanId);
  res.json({ items: findings });
});

app.post('/api/ai/explain', (req, res) => {
  const body = z.object({ issue: z.string().min(1) }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: 'Issue text is required.' });
  }

  res.json({
    issue: body.data.issue,
    explanation: {
      summary: 'The issue affects keyboard and screen-reader users because the element lacks a clear accessible name.',
      why: 'This commonly occurs when interactive controls are unlabeled or use non-semantic elements.',
      affectedUsers: ['keyboard users', 'screen reader users'],
      wcag: ['WCAG 2.1 4.1.2 Name, Role, Value'],
      fix: 'Add an accessible name using aria-label, an associated label, or a semantic button element.'
    }
  });
});

app.post('/api/ai/suggest-fix', (req, res) => {
  const body = z.object({ selector: z.string().min(1), issue: z.string().min(1) }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: 'selector and issue are required.' });
  }

  res.json({
    before: '<button class="cta">Submit</button>',
    after: '<button class="cta" aria-label="Submit form">Submit</button>',
    explanation: 'The fix adds an explicit accessible name so assistive technology can announce the action.'
  });
});

app.post('/api/verification', (req, res) => {
  const body = z.object({ scanId: z.string().min(1) }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: 'scanId is required.' });
  }

  res.json({
    status: 'completed',
    scanId: body.data.scanId,
    resolved: 2,
    remaining: 1,
    regressions: 0,
    scoreDelta: 6
  });
});

app.get('/api/analytics/overview', (_req, res) => {
  res.json(mockData.analytics.overview);
});

app.get('/api/analytics/trends', (_req, res) => {
  res.json(mockData.analytics.trends);
});

app.get('/api/notifications', (_req, res) => {
  res.json({ items: mockData.notifications });
});

app.get('/api/team', (_req, res) => {
  res.json({ items: [{ id: 'member_1', name: 'Alicia Nguyen', role: 'Admin' }, { id: 'member_2', name: 'Sam Patel', role: 'Reviewer' }] });
});

app.post('/api/team/invite', (req, res) => {
  const body = z.object({ email: z.string().email(), role: z.string().min(1) }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: body.error.flatten() });
  }

  res.status(201).json({ id: 'member_new', ...body.data, status: 'invited' });
});

app.post('/api/jira/connect', (req, res) => {
  const body = z.object({ baseUrl: z.string().url(), username: z.string().min(1) }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: body.error.flatten() });
  }

  res.json({ connected: true, project: 'ACCESS', baseUrl: body.data.baseUrl, username: body.data.username });
});

app.post('/api/jira/test-connection', (_req, res) => {
  res.json({ ok: true, message: 'Jira connection is healthy.' });
});

app.post('/api/jira/create-issue', (req, res) => {
  const body = z.object({ title: z.string().min(1), projectKey: z.string().min(1), findingId: z.string().optional() }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: body.error.flatten() });
  }

  res.status(201).json({ key: 'ACCESS-421', id: 'jira_421', projectKey: body.data.projectKey, title: body.data.title });
});

app.get('/api/jira/issues', (_req, res) => {
  res.json({ items: [{ key: 'ACCESS-421', title: 'Button missing accessible name', status: 'Open' }] });
});

app.listen(port, () => {
  console.log(`AccessLens API listening on http://localhost:${port}`);
});
