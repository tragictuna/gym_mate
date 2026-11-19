/**
 * ==============================================================================
 * 파일명: api/routine.js
 * 역할: 사용자가 고른 조건과 '내 헬스장'에 등록한 기구 목록으로 오늘의 루틴을 만드는 Vercel 서버리스 함수 (PRD 7장)
 * 모델: process.env.OPENROUTER_MODEL (없으면 "google/gemma-4-26b-a4b-it:free")
 *       실패하면 ROUTINE_FREE_FALLBACKS(무료 모델)로 순서대로 넘어갑니다. 유료 모델은 쓰지 않습니다.
 *
 * 요청: POST /api/routine
 *   {
 *     conditions: { goal: "근육 늘리기"|"체력"|"체중 감량", minutes: 30|45|60, body_part: string },
 *     (경력은 받지 않습니다. 대상이 모두 헬스 0~2개월 초보라 시스템 프롬프트에 고정했습니다. 예전 클라이언트가 보내도 무시합니다.)
 *     equipment:  [ { id: "eq_...", name_ko: string, target_muscles: string[] }, ... ]   // 1개 이상
 *   }
 * 응답(성공): { success: true, data: {
 *     principle: string,          // 루틴 전체 원칙 한 줄 (앱의 차별점: "왜 이 순서인가")
 *     total_minutes: number,
 *     warmup: string,             // 등록 기구나 맨몸으로 하는 짧은 워밍업
 *     exercises: [ { order, equipment_id, exercise, sets, reps, rest_sec, why_this_order } ]  // order 순 정렬
 *   }, filtered_count: number }   // 등록 목록에 없는 기구를 써서 걸러낸 운동 수 (등록 기구 준수율 검증용)
 * 응답(실패): { success: false, error }
 *   - 400: 본문 없음, 조건 값이 허용 범위 밖, 기구가 0개
 *   - 405: POST가 아닌 요청 / 500: 키 없음·내부 오류
 *   - 502: 2번(최초 + 재시도 1회) 모두 형식 실패이거나, 걸러낸 뒤 운동이 하나도 남지 않음
 *   - 429: 무료 모델이 모두 붐빔 / 그 밖: OpenRouter 오류 코드를 그대로 전달
 *
 * 서버 검사 순서 (AI가 지시를 어겨도 사용자에게 잘못된 루틴이 가지 않게 하는 안전장치)
 *   (1) equipment_id가 등록 목록에 없는 운동은 걸러냅니다.
 *   (2) 걸러낸 뒤 운동이 비거나 너무 적으면, 걸러낸 기구를 '금지 목록'으로 알려 주고 1회 다시 생성합니다.
 *   (3) why_this_order 등 필수 값이 빠진 운동이 있으면 형식 실패로 보고 1회 재시도합니다.
 *   (4) order 순서대로 정렬하고 1, 2, 3...으로 다시 번호를 매깁니다.
 * ==============================================================================
 */

// 허용 조건 값 (routine.html의 칩 값과 같아야 합니다)
const ALLOWED_GOALS = ["근육 늘리기", "체력", "체중 감량"];
const ALLOWED_MINUTES = [30, 45, 60];

// 기구 목록 최대 개수. 프롬프트가 지나치게 길어지는 것을 막습니다(헬스장 기구를 다 등록해도 보통 이보다 적음).
const MAX_EQUIPMENT = 40;

// 시간별 최소 운동 수. 걸러낸 뒤 이보다 적으면 다시 생성합니다. (등록 기구가 더 적으면 그 수까지만 요구)
const MIN_EXERCISES_BY_MINUTES = { 30: 3, 45: 4, 60: 5 };

// 주 모델이 실패했을 때 넘어갈 무료 모델 목록. 루틴은 글만 주고받으므로 이미지를 못 읽는 모델도 쓸 수 있습니다.
// - 무작위 라우터 openrouter/free는 품질을 예측할 수 없어 쓰지 않습니다.
// - 유료 모델은 크레딧 차감을 막기 위해 넣지 않습니다(사용자 결정).
// - 순서는 2026-11-19 실측 결과로 정했습니다: ernie-5.5-flash 약 10초·등록 기구 5/5·이유 자연스러움,
//   dots-3-note 약 110초(느리지만 정확해 마지막 대비용). gemma-4-31b는 주 모델과 같은 공유 한도에 막혀(429) 뺐습니다.
// - OpenRouter는 models 배열을 최대 3개까지만 받으므로(4개면 HTTP 400) 주 모델 + 2개로 맞춥니다.
const ROUTINE_FREE_FALLBACKS = [
  "baidu/ernie-5.5-flash-preview:free",
  "dots-studio/dots-3-note-preview:free"
];

