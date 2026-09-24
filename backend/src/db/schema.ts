import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  date,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import type { ChecklistItem } from '../types';

// Property keys are snake_case on purpose: rows are returned to the frontend
// as-is, so the JSON shape matches the column names the UI already expects.

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull(),
  password_hash: text('password_hash').notNull(),
  display_name: text('display_name').notNull(),
  avatar_url: text('avatar_url'),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}).notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (t) => [
  uniqueIndex('users_username_key').on(sql`lower(${t.username})`),
]);

// Replaces the task lists that used to live in the external task service.
// Every user gets exactly one default list at sign-up (the '@default' alias).
export const taskLists = pgTable('task_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  is_default: boolean('is_default').default(false).notNull(),
  created_at: createdAt(),
}, (t) => [
  index('idx_task_lists_user_id').on(t.user_id),
  uniqueIndex('task_lists_one_default_per_user').on(t.user_id).where(sql`${t.is_default}`),
]);

// Replaces the external calendar. start/end are stored as instants; all-day
// events keep midnight (Asia/Seoul) boundaries with all_day = true.
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  start_at: timestamp('start_at', { withTimezone: true }).notNull(),
  end_at: timestamp('end_at', { withTimezone: true }).notNull(),
  all_day: boolean('all_day').default(false).notNull(),
  color: text('color'),
  reminder_minutes: integer('reminder_minutes'),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (t) => [
  index('idx_events_user_start').on(t.user_id, t.start_at),
]);

export const reminders = pgTable('reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  list_id: uuid('list_id').notNull().references(() => taskLists.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  due_date: date('due_date', { mode: 'string' }),
  priority: text('priority').$type<'low' | 'medium' | 'high'>().default('medium').notNull(),
  status: text('status').$type<'not_started' | 'in_progress' | 'completed'>().default('not_started').notNull(),
  is_completed: boolean('is_completed').default(false).notNull(),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  linked_event_id: uuid('linked_event_id').references(() => events.id, { onDelete: 'set null' }),
  auto_complete_on_event_end: boolean('auto_complete_on_event_end').default(false).notNull(),
  checklist: jsonb('checklist').$type<ChecklistItem[]>().default([]).notNull(),
  tags: text('tags').array().default(sql`'{}'::text[]`).notNull(),
  notify: boolean('notify').default(false).notNull(),
  notify_at: timestamp('notify_at', { withTimezone: true }),
  color: text('color'),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (t) => [
  index('idx_reminders_user_id').on(t.user_id),
  index('idx_reminders_list').on(t.user_id, t.list_id),
  index('idx_reminders_status').on(t.user_id, t.status),
  index('idx_reminders_linked_event').on(t.user_id, t.linked_event_id).where(sql`${t.linked_event_id} is not null`),
  check('reminders_priority_check', sql`${t.priority} in ('low', 'medium', 'high')`),
  check('reminders_status_check', sql`${t.status} in ('not_started', 'in_progress', 'completed')`),
]);

export const reminderNotes = pgTable('reminder_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  reminder_id: uuid('reminder_id').notNull().references(() => reminders.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').default('').notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (t) => [
  uniqueIndex('reminder_notes_reminder_user_key').on(t.reminder_id, t.user_id),
]);

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').$type<'user' | 'assistant'>().notNull(),
  content: text('content').notNull(),
  context: text('context').$type<'home' | 'calendar' | 'reminder'>().default('home').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  created_at: createdAt(),
}, (t) => [
  index('idx_chat_messages_user_created').on(t.user_id, t.created_at),
  check('chat_messages_role_check', sql`${t.role} in ('user', 'assistant')`),
]);

export const userInstructions = pgTable('user_instructions', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (t) => [
  index('idx_user_instructions_user_id').on(t.user_id),
]);

export const todoTimeLog = pgTable('todo_time_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reminder_id: uuid('reminder_id').notNull().references(() => reminders.id, { onDelete: 'cascade' }),
  started_at: timestamp('started_at', { withTimezone: true }).notNull(),
  ended_at: timestamp('ended_at', { withTimezone: true }),
  source: text('source').default('focus_session').notNull(),
  target_minutes: integer('target_minutes'),
  created_at: createdAt(),
}, (t) => [
  index('idx_todo_time_log_user_started').on(t.user_id, t.started_at),
]);

export type UserRow = typeof users.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
