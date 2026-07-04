import { createClient } from '../supabase/client';

/**
 * Updates the user profile to record that terms and privacy policy were accepted.
 */
export async function updateConsent(userId: string, version: string = 'v1.0') {
  const supabase = createClient();
  const now = new Date().toISOString();
  return supabase
    .from('profiles')
    .update({
      terms_accepted: true,
      privacy_accepted: true,
      terms_accepted_at: now,
      privacy_accepted_at: now,
      consent_version: version,
    })
    .eq('user_id', userId);
}

/**
 * Clears the user's consent flags and timestamps to revoke consent.
 */
export async function revokeConsent(userId: string) {
  const supabase = createClient();
  return supabase
    .from('profiles')
    .update({
      terms_accepted: false,
      privacy_accepted: false,
      terms_accepted_at: null,
      privacy_accepted_at: null,
      consent_version: null,
    })
    .eq('user_id', userId);
}
