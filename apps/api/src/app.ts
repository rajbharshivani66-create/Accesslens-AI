import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Prisma } from '@accesslens-ai/database';
import { createHash, randomBytes } from 'node:crypto';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import type { AccessTokenVerifier, AuthContext } from './modules/auth/auth.types.js';
import type { DashboardRepository } from './modules/dashboard/dashboard.repository.js';
import type { ProjectRepository } from './modules/projects/project.repository.js';
import type { TeamRepository } from './modules/teams/team.repository.js';
import type { InvitationEmailSender } from './modules/teams/invitation-email.js';
import type { ScanService } from './modules/scans/scan.service.js';
import type { FindingRepository } from './modules/findings/finding.repository.js';
import type { AIFixService } from './modules/ai-fixes/ai-fixes.service.js';
import type { JiraService } from './modules/jira/jira.service.js';
import type { ActivityRepository } from './modules/activity/activity.repository.js';
import type { ReportRepository } from './modules/reports/report.repository.js';
import type { AnalyticsRepository } from './modules/analytics/analytics.repository.js';
import { findingsCsv, findingsPdf } from './modules/reports/report-export.js';
import {
  createRateLimitMiddleware,
  defaultRateLimitSettings,
  type RateLimitMiddlewareSet
} from './middleware/rate-limit.js';
import { ApiError } from './utils/api-error.js';
import { asyncHandler } from './utils/async-handler.js';

export interface AppDependencies {
  repository: ProjectRepository;
  dashboardRepository: DashboardRepository;
  teamRepository: TeamRepository;
  verifyAccessToken: AccessTokenVerifier;
  sendInvitationEmail?: InvitationEmailSender;
  frontendUrl?: string;
  rateLimiters?: RateLimitMiddlewareSet;
  trustedProxyCidrs?: string[];
  scanService?: ScanService;
  findingRepository?: FindingRepository;
  aiFixService?: AIFixService;
  jiraService?: JiraService;
  activityRepository?: ActivityRepository;
  reportRepository?: ReportRepository;
  analyticsRepository?: AnalyticsRepository;
}

const profileSchema = z
  .object({
    fullName: z.string().trim().max(100).nullable().optional(),
    avatarUrl: z
      .string()
      .url()
      .max(2048)
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
        message: 'Avatar URL must use HTTP or HTTPS.'
      })
      .nullable()
      .optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one profile field to update.'
  });

const projectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  url: z.string().trim().url().max(2048).refine(isHttpUrl, {
    message: 'Project URL must use HTTP or HTTPS and must not contain credentials.'
  }),
  description: z.string().trim().max(500).optional(),
  teamId: z.string().min(1).nullable().optional()
});

const projectUpdateSchema = projectSchema
  .omit({ teamId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one project field to update.'
  });

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});
const idSchema = z.string().min(1).max(128);

const dashboardQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d')
});

const scanRequestSchema = z.object({
  paths: z.array(z.string().trim().min(1).max(2048).refine((path) => path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') && !/[?#\u0000-\u001f]/.test(path), {
    message: 'Paths must be same-origin absolute paths without query, fragment, or control characters.'
  })).min(1).max(25).optional()
}).strict();
const scanCreateSchema = z.object({
  projectId: idSchema,
  paths: scanRequestSchema.shape.paths
}).strict();

const findingQuerySchema = paginationSchema.extend({
  projectId: idSchema.optional(),
  scanId: idSchema.optional(),
  severity: z.enum(['CRITICAL', 'SERIOUS', 'MODERATE', 'MINOR']).optional(),
  status: z.enum(['OPEN', 'IN_REVIEW', 'IGNORED', 'RESOLVED']).optional(),
  wcag: z.string().trim().min(1).max(40).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  sortBy: z.enum(['createdAt', 'severity', 'status', 'ruleId']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});
const findingStatusSchema = z.object({ status: z.enum(['OPEN', 'IN_REVIEW', 'IGNORED', 'RESOLVED']) }).strict();
const findingAssignmentSchema = z.object({ assignedToId: idSchema.nullable() }).strict();
const jiraCompleteSchema = z.object({ state: z.string().length(43), cloudId: z.string().regex(/^[A-Za-z0-9-]{1,80}$/), projectKey: z.string().regex(/^[A-Z][A-Z0-9_]{0,19}$/) }).strict();
const jiraIssueCreateSchema = z.object({ findingId: idSchema, integrationId: idSchema.optional(), includeReviewedRemediation: z.boolean().default(false) }).strict();
const jiraDisconnectSchema = z.object({ integrationId: idSchema }).strict();

const teamCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional()
});

const teamUpdateSchema = teamCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'Provide at least one team field to update.' }
);

const invitationSchema = z.object({
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  role: z.enum(['ADMIN', 'DEVELOPER', 'VIEWER']).default('DEVELOPER')
});

const invitationAcceptSchema = z.object({
  token: z.string().length(43).regex(/^[A-Za-z0-9_-]+$/)
});
const aiFindingRequestSchema = z.object({ findingId: z.string().trim().min(1).max(128) }).strict();

const memberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'DEVELOPER', 'VIEWER'])
});


