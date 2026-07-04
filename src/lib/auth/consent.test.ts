import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: {
    updatePayload: null as any,
    eqVal: null as any,
    lastTable: null as any,
  },
}));

vi.mock('@/lib/supabase/client', () => {
  return {
    createClient: () => ({
      from: (table: string) => {
        h.state.lastTable = table;
        return {
          update: (payload: any) => {
            h.state.updatePayload = payload;
            return {
              eq: (col: string, val: any) => {
                h.state.eqVal = val;
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      },
    }),
  };
});

import { updateConsent, revokeConsent } from './consent';

describe('consent helpers', () => {
  beforeEach(() => {
    h.state.updatePayload = null;
    h.state.eqVal = null;
    h.state.lastTable = null;
    vi.clearAllMocks();
  });

  describe('updateConsent', () => {
    it('updates terms and privacy as true on profiles table', async () => {
      await updateConsent('user-123', 'v1.0');

      expect(h.state.lastTable).toBe('profiles');
      expect(h.state.eqVal).toBe('user-123');
      expect(h.state.updatePayload).toEqual({
        terms_accepted: true,
        privacy_accepted: true,
        terms_accepted_at: expect.any(String),
        privacy_accepted_at: expect.any(String),
        consent_version: 'v1.0',
      });
    });
  });

  describe('revokeConsent', () => {
    it('sets terms and privacy as false and nulls columns on profiles table', async () => {
      await revokeConsent('user-456');

      expect(h.state.lastTable).toBe('profiles');
      expect(h.state.eqVal).toBe('user-456');
      expect(h.state.updatePayload).toEqual({
        terms_accepted: false,
        privacy_accepted: false,
        terms_accepted_at: null,
        privacy_accepted_at: null,
        consent_version: null,
      });
    });
  });
});
