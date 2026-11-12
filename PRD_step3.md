# [PRD] 3단계: 사용자 프로필 및 운동 기록/성장 대시보드

## 1. 개요 (Overview)
- **문서 버전:** v1.0.0
- **작성일:** 2026-11-12
- **단계 목표:** 사용자의 기본 신체 정보와 운동 성향을 담은 프로필을 구축하고, 1~2단계에서 수행한 운동 루틴의 실시간 결과(세트, 중량, 횟수, 소요시간)를 누적 저장하여, 초보자가 성취감을 느끼고 점진적 과부하를 실천할 수 있는 성장 대시보드를 제공한다.

---

## 2. 배경 및 목적 (Background & Goals)
### 2.1 배경
- 초보자가 운동을 지속하지 못하는 가장 큰 이유는 "내가 발전하고 있는지 눈에 보이지 않아서"와 "지난번에 몇 kg으로 몇 번 들었는지 기억나지 않아서"임.
- 1단계(인식)와 2단계(루틴 생성)의 일회성 사용을 넘어, 지속적인 리텐션(재방문율)을 창출하기 위해 기록과 프로필 기반의 개인화 데이터 축적이 필수적임.

### 2.2 목표
- **간편한 프로필 설정:** 복잡한 인바디 수치 없이도 1분 만에 끝내는 초보자 친화적 온보딩.
- **원클릭 운동 저장:** 2단계 루틴 수행 결과를 번거로운 수기 입력 없이 직관적으로 로깅.
- **시각적 보상(성장 대시보드):** 출석 잔디(캘린더), 연속 운동 일수(Streak), 부위별 밸런스 차트를 통해 운동 습관 형성 지원.
- **AI 추천 고도화 연계:** 누적된 기록 데이터를 2단계 OpenRouter 프롬프트에 피드백하여 "지난주보다 2.5kg 올려보기"와 같은 초개인화 가이드 제공.

---

## 3. 핵심 사용자 페르소나 (Target Persona)
- **이름:** 이초보 (29세, 헬스 3주차)
- **상황:** 지난주에 랫 풀 다운을 몇 kg으로 당겼는지 기억이 안 나서 매번 핀을 이리저리 꽂아보며 시간을 낭비함.
- **니즈:** 오늘 한 운동이 달력에 자동으로 찍히고, 지난번 운동 중량과 횟수가 자동으로 기록되어 한눈에 성장 과정을 확인하고 싶음.

---

## 4. 기능 요구사항 (Functional Requirements)

### 4.1 사용자 프로필 관리 (User Profile & Onboarding)
- **FR-1.1 기본 프로필 정보:**
  - 닉네임, 프로필 아바타(기본 프리셋 제공)
  - 운동 경력 단계 (`완전 초보 1개월 미만` / `초급 1~3개월` / `초중급 3~6개월` / `중급 6개월 이상`)
  - 신체 정보 (신장, 체중 - 선택 입력 가능)
  - 주요 운동 목적 (`체지방 감량`, `근육 증가`, `기초 체력 증진`, `체형/자세 교정`)
  - 주간 목표 운동 일수 (예: 주 3회)
- **FR-1.2 인증 체계:**
  - 1차: 브라우저 로컬 저장소(IndexedDB/LocalStorage) 기반 무로그인 즉시 체험
  - 2차: 데이터 영구 보존 및 다기기 동기화를 위한 간편 소셜 로그인(Google, Kakao 등 OAuth 2.0)

### 4.2 운동 세션 및 세트 기록 (Workout Logging Engine)
- **FR-2.1 2단계 루틴 자동 임포트:**
  - 2단계에서 "운동 완료 및 기록 저장" 클릭 시 세션 메타데이터(운동 일시, 총 소요시간, 추천받은 기구 및 운동 목록)를 자동 인계
- **FR-2.2 실제 수행 데이터 보정 입력:**
  - 세트별 실제 성공한 무게(kg) 및 횟수(Reps) 간편 증감 버튼(+/-) 제공
  - 총 소요 시간(분) 자동 계산 및 수동 수정 가능
- **FR-2.3 세션 피드백 및 메모:**
  - 운동 체감 난이도 RPE 평가 (1: 너무 쉬움 ~ 5: 한계 도달)
  - 오늘의 한줄 일기/메모 (예: "등 자극이 잘 왔으나 오른쪽 어깨가 살짝 결림")
  - 기구 사진 또는 오운완(오늘 운동 완료) 인증샷 첨부(선택)

### 4.3 성장 대시보드 및 통계 (Growth Dashboard & Analytics)
- **FR-3.1 월간 운동 캘린더:**
  - 운동을 완료한 날에 시각적 스탬프/잔디 표시
  - 특정 날짜 클릭 시 해당 일자의 운동 상세 내역(기구, 볼륨, 메모) 팝업 조회
