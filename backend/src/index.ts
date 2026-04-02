import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/auth';
import calendarRoutes from './routes/calendar';
import reminderRoutes from './routes/reminders';
import reminderNotesRoutes from './routes/reminder-notes';
import taskListRoutes from './routes/task-lists';
import chatRoutes from './routes/chat';
import summaryRoutes from './routes/summary';
import instructionRoutes from './routes/instructions';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/reminders', reminderNotesRoutes);
app.use('/api/task-lists', taskListRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/instructions', instructionRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
