export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
  is_completed: boolean;
  notify: boolean;
  notify_at: string | null;
  color: string | null;
  google_task_id: string | null;
  google_list_id: string | null;
  created_at: string;
  updated_at: string;
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
    | 'save_instruction' | 'delete_instruction';
  data: Record<string, unknown>;
}

export interface AIResponse {
  actions: AIAction[];
  response: string;
}