- **FR-3.2 스트릭(Streak) & 주간 달성률:**
  - "🔥 현재 3일 연속 운동 중!", "이번 주 목표 3회 중 2회 달성 (66%)" 위젯 노출
- **FR-3.3 신체 부위별 밸런스 차트:**
  - 최근 30일간 수행한 부위(가슴, 등, 하체, 어깨, 팔, 복근/유산소)의 비율을 도넛/레이더 차트로 시각화
  - 불균형 시 AI 조언 ("최근 하체 운동 비율이 낮습니다. 다음엔 레그 프레스를 추천해요!")
- **FR-3.4 기구별 성장 추이 그래프:**
  - 특정 기구(예: 랫 풀 다운, 레그 프레스)의 날짜별 최대 중량(1RM 추정치 또는 세트 최고 무게) 선 그래프 시각화

### 4.4 1-2단계와의 선순환 연동 (Feedback Loop to Step 1 & 2)
- **FR-4.1 이전 기록 컨텍스트 제공:**
  - 1단계에서 동일 기구 재스캔 시: "💡 지난 11월 8일에 이 기구로 25kg 12회 3세트를 완료했습니다." 플로팅 배너 노출
  - 2단계 루틴 프롬프트 자동 삽입: `user_past_history`를 OpenRouter에 주입하여 점진적 과부하(예: 25kg -> 27.5kg 제안) 반영

---

## 5. 데이터베이스 스키마 설계 (Data Architecture)

```sql
-- 1. 사용자 테이블
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    nickname VARCHAR(50) NOT NULL,
    experience_level VARCHAR(20) DEFAULT 'beginner', -- beginner, novice, intermediate
    target_goal VARCHAR(50), -- fat_loss, muscle_gain, stamina
    weekly_target_days INT DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 운동 세션 (하루 1회 운동 단위)
CREATE TABLE workout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    routine_title VARCHAR(100),
    total_duration_min INT,
    perceived_rpe INT, -- 1 to 5
    user_memo TEXT,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 운동 항목 (세션 내 포함된 개별 기구/종목)
CREATE TABLE workout_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES workout_sessions(id) ON DELETE CASCADE,
    equipment_name VARCHAR(100) NOT NULL, -- e.g., '체스트 프레스 머신'
    target_muscle VARCHAR(50), -- e.g., '가슴'
    item_order INT NOT NULL
);

-- 4. 세트 상세 기록
CREATE TABLE workout_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES workout_items(id) ON DELETE CASCADE,
    set_number INT NOT NULL,
    weight_kg NUMERIC(5, 2), -- 0 for bodyweight
    reps INT NOT NULL,
    is_completed BOOLEAN DEFAULT TRUE
);
```

---

## 6. 비기능 요구사항 (Non-Functional Requirements)
- **NFR-1 데이터 동기화 & 오프라인 퍼스트:**
  - 로컬 IndexedDB에 우선 저장 후 네트워크 감지 시 서버와 자동 동기화(헬스장 지하 음영지역 대응)
- **NFR-2 대시보드 렌더링 성능:**
  - 캘린더 및 통계 차트 로딩 시간 1초 이내 (최근 3개월 데이터 클라이언트 메모리 캐싱)
- **NFR-3 데이터 백업 및 내보내기:**
  - 사용자가 자신의 운동 기록을 CSV/JSON 파일로 내보낼 수 있는 기능 제공

---

## 7. 예외 및 에러 핸들링 (Error Handling)
| 상황 | 처리 방안 |
|---|---|
| 비로그인 사용자의 기기 변경/캐시 삭제 | 브라우저 로컬 데이터 삭제 위험 안내 배너 노출 및 "소셜 계정 연동하고 기록 평생 보관하기" 모달 유도 |
| 오프라인 상태에서 운동 완료 버튼 클릭 시 | 로컬 큐(Local Queue)에 기록 보관 후 화면에 "오프라인 저장 완료 (온라인 시 자동 동기화)" 토스트 알림 |
| 비정상적인 수치 입력 (예: 체중 999kg, 세트 무게 5,000kg) | 유효성 검사 경고창 노출 ("정확한 무게를 입력해 주세요") |

---

## 8. 성공 지표 (Success Metrics)
- 운동 완료 후 실제 기록 저장 전환율(Save Rate): 80% 이상
- 주간 활성 사용자(WAU) 기준 주 2회 이상 기록 유저 비율: 50% 이상
- 연속 운동 3일(Streak) 달성 사용자 비율: 40% 이상
- 기록 누적 사용자의 2단계 루틴 재방문율: 단순 사용자 대비 2.5배 이상 달성
