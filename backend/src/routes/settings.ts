import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { supabaseAdmin } from '../services/supabase';

const router = Router();

router.use(authMiddleware);

const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  defaultCalendarView: z.enum(['dayGridMonth', 'timeGridWeek', 'timeGridDay']).optional(),
  defaultReminderPriority: z.enum(['low', 'medium', 'high']).optional(),
  language: z.enum(['ko', 'en']).optional(),
});

// GET / - Get user settings
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('settings')
      .eq('id', req.userId)
      .single();

    if (error || !profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    // Return settings with defaults
    const defaults = {
      theme: 'system',
      defaultCalendarView: 'dayGridMonth',
      defaultReminderPriority: 'medium',
      language: 'ko',
    };

    res.json({ ...defaults, ...(profile.settings || {}) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PATCH / - Update user settings (partial, atomic merge via PostgreSQL || operator)
router.patch('/', validateBody(settingsSchema), async (req: AuthRequest, res: Response) => {
  try {
    // Atomic merge: COALESCE(settings, '{}') || new_values
    // This avoids read-then-write race conditions
    const { data, error } = await supabaseAdmin.rpc('merge_user_settings', {
      p_user_id: req.userId,
      p_settings: req.body,
    });

    // Fallback if RPC doesn't exist: use read-then-write
    if (error?.code === '42883') {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('settings')
        .eq('id', req.userId)
        .single();

      if (!profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }

      const merged = { ...(profile.settings || {}), ...req.body };

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          settings: merged,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.userId)
        .select('settings')
        .single();

      if (updateError) {
        res.status(500).json({ error: 'Failed to update settings' });
        return;
      }

      const defaults = {
        theme: 'system',
        defaultCalendarView: 'dayGridMonth',
        defaultReminderPriority: 'medium',
        language: 'ko',
      };

      res.json({ ...defaults, ...(updated.settings || {}) });
      return;
    }

    if (error) {
      res.status(500).json({ error: 'Failed to update settings' });
      return;
    }

    const defaults = {
      theme: 'system',
      defaultCalendarView: 'dayGridMonth',
      defaultReminderPriority: 'medium',
      language: 'ko',
    };

    res.json({ ...defaults, ...(data || {}) });
  } catch {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