// OpenRouter models 배열 최대 길이 (넘으면 400 "models array must have 3 items or fewer")
const MAX_MODELS = 3;

// 응답 최대 토큰. 무료 모델 대부분이 먼저 '생각'을 하므로, JSON 답(약 1000토큰)에 생각할 몫을 넉넉히 더합니다. 무료라 비용 없음.
const MAX_TOKENS = 8000;

// 최종 실패 시 사용자에게 보여 줄 문구
const FAIL_MESSAGE = "루틴을 만들지 못했어요. 잠시 후 다시 시도해 주세요";

/**
 * OpenRouter에 보낼 HTTP-Referer 값을 요청 정보로 만듭니다.
 * - 동작 원리: 하드코딩된 localhost 대신 실제 접속 주소를 써서, 로컬과 Vercel 배포 환경 모두에서 올바른 출처를 알립니다.
 *   1순위는 브라우저가 보내는 origin 헤더, 2순위는 host 헤더(+프로토콜)입니다.
 * @param {object} req - 들어온 HTTP 요청 객체 (req.headers.origin, req.headers.host 사용)
 * @returns {string} 예: "https://gymmate.vercel.app" 또는 "http://localhost:3000"
 * - 예외 처리: curl 등 헤더가 없는 요청에서도 호출이 실패하지 않도록, 둘 다 없으면 localhost를 씁니다.
 */
function getReferer(req) {
  const headers = (req && req.headers) || {};
  if (headers.origin) {
    return headers.origin;
  }
  if (headers.host) {
    // Vercel은 프록시 뒤에서 동작하므로 x-forwarded-proto로 원래 프로토콜(https)을 알아냅니다.
    const proto = String(headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    return `${proto}://${headers.host}`;
  }
  return "http://localhost:3000";
}

/**
 * 프롬프트에 넣을 짧은 문자열로 정리합니다.
 * @param {*} value - 원래 값
 * @param {number} maxLength - 최대 길이
 * @returns {string} 줄바꿈·<>를 없애고 길이를 자른 문자열
 * - 이유: 기구 이름은 원래 AI가 만든 값이고 사용자가 고칠 수도 있어서, 줄바꿈이나 지시문처럼 보이는 글자가
 *   프롬프트 구조를 흐트러뜨리지 않게 합니다.
 */
function cleanText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\r\n<>]+/g, " ")
    .replace(/\s+/g, " ") // 지운 자리에 생긴 겹친 공백을 한 칸으로 합칩니다.
    .trim()
    .slice(0, maxLength);
}

/**
 * 요청 본문을 검사하고 정리합니다.
 * @param {*} body - req.body
 * @returns {{ok: true, conditions: Object, equipment: Array} | {ok: false, error: string}}
 * - 예외 처리: 잘못된 요청은 AI를 부르기 전에 400으로 돌려보내 무료 한도와 시간을 아낍니다.
 *   기구가 0개면 '등록 기구만 쓴다'는 원칙을 지킬 수 없으므로 400입니다(PRD).
 */
function validateRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "요청 본문이 없거나 JSON 형식이 아닙니다." };
  }

  const c = body.conditions;
  if (!c || typeof c !== "object") {
    return { ok: false, error: "conditions(목표, 시간, 부위)가 없습니다." };
  }
  const minutes = Number(c.minutes);
  if (!ALLOWED_GOALS.includes(c.goal)) {
    return { ok: false, error: `goal은 ${ALLOWED_GOALS.join(", ")} 중 하나여야 합니다.` };
  }
  if (!ALLOWED_MINUTES.includes(minutes)) {
    return { ok: false, error: `minutes는 ${ALLOWED_MINUTES.join(", ")} 중 하나여야 합니다.` };
  }
  const bodyPart = cleanText(c.body_part, 20);
  if (!bodyPart) {
    return { ok: false, error: "body_part(운동 부위)가 없습니다." };
  }

  if (!Array.isArray(body.equipment) || body.equipment.length === 0) {
    return { ok: false, error: "등록된 기구가 없습니다. 내 헬스장에 기구를 먼저 등록해 주세요." };
  }
  if (body.equipment.length > MAX_EQUIPMENT) {
    return { ok: false, error: `기구는 최대 ${MAX_EQUIPMENT}개까지 보낼 수 있습니다.` };
  }

  // 기구 정리: id와 이름이 있는 것만, id 중복은 한 번만
  const seen = new Set();
  const equipment = [];
  for (const item of body.equipment) {
    const id = cleanText(item && item.id, 40);
    const name = cleanText(item && item.name_ko, 40);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const muscles = Array.isArray(item.target_muscles)
      ? item.target_muscles.map((m) => cleanText(m, 20)).filter(Boolean).slice(0, 5)
      : [];
    equipment.push({ id, name_ko: name, target_muscles: muscles });
  }
  if (equipment.length === 0) {
    return { ok: false, error: "기구 목록에 id와 name_ko가 있는 항목이 없습니다." };
  }

  return {
    ok: true,
    conditions: { goal: c.goal, minutes, body_part: bodyPart },
    equipment
  };
}

/**
 * AI 응답이 출력 스키마에 맞는지 검사합니다. (기구 id가 목록에 있는지는 여기서 보지 않고 filterExercises에서 따로 봅니다)
 * @param {*} data - JSON.parse 결과
 * @returns {string[]} 문제 목록. 빈 배열이면 통과입니다. 재시도할 때 AI에게 그대로 알려 줍니다.
 */
function validateRoutine(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["응답이 JSON 객체가 아닙니다."];
  }
  const errors = [];
  const isText = (v) => typeof v === "string" && v.trim() !== "";
  const isPositive = (v) => Number.isFinite(Number(v)) && Number(v) > 0;

  if (!isText(data.principle)) errors.push("principle(루틴 전체 원칙 한 줄)이 없습니다.");
  if (!isText(data.warmup)) errors.push("warmup(워밍업 설명 문자열)이 없습니다.");
  if (!isPositive(data.total_minutes)) errors.push("total_minutes는 양수여야 합니다.");
  if (!Array.isArray(data.exercises) || data.exercises.length === 0) {
    errors.push("exercises는 운동 1개 이상의 배열이어야 합니다.");
    return errors;
  }

  data.exercises.forEach((ex, i) => {
    const label = `exercises[${i}]`;
    if (!ex || typeof ex !== "object") {
      errors.push(`${label}가 객체가 아닙니다.`);
      return;
    }
    // PRD: why_this_order가 빠지면 앱의 핵심(순서의 이유)이 없으므로 반드시 형식 실패로 봅니다.
    if (!isText(ex.why_this_order)) errors.push(`${label}.why_this_order(이 순서인 이유 한 문장)가 없습니다.`);
    if (!isText(ex.equipment_id)) errors.push(`${label}.equipment_id가 없습니다.`);
    if (!isText(ex.exercise)) errors.push(`${label}.exercise(운동 이름)가 없습니다.`);
    if (!isPositive(ex.order)) errors.push(`${label}.order는 양수여야 합니다.`);
    if (!isPositive(ex.sets)) errors.push(`${label}.sets는 양수여야 합니다.`);
    if (!(isText(ex.reps) || isPositive(ex.reps))) errors.push(`${label}.reps(횟수)가 없습니다.`);
    if (!Number.isFinite(Number(ex.rest_sec)) || Number(ex.rest_sec) < 0) {
      errors.push(`${label}.rest_sec는 0 이상의 숫자여야 합니다.`);
    }
  });
  return errors;
}

/**
 * 등록 목록에 없는 equipment_id를 쓴 운동을 걸러냅니다. (서버 검사 1)
 * @param {Array} exercises - 형식 검사를 통과한 운동 배열
 * @param {Set<string>} allowedIds - 등록 기구 id 집합
 * @returns {{kept: Array, removed: Array}} 남은 운동과 걸러낸 운동
 */
function filterExercises(exercises, allowedIds) {
  const kept = [];
  const removed = [];
  exercises.forEach((ex) => {
    (allowedIds.has(String(ex.equipment_id).trim()) ? kept : removed).push(ex);
  });
  return { kept, removed };
}

