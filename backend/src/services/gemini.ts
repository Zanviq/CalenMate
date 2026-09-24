import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerativeModel } from '@google/generative-ai';
import { AIResponse } from '../types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Gemini error handling ────────────────────────────────────────────────────
//
// Gemini 2.5 Flash periodically returns 503 ("high demand") and 429 ("quota")
// errors that resolve themselves within a few seconds. We retry transient
// failures with exponential backoff so the user typically never sees them.
// After exhausting retries we surface a Korean message instead of leaking the
// raw provider error string to the chat UI.

class GeminiUnavailableError extends Error {
  readonly userMessage: string;
  readonly kind: 'overloaded' | 'quota' | 'unknown';
  readonly originalError: unknown;
  constructor(userMessage: string, kind: 'overloaded' | 'quota' | 'unknown', originalError?: unknown) {
    super(userMessage);
    this.name = 'GeminiUnavailableError';
    this.userMessage = userMessage;
    this.kind = kind;
    this.originalError = originalError;
  }
}

function classifyError(err: unknown): 'overloaded' | 'quota' | 'unknown' {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('503') || msg.includes('service unavailable') || msg.includes('high demand') || msg.includes('overload')) {
    return 'overloaded';
  }
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')) {
    return 'quota';
  }
  return 'unknown';
}

function isRetryableError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  // Retry transient HTTP statuses + obvious network failures.
  return /\b(429|500|502|503|504)\b/.test(msg)
    || msg.includes('service unavailable')
    || msg.includes('high demand')
    || msg.includes('overload')
    || msg.includes('econnreset')
    || msg.includes('econnrefused')
    || msg.includes('etimedout')
    || msg.includes('enotfound')
    || msg.includes('socket hang up')
    || msg.includes('fetch failed');
}

async function generateContentWithRetry(
  model: GenerativeModel,
  parts: Parameters<GenerativeModel['generateContent']>[0],
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<Awaited<ReturnType<GenerativeModel['generateContent']>>> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 700;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await model.generateContent(parts);
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || attempt === maxAttempts) break;
      // Exponential backoff with jitter: ~700ms, 1.4s, 2.8s.
      const delay = baseDelayMs * Math.pow(2, attempt - 1) * (0.7 + Math.random() * 0.6);
      console.warn(`[gemini] attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms:`,
        err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // All retries exhausted (or non-retryable). Wrap with a Korean user message
  // so callers can surface it directly without further translation.
  const kind = classifyError(lastErr);
  const userMessage =
    kind === 'overloaded'
      ? 'AI 모델이 현재 과부하 상태입니다. 잠시 후 (1~2분) 다시 시도해주세요.'
      : kind === 'quota'
        ? 'AI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요.'
        : `AI 응답 처리 중 오류가 발생했습니다: ${lastErr instanceof Error ? lastErr.message : '알 수 없는 오류'}`;
  throw new GeminiUnavailableError(userMessage, kind, lastErr);
}

interface ParseOptions {
  content: string;
  context: string;
  existingEvents?: Record<string, unknown>[];
  existingReminders?: Record<string, unknown>[];
  chatHistory?: { role: string; content: string }[];
  userInstructions?: { id: string; content: string }[];
  calendarError?: string | null;
  eventsLabel?: string;
}

