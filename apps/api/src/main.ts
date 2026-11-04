import { resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const port = Number(process.env.PORT ?? 4000);

async function start(): Promise<void> {
  const [{ connectDatabase, disconnectDatabase, prisma }, { createApp, createSupabaseTokenVerifier }, { PrismaProjectRepository }] =
    await Promise.all([
      import('@accesslens-ai/database'),
      import('./app.js'),
      import('./services/prisma-project.repository.js')
    ]);

  const app = createApp({
    repository: new PrismaProjectRepository(prisma),
    verifyAccessToken: createSupabaseTokenVerifier(),
    frontendUrl: process.env.FRONTEND_URL
  });
  await connectDatabase();

  const server = app.listen(port, () => {
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

      await disconnectDatabase();
    });
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void start().catch((error: unknown) => {
  console.error('AccessLens API failed to start.', {
    errorName: error instanceof Error ? error.name : 'UnknownError'
  });
  process.exitCode = 1;
});