/**
 * 최종 응답 형태로 정리합니다. (서버 검사 4: order 정렬 후 1부터 다시 번호 매김)
 * @param {Object} data - 형식 검사를 통과한 AI 응답
 * @param {Array} kept - 걸러내고 남은 운동
 * @param {number} minutes - 요청한 운동 시간 (AI 값이 이상할 때 대신 씀)
 * @returns {Object} { principle, total_minutes, warmup, exercises }
 */
function normalizeRoutine(data, kept, minutes) {
  const exercises = kept
    .slice()
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((ex, i) => ({
      order: i + 1,
      equipment_id: String(ex.equipment_id).trim(),
      exercise: String(ex.exercise).trim(),
      sets: Math.round(Number(ex.sets)),
      reps: String(ex.reps).trim(),
      rest_sec: Math.round(Number(ex.rest_sec)),
      why_this_order: String(ex.why_this_order).trim()
    }));
  const total = Math.round(Number(data.total_minutes));
  return {
    principle: data.principle.trim(),
    // AI가 요청 시간과 크게 다른 값을 내면 화면에 엉뚱한 시간이 보이므로 요청 시간을 씁니다.
    total_minutes: Math.abs(total - minutes) <= 10 ? total : minutes,
    warmup: data.warmup.trim(),
    exercises
  };
}

/**
 * AI 응답 문자열에서 JSON 객체를 꺼내 파싱합니다. (recognize.js와 같은 코드블록 제거 로직)
 * @param {string} rawContent - 모델이 돌려준 원문
 * @returns {{ok: true, data: *} | {ok: false, error: string}}
 */
