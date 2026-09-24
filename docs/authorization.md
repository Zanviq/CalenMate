# Authorization (former RLS policies)

The Supabase version relied on Row Level Security (`user_id = auth.uid()`) on every table.
The self-hosted version has no RLS. The backend connects with a single database role,
so **every query filters by the logged-in user's id** instead.

## How it works

1. `POST /api/auth/login` or `/register` issues a JWT (`sub` = user id) in the httpOnly cookie
   `calenmate_session` (7 days, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`).
2. `authMiddleware` (`backend/src/middleware/auth.ts`) verifies the JWT and sets `req.userId`.
3. Each route adds `user_id = req.userId` to its `WHERE` clause. Rows owned by another user
   look the same as rows that don't exist (404 / empty list).

## Policy mapping

| Table | Former RLS policy | Where it is enforced now |
|---|---|---|
| `users` (was `profiles`) | select/update own row (`id = auth.uid()`) | `routes/auth.ts` `/me`, `routes/settings.ts`: `WHERE id = req.userId` |
| `reminders` | select/insert/update/delete own rows | `services/reminders.ts` `ownedBy()` / `getOwnedReminder()`; list/tag queries in `routes/reminders.ts`, `summary.ts`, `insights.ts`, `chat.ts` |
| `reminder_notes` | select/insert/update own rows | `routes/reminder-notes.ts`: parent reminder ownership check + `user_id` filter |
| `chat_messages` | select/insert/update/delete own rows | `routes/chat.ts`: `user_id` filter on history, execute, cancel, delete |
| `user_instructions` | 4 policies `auth.uid() = user_id` (select/insert/update/delete) | `routes/instructions.ts` `ownedBy()`; `chat.ts` save/delete actions |
| `todo_time_log` | select/insert/update own rows | `routes/focus.ts` `activeFocusFor()` / `ownLog`; `insights.ts` |
| `events` (new; replaces the external calendar) | — (access was limited by the user's OAuth token) | `services/events.ts`: every function takes `userId` |
| `task_lists` (new; replaces external task lists) | — (access was limited by the user's OAuth token) | `services/task-lists.ts`: every function takes `userId` |

## Additional checks

- Foreign keys that point at other rows are checked against the same user before writing:
  a ToDo's `list_id` (`resolveListId`) and `linked_event_id` (`linkReminderEvent`).
- Ids that are not UUIDs are rejected before querying (`isUuid`), so malformed ids return 404.
- `password_hash` is removed from every user object sent to the client (`toPublicUser`).
