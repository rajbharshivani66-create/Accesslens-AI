import type { AccessibilityScanner, ScanRepository, ScanSummary } from './scan.types.js';

const maxPathLength = 2048;

export class ScanService {
  constructor(
    private readonly repository: ScanRepository,
    private readonly scanner: AccessibilityScanner,
    readonly maxPageCount: number
  ) {}

  async startScan(
    userId: string,
    projectId: string,
    paths: string[] = ['/']
  ): Promise<ScanSummary | null> {
    const normalizedPaths = [...new Set(paths.map((path) => path.trim()))];
    if (
      normalizedPaths.length === 0 ||
      normalizedPaths.length > this.maxPageCount ||
      normalizedPaths.some((path) => !path.startsWith('/') || path.length > maxPathLength)
    ) {
      throw new Error('The scan page list is invalid.');
    }

    return this.repository.createScan(userId, projectId, normalizedPaths);
  }

  async retryScan(userId: string, scanId: string): Promise<ScanSummary | null> {
    const existing = await this.repository.getScan(userId, scanId);
    if (!existing) return null;
    if (existing.status !== 'FAILED') return null;
    return this.startScan(userId, existing.projectId, existing.paths);
  }

  async processNextQueuedScan(): Promise<boolean> {
    const scan = await this.repository.claimNextScan();
    if (!scan) return false;
    try {
      const result = await this.scanner.scan(scan.projectUrl, scan.paths);
      await this.repository.completeScan(scan.id, result);
    } catch {
      await this.repository.failScan(
        scan.id,
        'The scan could not be completed because the target was unsafe or the browser scan failed.',
        Math.max(0, Date.now() - scan.startedAt.getTime())
      );
    }
    return true;
  }

  startWorker(pollIntervalMs = 1000, concurrency = 1): () => Promise<void> {
    let stopping = false;
    const worker = async () => {
      while (!stopping) {
        let processed = false;
        try {
          processed = await this.processNextQueuedScan();
        } catch (error) {
          console.error('Scan worker could not claim a queued scan.', {
            errorName: error instanceof Error ? error.name : 'UnknownError'
          });
        }
        if (!processed && !stopping) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      }
    };
    const activeWorkers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
    return async () => {
      stopping = true;
      await Promise.all(activeWorkers);
    };
  }

  listProjectScans(userId: string, projectId: string, skip: number, take: number) {
    return this.repository.listProjectScans(userId, projectId, skip, take);
  }

  listScans(userId: string, skip: number, take: number) {
    return this.repository.listScans(userId, skip, take);
  }

  getScan(userId: string, scanId: string) {
    return this.repository.getScan(userId, scanId);
  }
}
