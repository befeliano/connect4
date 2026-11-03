import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

describe('reference reproduction (Assignment 3 report)', () => {
  it('reproduces every reference number', { timeout: 300_000 }, async () => {
    const run = promisify(execFile);
    const { stdout } = await run(process.execPath, ['--import', 'tsx', 'scripts/reference.ts'], {
      maxBuffer: 10_000_000,
    }).catch((e: { stdout?: string }) => ({ stdout: e.stdout ?? String(e) }));
    expect(stdout).not.toMatch(/FAIL/);
    expect(stdout).toContain('ALL REFERENCE NUMBERS MATCH');
    expect(stdout).toContain('3,174,822 states');
    expect(stdout).toContain('4,939,081 transitions');
  });
});
