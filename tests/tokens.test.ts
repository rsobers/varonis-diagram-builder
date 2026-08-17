import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOKENS } from '../src/tokens';

/**
 * The style guide (docs/varonis-diagram-style-guide.md, section 11) is the
 * source of truth. If src/tokens.ts drifts from it, this test fails so the
 * mismatch is caught before it silently reaches the renderer.
 */
describe('tokens', () => {
  it('matches the JSON block in section 11 of the style guide', () => {
    const guide = readFileSync(
      join(__dirname, '..', 'docs', 'varonis-diagram-style-guide.md'),
      'utf8'
    );
    // The token block is the only ```json fence in the file, under section 11.
    const match = guide.match(/```json\s*\n([\s\S]*?)\n```/);
    expect(match, 'section 11 JSON block not found in style guide').toBeTruthy();
    const parsed = JSON.parse(match![1]!);
    expect(TOKENS).toEqual(parsed);
  });
});
