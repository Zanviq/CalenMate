import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { supabaseAdmin } from '../services/supabase';

const router = Router();

router.use(authMiddleware);

const instructionSchema = z.object({
  content: z.string().min(1, '내용은 필수입니다').max(2000),
});

// GET / - List all instructions
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_instructions')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch instructions';
    res.status(500).json({ error: message });
  }
});

// POST / - Create instruction
router.post('/', validateBody(instructionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { content } = req.body;

    const { data, error } = await supabaseAdmin
      .from('user_instructions')
      .insert({ user_id: req.userId, content })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create instruction';
    res.status(500).json({ error: message });
  }
});

// PUT /:id - Update instruction
router.put('/:id', validateBody(instructionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { content } = req.body;

    const { data, error } = await supabaseAdmin
      .from('user_instructions')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update instruction';
    res.status(500).json({ error: message });
  }
});

// DELETE /:id - Delete instruction
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabaseAdmin
      .from('user_instructions')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId);

    if (error) throw error;
    res.json({ message: 'Instruction deleted successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete instruction';
    res.status(500).json({ error: message });
  }
});

export default router;
