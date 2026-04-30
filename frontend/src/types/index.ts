export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ReminderStatus = 'not_started' | 'in_progress' | 'completed';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  order: number;
}

export interface LinkedEventInfo {
  id: string;
  summary: string | null;
  start: string | null;
  end: string | null;
  all_day: boolean;
}

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
  status: ReminderStatus;
  is_completed: boolean;
  started_at: string | null;
  completed_at: string | null;
  linked_event_id: string | null;
  auto_complete_on_event_end: boolean;
  checklist: ChecklistItem[];
  tags: string[];
  notify: boolean;
  notify_at: string | null;
  color: string | null;
  google_task_id: string | null;
  google_list_id: string | null;
  created_at: string;
  updated_at: string;
  linked_event?: LinkedEventInfo | null;
}

export interface TaskList {
  id: string;
  title: string;
}

export interface ReminderNote {
  id: string;
  reminder_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  context: 'home' | 'calendar' | 'reminder';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  color?: string;
  allDay?: boolean;
}

export interface UserInstruction {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface AIAction {
  type:
    | 'create_event' | 'update_event' | 'delete_event'
    | 'create_reminder' | 'update_reminder' | 'delete_reminder' | 'complete_reminder'
    | 'set_reminder_status' | 'link_reminder_event'
    | 'save_instruction' | 'delete_instruction'
    | 'query_events';
  data: Record<string, unknown>;
}

export interface AIResponse {
  actions: AIAction[];
  response: string;
  requiresConfirmation?: boolean;
}