function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function sendValidationError(response: Response, error: z.ZodError): void {
  response.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'The request contains invalid fields.',
      details: error.flatten()
    }
  });
}

function requireAuthContext(request: Request, response: Response): AuthContext | null {
  if (!request.authContext) {
    response.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'A valid access token is required.' }
    });
    return null;
  }

  return request.authContext;
}

function createAuthMiddleware(
  repository: ProjectRepository,
  verifyAccessToken: AccessTokenVerifier
) {
  return asyncHandler(async (request, response, next) => {
    const authorization = request.header('authorization');
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (!token) {
      response.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'A bearer access token is required.' }
      });
      return;
    }

    try {
      const identity = await verifyAccessToken(token);
      if (!identity) {
        response.status(401).json({
          error: { code: 'INVALID_TOKEN', message: 'The access token is invalid or expired.' }
        });
        return;
      }

      const profile = await repository.ensureProfile(identity);
      request.authContext = {
        id: identity.id,
        email: identity.email,
        emailVerified: identity.emailVerified === true,
        profileId: profile.id
      };
      next();
    } catch (error) {
      console.error('Access token verification or profile initialization failed.', {
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
      response.status(503).json({
        error: {
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'Authentication could not be completed. Please try again.'
        }
      });
    }
  });
}

export function createSupabaseTokenVerifier(
  supabaseUrl = process.env.SUPABASE_URL,
  supabaseAnonKey = process.env.SUPABASE_ANON_KEY
): AccessTokenVerifier {
  let supabase: SupabaseClient | undefined;

  return async (token) => {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be configured.');
    }

    supabase ??= createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.id || !data.user.email) {
      return null;
    }

    const metadataName = data.user.user_metadata.full_name;
    const fullName =
      typeof metadataName === 'string' && metadataName.trim().length <= 100
        ? metadataName.trim()
        : undefined;
    return {
      id: data.user.id,
      email: data.user.email,
      emailVerified: Boolean(data.user.email_confirmed_at),
      ...(fullName ? { fullName } : {})
    };
  };
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const allowedOrigin = dependencies.frontendUrl ?? 'http://localhost:3000';
  const rateLimiters = dependencies.rateLimiters ?? createRateLimitMiddleware(defaultRateLimitSettings);

  app.disable('x-powered-by');
  app.set('trust proxy', dependencies.trustedProxyCidrs ?? []);
  app.use(helmet({
    strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false
  }));
  app.use(cors({ origin: allowedOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get(
    '/health',
    asyncHandler(async (_request, response) => {
      try {
        await dependencies.repository.ping();
        response.json({ data: { status: 'ok', database: 'connected' } });
      } catch (error) {
        console.error('Health check could not reach PostgreSQL.', {
          errorName: error instanceof Error ? error.name : 'UnknownError'
        });
        response.status(503).json({
          error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' }
        });
      }
    })
  );

  if (dependencies.jiraService) {
    app.get('/api/jira/callback', rateLimiters.apiIp, asyncHandler(async (request, response) => {
      const redirectUrl = await dependencies.jiraService!.callback({
        code: request.query.code,
        state: request.query.state,
        error: request.query.error
      });
      response.redirect(302, redirectUrl);
    }));
  }

  app.use('/api', rateLimiters.apiIp);
  app.use('/api/auth', rateLimiters.authIp);
  app.use('/api', createAuthMiddleware(dependencies.repository, dependencies.verifyAccessToken));
  app.use('/api', rateLimiters.apiUser);
  app.use('/api', (request, response, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      rateLimiters.writes(request, response, next);
      return;
    }
    next();
  });
  app.use(['/api/dashboard', '/api/analytics', '/api/scans', '/api/ai'], rateLimiters.expensive);

  app.get('/api/auth/me', (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    response.json({ data: { id: user.id, email: user.email, profileId: user.profileId } });
  });

  app.get('/api/dashboard/summary', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;

    const parsed = dashboardQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    const days = Number.parseInt(parsed.data.range, 10);
    const startDate = new Date();
    startDate.setUTCHours(0, 0, 0, 0);
    startDate.setUTCDate(startDate.getUTCDate() - days + 1);
    const summary = await dependencies.dashboardRepository.getSummary(
      user.profileId,
      parsed.data.range,
      startDate
    );
    response.json({ data: summary });
  }));

  if (dependencies.analyticsRepository) {
    app.get('/api/analytics/summary', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const parsed = z.object({ range: z.enum(['7d', '30d', '90d']).default('30d'), projectId: idSchema.optional() }).strict().safeParse(request.query);
      if (!parsed.success) { sendValidationError(response, parsed.error); return; }
      const summary = await dependencies.analyticsRepository!.summarize(user.profileId, parsed.data.range, parsed.data.projectId);
      if (!summary) { response.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'The project was not found.' } }); return; }
      response.json({ data: summary });
    }));
  }

  app.get('/api/teams', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    response.json({ data: await dependencies.teamRepository.listTeams(user.profileId) });
  }));

  app.post('/api/teams', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    const parsed = teamCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    const team = await dependencies.teamRepository.createTeam(
      user.profileId,
      parsed.data.name,
      parsed.data.description
    );
    response.status(201).json({ data: team });
  }));

  app.get('/api/teams/:teamId', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    const teamId = idSchema.safeParse(request.params.teamId);
    if (!teamId.success) {
      sendValidationError(response, teamId.error);
      return;
    }
    const team = await dependencies.teamRepository.getTeam(user.profileId, teamId.data);
    if (!team) {
      response.status(404).json({
        error: { code: 'TEAM_NOT_FOUND', message: 'The team was not found.' }
      });
      return;
    }
    response.json({ data: team });
  }));

  app.put('/api/teams/:teamId', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    const teamId = idSchema.safeParse(request.params.teamId);
    const parsed = teamUpdateSchema.safeParse(request.body);
    if (!teamId.success) {
      sendValidationError(response, teamId.error);
      return;
    }
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    const team = await dependencies.teamRepository.updateTeam(
      user.profileId,
      teamId.data,
      parsed.data
    );
    if (!team) {
      response.status(404).json({
        error: { code: 'TEAM_NOT_FOUND', message: 'The team was not found.' }
      });
      return;
    }
    response.json({ data: team });
  }));

  app.delete('/api/teams/:teamId', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    const teamId = idSchema.safeParse(request.params.teamId);
    if (!teamId.success) {
      sendValidationError(response, teamId.error);
      return;
    }
    const deleted = await dependencies.teamRepository.deleteTeam(user.profileId, teamId.data);
    if (!deleted) {
      response.status(404).json({
        error: { code: 'TEAM_NOT_FOUND', message: 'The team was not found.' }
      });
      return;
    }
    response.status(204).end();
  }));

  app.post('/api/teams/:teamId/invitations', rateLimiters.invitations, asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    const teamId = idSchema.safeParse(request.params.teamId);
    const parsed = invitationSchema.safeParse(request.body);
    if (!teamId.success) {
      sendValidationError(response, teamId.error);
      return;
    }
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await dependencies.teamRepository.createInvitation(
      user.profileId,
      teamId.data,
      {
        email: parsed.data.email,
        role: parsed.data.role,
        tokenHash,
        emailStatus: dependencies.sendInvitationEmail ? 'PENDING' : 'NOT_CONFIGURED',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    );
    const inviteUrl = new URL('/team', allowedOrigin);
    inviteUrl.hash = `invite=${token}`;
    let emailStatus = invitation.emailStatus;
    if (dependencies.sendInvitationEmail) {
      try {
        const team = await dependencies.teamRepository.getTeam(user.profileId, teamId.data);
        if (!team) {
          throw new Error('The team became unavailable before the invitation email was sent.');
        }
        await dependencies.sendInvitationEmail({
          recipient: invitation.email,
          teamName: team.name,
          inviteUrl: inviteUrl.toString(),
          expiresAt: invitation.expiresAt
        });
        emailStatus = 'ACCEPTED';
      } catch (error) {
        emailStatus = 'FAILED';
        console.error('Team invitation email could not be accepted by the provider.', {
          errorName: error instanceof Error ? error.name : 'UnknownError'
        });
      }
      await dependencies.teamRepository.updateInvitationEmailStatus(
        invitation.id,
        emailStatus
      );
    }
    response.status(201).json({
      data: { ...invitation, emailStatus, inviteUrl: inviteUrl.toString() }
    });
  }));

  app.delete('/api/teams/:teamId/invitations/:invitationId', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    const teamId = idSchema.safeParse(request.params.teamId);
    const invitationId = idSchema.safeParse(request.params.invitationId);
    if (!teamId.success) {
      sendValidationError(response, teamId.error);
      return;
    }
    if (!invitationId.success) {
      sendValidationError(response, invitationId.error);
      return;
    }
    const revoked = await dependencies.teamRepository.revokeInvitation(
      user.profileId,
      teamId.data,
      invitationId.data
    );
    if (!revoked) {
      response.status(404).json({
        error: { code: 'INVITATION_NOT_FOUND', message: 'The invitation was not found.' }
      });
      return;
    }
    response.status(204).end();
  }));

  app.post('/api/team-invitations/accept', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    if (!user.emailVerified) {
      response.status(403).json({
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Verify your email address before accepting a team invitation.'
        }
      });
      return;
    }
    const parsed = invitationAcceptSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
    const team = await dependencies.teamRepository.acceptInvitation(
      user.profileId,
      user.email,
      tokenHash,
      new Date()
    );
    response.json({ data: team });
  }));

  app.patch('/api/teams/:teamId/members/:memberId', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    const teamId = idSchema.safeParse(request.params.teamId);
    const memberId = idSchema.safeParse(request.params.memberId);
    const parsed = memberRoleSchema.safeParse(request.body);
    if (!teamId.success) {
      sendValidationError(response, teamId.error);
      return;
    }
    if (!memberId.success) {
      sendValidationError(response, memberId.error);
      return;
    }
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    const team = await dependencies.teamRepository.updateMemberRole(
      user.profileId,
      teamId.data,
      memberId.data,
      parsed.data.role
    );
    if (!team) {
      response.status(404).json({
        error: { code: 'MEMBER_NOT_FOUND', message: 'The team member was not found.' }
      });
      return;
    }
    response.json({ data: team });
  }));

  app.delete('/api/teams/:teamId/members/:memberId', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    const teamId = idSchema.safeParse(request.params.teamId);
    const memberId = idSchema.safeParse(request.params.memberId);
    if (!teamId.success) {
      sendValidationError(response, teamId.error);
      return;
    }
    if (!memberId.success) {
      sendValidationError(response, memberId.error);
      return;
    }
    const removed = await dependencies.teamRepository.removeMember(
      user.profileId,
      teamId.data,
      memberId.data
    );
    if (!removed) {
      response.status(404).json({
        error: { code: 'MEMBER_NOT_FOUND', message: 'The team member was not found.' }
      });
      return;
    }
    response.status(204).end();
  }));

  app.get('/api/profile', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;

    const profile = await dependencies.repository.getProfile(user.id);
    if (!profile) {
      response.status(404).json({
        error: { code: 'PROFILE_NOT_FOUND', message: 'The authenticated profile was not found.' }
      });
      return;
    }

    response.json({ data: profile });
  }));

  app.put('/api/profile', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;

    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    const profile = await dependencies.repository.updateProfile(user.id, parsed.data);
    if (!profile) {
      response.status(404).json({
        error: { code: 'PROFILE_NOT_FOUND', message: 'The authenticated profile was not found.' }
      });
      return;
    }

    response.json({ data: profile });
  }));

  app.get('/api/projects', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;

    const pagination = paginationSchema.safeParse(request.query);
    if (!pagination.success) {
      sendValidationError(response, pagination.error);
      return;
    }

    const { page, pageSize } = pagination.data;
    const result = await dependencies.repository.listProjects(
      user.profileId,
      (page - 1) * pageSize,
      pageSize
    );

    response.json({
      data: {
        items: result.items,
        pagination: {
          page,
          pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / pageSize)
        }
      }
    });
  }));

  app.post('/api/projects', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;

    const parsed = projectSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    const project = await dependencies.repository.createProject(user.profileId, parsed.data);
    response.status(201).json({ data: project });
  }));

  app.get('/api/projects/:projectId', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;

    const projectId = z.string().min(1).safeParse(request.params.projectId);
    if (!projectId.success) {
      sendValidationError(response, projectId.error);
      return;
    }

    const project = await dependencies.repository.getProject(user.profileId, projectId.data);
    if (!project) {
      response.status(404).json({
        error: { code: 'PROJECT_NOT_FOUND', message: 'The project was not found.' }
      });
      return;
    }

    response.json({ data: project });
  }));

  app.put('/api/projects/:projectId', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;

    const projectId = z.string().min(1).safeParse(request.params.projectId);
    if (!projectId.success) {
      sendValidationError(response, projectId.error);
      return;
    }

    const parsed = projectUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    const project = await dependencies.repository.updateProject(
      user.profileId,
      projectId.data,
      parsed.data
    );
    if (!project) {
      response.status(404).json({
        error: { code: 'PROJECT_NOT_FOUND', message: 'The project was not found.' }
      });
      return;
    }

    response.json({ data: project });
  }));

  app.delete('/api/projects/:projectId', asyncHandler(async (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;

    const projectId = z.string().min(1).safeParse(request.params.projectId);
    if (!projectId.success) {
      sendValidationError(response, projectId.error);
      return;
    }

    const deleted = await dependencies.repository.deleteProject(
      user.profileId,
      projectId.data
    );
    if (!deleted) {
      response.status(404).json({
        error: { code: 'PROJECT_NOT_FOUND', message: 'The project was not found.' }
      });
      return;
    }

    response.status(204).end();
  }));

  if (dependencies.scanService) {
    app.get('/api/scans', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const parsed = paginationSchema.extend({ projectId: idSchema.optional() }).strict().safeParse(request.query);
      if (!parsed.success) { sendValidationError(response, parsed.error); return; }
      const skip = (parsed.data.page - 1) * parsed.data.pageSize;
      if (parsed.data.projectId) {
        const result = await dependencies.scanService!.listProjectScans(user.profileId, parsed.data.projectId, skip, parsed.data.pageSize);
        if (!result) { response.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'The project was not found.' } }); return; }
        response.json({ data: { ...result, page: parsed.data.page, pageSize: parsed.data.pageSize } });
      } else {
        const result = await dependencies.scanService!.listScans(user.profileId, skip, parsed.data.pageSize);
        response.json({ data: { ...result, page: parsed.data.page, pageSize: parsed.data.pageSize } });
      }
    }));

    app.post('/api/scans', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const parsed = scanCreateSchema.safeParse(request.body ?? {});
      if (!parsed.success) { sendValidationError(response, parsed.error); return; }
      const paths = parsed.data.paths ?? ['/'];
      if (paths.length > dependencies.scanService!.maxPageCount) {
        sendValidationError(response, new z.ZodError([{
          code: z.ZodIssueCode.too_big, maximum: dependencies.scanService!.maxPageCount, type: 'array', inclusive: true, exact: false,
          path: ['paths'], message: `At most ${dependencies.scanService!.maxPageCount} pages may be scanned at once.`
        }]));
        return;
      }
      const scan = await dependencies.scanService!.startScan(user.profileId, parsed.data.projectId, paths);
      if (!scan) { response.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'The project was not found or is not writable.' } }); return; }
      response.status(202).json({ data: scan });
    }));

    app.get('/api/projects/:projectId/scans', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const projectId = idSchema.safeParse(request.params.projectId);
      const pagination = paginationSchema.safeParse(request.query);
      if (!projectId.success) {
        sendValidationError(response, projectId.error);
        return;
      }
      if (!pagination.success) {
        sendValidationError(response, pagination.error);
        return;
      }
      const scans = await dependencies.scanService!.listProjectScans(
        user.profileId,
        projectId.data,
        (pagination.data.page - 1) * pagination.data.pageSize,
        pagination.data.pageSize
      );
      if (!scans) {
        response.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'The project was not found.' } });
        return;
      }
      response.json({ data: { ...scans, page: pagination.data.page, pageSize: pagination.data.pageSize } });
    }));

    app.post('/api/projects/:projectId/scans', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const projectId = idSchema.safeParse(request.params.projectId);
      const parsed = scanRequestSchema.safeParse(request.body ?? {});
      if (!projectId.success) {
        sendValidationError(response, projectId.error);
        return;
      }
      if (!parsed.success) {
        sendValidationError(response, parsed.error);
        return;
      }
      const paths = parsed.data.paths ?? ['/'];
      if (paths.length > dependencies.scanService!.maxPageCount) {
        sendValidationError(response, new z.ZodError([{
          code: z.ZodIssueCode.too_big,
          maximum: dependencies.scanService!.maxPageCount,
          type: 'array',
          inclusive: true,
          exact: false,
          path: ['paths'],
          message: `At most ${dependencies.scanService!.maxPageCount} pages may be scanned at once.`
        }]));
        return;
      }
      const scan = await dependencies.scanService!.startScan(user.profileId, projectId.data, paths);
      if (!scan) {
        response.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'The project was not found.' } });
        return;
      }
      response.status(202).json({ data: scan });
    }));

    app.get('/api/scans/:scanId', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const scanId = idSchema.safeParse(request.params.scanId);
      if (!scanId.success) {
        sendValidationError(response, scanId.error);
        return;
      }
      const scan = await dependencies.scanService!.getScan(user.profileId, scanId.data);
      if (!scan) {
        response.status(404).json({ error: { code: 'SCAN_NOT_FOUND', message: 'The scan was not found.' } });
        return;
      }
      response.json({ data: scan });
    }));

    app.post('/api/scans/:scanId/retry', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const scanId = idSchema.safeParse(request.params.scanId);
      if (!scanId.success) {
        sendValidationError(response, scanId.error);
        return;
      }
      const previous = await dependencies.scanService!.getScan(user.profileId, scanId.data);
      if (!previous) {
        response.status(404).json({ error: { code: 'SCAN_NOT_FOUND', message: 'The scan was not found.' } });
        return;
      }
      if (previous.status !== 'FAILED') {
        response.status(409).json({ error: { code: 'SCAN_NOT_RETRYABLE', message: 'Only failed scans can be retried.' } });
        return;
      }
      const scan = await dependencies.scanService!.retryScan(user.profileId, scanId.data);
      if (!scan) {
        response.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'The project was not found.' } });
        return;
      }
      response.status(202).json({ data: scan });
    }));
  }

  if (dependencies.findingRepository) {
    app.get('/api/findings', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const parsed = findingQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        sendValidationError(response, parsed.error);
        return;
      }
      const result = await dependencies.findingRepository!.list(user.profileId, parsed.data);
      response.json({ data: { ...result, page: parsed.data.page, pageSize: parsed.data.pageSize } });
    }));

    app.get('/api/findings/:findingId', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const findingId = idSchema.safeParse(request.params.findingId);
      if (!findingId.success) {
        sendValidationError(response, findingId.error);
        return;
      }
      const finding = await dependencies.findingRepository!.get(user.profileId, findingId.data);
      if (!finding) {
        response.status(404).json({ error: { code: 'FINDING_NOT_FOUND', message: 'The finding was not found.' } });
        return;
      }
      response.json({ data: finding });
    }));

    app.patch('/api/findings/:findingId', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const findingId = idSchema.safeParse(request.params.findingId);
      const input = findingStatusSchema.safeParse(request.body);
      if (!findingId.success) { sendValidationError(response, findingId.error); return; }
      if (!input.success) { sendValidationError(response, input.error); return; }
      const current = await dependencies.findingRepository!.get(user.profileId, findingId.data);
      if (!current) {
        response.status(404).json({ error: { code: 'FINDING_NOT_FOUND', message: 'The finding was not found.' } });
        return;
      }
      if (!current.access.writable) {
        response.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to update this finding.' } });
        return;
      }
      if (input.data.status === 'RESOLVED' && !current.access.canResolve) {
        response.status(409).json({ error: { code: 'VERIFICATION_REQUIRED', message: 'A completed verification with a resolved outcome is required before resolving this finding.' } });
        return;
      }
      const finding = await dependencies.findingRepository!.updateStatus(user.profileId, findingId.data, input.data.status);
      if (!finding) {
        response.status(404).json({ error: { code: 'FINDING_NOT_FOUND', message: 'The finding was not found.' } });
        return;
      }
      response.json({ data: finding });
    }));

    app.post('/api/findings/:findingId/verify', rateLimiters.expensive, asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const findingId = idSchema.safeParse(request.params.findingId);
      if (!findingId.success) { sendValidationError(response, findingId.error); return; }
      const current = await dependencies.findingRepository!.get(user.profileId, findingId.data);
      if (!current) {
        response.status(404).json({ error: { code: 'FINDING_NOT_FOUND', message: 'The finding was not found.' } });
        return;
      }
      if (!current.access.writable) {
        response.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to verify this finding.' } });
        return;
      }
      const scan = await dependencies.findingRepository!.startVerification(user.profileId, findingId.data);
      if (!scan) {
        response.status(409).json({ error: { code: 'VERIFICATION_UNAVAILABLE', message: 'This finding cannot be verified. Confirm its captured page still belongs to the project.' } });
        return;
      }
      response.status(202).json({ data: scan });
    }));

    app.get('/api/verifications', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const findingId = request.query.findingId === undefined ? undefined : idSchema.safeParse(request.query.findingId);
      if (findingId && !findingId.success) { sendValidationError(response, findingId.error); return; }
      const history = await dependencies.findingRepository!.listVerifications(user.profileId, findingId?.data);
      response.json({ data: history });
    }));

    app.post('/api/findings/:findingId/assign', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const findingId = idSchema.safeParse(request.params.findingId);
      const input = findingAssignmentSchema.safeParse(request.body);
      if (!findingId.success) { sendValidationError(response, findingId.error); return; }
      if (!input.success) { sendValidationError(response, input.error); return; }
      const current = await dependencies.findingRepository!.get(user.profileId, findingId.data);
      if (!current) {
        response.status(404).json({ error: { code: 'FINDING_NOT_FOUND', message: 'The finding was not found.' } });
        return;
      }
      if (!current.access.writable) {
        response.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to assign this finding.' } });
        return;
      }
      const finding = await dependencies.findingRepository!.assign(user.profileId, findingId.data, input.data.assignedToId);
      if (!finding) {
        response.status(400).json({ error: { code: 'INVALID_ASSIGNEE', message: 'The assignee must be an active member of the project team.' } });
        return;
      }
      response.json({ data: finding });
    }));
  }

  if (dependencies.aiFixService) {
    app.get('/api/ai/fixes', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      response.json({ data: await dependencies.aiFixService!.list(user.profileId) });
    }));

    const generateAI = asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      if (Buffer.byteLength(JSON.stringify(request.body ?? {}), 'utf8') > 8_192) {
        response.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'AI requests must be 8 KB or smaller.' } });
        return;
      }
      let findingId: string;
      if (request.params.findingId) {
        const parsed = idSchema.safeParse(request.params.findingId);
        if (!parsed.success) { sendValidationError(response, parsed.error); return; }
        findingId = parsed.data;
      } else {
        const parsed = aiFindingRequestSchema.safeParse(request.body);
        if (!parsed.success) { sendValidationError(response, parsed.error); return; }
        findingId = parsed.data.findingId;
      }
      try {
        const result = await dependencies.aiFixService!.generate(user.profileId, findingId);
        if (!result) {
          response.status(404).json({ error: { code: 'FINDING_NOT_FOUND', message: 'The finding was not found or is not writable.' } });
          return;
        }
        response.json({ data: result });
      } catch (error) {
        const missingCredentials = error instanceof Error && error.message === 'AI_PROVIDER_UNAVAILABLE';
        const providerFailed = error instanceof Error && error.message === 'AI_PROVIDER_REQUEST_FAILED';
        console.error('AI finding assistance failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
        response.status(missingCredentials ? 503 : 502).json({ error: {
          code: missingCredentials ? 'AI_PROVIDER_UNAVAILABLE' : providerFailed ? 'AI_PROVIDER_REQUEST_FAILED' : 'AI_RESPONSE_INVALID',
          message: missingCredentials
            ? 'Gemini is not configured on the API server. Add GEMINI_API_KEY to the backend environment, then restart or redeploy the API. Never add it to a NEXT_PUBLIC_ variable.'
            : providerFailed
              ? 'The Gemini request failed. Check the API server’s Gemini key, model setting, and provider availability, then retry.'
              : 'Gemini returned an invalid response. Please retry; no suggestion was saved.'
        } });
      }
    });
    app.post('/api/findings/:findingId/ai', rateLimiters.expensive, generateAI);
    app.post('/api/ai/explain', rateLimiters.expensive, generateAI);
    app.post('/api/ai/fix-suggestions', rateLimiters.expensive, generateAI);
  }

  if (dependencies.jiraService) {
    app.get('/api/jira/status', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      response.json({ data: await dependencies.jiraService!.status(user.profileId) });
    }));

    app.post('/api/jira/connect', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      try { response.json({ data: await dependencies.jiraService!.start(user.profileId) }); }
      catch (error) {
        if (error instanceof Error && error.message === 'JIRA_NOT_CONFIGURED') {
          response.status(503).json({ error: { code: 'JIRA_NOT_CONFIGURED', message: 'Jira OAuth is not configured on the API server.' } });
          return;
        }
        throw error;
      }
    }));

    app.get('/api/jira/pending', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const state = z.string().length(43).safeParse(request.query.state);
      if (!state.success) { sendValidationError(response, state.error); return; }
      const pending = await dependencies.jiraService!.pending(user.profileId, state.data);
      if (!pending) { response.status(404).json({ error: { code: 'JIRA_OAUTH_STATE_EXPIRED', message: 'The Jira authorization session is expired or unavailable.' } }); return; }
      response.json({ data: pending });
    }));

    app.get('/api/jira/projects', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const state = z.string().length(43).safeParse(request.query.state);
      const cloudId = z.string().regex(/^[A-Za-z0-9-]{1,80}$/).safeParse(request.query.cloudId);
      if (!state.success) { sendValidationError(response, state.error); return; }
      if (!cloudId.success) { sendValidationError(response, cloudId.error); return; }
      try {
        const projects = await dependencies.jiraService!.projects(user.profileId, state.data, cloudId.data);
        if (!projects) { response.status(404).json({ error: { code: 'JIRA_OAUTH_STATE_EXPIRED', message: 'The Jira authorization session is expired or unavailable.' } }); return; }
        response.json({ data: projects });
      } catch {
        response.status(502).json({ error: { code: 'JIRA_PROJECTS_UNAVAILABLE', message: 'Jira projects could not be loaded.' } });
      }
    }));

    app.post('/api/jira/complete', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const input = jiraCompleteSchema.safeParse(request.body);
      if (!input.success) { sendValidationError(response, input.error); return; }
      try {
        const integration = await dependencies.jiraService!.complete(user.profileId, input.data.state, input.data.cloudId, input.data.projectKey);
        if (!integration) { response.status(400).json({ error: { code: 'JIRA_SELECTION_INVALID', message: 'Choose a Jira site and project available to this account.' } }); return; }
        response.json({ data: integration });
      } catch {
        response.status(502).json({ error: { code: 'JIRA_PROJECT_VALIDATION_FAILED', message: 'The selected Jira project could not be verified.' } });
      }
    }));

    app.get('/api/jira/integrations', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      response.json({ data: await dependencies.jiraService!.integration(user.profileId) });
    }));

    app.get('/api/jira/issues/:issueId', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const issueId = idSchema.safeParse(request.params.issueId);
      if (!issueId.success) { sendValidationError(response, issueId.error); return; }
      const issue = await dependencies.jiraService!.getIssue(user.profileId, issueId.data);
      if (!issue) { response.status(404).json({ error: { code: 'JIRA_ISSUE_NOT_FOUND', message: 'The Jira issue was not found.' } }); return; }
      response.json({ data: issue });
    }));

    app.post('/api/jira/issues', rateLimiters.expensive, asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const input = jiraIssueCreateSchema.safeParse(request.body);
      if (!input.success) { sendValidationError(response, input.error); return; }
      try {
        const issue = await dependencies.jiraService!.createIssue(user.profileId, input.data.findingId, input.data.integrationId, input.data.includeReviewedRemediation);
        if (!issue) { response.status(404).json({ error: { code: 'FINDING_NOT_FOUND', message: 'The finding was not found or is not writable.' } }); return; }
        response.status('alreadyExists' in issue && issue.alreadyExists ? 200 : 201).json({ data: issue });
      } catch (error) {
        const notConnected = error instanceof Error && ['JIRA_NOT_CONNECTED', 'JIRA_REAUTH_REQUIRED'].includes(error.message);
        const conflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        response.status(notConnected ? 409 : conflict ? 409 : 502).json({ error: {
          code: notConnected ? 'JIRA_REAUTH_REQUIRED' : conflict ? 'JIRA_ISSUE_EXISTS' : 'JIRA_ISSUE_CREATE_FAILED',
          message: notConnected ? 'Connect or reconnect Jira before creating issues.' : conflict ? 'A Jira issue is already linked to this finding.' : 'Jira could not create an issue. Check the integration and try again.'
        } });
      }
    }));

    app.post('/api/jira/disconnect', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const input = jiraDisconnectSchema.safeParse(request.body);
      if (!input.success) { sendValidationError(response, input.error); return; }
      if (!await dependencies.jiraService!.disconnect(user.profileId, input.data.integrationId)) {
        response.status(404).json({ error: { code: 'JIRA_INTEGRATION_NOT_FOUND', message: 'The Jira integration was not found.' } });
        return;
      }
      response.status(204).end();
    }));

    app.delete('/api/jira/integrations/:integrationId', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const integrationId = idSchema.safeParse(request.params.integrationId);
      if (!integrationId.success) { sendValidationError(response, integrationId.error); return; }
      if (!await dependencies.jiraService!.disconnect(user.profileId, integrationId.data)) {
        response.status(404).json({ error: { code: 'JIRA_INTEGRATION_NOT_FOUND', message: 'The Jira integration was not found.' } });
        return;
      }
      response.status(204).end();
    }));

    app.post('/api/jira/integrations/:integrationId/sync', rateLimiters.expensive, asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const integrationId = idSchema.safeParse(request.params.integrationId);
      if (!integrationId.success) { sendValidationError(response, integrationId.error); return; }
      try {
        const result = await dependencies.jiraService!.syncIssues(user.profileId, integrationId.data);
        if (!result) { response.status(404).json({ error: { code: 'JIRA_INTEGRATION_NOT_FOUND', message: 'A connected Jira integration was not found.' } }); return; }
        response.json({ data: result });
      } catch (error) {
        const reauth = error instanceof Error && error.message === 'JIRA_REAUTH_REQUIRED';
        response.status(reauth ? 409 : 502).json({ error: { code: reauth ? 'JIRA_REAUTH_REQUIRED' : 'JIRA_SYNC_FAILED', message: reauth ? 'Reconnect Jira before synchronizing issues.' : 'Jira issue status could not be synchronized.' } });
      }
    }));

    app.post('/api/findings/:findingId/jira', rateLimiters.expensive, asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const findingId = idSchema.safeParse(request.params.findingId);
      if (!findingId.success) { sendValidationError(response, findingId.error); return; }
      try {
        const issue = await dependencies.jiraService!.createIssue(user.profileId, findingId.data);
        if (!issue) { response.status(404).json({ error: { code: 'FINDING_NOT_FOUND', message: 'The finding was not found or is not writable.' } }); return; }
        response.status('alreadyExists' in issue && issue.alreadyExists ? 200 : 201).json({ data: issue });
      } catch (error) {
        const notConnected = error instanceof Error && ['JIRA_NOT_CONNECTED', 'JIRA_REAUTH_REQUIRED'].includes(error.message);
        const conflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        response.status(notConnected ? 409 : conflict ? 409 : 502).json({ error: {
          code: notConnected ? 'JIRA_REAUTH_REQUIRED' : conflict ? 'JIRA_ISSUE_EXISTS' : 'JIRA_ISSUE_CREATE_FAILED',
          message: notConnected ? 'Reconnect Jira before creating issues.' : conflict ? 'A Jira issue is already linked to this finding.' : 'Jira could not create an issue. Check the integration and try again.'
        } });
      }
    }));
  }

  if (dependencies.activityRepository) {
    app.get('/api/notifications', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const parsed = paginationSchema.safeParse(request.query);
      if (!parsed.success) { sendValidationError(response, parsed.error); return; }
      const result = await dependencies.activityRepository!.listNotifications(
        user.profileId, (parsed.data.page - 1) * parsed.data.pageSize, parsed.data.pageSize
      );
      response.json({ data: { ...result, page: parsed.data.page, pageSize: parsed.data.pageSize } });
    }));

    app.patch('/api/notifications/:notificationId/read', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const notificationId = idSchema.safeParse(request.params.notificationId);
      if (!notificationId.success) { sendValidationError(response, notificationId.error); return; }
      if (!await dependencies.activityRepository!.markNotificationRead(user.profileId, notificationId.data)) {
        response.status(404).json({ error: { code: 'NOTIFICATION_NOT_FOUND', message: 'The notification was not found.' } });
        return;
      }
      response.status(204).end();
    }));

    app.post('/api/notifications/read-all', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      response.json({ data: { updated: await dependencies.activityRepository!.markAllNotificationsRead(user.profileId) } });
    }));

    app.get('/api/activity', asyncHandler(async (request, response) => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const parsed = paginationSchema.safeParse(request.query);
      if (!parsed.success) { sendValidationError(response, parsed.error); return; }
      const result = await dependencies.activityRepository!.listActivity(
        user.profileId, (parsed.data.page - 1) * parsed.data.pageSize, parsed.data.pageSize
      );
      response.json({ data: { ...result, page: parsed.data.page, pageSize: parsed.data.pageSize } });
    }));
  }

  if (dependencies.reportRepository) {
    const reportQuery = z.object({ projectId: idSchema.optional() }).strict();
    const exportFindings = async (request: Request, response: Response, format: 'csv' | 'pdf') => {
      const user = requireAuthContext(request, response);
      if (!user) return;
      const parsed = reportQuery.safeParse(request.query);
      if (!parsed.success) { sendValidationError(response, parsed.error); return; }
      const rows = await dependencies.reportRepository!.listFindings(user.profileId, parsed.data.projectId, 5000);
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('Content-Disposition', `attachment; filename="accesslens-findings.${format}"`);
      if (format === 'csv') response.type('text/csv; charset=utf-8').send(findingsCsv(rows));
      else response.type('application/pdf').send(findingsPdf(rows));
    };
    app.get('/api/reports/findings.csv', asyncHandler(async (request, response) => exportFindings(request, response, 'csv')));
    app.get('/api/reports/findings.pdf', asyncHandler(async (request, response) => exportFindings(request, response, 'pdf')));
  }

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof ApiError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message }
      });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      response.status(409).json({
        error: { code: 'CONFLICT', message: 'A record with the same unique value already exists.' }
      });
      return;
    }

    console.error('Unhandled API request error.', {
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' }
    });
  };

  app.use((request, response) => {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${request.path}.` }
    });
  });
  app.use(errorHandler);

  return app;
}
