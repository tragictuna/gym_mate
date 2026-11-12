# AGENTS.md - GymMate AI 개발 가이드 및 에이전트 지침서

이 문서는 AI 에이전트와 개발자가 GymMate(헬스장 기구 인식 및 맞춤형 운동 루틴 추천 웹앱) 프로젝트를 구현하고 유지보수할 때 반드시 준수해야 하는 핵심 규칙과 가이드라인을 정의합니다.

---

## 1. 프로젝트 개요 (Overview)
- **서비스명:** GymMate (짐메이트)
- **목적:** 헬스장 초보자를 위한 기구 사진 인식, 맞춤형 운동 루틴 추천, 운동 기록 및 성장 시각화 서비스
- **참조 문서:**
  - `PRD_step1.md`: 1단계 - AI 헬스장 기구 이미지 인식 기능
  - `PRD_step2.md`: 2단계 - 사용자 조건 맞춤형 운동 루틴 생성 기능
  - `PRD_step3.md`: 3단계 - 사용자 프로필 및 운동 기록/성장 대시보드

---

## 2. 절대 준수 규칙 (Core Rules)

### 📌 규칙 1. 기술 스택 제약 (순수 HTML/CSS/JS + Vercel 서버리스)
- **프론트엔드:** 프레임워크(React, Vue, Next.js, Angular 등) 및 빌드 도구(Webpack, Vite, Rollup, Babel, PostCSS 등)의 **사용을 엄격히 금지**합니다.
  - 정적 파일 구조: `index.html`, `style.css`, `script.js` (필요 시 하위 모듈 js 분리 가능)
- **백엔드 (API):** Vercel 서버리스 함수(`api/*.js`, Node.js CommonJS 또는 ES Module 환경)만 사용합니다.
- 패키지 의존성(npm dependencies)은 서버리스 함수에 필요한 최소한(예: node-fetch 등 필요 시)으로 제한하며, 프론트엔드 번들러는 일체 두지 않습니다.

### 📌 규칙 2. OpenRouter API 호출 및 보안 규칙
- **호출 위치:** OpenRouter API 호출은 반드시 **`api/` 폴더 안의 서버리스 함수**에서만 수행합니다. 클라이언트 브라우저(`script.js`)에서 직접 OpenRouter로 요청을 보내는 것은 보안상 엄격히 금지됩니다.
- **환경 변수 사양:**
  - API Key: `process.env.OPENROUTER_API_KEY`
  - 모델명: `process.env.OPENROUTER_MODEL` (환경변수 미설정 시 기본값: `"google/gemma-4-26b-a4b-it:free"`)
- **API 헤더:** OpenRouter 권장 표준 헤더(`Authorization: Bearer ...`, `HTTP-Referer`, `X-Title: GymMate`)를 필수로 포함합니다.

### 📌 규칙 3. 단계별/기능별 점진적 개발 및 확인 절차
- **한 번에 한 가지 기능만 개발:** 복수의 단계를 동시에 구현하지 않고, 원자적(atomic) 단위로 구현합니다.
- **확인 방법 제시:** 기능 구현 완료 시, 사용자가 브라우저나 터미널에서 어떻게 결과를 검증하고 테스트할 수 있는지 구체적인 확인 단계(체크리스트)를 반드시 안내합니다.

### 📌 규칙 4. 전 코드 한국어 주석 필수
- 모든 작성 코드(`HTML`, `CSS`, `JavaScript`, `Vercel 서버리스 함수`)에는 역할, 함수 동작 원리, 매개변수, 예외 처리 이유 등을 **명확한 한국어 주석**으로 상세히 작성합니다.

### 📌 규칙 5. 환경 변수 및 형상 관리 (.env.local / .gitignore)
- API 키 등 민감 정보는 `.env.local` 파일에서 관리하며, 절대 git 커밋에 포함되지 않도록 `.gitignore`에 등록합니다.
- `.gitignore` 필수 등록 항목:
  ```text
  .env
  .env.local
  .env.*.local
  node_modules/
  .vercel/
  ```

### 📌 규칙 6. 터미널 명령 직접 실행 및 결과 설명
- 패키지 설치, 로컬 서버 구동, 파일 검증 등 개발에 필요한 모든 터미널 명령은 에이전트가 직접 터미널 툴(`run_command`)을 통해 실행하고, 그 실행 결과와 성공 여부를 사용자에게 한국어로 친절히 설명합니다.

