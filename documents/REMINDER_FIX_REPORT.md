# 리마인더 시스템 문제 분석 및 수정 계획

> 작성일: 2026-04-06

## 1. 문제 요약

| # | 문제 | 심각도 | 영역 |
|---|------|--------|------|
| 1 | 리마인더 삭제가 실제로 반영되지 않음 | Critical | Frontend/Backend |
| 2 | 홈 화면 체크박스가 작동하지 않고 클릭 시 상세 페이지로 이동 | Critical | Frontend |
| 3 | 상세 페이지에 삭제/완료 토글 버튼 없음 | High | Frontend |
| 4 | 캐시 정합성 문제로 삭제/완료 후 다른 탭에서 이전 상태 노출 | High | Frontend |
| 5 | 에러 발생 시 사용자 피드백 없음 (조용한 롤백) | Medium | Frontend |
| 6 | AI 활용도 낮음 — 노트 자동 생성, 리마인더 분석 등 부재 | Medium | Frontend/Backend |

---

## 2. 상세 분석

### 2.1 리마인더 삭제 미반영 (Critical)

**현상**: 삭제 버튼 클릭 후 리마인더가 일시적으로 사라졌다가 다시 나타남.

**원인 분석**:
- `reminders/page.tsx` deleteMutation에 `onSettled`가 없어서 서버 응답 후 쿼리를 재조회하지 않음
- Optimistic update로 UI에서 즉시 제거되지만, 서버 오류 시 `onError`에서 조용히 롤백됨
- **가장 큰 문제**: 삭제 성공 시에도 현재 필터의 쿼리 키(`['reminders', filter, selectedListId]`)만 업데이트됨. 다른 필터 탭의 캐시는 여전히 이전 데이터를 보유 → 탭 전환 시 삭제된 항목이 다시 나타남
- 홈 페이지의 `['reminders']` 쿼리 키와도 불일치

**수정 방안**:
- 삭제/완료 mutation에 `onSettled`에서 모든 `['reminders']` 관련 쿼리 무효화
- 에러 시 toast 메시지 표시

### 2.2 홈 화면 체크박스 미작동 (Critical)

**현상**: 홈 화면에서 리마인더 체크박스를 클릭하면 완료 표시 대신 상세 페이지로 이동.

**원인**: `home/page.tsx:271`
```tsx
<Checkbox checked={false} />  // 하드코딩된 false, onChange 없음
```
- 전체 행에 `onClick={() => router.push(...)}` 적용 → 체크박스 클릭도 네비게이션 트리거
- 체크박스에 toggle mutation 미연결

**수정 방안**:
- 체크박스 영역에 `e.stopPropagation()` + toggleComplete mutation 추가
- 텍스트 클릭은 기존대로 페이지 이동 유지

### 2.3 상세 페이지 삭제/완료 불가 (High)

**현상**: 리마인더 상세 페이지(`reminders/[id]/page.tsx`)에서 삭제, 완료 토글 불가.

**원인**: 해당 기능의 UI와 mutation이 구현되어 있지 않음.

**수정 방안**:
- 헤더에 완료 토글 버튼 + 삭제 버튼 추가
- 삭제 시 확인 다이얼로그 → 삭제 후 목록으로 이동

### 2.4 캐시 정합성 (High)

**현상**: 한 탭에서 완료/삭제한 항목이 다른 탭에서 여전히 보임.

**원인**:
- 쿼리 키가 `['reminders', filter, selectedListId]`로 세분화되어 있어, mutation 시 현재 쿼리만 업데이트
- `queryClient.invalidateQueries({ queryKey: ['reminders'] })` 대신 exact 키 사용 중

**수정 방안**:
- 모든 mutation의 `onSettled`에서 `queryKey: ['reminders']` prefix로 전체 무효화

### 2.5 에러 피드백 부재 (Medium)

**현상**: 삭제/완료 실패 시 사용자에게 아무 피드백 없이 조용히 롤백.

**수정 방안**:
- `onError`에서 toast 알림 표시 (sonner 또는 기존 toast 컴포넌트 활용)

### 2.6 AI 활용도 낮음 (Medium)

**현상**: AI 노트 탭은 수동 작성만 가능. 리마인더 관련 AI 분석/제안 기능 없음.

**수정 방안**:
- 상세 페이지에 "AI로 노트 생성" 버튼 추가 — 리마인더 내용 기반 체크리스트/분석 자동 생성
- 홈 화면 AI 요약에 리마인더 관련 인사이트 포함 (이미 backend에서 리마인더 데이터를 넘기므로 프롬프트 조정)

---

## 3. 수정 계획

### Phase 1: 핵심 버그 수정
1. **삭제/완료 mutation 캐시 무효화** — 모든 `['reminders']` prefix 쿼리 무효화
2. **홈 화면 체크박스** — stopPropagation + toggleComplete mutation
3. **상세 페이지 삭제/완료 버튼** 추가

### Phase 2: UX 개선
4. **에러 피드백** — mutation 실패 시 toast 알림
5. **상세 페이지 삭제 확인** — AlertDialog 사용

### Phase 3: AI 기능 강화
6. **AI 노트 자동 생성** — 상세 페이지에서 버튼 클릭으로 AI가 리마인더 분석 노트 생성

---

## 4. 영향 받는 파일

| 파일 | 변경 내용 |
|------|-----------|
| `frontend/src/app/(app)/home/page.tsx` | 체크박스 기능 구현, 완료 mutation 추가 |
| `frontend/src/app/(app)/reminders/page.tsx` | 캐시 무효화 개선, 에러 피드백 |
| `frontend/src/app/(app)/reminders/[id]/page.tsx` | 삭제/완료 버튼 추가, AI 노트 생성 |
| `backend/src/routes/reminders.ts` | AI 노트 생성 엔드포인트 (필요 시) |
| `backend/src/services/gemini.ts` | 리마인더 노트 생성 프롬프트 (필요 시) |
| `frontend/src/lib/chat-commands.ts` | `/reminders` 슬래시 명령어 ��가 |

---

## 5. 추가 발견 및 수정 사항

### 5.1 홈 페이지 AI 액션 미반영 (High)

**현상**: AI 채팅에서 리마인더/일정 변경 후 홈 화면 데이터가 갱신되지 않음.

**원인**: `home/page.tsx`에서 `reminderActionCount`, `calendarActionCount`를 감시하지 않음.

**수정**: 두 카운터 모두 감시하여 변경 시 해당 쿼리 무효화.

### 5.2 슬래시 명령어 부족 (Medium)

**현상**: `/help`, `/today`, `/instructions`, `/clear`, `/reset_memory`만 존재. 리마인더 관련 빠른 조회 불가.

**수정**: `/reminders` 명령어 추가 — 진행 중인 리마인더 목록을 우선순위 이모지와 함께 표시.
