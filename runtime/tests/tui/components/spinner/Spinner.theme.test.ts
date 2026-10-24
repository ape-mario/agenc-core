import { describe, expect, it } from 'vitest';

import { SPINNER_AGENT_THEME_COLOR } from '../../../../src/tui/components/spinner/spinnerTheme.js';

describe('running local agents spinner color', () => {
  it('uses a current AgenC theme token', () => {
    expect(SPINNER_AGENT_THEME_COLOR).toBe('suggestion');
    expect(SPINNER_AGENT_THEME_COLOR).not.toContain('SUBAGENTS');
  });
});
