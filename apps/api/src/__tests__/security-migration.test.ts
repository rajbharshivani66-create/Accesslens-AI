import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Jira OAuth state database boundary', () => {
  it('enables default-deny RLS on state and temporary encrypted OAuth credentials', async () => {
    const migrationPath = fileURLToPath(new URL(
      '../../../../packages/database/prisma/migrations/20261107233000_jira_oauth_state_rls/migration.sql',
      import.meta.url
    ));
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/ALTER\s+TABLE\s+"JiraOAuthState"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY\b/i);
  });
});
