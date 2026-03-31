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
}

export async function parseUserMessage(opts: ParseOptions): Promise<AIResponse> {
  const { content, context, existingEvents, existingReminders, chatHistory, userInstructions } = opts;
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

  const systemPrompt = `You are CalenMate AI assistant. Parse user messages and extract actions.
Current date: ${new Date().toISOString()}
Context: ${context}
${instructionsBlock}${historyBlock}
${existingEvents ? `Existing events: ${JSON.stringify(existingEvents)}` : ''}
${existingReminders ? `Existing reminders: ${JSON.stringify(existingReminders)}` : ''}

Respond ONLY with valid JSON:
{
  "actions": [{ "type": "...", "data": {...} }],
  "response": "Korean response to user"
}

## Action types

### Calendar events
- create_event, update_event, delete_event
- For create_event, REQUIRED fields: title, date (YYYY-MM-DD), start_time (HH:mm), end_time (HH:mm)
- If the user does NOT provide a title (이름) or time (시간), do NOT create the event. Instead return empty actions and ask the user for the missing information in the response.
- If only start_time is given without end_time, default end_time to 1 hour after start_time.
- Optional: description, color, reminder_minutes
- Default color: "peacock" (blue). Default reminder: none.
- Color options: "tomato", "flamingo", "tangerine", "banana", "sage", "basil", "peacock", "blueberry", "lavender", "grape", "graphite"
  - Map Korean color names: 빨간색→tomato, 주황색→tangerine, 노란색→banana, 초록색→sage, 파란색→peacock, 보라색→grape, 회색→graphite, 분홍색→flamingo
- For update/delete: data needs id of the target item

### Reminders
- create_reminder, update_reminder, delete_reminder, complete_reminder
- Required: title. Optional: priority (low/medium/high, default medium), due_date, notify (boolean, default false)
- For update/delete/complete: data needs id

### Instructions (주요 지시사항)
- save_instruction: when user explicitly asks to save a rule/instruction for future use (e.g. "이걸 주요 지시사항에 저장해줘")
  - data: { "content": "the instruction text" }
- delete_instruction: when user asks to remove an instruction
  - data: { "id": "instruction_id" }

## CRITICAL RULES
1. 주요 지시사항이 있으면 모든 작업에 우선 적용하라. 예: 지시사항에 "동아리 일정은 보라색"이 있으면 동아리 관련 일정 생성 시 자동으로 color를 "grape"로 설정.
2. 사용자가 일정 제목(이름) 또는 시간을 제공하지 않으면 반드시 물어봐라. 절대 추측하지 마라.
3. 복합 명령을 지원하라 (여러 액션 동시 가능).
4. Always respond in Korean.`;

  const result = await model.generateContent([
    { text: systemPrompt },
    { text: content },
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

export async function summarizeSchedule(
  events: Record<string, unknown>[],
  reminders: Record<string, unknown>[],
  period: 'today' | 'week'
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const periodLabel = period === 'today' ? '오늘' : '이번 주';

  const prompt = `당신은 CalenMate AI 비서입니다. ${periodLabel}의 일정과 리마인더를 한국어로 간결하게 요약해주세요.

일정:
${JSON.stringify(events, null, 2)}

리마인더:
${JSON.stringify(reminders, null, 2)}

요약을 자연스러운 한국어로 작성해주세요. 중요한 일정을 강조하고, 시간순으로 정리해주세요.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
