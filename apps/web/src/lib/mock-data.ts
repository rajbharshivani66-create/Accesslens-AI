export const dashboardData = {
  totalWebsites: 18,
  totalScans: 126,
  accessibilityScore: 92,
  criticalIssues: 3,
  seriousIssues: 14,
  moderateIssues: 26,
  minorIssues: 11,
  resolvedFindings: 82,
  unresolvedFindings: 42,
  recentActivities: [
    { title: 'New scan complete', type: 'scan', summary: 'Checkout homepage completed with a 96/100 score.' },
    { title: 'Jira sync', type: 'jira', summary: '3 accessibility bugs created in project ACCESS-431.' },
    { title: 'AI fix review', type: 'ai', summary: 'Contrast optimization suggestion approved for marketing landing page.' }
  ],
  scanHistory: [
    { id: 'SCAN-1102', project: 'Northstar Commerce', date: '2026-11-04', score: 96, issues: 5 },
    { id: 'SCAN-1101', project: 'Kinetic Health', date: '2026-11-02', score: 91, issues: 12 },
    { id: 'SCAN-1099', project: 'Harbor Studio', date: '2026-10-29', score: 88, issues: 18 }
  ]
};

export const scoreTrend = [
  { month: 'Jul', score: 78 },
  { month: 'Aug', score: 81 },
  { month: 'Sep', score: 84 },
  { month: 'Oct', score: 89 },
  { month: 'Nov', score: 92 }
];
