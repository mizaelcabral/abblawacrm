-- Migration 068: Add UNIQUE constraint on conversations(account_id, contact_id)
--
-- Problem: findOrCreateConversation used .single() which throws PGRST116 for
-- both 0 rows AND >=2 rows. Without this constraint, race conditions (two
-- simultaneous inbound messages) could silently create duplicate conversations
-- for the same contact. The constraint makes duplicate inserts fail with
-- error code 23505 (unique_violation), which the retry path in
-- findOrCreateConversation handles gracefully.
--
-- Safety: Before adding the constraint, we consolidate any existing duplicates
-- by re-parenting their messages to the oldest surviving conversation, then
-- deleting the newer duplicates.

-- Step 1: Re-parent messages from duplicate conversations to the oldest one.
-- This preserves all message history under a single conversation row.
DO $$
DECLARE
  dup RECORD;
  oldest_id UUID;
BEGIN
  FOR dup IN
    SELECT account_id, contact_id
    FROM conversations
    GROUP BY account_id, contact_id
    HAVING COUNT(*) > 1
  LOOP
    -- Find the oldest conversation for this (account, contact) pair
    SELECT id INTO oldest_id
    FROM conversations
    WHERE account_id = dup.account_id
      AND contact_id = dup.contact_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- Move all messages from newer duplicates to the oldest conversation
    UPDATE messages
    SET conversation_id = oldest_id
    WHERE conversation_id IN (
      SELECT id FROM conversations
      WHERE account_id = dup.account_id
        AND contact_id = dup.contact_id
        AND id <> oldest_id
    );

    -- Delete the now-empty duplicate conversations
    DELETE FROM conversations
    WHERE account_id = dup.account_id
      AND contact_id = dup.contact_id
      AND id <> oldest_id;
  END LOOP;
END $$;

-- Step 2: Add the unique constraint so future races are caught at DB level.
ALTER TABLE conversations
  ADD CONSTRAINT conversations_account_contact_unique
  UNIQUE (account_id, contact_id);
