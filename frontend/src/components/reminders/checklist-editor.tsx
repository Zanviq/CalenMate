'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ChecklistItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

interface ChecklistEditorProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  disabled?: boolean;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChecklistEditor({ items, onChange, disabled }: ChecklistEditorProps) {
  const [draft, setDraft] = useState('');

  const sorted = [...items].sort((a, b) => a.order - b.order);
  const total = items.length;
  const done = items.filter((it) => it.done).length;

  const handleToggle = (id: string) => {
    onChange(items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  };

  const handleDelete = (id: string) => {
    onChange(items.filter((it) => it.id !== id));
  };

  const handleEditText = (id: string, text: string) => {
    onChange(items.map((it) => (it.id === id ? { ...it, text } : it)));
  };

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;
    const nextOrder = items.length === 0 ? 0 : Math.max(...items.map((i) => i.order)) + 1;
    onChange([...items, { id: makeId(), text, done: false, order: nextOrder }]);
    setDraft('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">체크리스트</label>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            {done} / {total}
          </span>
        )}
      </div>

      {sorted.length > 0 && (
        <ul className="space-y-1.5">
          {sorted.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              disabled={disabled}
              onToggle={() => handleToggle(item.id)}
              onDelete={() => handleDelete(item.id)}
              onCommitText={(text) => handleEditText(item.id, text)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="새 항목 추가"
          disabled={disabled}
          className="h-8"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={handleAdd}
          disabled={disabled || !draft.trim()}
        >
          <Plus className="h-4 w-4" />
          추가
        </Button>
      </div>
    </div>
  );
}

interface ChecklistRowProps {
  item: ChecklistItem;
  disabled?: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onCommitText: (text: string) => void;
}

function ChecklistRow({ item, disabled, onToggle, onDelete, onCommitText }: ChecklistRowProps) {
  // Sync local edit buffer with the prop without an effect.
  // When item.text changes externally (e.g. AI rewrite), reset the buffer.
  const [text, setText] = useState(item.text);
  const [lastExternalText, setLastExternalText] = useState(item.text);
  if (item.text !== lastExternalText) {
    setLastExternalText(item.text);
    setText(item.text);
  }

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === item.text) return;
    if (!trimmed) {
      // Empty text → treat as delete intent.
      onDelete();
      return;
    }
    onCommitText(trimmed);
  };

  return (
    <li className="group flex items-center gap-2">
      <Checkbox
        checked={item.done}
        onCheckedChange={() => onToggle()}
        disabled={disabled}
      />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={disabled}
        className={`h-8 flex-1 ${item.done ? 'text-muted-foreground line-through' : ''}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-zinc-400 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        onClick={onDelete}
        disabled={disabled}
        aria-label="항목 삭제"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
