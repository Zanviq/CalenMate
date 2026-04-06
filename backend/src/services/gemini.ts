import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIResponse } from '../types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface ParseOptions {
  content: string;
  context: string;
  existingEvents?: Record<string, unknown>[];
  existingReminders?: Record<string, unknown>[];
  chatHistory?: { role: string; content: string }[];
  userInstructions?: { id: string; content: string }[];
  calendarError?: string | null;
}

export async function parseUserMessage(opts: ParseOptions): Promise<AIResponse> {
  const { content, context, existingEvents, existingReminders, chatHistory, userInstructions, calendarError } = opts;
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const instructionsBlock = userInstructions && userInstructions.length > 0
    ? `\n== 사용자 주요 지시사항 (항상 우선 적용) ==\n${userInstructions.map((i) => `- [id:${i.id}] ${i.content}`).join('\n')}\n`
    : '';

  const historyBlock = chatHistory && chatHistory.length > 0
    ? `\n== 최근 대화 기록 (참고용, 이미 처리 완료된 과거 대화) ==\n${chatHistory.map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`).join('\n')}\n`
    : '';

  let eventsBlock: string;
  if (calendarError) {
    eventsBlock = `\n== 현재 등록된 일정 ==\n캘린더 조회 실패: ${calendarError}\n사용자에게 이 오류를 알려줘라.\n`;
  } else if (existingEvents && existingEvents.length > 0) {
    eventsBlock = `\n== 현재 등록된 일정 (향후 30일) ==\n${JSON.stringify(existingEvents)}\n`;
  } else {
    eventsBlock = '\n== 현재 등록된 일정 ==\n없음\n';
  }

  const remindersBlock = existingReminders && existingReminders.length > 0
    ? `\n== 현재 리마인더 (Google Tasks) ==\n${JSON.stringify(existingReminders)}\n`
    : '\n== 현재 리마인더 ==\n없음\n';

  const systemPrompt = `You are CalenMate AI assistant. You help users manage their calendar and reminders.
Current date: ${new Date().toISOString()}
Context: ${context}
${instructionsBlock}${historyBlock}${eventsBlock}${remindersBlock}

Respond ONLY with valid JSON:
{
  "actions": [{ "type": "...", "data": {...} }],
  "response": "Korean response to user"
}

## Your capabilities

### 1. 일정/리마인더 조회 및 질문 답변
- 사용자가 일정이나 리마인더에 대해 물어보면 위에 제공된 데이터를 사용하여 답변하라.
- "오늘 일정 알려줘", "이번 주 뭐 있어?", "내일 일정 있어?" 등의 질문에 답변하라.
- 일정이 없으면 "등록된 일정이 없습니다"라고 답변하라.
- 조회만 하는 경우 actions는 빈 배열 []로 두고 response에 정보를 담아라.

### 2. 일정 관리 (actions)

#### Calendar events: create_event, update_event, delete_event
- For create_event, REQUIRED fields: title, date (YYYY-MM-DD), start_time (HH:mm), end_time (HH:mm)
- If the user does NOT provide a title (이름) or time (시간), do NOT create the event. Instead return empty actions and ask the user for the missing information in the response.
- If only start_time is given without end_time, default end_time to 1 hour after start_time.
- Optional: description, color, reminder_minutes
- Default color: "peacock" (blue). Default reminder: none.
- Color options: "tomato", "flamingo", "tangerine", "banana", "sage", "basil", "peacock", "blueberry", "lavender", "grape", "graphite"
  - Map Korean color names: 빨간색→tomato, 주황색→tangerine, 노란색→banana, 초록색→sage, 파란색→peacock, 보라색→grape, 회색→graphite, 분홍색→flamingo
- For update/delete: data needs id of the target item

#### Reminders (Google Tasks 연동): create_reminder, update_reminder, delete_reminder, complete_reminder
- Required: title. Optional: priority (low/medium/high, default medium), due_date, notify (boolean, default false), list_id (Google Tasks 목록 ID, 기본값: @default)
- 리마인더는 Google Tasks 목록에 속함. 사용자가 특정 목록을 지정하면 해당 목록의 google_list_id를 list_id에 넣어라.
- For update/delete/complete: data needs id (Supabase UUID)

