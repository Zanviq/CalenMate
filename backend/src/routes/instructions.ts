import { Router, Response } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { db } from '../db';
import { userInstructions } from '../db/schema';
import { isUuid } from '../services/events';

const router = Router();

router.use(authMiddleware);

const instructionSchema = z.object({
  content: z.string().min(1, '내용은 필수입니다').max(2000),
});

const ownedBy = (userId: string, id: string) =>
  and(eq(userInstructions.id, id), eq(userInstructions.user_id, userId));

// GET / - List all instructions
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = await db
      .select()
      .from(userInstructions)
      .where(eq(userInstructions.user_id, req.userId!))
      .orderBy(asc(userInstructions.created_at));
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
    const [data] = await db
      .insert(userInstructions)
      .values({ user_id: req.userId!, content })
      .returning();
    res.status(201).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create instruction';
    res.status(500).json({ error: message });
  }
});

// PUT /:id - Update instruction
router.put('/:id', validateBody(instructionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { content } = req.body;

    const [data] = isUuid(id)
      ? await db
        .update(userInstructions)
        .set({ content, updated_at: new Date() })
        .where(ownedBy(req.userId!, id))
        .returning()
      : [];

    if (!data) {
      res.status(404).json({ error: 'Instruction not found' });
      return;
    }
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update instruction';
    res.status(500).json({ error: message });
  }
});

// DELETE /:id - Delete instruction
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    if (isUuid(id)) {
      await db.delete(userInstructions).where(ownedBy(req.userId!, id));
    }
    res.json({ message: 'Instruction deleted successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete instruction';
    res.status(500).json({ error: message });
  }
});

export default router;