function parseModelJson(rawContent) {
  if (!rawContent || rawContent.trim() === "") {
    return { ok: false, error: "AI가 빈 응답을 보냈습니다." };
  }
  let cleaned = rawContent.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/```$/, "").trim();
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { ok: false, error: "응답에서 JSON 객체를 찾지 못했습니다." };
  }
  try {
    return { ok: true, data: JSON.parse(jsonMatch[0]) };
  } catch (e) {
    return { ok: false, error: `JSON 파싱 오류: ${e.message}` };
  }
}

// 시스템 프롬프트: 역할과 절대 규칙
const SYSTEM_PROMPT = `너는 헬스 0~2개월 차 초보자에게 오늘의 루틴을 짜 주는 트레이너다.
이 앱의 핵심은 "따라 하기가 아니라 순서의 이유를 이해하게 하는 것"이다.

[절대 규칙]
1. 목록에 없는 기구는 절대 쓰지 않는다. 덤벨, 바벨, 맨몸 보조 운동도 목록에 없으면 메인 운동으로 넣지 않는다.
2. equipment_id는 목록의 id를 글자 하나 바꾸지 말고 그대로 쓴다.
3. principle은 루틴 전체 원칙을 한 줄로 쓴다. (예시 형식: "<무엇을> 먼저, <무엇을> 나중에 하는 이유")
4. why_this_order는 운동마다 한 문장으로, 왜 이 운동이 이 순서에 오는지 쓴다. 앞뒤 운동과의 관계를 말한다.
5. warmup은 등록 기구나 맨몸으로 하는 5분 안팎의 짧은 워밍업을 한 문자열로 쓴다.
6. 운동 시간(분)에 맞게 운동 수, 세트, 휴식을 정한다. 대략 30분은 3~4개, 45분은 4~5개, 60분은 5~6개.
7. 초보자 기준으로 세트는 2~4, 휴식은 45~120초 안에서 정한다. 자세 교정은 하지 않는다.
8. 반드시 JSON 객체 하나만 출력한다. 인사말, 설명, 마크다운 코드블록은 쓰지 않는다.`;

/**
 * 사용자 프롬프트를 만듭니다.
 * @param {Object} conditions - { goal, minutes, body_part }
 * @param {Array} equipment - 정리된 기구 목록
 * @param {string[]} bannedIds - 지난 응답에서 목록에 없어서 걸러진 id (금지 목록, 서버 검사 2)
 * @param {string[]} previousErrors - 지난 응답의 형식 문제 (서버 검사 3)
 * @returns {string}
 * - 응답 형식에는 실제 운동 이름 대신 <설명>만 둡니다. 예시 이름을 넣으면 모델이 그대로 베끼는 문제가 있었기 때문입니다.
 */
function buildUserPrompt(conditions, equipment, bannedIds, previousErrors) {
  const list = equipment
    .map((e) => `- id: ${e.id} | 이름: ${e.name_ko} | 근육: ${e.target_muscles.join(", ") || "정보 없음"}`)
    .join("\n");

  let text = `[오늘 조건]
- 목표: ${conditions.goal}
- 운동 시간: ${conditions.minutes}분
- 운동 부위: ${conditions.body_part}

[내 헬스장 기구 목록 — 이 목록의 기구만 쓴다]
${list}

아래 형식의 JSON 하나로만 답해. <> 안은 설명이니 실제 값으로 바꿔 써.
{
  "principle": "<루틴 전체 원칙 한 줄>",
  "total_minutes": ${conditions.minutes},
  "warmup": "<등록 기구나 맨몸으로 하는 짧은 워밍업>",
  "exercises": [
    { "order": 1, "equipment_id": "<목록의 id 그대로>", "exercise": "<운동 이름>", "sets": 3, "reps": "<예: 10~12회>", "rest_sec": 90, "why_this_order": "<이 순서인 이유 한 문장>" }
  ]
}`;

  if (bannedIds.length > 0) {
    text += `\n\n[금지] 바로 전 응답에서 다음 id는 목록에 없어서 뺐다. 절대 쓰지 마: ${bannedIds.join(", ")}`;
  }
  if (previousErrors.length > 0) {
    text += `\n\n[주의] 바로 전 응답의 문제를 고쳐서 다시 출력해:\n- ${previousErrors.join("\n- ")}`;
  }
  return text;
}

/**
 * OpenRouter에 루틴 생성을 한 번 요청합니다.
 * @param {Object} params - { apiKey, modelName, referer, userPrompt }
 * @returns {Promise<{ok: true, content: string} | {ok: false, status: number, error: string}>}
 * - 예외 처리: HTTP 오류는 다시 해도 같을 가능성이 높아(키 오류, 한도 초과) 재시도하지 않고 돌려줍니다.
 */
async function requestRoutine({ apiKey, modelName, referer, userPrompt }) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "GymMate"
    },
    body: JSON.stringify({
      model: modelName,
      // 주 모델이 실패하면 무료 모델로 순서대로 넘어갑니다. 주 모델과 같은 이름은 한 번만 넣고, 최대 3개로 자릅니다.
      models: [modelName].concat(ROUTINE_FREE_FALLBACKS.filter((m) => m !== modelName)).slice(0, MAX_MODELS),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: MAX_TOKENS,
      // 생각하는 양을 줄여 응답 시간을 아낍니다. 지원하지 않는 모델은 무시합니다.
      reasoning: { effort: "low" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[OpenRouter Routine Error]:", response.status, errorText);
    if (response.status === 429) {
      return { ok: false, status: 429, error: "무료 AI가 지금 붐벼요. 1~2분 뒤에 다시 시도해 주세요." };
    }
    let message = errorText;
    try {
      message = JSON.parse(errorText).error?.message || errorText;
    } catch (e) {
      // JSON이 아닌 일반 텍스트 오류면 원문을 그대로 씁니다.
    }
    return { ok: false, status: response.status, error: `AI 서버 요청 실패 (${response.status}): ${message}` };
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  // 실제로 답한 모델과 잘림 여부(length)를 남겨 문제를 추적하기 쉽게 합니다.
  console.log(`[루틴 응답] 실제 모델: ${data.model}, finish_reason: ${choice?.finish_reason}`);
  return { ok: true, content: choice?.message?.content || "" };
}

/**
 * Vercel 서버리스 핸들러
 * @param {object} req - 요청 (req.method, req.headers, req.body)
 * @param {object} res - 응답 (res.status().json(), res.setHeader, res.end)
 */
export default async function handler(req, res) {
  // CORS 헤더 설정 (기존 로직 재사용)
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "허용되지 않는 HTTP 메서드입니다. POST 요청을 사용하세요." });
  }

  try {
    // 1) 요청 검사 — 잘못된 요청은 키 검사보다 먼저 400으로 돌려보냅니다.
    const check = validateRequestBody(req.body);
    if (!check.ok) {
      return res.status(400).json({ success: false, error: check.error });
    }
    const { conditions, equipment } = check;

    // 2) 키·모델 확인
    const apiKey = process.env.OPENROUTER_API_KEY;
    const modelName = process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";
    if (!apiKey || apiKey.trim() === "" || apiKey === "your_openrouter_api_key_here") {
      return res.status(500).json({
        success: false,
        error: "서버에 OPENROUTER_API_KEY 환경 변수가 설정되지 않았습니다. .env.local 파일을 확인해 주세요."
      });
    }

    // 3) 생성 → 파싱 → 형식 검사 → 기구 필터. 실패하면 1회만 다시 생성합니다(총 최대 2번).
    const allowedIds = new Set(equipment.map((e) => e.id));
    const minExercises = Math.min(MIN_EXERCISES_BY_MINUTES[conditions.minutes], equipment.length);
    const referer = getReferer(req);
    const MAX_ATTEMPTS = 2;
    const bannedIds = new Set(); // 지금까지 걸러진 가짜 id (다음 시도에 금지 목록으로 알려 줌)
    let previousErrors = [];
    let fallbackResult = null; // 2회차에도 운동 수가 모자랄 때 대신 돌려줄 '걸러낸 뒤 1개 이상 남은' 결과

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[루틴 생성 ${attempt}/${MAX_ATTEMPTS}회차] ${conditions.minutes}분, 기구 ${equipment.length}개`);
      const result = await requestRoutine({
        apiKey,
        modelName,
        referer,
        userPrompt: buildUserPrompt(conditions, equipment, [...bannedIds], previousErrors)
      });
      if (!result.ok) {
        return res.status(result.status).json({ success: false, error: result.error });
      }

      const parsed = parseModelJson(result.content);
      if (!parsed.ok) {
        previousErrors = [parsed.error, "JSON 객체 하나만 출력해야 한다."];
        console.warn(`[루틴 ${attempt}회차 파싱 실패]:`, parsed.error);
        continue;
      }

      // 서버 검사 3: why_this_order 등 필수 값 확인
      const errors = validateRoutine(parsed.data);
      if (errors.length > 0) {
        previousErrors = errors.slice(0, 8); // 프롬프트가 너무 길어지지 않게 앞쪽 문제만 알려 줍니다.
        console.warn(`[루틴 ${attempt}회차 형식 검사 실패]:`, errors);
        continue;
      }

      // 서버 검사 1: 목록에 없는 기구 걸러내기
      const { kept, removed } = filterExercises(parsed.data.exercises, allowedIds);
      removed.forEach((ex) => bannedIds.add(String(ex.equipment_id).trim()));
      if (removed.length > 0) {
        console.warn(`[루틴 ${attempt}회차] 목록에 없는 기구 ${removed.length}개 걸러냄:`, removed.map((e) => e.equipment_id));
      }

      const routine = normalizeRoutine(parsed.data, kept, conditions.minutes);
      const payload = { success: true, data: routine, filtered_count: removed.length };

      // 서버 검사 2: 걸러낸 뒤 충분하면 완료, 모자라면 금지 목록을 알려 주고 다시 생성
      if (kept.length >= minExercises) {
        return res.status(200).json(payload);
      }
      if (kept.length > 0) fallbackResult = payload;
      previousErrors = [`등록 기구로 만든 운동이 ${kept.length}개뿐이다. 목록의 기구만으로 ${minExercises}개 이상 만들어야 한다.`];
      console.warn(`[루틴 ${attempt}회차] 운동 ${kept.length}개 < 최소 ${minExercises}개 → 다시 생성`);
    }

    // 2번 시도 후에도 모자라지만 1개 이상 남은 결과가 있으면, 빈손보다 나으므로 그 결과를 돌려줍니다.
    if (fallbackResult) {
      return res.status(200).json(fallbackResult);
    }
    return res.status(502).json({ success: false, error: FAIL_MESSAGE });
  } catch (error) {
    console.error("[Internal Server Error in routine]:", error);
    return res.status(500).json({ success: false, error: `서버 내부 오류가 발생했습니다: ${error.message}` });
  }
}
