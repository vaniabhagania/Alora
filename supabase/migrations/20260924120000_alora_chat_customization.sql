/*
# ALORA Chat Customization

Adds a single column so the user can customize how Alora Chat talks to them —
free-text instructions blended into the system prompt sent to the LLM
(tone, boundaries, what to focus on, how formal/casual to be, etc).

## Changes

- `settings.custom_chat_instructions` (text, default '') — user-editable,
  read and injected server-side by the alora-chat Edge Function. Never
  sent anywhere except that function's own request to the LLM provider.

No RLS changes needed — `settings` already has owner-scoped SELECT/INSERT/
UPDATE/DELETE policies from the v1 migration; this just adds a column.
*/

ALTER TABLE settings ADD COLUMN IF NOT EXISTS custom_chat_instructions text NOT NULL DEFAULT '';
