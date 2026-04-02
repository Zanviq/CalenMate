'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, List } from 'lucide-react';
import api from '@/lib/api';
import type { TaskList } from '@/types';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface TaskListSelectorProps {
  value: string;
  onChange: (listId: string) => void;
}

export function TaskListSelector({ value, onChange }: TaskListSelectorProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');

  const { data: lists = [] } = useQuery<TaskList[]>({
    queryKey: ['task-lists'],
    queryFn: async () => {
      const res = await api.get('/api/task-lists');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => api.post('/api/task-lists', { title }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['task-lists'] });
      const newList = res.data as TaskList;
      onChange(newList.id);
      setCreating(false);
      setNewListTitle('');
      setOpen(false);
    },
  });

  const selectedList = lists.find((l) => l.id === value);
  const displayName = selectedList?.title || '기본 목록';

  const handleCreate = () => {
    const title = newListTitle.trim();
    if (!title) return;
    createMutation.mutate(title);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-sm font-normal transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
        <List className="h-3.5 w-3.5 text-zinc-500" />
        {displayName}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <div className="max-h-60 overflow-y-auto">
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                list.id === value
                  ? 'bg-zinc-100 font-medium dark:bg-zinc-800'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
              }`}
              onClick={() => {
                onChange(list.id);
                setOpen(false);
              }}
            >
              <List className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="truncate">{list.title}</span>
            </button>
          ))}
        </div>

        <div className="mt-1 border-t pt-1">
          {creating ? (
            <div className="flex gap-1 px-1 py-1">
              <Input
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                placeholder="목록 이름"
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
              />
              <button
                type="button"
                className="h-7 shrink-0 rounded-md bg-zinc-900 px-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                onClick={handleCreate}
                disabled={!newListTitle.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? '...' : '추가'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              새 목록 만들기
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
