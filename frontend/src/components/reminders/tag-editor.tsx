'use client';

import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface TagEditorProps {
  tags: string[];
  suggestions?: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

function normalize(raw: string): string {
  // Strip leading "#", trim whitespace, drop commas (used as wire separator).
  return raw.replace(/^#+/, '').replace(/,/g, '').trim();
}

export function TagEditor({ tags, suggestions, onChange, disabled }: TagEditorProps) {
  const [draft, setDraft] = useState('');

  const filteredSuggestions = useMemo(() => {
    if (!suggestions) return [];
    const normDraft = normalize(draft).toLowerCase();
    return suggestions
      .filter((s) => !tags.includes(s))
      .filter((s) => !normDraft || s.toLowerCase().includes(normDraft))
      .slice(0, 8);
  }, [suggestions, draft, tags]);

  const commit = (raw: string) => {
    const tag = normalize(raw);
    if (!tag) return;
    if (tag.length > 50) return;
    if (tags.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...tags, tag]);
    setDraft('');
  };

  const remove = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">태그</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            #{tag}
            {!disabled && (
              <button
                type="button"
                aria-label={`${tag} 태그 제거`}
                onClick={() => remove(tag)}
                className="text-zinc-400 transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit(draft);
            } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
              remove(tags[tags.length - 1]);
            }
          }}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          disabled={disabled}
          placeholder={tags.length === 0 ? '태그 추가 (Enter로 등록)' : ''}
          className="h-7 min-w-[8rem] flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
        />
      </div>

      {filteredSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">추천:</span>
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
              disabled={disabled}
              className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-muted dark:border-zinc-800 dark:text-zinc-400"
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
