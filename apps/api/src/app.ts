import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Prisma } from '@accesslens-ai/database';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AccessTokenVerifier, AuthContext } from './modules/auth/auth.types.js';
import type { ProjectRepository } from './modules/projects/project.repository.js';
import { asyncHandler } from './utils/async-handler.js';

export interface AppDependencies {
  repository: ProjectRepository;
  verifyAccessToken: AccessTokenVerifier;
  frontendUrl?: string;
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
  description: z.string().trim().max(500).optional()
});

const projectUpdateSchema = projectSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one project field to update.'
  });

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
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
      ...(fullName ? { fullName } : {})
    };
  };
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const allowedOrigin = dependencies.frontendUrl ?? 'http://localhost:3000';

  app.disable('x-powered-by');
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

  app.use('/api', createAuthMiddleware(dependencies.repository, dependencies.verifyAccessToken));

  app.get('/api/auth/me', (request, response) => {
    const user = requireAuthContext(request, response);
    if (!user) return;
    response.json({ data: { id: user.id, email: user.email, profileId: user.profileId } });
  });

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

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
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
