-- Phase 1 ToDo enhancements
-- Adds: F1 multi-state status, F2 calendar event link, F3 checklist
-- Reference: documents/feature/todo-enhancements.md

-- F1: Multi-state status (not_started / in_progress / completed) + transition timestamps
alter table public.reminders
  add column if not exists status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed'));

alter table public.reminders
  add column if not exists started_at timestamptz;

alter table public.reminders
  add column if not exists completed_at timestamptz;

-- F2: Calendar event link (one-way link to a Google Calendar event)
alter table public.reminders
  add column if not exists linked_event_id text;

alter table public.reminders
  add column if not exists auto_complete_on_event_end boolean default false;

-- F3: Inline checklist (JSONB: [{ id, text, done, order }])
alter table public.reminders
  add column if not exists checklist jsonb default '[]'::jsonb;

-- Backfill: derive status from the legacy is_completed boolean for existing rows.
-- Rows that were already completed get status='completed' and completed_at=updated_at.
update public.reminders
   set status = 'completed',
       completed_at = coalesce(completed_at, updated_at)
 where is_completed = true
   and status = 'not_started';

-- Indexes for the new query patterns
create index if not exists idx_reminders_status
  on public.reminders(user_id, status);

create index if not exists idx_reminders_linked_event
  on public.reminders(user_id, linked_event_id)
  where linked_event_id is not null;
