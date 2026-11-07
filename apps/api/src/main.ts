import { resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const environment = (await import('./config/environment.js')).parseApiEnvironment(process.env);
const port = environment.PORT;

async function start(): Promise<void> {
  const [
    { connectDatabase, disconnectDatabase, prisma },
    { createApp, createSupabaseTokenVerifier },
    { createResendInvitationEmailSender },
    { PrismaProjectRepository },
    { PrismaDashboardRepository },
    { PrismaTeamRepository },
    { PrismaScanRepository },
    { PrismaFindingRepository },
    { PrismaAIFixRepository },
    { PrismaActivityRepository },
    { PrismaReportRepository },
    { PrismaAnalyticsRepository },
    { ScanService },
    { PlaywrightAxeScanner },
    { AIFixService, createGeminiInteractionsRequest },
    { JiraService },
    { createRateLimitRuntime }
  ] =
    await Promise.all([
      import('@accesslens-ai/database'),
      import('./app.js'),
      import('./modules/teams/invitation-email.js'),
      import('./services/prisma-project.repository.js'),
      import('./services/prisma-dashboard.repository.js'),
      import('./services/prisma-team.repository.js'),
      import('./services/prisma-scan.repository.js'),
      import('./services/prisma-finding.repository.js'),
      import('./services/prisma-ai-fix.repository.js'),
      import('./services/prisma-activity.repository.js'),
      import('./services/prisma-report.repository.js'),
      import('./services/prisma-analytics.repository.js'),
      import('./modules/scans/scan.service.js'),
      import('./modules/scans/playwright-axe-scanner.js'),
      import('./modules/ai-fixes/ai-fixes.service.js'),
      import('./modules/jira/jira.service.js'),
      import('./middleware/rate-limit.js')
    ]);

  const rateLimitRuntime = await createRateLimitRuntime(environment);
  const scanRepository = new PrismaScanRepository(prisma);
  try {
    await connectDatabase();
    await scanRepository.failStaleScans(new Date(Date.now() - 30 * 60 * 1000));
  } catch (error) {
    await Promise.all([disconnectDatabase(), rateLimitRuntime.close()]);
    throw error;
  }

  const scanService = new ScanService(
    scanRepository,
    new PlaywrightAxeScanner({
      maxPages: environment.SCAN_MAX_PAGES,
      pageTimeoutMs: environment.SCAN_PAGE_TIMEOUT_MS,
      maxRequestsPerPage: environment.SCAN_MAX_REQUESTS_PER_PAGE,
      maxBytesPerScan: environment.SCAN_MAX_BYTES_PER_SCAN,
      maxConcurrentScans: environment.SCAN_MAX_CONCURRENT
    }),
    environment.SCAN_MAX_PAGES
  );
  const stopScanWorker = scanService.startWorker(1000, environment.SCAN_MAX_CONCURRENT);
  const jiraService = new JiraService(prisma, {
    clientId: environment.JIRA_CLIENT_ID,
    clientSecret: environment.JIRA_CLIENT_SECRET,
    redirectUri: environment.JIRA_REDIRECT_URI,
    tokenEncryptionKey: environment.JIRA_TOKEN_ENCRYPTION_KEY,
    frontendUrl: environment.FRONTEND_URL
  });

  const app = createApp({
    repository: new PrismaProjectRepository(prisma),
    dashboardRepository: new PrismaDashboardRepository(prisma),
    teamRepository: new PrismaTeamRepository(prisma),
    scanService,
    findingRepository: new PrismaFindingRepository(prisma),
    aiFixService: new AIFixService(
      new PrismaAIFixRepository(prisma),
      createGeminiInteractionsRequest(environment.GEMINI_API_KEY, environment.GEMINI_MODEL)
    ),
    jiraService,
    activityRepository: new PrismaActivityRepository(prisma),
    reportRepository: new PrismaReportRepository(prisma),
    analyticsRepository: new PrismaAnalyticsRepository(prisma),
    verifyAccessToken: createSupabaseTokenVerifier(
      environment.SUPABASE_URL,
      environment.SUPABASE_ANON_KEY
    ),
    ...(environment.RESEND_API_KEY && environment.INVITATION_FROM_EMAIL
      ? {
          sendInvitationEmail: createResendInvitationEmailSender(
            environment.RESEND_API_KEY,
            environment.INVITATION_FROM_EMAIL
          )
        }
      : {}),
    frontendUrl: environment.FRONTEND_URL,
    rateLimiters: rateLimitRuntime.middleware,
    trustedProxyCidrs: environment.TRUSTED_PROXY_CIDRS
  });

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`AccessLens API listening on port ${port}.`);
  });

  const shutdown = async () => {
    server.close(async (error) => {
      if (error) {
        console.error('API server failed to close cleanly.', {
          errorName: error.name
        });
        process.exitCode = 1;
      }

      await stopScanWorker();
      await Promise.all([disconnectDatabase(), rateLimitRuntime.close()]);
    });
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void start().catch((error: unknown) => {
  const message = error instanceof Error
    ? error.message.replace(/\b(postgres(?:ql)?|redis|rediss):\/\/[^\s"']+/gi, '$1://<redacted>')
    : 'Unknown startup error';
  console.error('AccessLens API failed to start.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorCode: typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined,
    message
  });
  process.exitCode = 1;
});
