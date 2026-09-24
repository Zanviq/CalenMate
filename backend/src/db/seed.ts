import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { db } from './index';
import {
  users,
  taskLists,
  reminders,
  reminderNotes,
  userInstructions,
  chatMessages,
} from './schema';
import { createEvent } from '../services/events';
import { DEFAULT_LIST_TITLE } from '../services/task-lists';

export const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo1234';

// YYYY-MM-DD in Asia/Seoul, offset by N days from today.
function seoulDate(offsetDays: number): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Creates the demo account (demo / demo1234) with sample events, ToDos,
 * a note, an instruction and a short chat exchange. Dates are relative to
 * the day the seed runs so the home screen always has something to show.
 * Skips everything if the demo user already exists.
 */
export async function seedDemoData() {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${DEMO_USERNAME}`)
    .limit(1);
  if (existing) {
    console.log('[seed] demo user already exists, skipping');
    return;
  }

  const [user] = await db
    .insert(users)
    .values({
      username: DEMO_USERNAME,
      password_hash: await bcrypt.hash(DEMO_PASSWORD, 10),
      display_name: '데모 사용자',
    })
    .returning();
  const userId = user.id;

  const [defaultList, studyList] = await db
    .insert(taskLists)
    .values([
      { user_id: userId, title: DEFAULT_LIST_TITLE, is_default: true },
      { user_id: userId, title: '공부' },
    ])
    .returning();

  const today = seoulDate(0);
  const tomorrow = seoulDate(1);

  const standup = await createEvent(userId, {
    title: '주간 스탠드업',
    start: `${today}T09:30:00`,
    end: `${today}T10:00:00`,
    color: '7',
  });
  const review = await createEvent(userId, {
    title: '디자인 리뷰',
    description: '새 캘린더 화면 시안 검토',
    start: `${today}T14:00:00`,
    end: `${today}T15:00:00`,
    color: '3',
  });
  await createEvent(userId, {
    title: '헬스장',
    start: `${tomorrow}T19:00:00`,
    end: `${tomorrow}T20:00:00`,
    color: '2',
  });
  await createEvent(userId, {
    title: '프로젝트 마감',
    start: seoulDate(3),
    end: seoulDate(4),
    color: '11',
  });
  void standup;

  const now = new Date();
  const [reportTodo] = await db
    .insert(reminders)
    .values([
      {
        user_id: userId,
        list_id: defaultList.id,
        title: '주간 보고서 작성',
        description: '이번 주 진행 상황 정리',
        due_date: today,
        priority: 'high',
        tags: ['work'],
        checklist: [
          { id: 'c1', text: '진행 상황 정리', done: true, order: 0 },
          { id: 'c2', text: '다음 주 계획', done: false, order: 1 },
          { id: 'c3', text: '팀장님께 공유', done: false, order: 2 },
        ],
      },
      {
        user_id: userId,
        list_id: defaultList.id,
        title: '디자인 리뷰 자료 준비',
        due_date: today,
        priority: 'medium',
        tags: ['work'],
        linked_event_id: review.id,
        auto_complete_on_event_end: true,
      },
      {
        user_id: userId,
        list_id: defaultList.id,
        title: '장보기',
        due_date: tomorrow,
        priority: 'low',
        tags: ['life'],
      },
      {
        user_id: userId,
        list_id: studyList.id,
        title: 'TypeScript 제네릭 복습',
        due_date: seoulDate(2),
        priority: 'medium',
        tags: ['study'],
      },
      {
        user_id: userId,
        list_id: defaultList.id,
        title: 'PR 리뷰 마무리',
        priority: 'medium',
        status: 'completed',
        is_completed: true,
        started_at: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        completed_at: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        tags: ['work'],
      },
    ])
    .returning();

  await db.insert(reminderNotes).values({
    reminder_id: reportTodo.id,
    user_id: userId,
    content: '## 메모\n\n- 지난주 대비 완료율 포함하기\n- 이슈 2건은 다음 주로 이월',
  });

  await db.insert(userInstructions).values({
    user_id: userId,
    content: '업무 일정은 평일 09:00~18:00 사이에 잡아줘.',
  });

  const chatAt = new Date(now.getTime() - 60 * 60 * 1000);
  await db.insert(chatMessages).values([
    {
      user_id: userId,
      role: 'user',
      content: '오늘 일정 알려줘',
      context: 'home',
      created_at: chatAt,
    },
    {
      user_id: userId,
      role: 'assistant',
      content: '오늘은 09:30 주간 스탠드업, 14:00 디자인 리뷰가 있습니다.',
      context: 'home',
      created_at: new Date(chatAt.getTime() + 1000),
    },
  ]);

  console.log(`[seed] demo user created (${DEMO_USERNAME} / ${DEMO_PASSWORD})`);
}

if (require.main === module) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] failed:', err);
      process.exit(1);
    });
}