export async function parseUserMessage(opts: ParseOptions): Promise<AIResponse> {
  const { content, context, existingEvents, existingReminders, chatHistory, userInstructions, calendarError, eventsLabel } = opts;
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
    ? `\n== 최근 대화 기록 ==\n${chatHistory.map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`).join('\n')}\n`
    : '';

  const eventsRangeLabel = eventsLabel || '오늘~향후 7일';
  let eventsBlock: string;
  if (calendarError) {
    eventsBlock = `\n== 현재 등록된 일정 ==\n캘린더 조회 실패: ${calendarError}\n사용자에게 이 오류를 알려줘라.\n`;
  } else if (existingEvents && existingEvents.length > 0) {
    eventsBlock = `\n== 현재 등록된 일정 (${eventsRangeLabel}) ==\n${JSON.stringify(existingEvents)}\n`;
  } else {
    eventsBlock = `\n== 현재 등록된 일정 (${eventsRangeLabel}) ==\n없음\n`;
  }

  const remindersBlock = existingReminders && existingReminders.length > 0
    ? `\n== 현재 ToDo ==\n${JSON.stringify(existingReminders)}\n`
    : '\n== 현재 ToDo ==\n없음\n';

  const systemPrompt = `You are CalenMate AI assistant. You help users manage their calendar and reminders.
Current date: ${new Date().toISOString()}
Context: ${context}
${instructionsBlock}${historyBlock}${eventsBlock}${remindersBlock}

Respond ONLY with valid JSON:
{
  "actions": [{ "type": "...", "data": {...} }],
  "response": "Korean response to user",
  "requiresConfirmation": false
}

## Your capabilities

### 1. 일정/ToDo 조회 및 질문 답변
- 사용자가 일정이나 ToDo에 대해 물어보면 위에 제공된 데이터를 사용하여 답변하라.
- "오늘 일정 알려줘", "이번 주 뭐 있어?", "내일 일정 있어?" 등의 질문에 답변하라.
- 일정이 없으면 "등록된 일정이 없습니다"라고 답변하라.
- 조회만 하는 경우 actions는 빈 배열 []로 두고 response에 정보를 담아라.

