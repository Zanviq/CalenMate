import { and, asc, desc, eq } from 'drizzle-orm';
import { db, type Db } from '../db';
import { taskLists } from '../db/schema';
import { isUuid } from './events';

export const DEFAULT_LIST_ALIAS = '@default';
export const DEFAULT_LIST_TITLE = '내 할 일';

type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export async function createDefaultList(userId: string, executor: Executor = db) {
  const [list] = await executor
    .insert(taskLists)
    .values({ user_id: userId, title: DEFAULT_LIST_TITLE, is_default: true })
    .returning();
  return list;
}

export async function getTaskLists(userId: string) {
  const rows = await db
    .select({ id: taskLists.id, title: taskLists.title })
    .from(taskLists)
    .where(eq(taskLists.user_id, userId))
    .orderBy(desc(taskLists.is_default), asc(taskLists.created_at));
  return rows;
}

/**
 * Resolve a list id coming from the client or the AI.
 * '@default' (or empty) maps to the user's default list, which is created on
 * demand if missing. Unknown ids fall back to the default list as well.
 */
export async function resolveListId(userId: string, listId?: string | null): Promise<string> {
  if (listId && listId !== DEFAULT_LIST_ALIAS && isUuid(listId)) {
    const [owned] = await db
      .select({ id: taskLists.id })
      .from(taskLists)
      .where(and(eq(taskLists.id, listId), eq(taskLists.user_id, userId)))
      .limit(1);
    if (owned) return owned.id;
  }

  const [existing] = await db
    .select({ id: taskLists.id })
    .from(taskLists)
    .where(and(eq(taskLists.user_id, userId), eq(taskLists.is_default, true)))
    .limit(1);
  if (existing) return existing.id;

  return (await createDefaultList(userId)).id;
}

export async function createTaskList(userId: string, title: string) {
  const [list] = await db
    .insert(taskLists)
    .values({ user_id: userId, title })
    .returning({ id: taskLists.id, title: taskLists.title });
  return list;
}

export async function updateTaskList(userId: string, listId: string, title: string) {
  if (!isUuid(listId)) return null;
  const [list] = await db
    .update(taskLists)
    .set({ title })
    .where(and(eq(taskLists.id, listId), eq(taskLists.user_id, userId)))
    .returning({ id: taskLists.id, title: taskLists.title });
  return list ?? null;
}

/** Deletes a list and (via FK cascade) its ToDos. The default list cannot be deleted. */
export async function deleteTaskList(userId: string, listId: string): Promise<'deleted' | 'not_found' | 'default'> {
  if (!isUuid(listId)) return 'not_found';
  const [list] = await db
    .select({ is_default: taskLists.is_default })
    .from(taskLists)
    .where(and(eq(taskLists.id, listId), eq(taskLists.user_id, userId)))
    .limit(1);
  if (!list) return 'not_found';
  if (list.is_default) return 'default';
  await db.delete(taskLists).where(and(eq(taskLists.id, listId), eq(taskLists.user_id, userId)));
  return 'deleted';
}
