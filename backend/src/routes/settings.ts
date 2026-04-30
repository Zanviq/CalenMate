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

const DEFAULT_SETTINGS = {
  theme: 'system',
  defaultCalendarView: 'dayGridMonth',
  defaultReminderPriority: 'medium',
  language: 'ko',
};

// GET / - Get user settings
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('settings')
      .eq('id', req.userId)
      .maybeSingle();

    if (error) {
      console.error('Settings read failed:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
      return;
    }

    res.json({ ...DEFAULT_SETTINGS, ...((profile?.settings as Record<string, unknown>) || {}) });
  } catch (err) {
    console.error('Settings GET error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PATCH / - Update user settings (partial merge)
router.patch('/', validateBody(settingsSchema), async (req: AuthRequest, res: Response) => {
  try {
    // Read existing settings (auto-create profile row if missing — first-time settings change)
    const { data: profile, error: readError } = await supabaseAdmin
      .from('profiles')
      .select('settings')
      .eq('id', req.userId)
      .maybeSingle();

    if (readError) {
      console.error('Settings read failed:', readError);
      res.status(500).json({ error: 'Failed to read settings' });
      return;
    }

    const merged = { ...(profile?.settings || {}), ...req.body };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ settings: merged, updated_at: new Date().toISOString() })
      .eq('id', req.userId)
      .select('settings')
      .maybeSingle();

    if (updateError) {
      console.error('Settings update failed:', updateError);
      res.status(500).json({ error: 'Failed to update settings' });
      return;
    }

    res.json({ ...DEFAULT_SETTINGS, ...((updated?.settings as Record<string, unknown>) || merged) });
  } catch (err) {
    console.error('Settings PATCH error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