### 1-2. 과거 대화 기록 회상
- 사용자는 자신의 데이터의 소유자다. **"== 최근 대화 기록 ==" 블록은 사용자 본인의 대화 기록**이므로 사용자가 요청하면 자유롭게 요약하거나 인용해도 된다. 사적 정보 우려로 거부하지 마라.
- "과거 대화 알려줘", "방금 뭐라고 했지?", "어제 우리가 뭐 얘기했어?", "이전 대화 요약해줘" 같은 요청 → 위 대화 기록을 한국어로 자연스럽게 요약해서 답변하라.
- 답변 형식 가이드:
  - 메시지 단위로 그대로 나열하지 말고, 주제별/시간순으로 묶어서 정리하라.
  - 각 컨텍스트 태그(\`[home]\`, \`[calendar]\`, \`[reminder]\`)가 보이면 어디서 한 대화인지 함께 알려줘라 (예: "캘린더 탭에서는 ~", "ToDo 탭에서는 ~").
  - 너무 짧은 인사/시스템 메시지는 생략하라.
  - 기록이 비어있거나 의미 있는 내용이 없으면 솔직히 "최근 대화 내역이 거의 없습니다"라고 답하라.
- 사용자가 특정 키워드/주제를 언급하면 (예: "운동 얘기 했었나?") 해당 키워드와 관련된 메시지만 찾아서 인용하라.
- actions는 빈 배열 []로 두고 response에 요약을 담아라.

### 2. 일정 관리 (actions)

#### Calendar events: create_event, update_event, delete_event
- For create_event, REQUIRED fields: title, date (YYYY-MM-DD), start_time (HH:mm), end_time (HH:mm)
- If the user does NOT provide a title (이름) or time (시간), do NOT create the event. Instead return empty actions and ask the user for the missing information in the response.
- If only start_time is given without end_time, default end_time to 1 hour after start_time.
- Optional: description, color, reminder_minutes
- Default color: "peacock" (blue). Default reminder: none.
- Color options: "tomato", "flamingo", "tangerine", "banana", "sage", "basil", "peacock", "blueberry", "lavender", "grape", "graphite"
  - Map Korean color names: 빨간색→tomato, 주황색→tangerine, 노란색→banana, 초록색→sage, 파란색→peacock, 보라색→grape, 회색→graphite, 분홍색→flamingo
  - **사용자 메시지에 색상 이모티콘이 있으면 다음 매핑을 적용하라** (이모티콘은 색상 picker에서 삽입된 것):
    🔴=tomato, 🟠=tangerine, 🟡=banana, 🟢=sage, 🔵=peacock, 🟣=grape, ⚫=graphite, 🩷=flamingo, 🟪=lavender, 🟦=blueberry, 🟩=basil
  - 색상 이모티콘은 사용자가 색상을 명시적으로 선택한 신호이므로 일반적인 한국어 색상 단어보다 우선시하라.
  - 이모티콘은 일정 제목(title)에 포함하지 마라. 색상 지정용 신호일 뿐이다.
- For update/delete: data needs id of the target item

#### Reminders (ToDo): create_reminder, update_reminder, delete_reminder, complete_reminder
- Required: title. Optional: priority (low/medium/high, default medium), due_date, notify (boolean, default false), list_id (ToDo 목록 ID, 기본값: @default), checklist, tags
- ToDo는 목록에 속함. 사용자가 특정 목록을 지정하면 해당 ToDo 목록의 list_id를 list_id에 넣어라.
- For update/delete/complete: data needs id (UUID)
- checklist는 [{ "id": "랜덤문자열", "text": "...", "done": false, "order": 0 }] 형식의 배열. 사용자가 "체크리스트 추가" 같은 요청을 하면 update_reminder의 checklist 필드에 항목 배열을 넣어라.
- tags는 ["work", "study"] 같은 짧은 문자열 배열. 사용자가 분류/라벨링을 요청하거나 "이 ToDo work 태그 붙여줘", "운동 태그로 분류" 같은 표현을 쓰면 tags 필드를 사용하라. update_reminder의 tags는 전체 배열을 보내야 하며 (부분 패치 아님) 기존 사용자 태그를 보존하려면 기존 태그를 포함시켜라. 사용자가 따로 지정하지 않으면 tags는 생략하라.

#### ToDo 상태 변경: set_reminder_status
- 사용자가 ToDo를 "시작했어", "진행 중이야", "다시 안 한 걸로 해줘"처럼 명시할 때 사용.
- data: { "id": "<reminder_id>", "status": "not_started" | "in_progress" | "completed" }
- "완료해줘"는 기존 complete_reminder를 우선 사용해도 무방하다.

#### ToDo ↔ 캘린더 이벤트 링크: link_reminder_event
- 사용자가 "이 ToDo에 시간을 잡아줘", "1시간 블록해줘"처럼 time-blocking을 요청할 때 사용.
- data 옵션 1 — 새 이벤트 생성: { "id": "<reminder_id>", "date": "YYYY-MM-DD", "start_time": "HH:mm", "end_time": "HH:mm" 또는 "duration_minutes": 60, "auto_complete_on_event_end": true }
- data 옵션 2 — 기존 이벤트 연결: { "id": "<reminder_id>", "event_id": "<event_id>", "auto_complete_on_event_end": true }
- 링크된 이벤트가 끝나면 ToDo가 자동 완료된다 (auto_complete_on_event_end=true일 때).

#### 자동 스케줄링 (제안 모드)
- 사용자가 "오늘 ToDo 다 일정에 잡아줘", "이번 주 ToDo 시간 배치해줘"처럼 **여러 ToDo를 한 번에 스케줄링**해달라고 요청할 때 사용한다.
- 다음 절차를 따른다:
  1. 위에 제공된 일정 데이터(== 현재 등록된 일정 ==)에서 각 날짜의 빈 시간대를 추론한다. 기본 업무 시간은 09:00–18:00 (사용자 주요 지시사항이 다른 시간대를 명시하면 그걸 따른다).
  2. 미완료 ToDo만 대상으로 한다 (is_completed=false). 이미 linked_event_id가 있는 ToDo는 건너뛴다.
  3. 우선순위 high → 오전(가능하면 09:00–11:00), medium → 오전~오후, low → 오후 후반.
  4. 기본 소요 시간: high=60분, medium=45분, low=30분. 사용자가 명시한 길이가 있으면 그걸 우선한다.
  5. 회의와 회의 사이 15분 미만의 짧은 슬롯에는 큰 ToDo를 넣지 마라.
  6. 점심 시간(12:00–13:00)은 비워둔다.
  7. 같은 ToDo가 두 번 잡히지 않도록 한 번에 하나의 슬롯에만 매핑한다.
- **반드시 \`requiresConfirmation: true\`로 설정한다.** 이는 일괄 작업이므로 사용자 확인이 필요하다.
- response에는 제안 스케줄을 요약 (예: "9시 PR 리뷰(60분), 10시 보고서(45분), 14시 운동(30분)을 잡을게요.")
- actions 배열은 link_reminder_event 액션의 배열이다 (각 ToDo당 하나).
- 빈 슬롯이 부족하면 일부만 제안하고 부족한 ToDo는 response에서 언급하라 (강제로 점심 시간 등에 욱여넣지 마라).

#### 특정 기간 일정 조회: query_events
- 기본 제공되는 일정 데이터는 오늘~향후 7일뿐이다.
- **사용자가 명시적으로 기간을 지정하면 (이번 달, 저번 달, 이번 주, 3월, 올해 등) 기본 데이터에 일부 일정이 포함되어 있더라도 반드시 query_events를 사용하여 해당 기간 전체를 조회하라.** 기본 데이터로 부분 답변하지 마라.
- 기본 데이터만으로 답변해도 되는 경우: "오늘 일정", "내일 일정", "모레 뭐 있어?" 처럼 오늘~7일 이내만 묻는 경우.
- data: { "timeMin": "YYYY-MM-DD", "timeMax": "YYYY-MM-DD" }
- 예: "이번달 일정" → timeMin: 이번달 1일, timeMax: 이번달 말일
- 예: "저번달 일정" → timeMin: 저번달 1일, timeMax: 저번달 말일
- 예: "작년 12월에 뭐 했지?" → timeMin: "2025-12-01", timeMax: "2025-12-31"
- query_events를 사용할 때는 response에 "일정을 조회하고 있습니다..."와 같은 임시 응답을 넣어라. 조회 결과를 바탕으로 최종 응답이 자동 생성된다.
- query_events와 다른 액션(create, update 등)을 동시에 사용하지 마라. query_events는 단독으로 사용하라.

#### Instructions (주요 지시사항): save_instruction, delete_instruction
- save_instruction: when user explicitly asks to save a rule/instruction for future use (e.g. "이걸 주요 지시사항에 저장해줘")
  - data: { "content": "the instruction text" }
- delete_instruction: when user asks to remove an instruction
  - data: { "id": "instruction_id" }

## CRITICAL RULES
1. **대화 기록을 적극 활용하여 맥락을 파악하라.** 사용자가 "그거", "아까 그 일정", "거기" 등 이전 대화를 참조하면 대화 기록에서 해당 대상을 찾아 처리하라. 단, 과거에 이미 실행 완료된 동일한 액션을 중복 실행하지 마라. actions는 현재 메시지의 의도에 대해서만 생성하라.
2. 주요 지시사항이 있으면 모든 작업에 우선 적용하라.
3. 사용자가 일정 제목(이름) 또는 시간을 제공하지 않으면 반드시 물어봐라. 절대 추측하지 마라.
4. 복합 명령을 지원하라 (여러 액션 동시 가능).
5. "오늘", "내일" 등 오늘~7일 이내만 묻는 경우에만 기본 제공 데이터로 답변하라. 사용자가 특정 기간을 지정하면 (이번 달, 이번 주, 저번 달 등) 반드시 query_events로 전체 범위를 조회하라.
6. Always respond in Korean.
7. **여러 건을 삭제하거나 대량 수정하는 경우** requiresConfirmation을 true로 설정하라. 이 경우 response에 수행할 작업 내용을 요약하라 (예: "4개 일정을 삭제합니다"). 단건 작업은 requiresConfirmation: false로 바로 실행하라.
8. 사용자에게 텍스트로 재확인을 묻지 마라. 확인이 필요하면 반드시 requiresConfirmation: true를 사용하라.`;

  let responseText: string;
  try {
    const result = await generateContentWithRetry(model, [
      { text: systemPrompt },
      { text: `== 현재 사용자 메시지 ==\n${content}` },
    ]);
    responseText = result.response.text();
  } catch (err) {
    // Gracefully fall back so the user still sees a chat message rather than
    // a generic 500. The user message + this assistant reply are persisted by
    // the route handler exactly like a normal turn.
    if (err instanceof GeminiUnavailableError) {
      console.warn('[gemini] parseUserMessage giving up after retries:', err.kind);
      return { actions: [], response: err.userMessage };
    }
    console.error('[gemini] parseUserMessage unexpected failure:', err);
    return {
      actions: [],
      response: 'AI 응답 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    };
  }

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

  const prompt = `당신은 CalenMate AI 비서입니다. 아래 ToDo에 대한 실용적인 노트를 마크다운 형식으로 작성해주세요.

ToDo:
- 제목: ${reminder.title}
${reminder.description ? `- 설명: ${reminder.description}` : ''}
${reminder.due_date ? `- 마감일: ${reminder.due_date}` : ''}
${reminder.priority ? `- 우선순위: ${reminder.priority}` : ''}

다음 내용을 포함해주세요:
1. **체크리스트**: 이 할 일을 완료하기 위한 구체적인 단계들
2. **참고사항**: 작업 시 고려할 점이나 팁
3. **관련 키워드**: 검색이나 참고에 도움이 될 키워드

간결하고 실용적으로 작성하세요. 한국어로 답변하세요.`;

  const result = await generateContentWithRetry(model, prompt);
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

  const trimmedReminders = reminders.map((r) => {
    const checklist = Array.isArray(r.checklist) ? r.checklist as Array<{ done: boolean }> : [];
    const checklistDone = checklist.filter((c) => c.done).length;
    return {
      title: r.title,
      priority: r.priority,
      status: r.status,
      due_date: r.due_date,
      tags: Array.isArray(r.tags) ? r.tags : [],
      checklist_progress: checklist.length > 0 ? `${checklistDone}/${checklist.length}` : null,
      linked_to_event: !!r.linked_event_id,
      started_at: r.started_at,
    };
  });

  const prompt = `당신은 CalenMate AI 비서입니다. ${periodLabel}의 일정과 ToDo를 한국어로 간결하게 요약해주세요.

일정:
${JSON.stringify(trimmedEvents)}

ToDo (전체 미완료 백로그 — 이 중 ${periodLabel}에 관련 있는 것들 위주로 추려서 답변):
${JSON.stringify(trimmedReminders)}

요약 작성 가이드:
1. 중요한 일정을 시간순으로 강조하라.
2. ${periodLabel === '오늘' ? '오늘 마감(due_date가 오늘 또는 그 전)인 ToDo와 진행 중(status=in_progress)인 ToDo를 우선' : '이번 주 안에 마감인 ToDo와 진행 중인 ToDo를 우선'}으로 다뤄라.
3. 마감일(due_date)이 비어있는 ToDo도 우선순위가 high이거나 진행 중이면 언급하라.
4. 체크리스트 진행률(checklist_progress)이 있으면 함께 보여줘라 (예: "보고서 작성 (3/5 완료)").
5. linked_to_event=true는 캘린더에 이미 시간이 잡혀있다는 뜻이므로 일정과 함께 묶어서 표현하라.
6. 자연스러운 한국어 마크다운으로 작성하라.`;

  const result = await generateContentWithRetry(model, prompt);
  return result.response.text();
}

export { GeminiUnavailableError };