#### Instructions (주요 지시사항): save_instruction, delete_instruction
- save_instruction: when user explicitly asks to save a rule/instruction for future use (e.g. "이걸 주요 지시사항에 저장해줘")
  - data: { "content": "the instruction text" }
- delete_instruction: when user asks to remove an instruction
  - data: { "id": "instruction_id" }

## CRITICAL RULES
1. **현재 메시지만 처리하라.** 대화 기록은 맥락 파악용일 뿐이다. 과거에 이미 처리된 요청을 절대 다시 실행하지 마라. 오직 아래 "현재 사용자 메시지"에 대해서만 actions를 생성하라.
2. 주요 지시사항이 있으면 모든 작업에 우선 적용하라.
3. 사용자가 일정 제목(이름) 또는 시간을 제공하지 않으면 반드시 물어봐라. 절대 추측하지 마라.
4. 복합 명령을 지원하라 (여러 액션 동시 가능).
5. 사용자가 일정/리마인더 조회를 요청하면 "현재 등록된 일정" 데이터를 기반으로 답변하라. 이 데이터는 Google Calendar에서 실시간으로 가져온 것이다.
6. Always respond in Korean.`;

  const result = await model.generateContent([
    { text: systemPrompt },
    { text: `== 현재 사용자 메시지 (이것만 처리하라) ==\n${content}` },
  ]);

  const responseText = result.response.text();

  try {
    // responseMimeType: 'application/json' ensures clean JSON, but try multiple strategies
    const parsed: AIResponse = JSON.parse(responseText);
    return parsed;
  } catch {
    // Fallback: extract from markdown code block
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch { /* fall through */ }
    }
    // Fallback: find first { to last }
    const firstBrace = responseText.indexOf('{');
    const lastBrace = responseText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(responseText.slice(firstBrace, lastBrace + 1));
      } catch { /* fall through */ }
    }
    console.error('Failed to parse Gemini response:', responseText);
    return {
      actions: [],
      response: 'AI 응답을 처리하는 데 실패했습니다. 다시 시도해주세요.',
    };
  }
}

export async function generateReminderNote(reminder: {
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority?: string;
}): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `당신은 CalenMate AI 비서입니다. 아래 리마인더에 대한 실용적인 노트를 마크다운 형식으로 작성해주세요.

리마인더:
- 제목: ${reminder.title}
${reminder.description ? `- 설명: ${reminder.description}` : ''}
${reminder.due_date ? `- 마감일: ${reminder.due_date}` : ''}
${reminder.priority ? `- 우선순위: ${reminder.priority}` : ''}

다음 내용을 포함해주세요:
1. **체크리스트**: 이 할 일을 완료하기 위한 구체적인 단계들
2. **참고사항**: 작업 시 고려할 점이나 팁
3. **관련 키워드**: 검색이나 참고에 도움이 될 키워드

간결하고 실용적으로 작성하세요. 한국어로 답변하세요.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function summarizeSchedule(
  events: Record<string, unknown>[],
  reminders: Record<string, unknown>[],
  period: 'today' | 'week'
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const periodLabel = period === 'today' ? '오늘' : '이번 주';

  // Trim events to essential fields only to reduce tokens
  const trimmedEvents = events.map((e) => {
    const start = e.start as { dateTime?: string; date?: string } | undefined;
    const end = e.end as { dateTime?: string; date?: string } | undefined;
    return {
      title: e.summary || '(제목 없음)',
      date: start?.dateTime?.slice(0, 10) || start?.date || '',
      start_time: start?.dateTime?.slice(11, 16) || '',
      end_time: end?.dateTime?.slice(11, 16) || '',
      allDay: !start?.dateTime,
    };
  });

  const trimmedReminders = reminders.map((r) => ({
    title: r.title,
    priority: r.priority,
    due_date: r.due_date,
  }));

  const prompt = `당신은 CalenMate AI 비서입니다. ${periodLabel}의 일정과 리마인더를 한국어로 간결하게 요약해주세요.

일정:
${JSON.stringify(trimmedEvents)}

리마인더:
${JSON.stringify(trimmedReminders)}

요약을 자연스러운 한국어로 작성해주세요. 중요한 일정을 강조하고, 시간순으로 정리해주세요.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
