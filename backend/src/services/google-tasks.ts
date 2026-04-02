import { google, tasks_v1 } from 'googleapis';
import { getOAuth2Client } from './google-auth';

export async function getTasksClient(userId: string): Promise<tasks_v1.Tasks> {
  const oauth2Client = await getOAuth2Client(userId);
  return google.tasks({ version: 'v1', auth: oauth2Client });
}

function normalizeDueDate(dateStr: string): string {
  // Google Tasks requires RFC 3339 midnight UTC: "YYYY-MM-DDT00:00:00.000Z"
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T00:00:00.000Z`;
}

// ── Task Lists ──

export async function getTaskLists(userId: string) {
  const tasks = await getTasksClient(userId);
  const res = await tasks.tasklists.list({ maxResults: 100 });
  return (res.data.items || []).map((l) => ({
    id: l.id!,
    title: l.title || '',
  }));
}

export async function createTaskList(userId: string, title: string) {
  const tasks = await getTasksClient(userId);
  const res = await tasks.tasklists.insert({ requestBody: { title } });
  return { id: res.data.id!, title: res.data.title || '' };
}

export async function updateTaskList(userId: string, listId: string, title: string) {
  const tasks = await getTasksClient(userId);
  const res = await tasks.tasklists.patch({
    tasklist: listId,
    requestBody: { title },
  });
  return { id: res.data.id!, title: res.data.title || '' };
}

export async function deleteTaskList(userId: string, listId: string) {
  const tasks = await getTasksClient(userId);
  await tasks.tasklists.delete({ tasklist: listId });
}

// ── Tasks ──

export async function getTasks(userId: string, listId: string, showCompleted = true) {
  const tasks = await getTasksClient(userId);
  const res = await tasks.tasks.list({
    tasklist: listId,
    maxResults: 100,
    showCompleted,
    showHidden: showCompleted,
  });
  return res.data.items || [];
}

export async function getTask(userId: string, listId: string, taskId: string) {
  const tasks = await getTasksClient(userId);
  const res = await tasks.tasks.get({ tasklist: listId, task: taskId });
  return res.data;
}

export async function createGoogleTask(
  userId: string,
  listId: string,
  data: { title: string; notes?: string; due?: string },
) {
  const tasks = await getTasksClient(userId);
  const res = await tasks.tasks.insert({
    tasklist: listId,
    requestBody: {
      title: data.title,
      notes: data.notes || undefined,
      due: data.due ? normalizeDueDate(data.due) : undefined,
      status: 'needsAction',
    },
  });
  return res.data;
}

export async function updateGoogleTask(
  userId: string,
  listId: string,
  taskId: string,
  updates: { title?: string; notes?: string; due?: string | null; status?: string },
) {
  const tasks = await getTasksClient(userId);
  const body: tasks_v1.Schema$Task = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.notes !== undefined) body.notes = updates.notes;
  if (updates.due !== undefined) body.due = updates.due ? normalizeDueDate(updates.due) : undefined;
  if (updates.status !== undefined) body.status = updates.status;

  const res = await tasks.tasks.patch({
    tasklist: listId,
    task: taskId,
    requestBody: body,
  });
  return res.data;
}

export async function deleteGoogleTask(userId: string, listId: string, taskId: string) {
  const tasks = await getTasksClient(userId);
  await tasks.tasks.delete({ tasklist: listId, task: taskId });
}