---

## 3. 프로젝트 디렉토리 구조 (Directory Structure)

```text
gymmate/
├── .env.local               # 로컬 개발 환경 변수 (OPENROUTER_API_KEY 등, git 제외)
├── .gitignore               # 형상 관리 제외 목록
├── AGENTS.md                # 본 개발 지침서
├── PRD_step1.md             # 1단계 기구 인식 PRD
├── PRD_step2.md             # 2단계 루틴 추천 PRD
├── PRD_step3.md             # 3단계 기록 및 프로필 PRD
├── index.html               # 단일 페이지 애플리케이션(SPA) 구조의 메인 마크업
├── style.css                # 모바일 퍼스트 반응형 스타일시트
├── script.js                # 클라이언트 상태 관리, UI 이벤트 및 API 통신 스크립트
├── package.json             # Vercel 로컬 런타임 및 의존성 정의
└── api/                     # Vercel 서버리스 엔드포인트
    ├── analyze-equipment.js # 1단계: 기구 이미지 비전 분석 API
    ├── recommend-routine.js # 2단계: 맞춤형 루틴 생성 API
    └── ...                  # 3단계 관련 API (필요 시)
```

---

## 4. 로드맵 및 단계별 구현 가이드

```mermaid
flowchart LR
    A["1단계: 기구 이미지 인식<br>(사진 업로드 -> Vision API -> 카드 렌더링)"] --> B["2단계: 맞춤 루틴 추천<br>(조건 입력 -> LLM Routine API -> 세트 타이머)"]
    B --> C["3단계: 기록 및 프로필<br>(로컬/DB 저장 -> 캘린더 잔디 -> 성장 대시보드)"]
```

### [Step 1] 1단계: 기구 이미지 인식 기능
1. **기본 정적 파일 셋업:** `index.html`, `style.css`, `script.js` 기본 골격 작성 (모바일 뷰 최적화)
2. **이미지 입력 UI 구현:** 파일 업로드/카메라 촬영, 클라이언트 단 이미지 리사이징(Base64 인코딩)
3. **서버리스 API 구축 (`api/analyze-equipment.js`):** OpenRouter의 `google/gemma-4-26b-a4b-it:free` 멀티모달 호출 및 JSON 반환
4. **결과 표시 뷰:** 기구명, 타겟 부위, 세팅법, 주의사항 렌더링 및 2단계 연계 버튼 배치

### [Step 2] 2단계: 맞춤형 운동 루틴 생성 기능
1. **조건 입력 폼 모달/섹션:** 운동 목표(체지방/근비대), 가용 시간(20/40/60분), 난이도 선택 UI
2. **서버리스 API 구축 (`api/recommend-routine.js`):** 1단계 기구 데이터 + 사용자 조건 기반 프롬프트 생성 및 루틴 JSON 파싱
3. **루틴 인터랙티브 UI:** [워밍업-메인기구-보조운동-쿨다운] 타임라인 카드, 세트 체크박스, 휴식 카운트다운 타이머 제공

### [Step 3] 3단계: 사용자 프로필 및 기록 대시보드
1. **프로필 저장소 구성:** 경력, 목표, 주간 목표 저장 (LocalStorage 우선 구현)
2. **운동 세션 완료 로깅:** 루틴 수행 완료 시 실제 중량/세트/메모 저장
3. **대시보드 시각화:** 월간 운동 출석 잔디 캘린더, 연속 운동 일수(Streak), 부위별 운동 통계 제공
4. **피드백 루프:** 과거 기록을 2단계 루틴 프롬프트 컨텍스트에 자동 연동

---

## 5. 로컬 개발 및 테스트 실행 방법

1. **환경 변수 파일 생성 (`.env.local`):**
   ```env
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
   ```
2. **로컬 서버 구동 (Vercel CLI):**
   - Vercel 서버리스 함수와 정적 파일을 동시에 서빙하기 위해 `vercel dev`를 활용합니다.
   - 포트: 기본 `http://localhost:3000`
3. **검증 가이드라인:**
   - 에이전트는 코드를 추가/수정한 후 변경 사항과 함께 테스트 방법(예: 어떤 버튼을 누르고 어떤 응답이 와야 하는지)을 사용자에게 단계별로 설명해야 합니다.
