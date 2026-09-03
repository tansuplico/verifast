-- The existing `type` column (submission | renewal | expiration) describes
-- the temporal nature of a deadline, not what kind of item it is. The new
-- Deadlines and Reminders screen needs a separate "what is this" category
-- (Document / Checklist / Payment) for its badges - e.g. "Pay Tuition
-- Balance" isn't a document at all, and "Register for Classes" is a
-- checklist item with no document behind it.
create type reminder_category as enum ('document', 'checklist', 'payment');

-- Backfill default: any reminder already linked to a document_id is clearly
-- a document reminder; everything else defaults to checklist, since that's
-- the safest generic bucket (existing rows predate this concept, so this is
-- a best-effort guess, not a claim about what they "really" are).
alter table public.reminders
  add column category reminder_category not null default 'checklist';

update public.reminders
  set category = 'document'
  where document_id is not null;

-- Going forward, new document-linked reminders should be inserted with an
-- explicit category rather than relying on this default.