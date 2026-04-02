import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  getTaskLists,
  createTaskList,
  updateTaskList,
  deleteTaskList,
} from '../services/google-tasks';

const router = Router();

router.use(authMiddleware);

const taskListSchema = z.object({
  title: z.string().min(1, '목록 이름은 필수입니다').max(200),
});

// GET / - List all task lists
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const lists = await getTaskLists(req.userId!);
    res.json(lists);
  } catch (err) {
    console.error('Failed to fetch task lists:', err);
    if (err instanceof Error && err.message.includes('insufficient')) {
      res.status(403).json({ error: 'Google Tasks 권한이 없습니다. 다시 로그인해주세요.' });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch task lists' });
  }
});

// POST / - Create task list
router.post('/', validateBody(taskListSchema), async (req: AuthRequest, res: Response) => {
  try {
    const list = await createTaskList(req.userId!, req.body.title);
    res.status(201).json(list);
  } catch (err) {
    console.error('Failed to create task list:', err);
    res.status(500).json({ error: 'Failed to create task list' });
  }
});

// PATCH /:listId - Rename task list
router.patch('/:listId', validateBody(taskListSchema), async (req: AuthRequest, res: Response) => {
  try {
    const listId = req.params.listId as string;
    const list = await updateTaskList(req.userId!, listId, req.body.title);
    res.json(list);
  } catch (err) {
    console.error('Failed to update task list:', err);
    res.status(500).json({ error: 'Failed to update task list' });
  }
});

// DELETE /:listId - Delete task list
router.delete('/:listId', async (req: AuthRequest, res: Response) => {
  try {
    const listId = req.params.listId as string;
    await deleteTaskList(req.userId!, listId);
    res.json({ message: 'Task list deleted successfully' });
  } catch (err) {
    console.error('Failed to delete task list:', err);
    res.status(500).json({ error: 'Failed to delete task list' });
  }
});

export default router;
