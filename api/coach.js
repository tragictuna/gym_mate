/**
 * ==============================================================================
 * 파일명: api/coach.js
 * 역할: 루틴 속 운동 하나를 "어떻게 + 왜" 설명하는 코치 설명을 만드는 Vercel 서버리스 함수
 *   - 시스템 프롬프트는 프로젝트 루트의 coach.md를 그대로 씁니다. 말투·규칙을 바꾸려면 coach.md만 고치면 됩니다.
 *   - 루틴 화면에서 사용자가 '이 운동 자세히 배우기'를 누를 때만 호출합니다(무료 한도 절약).
 * 모델: 1단계 Google Gemini API 직접 호출(gemini-3-flash-preview → 3.1-flash-lite → 3.5-flash-lite, GEMINI_API_KEY),
 *       실패하면 2단계 OpenRouter COACH_FREE_MODELS(무료). 단계 전환과 HTTP 오류 처리는 api/_lib/ai.js가 맡습니다. 유료 크레딧은 쓰지 않습니다.
 *
 * 요청: POST /api/coach
 *   {
 *     goal: "근육 늘리기"|"체력"|"체중 감량",
 *     equipment: { name_ko, name_en?, target_muscles[], role?, setup[]?, cautions[]? },   // 등록 기구 정보
 *     exercise:  { exercise, sets, reps, rest_sec, order?, why_this_order? },          // 루틴의 운동 한 개
 *     total_exercises?: number                                                         // 루틴 전체 운동 수 (순서 설명용)
 *   }
 * 응답(성공): { success: true, data: { headline, why_for_goal, setup[], steps[{cue, detail}], breathing,
 *              feel_check{right, wrong}, set_plan{sets, reps, rest_sec, why}, weight_tip,
 *              common_mistakes[{mistake, fix}], remember } }
 * 응답(실패): 400 잘못된 요청 / 405 / 500 키 없음·coach.md 없음 / 502 2번 모두 형식 실패 / 429 무료 모델 붐빔
 *
 * 참고(PRD '자세 교정은 하지 않는다'와의 관계): 이 API는 사용자의 자세를 보고 평가하지 않고,
 * 동작 방법과 이유를 글로 설명만 합니다(2026-11-19 사용자 결정으로 허용).
 * ==============================================================================
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildModelStages, callAI, hasAnyAIKey, NO_KEY_MESSAGE } from "./_lib/ai.js";

// 허용 목표 값 (routine.html의 칩 값과 같아야 합니다)
const ALLOWED_GOALS = ["근육 늘리기", "체력", "체중 감량"];

// 2단계(무료) 텍스트 모델. 1단계(Google Gemini 직접 호출)가 실패했을 때만 씁니다. 루틴 API와 같은 이유·순서입니다(2026-11-19 실측).
// OpenRouter models 배열은 최대 3개입니다.
const COACH_FREE_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "baidu/ernie-5.5-flash-preview:free",
  "dots-studio/dots-3-note-preview:free"
];

// 응답 최대 토큰. 설명 JSON이 루틴보다 길고(약 1500토큰) 무료 모델이 먼저 '생각'을 하므로 넉넉히 잡습니다. 무료라 비용 없음.
const MAX_TOKENS = 8000;

const FAIL_MESSAGE = "설명을 만들지 못했어요. 잠시 후 다시 시도해 주세요";

// coach.md 위치: 이 파일(api/coach.js) 기준 한 단계 위(프로젝트 루트).
// process.cwd() 대신 파일 위치 기준으로 찾아야 로컬(dev-server)과 Vercel 모두에서 같은 파일을 찾습니다.
// Vercel 배포 묶음에 coach.md가 들어가도록 vercel.json의 includeFiles에도 등록해 두었습니다.
const COACH_PROMPT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "coach.md");

/**
 * coach.md를 읽어 시스템 프롬프트로 돌려줍니다.
 * - 요청마다 읽는 이유: 개발 중에 coach.md를 고치면 서버를 다시 켜지 않아도 바로 반영되게 하기 위해서입니다.
 *   파일이 작아(약 3KB) 매번 읽어도 부담이 없습니다.
 * @returns {string|null} 프롬프트 내용, 파일이 없거나 비었으면 null
 */
function loadCoachPrompt() {
  try {
    const text = fs.readFileSync(COACH_PROMPT_PATH, "utf8").trim();
    return text || null;
  } catch (e) {
    console.error("[coach.md 읽기 실패]:", e.message);
    return null;
  }
}

/**
 * OpenRouter에 보낼 HTTP-Referer 값을 요청 정보로 만듭니다. (다른 API와 같은 방식)
 * @param {object} req - 요청 객체
 * @returns {string} origin → host → localhost 순으로 고른 주소
 */
function getReferer(req) {
  const headers = (req && req.headers) || {};
  if (headers.origin) return headers.origin;
  if (headers.host) {
    const proto = String(headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    return `${proto}://${headers.host}`;
  }
  return "http://localhost:3000";
}

/**
 * 프롬프트에 넣을 문자열로 정리합니다. 줄바꿈과 <>를 없애고 길이를 자릅니다.
 * @param {*} value - 원래 값
 * @param {number} maxLength - 최대 길이
 * @returns {string}
 * - 이유: 기구 이름·세팅법은 AI가 만들었거나 사용자가 고친 값이라, 프롬프트 구조를 흐트러뜨리지 않게 합니다.
 */
function cleanText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\r\n<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * 문자열 배열로 정리합니다. (최대 개수·길이 제한)
 * @param {*} value - 배열이 아니어도 됨
 * @param {number} maxItems - 최대 개수
 * @param {number} maxLength - 항목별 최대 길이
 * @returns {string[]}
 */
function cleanList(value, maxItems, maxLength) {
  return (Array.isArray(value) ? value : [])
    .map((v) => cleanText(v, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

/**
 * 요청 본문을 검사하고 정리합니다.
 * @param {*} body - req.body
 * @returns {{ok: true, input: Object} | {ok: false, error: string}}
 * - 예외 처리: 기구 이름이나 운동 이름이 없으면 설명할 대상이 없으므로 AI를 부르기 전에 400으로 돌려보냅니다.
 */
function validateRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "요청 본문이 없거나 JSON 형식이 아닙니다." };
  }
  if (!ALLOWED_GOALS.includes(body.goal)) {
    return { ok: false, error: `goal은 ${ALLOWED_GOALS.join(", ")} 중 하나여야 합니다.` };
  }
  const eq = body.equipment;
  const ex = body.exercise;
  if (!eq || typeof eq !== "object" || !cleanText(eq.name_ko, 40)) {
    return { ok: false, error: "equipment.name_ko(기구 이름)가 없습니다." };
  }
  if (!ex || typeof ex !== "object" || !cleanText(ex.exercise, 40)) {
    return { ok: false, error: "exercise.exercise(운동 이름)가 없습니다." };
  }

  // 세트·횟수·휴식은 루틴에서 받은 값이 있을 때만 '바꾸면 안 되는 값'으로 넘깁니다(coach.md 내용 원칙 3).
  const sets = Number(ex.sets);
  const rest = Number(ex.rest_sec);
  const reps = cleanText(ex.reps, 20);
  const order = Number(ex.order);
  const total = Number(body.total_exercises);

  return {
    ok: true,
    input: {
      goal: body.goal,
      equipment: {
        name_ko: cleanText(eq.name_ko, 40),
        name_en: cleanText(eq.name_en, 60),
        target_muscles: cleanList(eq.target_muscles, 6, 20),
        role: cleanText(eq.role, 80),
        setup: cleanList(eq.setup, 5, 80),
        cautions: cleanList(eq.cautions, 5, 80)
      },
      exercise: {
        exercise: cleanText(ex.exercise, 40),
        sets: Number.isFinite(sets) && sets > 0 ? Math.round(sets) : null,
        reps: reps || null,
        rest_sec: Number.isFinite(rest) && rest >= 0 ? Math.round(rest) : null,
        order: Number.isFinite(order) && order > 0 ? Math.round(order) : null,
        why_this_order: cleanText(ex.why_this_order, 200)
      },
      total_exercises: Number.isFinite(total) && total > 0 ? Math.round(total) : null
    }
  };
}

/**
 * 사용자 프롬프트(입력 정보)를 만듭니다. 출력 형식은 coach.md에 이미 있으므로 여기서는 입력만 정리합니다.
 * @param {Object} input - validateRequestBody가 정리한 값
 * @param {string[]} previousErrors - 재시도일 때 지난 응답의 문제 목록
 * @returns {string}
 */
function buildUserPrompt(input, previousErrors) {
  const { goal, equipment: eq, exercise: ex, total_exercises: total } = input;
  const lines = [
    "[사용자 목표]",
    `- ${goal}`,
    "",
    "[기구 정보]",
    `- 이름: ${eq.name_ko}${eq.name_en ? ` (${eq.name_en})` : ""}`,
    `- 타겟 근육: ${eq.target_muscles.join(", ") || "정보 없음"}`,
    `- 역할: ${eq.role || "정보 없음"}`,
    `- 세팅법: ${eq.setup.join(" / ") || "정보 없음"}`,
    `- 주의사항: ${eq.cautions.join(" / ") || "정보 없음"}`,
    "",
    "[오늘 루틴에서 이 운동]",
    `- 운동 이름: ${ex.exercise}`
  ];
  if (ex.sets && ex.reps && ex.rest_sec !== null) {
    lines.push(`- 세트·횟수·휴식(절대 바꾸지 말 것): ${ex.sets}세트, ${ex.reps}, 휴식 ${ex.rest_sec}초`);
  } else {
    lines.push("- 세트·횟수·휴식: 주어지지 않음 (목표별 기준을 쓸 것)");
  }
  if (ex.order) {
    lines.push(`- 순서: 전체 ${total || "?"}개 중 ${ex.order}번째`);
  }
  if (ex.why_this_order) {
    lines.push(`- 이 순서인 이유: ${ex.why_this_order}`);
  }
  lines.push("", "위 정보로 정해진 JSON 형식 하나만 출력해.");

  if (previousErrors.length > 0) {
    lines.push("", "[주의] 바로 전 응답의 문제를 고쳐서 다시 출력해:", ...previousErrors.map((e) => `- ${e}`));
  }
  return lines.join("\n");
}

/**
 * AI 응답이 coach.md 출력 형식에 맞는지 검사합니다.
 * @param {*} data - JSON.parse 결과
 * @returns {string[]} 문제 목록 (빈 배열이면 통과)
 * - 글자 수 제한은 검사하지 않습니다. 조금 넘는 것까지 실패로 보면 재시도가 잦아져 무료 한도와 시간을 낭비하기 때문입니다.
 *   대신 칸이 비었거나 개수가 크게 벗어난 경우만 실패로 봅니다.
 */
function validateCoach(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["응답이 JSON 객체가 아닙니다."];
  const errors = [];
  const isText = (v) => typeof v === "string" && v.trim() !== "";

  ["headline", "why_for_goal", "breathing", "weight_tip", "remember"].forEach((key) => {
    if (!isText(data[key])) errors.push(`${key}가 비었습니다.`);
  });
  if (!Array.isArray(data.setup) || data.setup.filter(isText).length === 0) errors.push("setup은 문자열 1개 이상의 배열이어야 합니다.");
  if (!Array.isArray(data.steps) || data.steps.filter((s) => s && isText(s.cue) && isText(s.detail)).length < 2) {
    errors.push("steps는 {cue, detail} 3~5개여야 합니다.");
  }
  if (!data.feel_check || !isText(data.feel_check.right) || !isText(data.feel_check.wrong)) {
    errors.push("feel_check.right와 feel_check.wrong이 모두 있어야 합니다.");
  }
  if (!data.set_plan || !isText(data.set_plan.why)) errors.push("set_plan.why가 비었습니다.");
  if (!Array.isArray(data.common_mistakes) || data.common_mistakes.filter((m) => m && isText(m.mistake) && isText(m.fix)).length === 0) {
    errors.push("common_mistakes는 {mistake, fix} 2~3개여야 합니다.");
  }
  return errors;
}

/**
 * 검사를 통과한 응답을 정리합니다.
 * @param {Object} data - AI 응답
 * @param {Object} ex - 요청의 운동 정보 (세트·횟수·휴식)
 * @returns {Object} 화면에 바로 쓸 수 있는 설명 객체
 * - set_plan의 숫자는 루틴에서 받은 값이 있으면 그 값으로 덮어씁니다. coach.md가 "절대 바꾸지 않는다"고 지시하지만,
 *   모델이 어겨도 루틴 화면과 설명의 숫자가 다르게 보이지 않도록 서버에서 한 번 더 보장합니다.
 */
function normalizeCoach(data, ex) {
  const t = (v) => String(v ?? "").trim();
  const plan = data.set_plan || {};
  return {
    headline: t(data.headline),
    why_for_goal: t(data.why_for_goal),
    setup: data.setup.map(t).filter(Boolean).slice(0, 3),
    steps: data.steps
      .filter((s) => s && t(s.cue) && t(s.detail))
      .slice(0, 5)
      .map((s) => ({ cue: t(s.cue), detail: t(s.detail) })),
    breathing: t(data.breathing),
    feel_check: { right: t(data.feel_check.right), wrong: t(data.feel_check.wrong) },
    set_plan: {
      sets: ex.sets ?? (Number(plan.sets) || null),
      reps: ex.reps ?? t(plan.reps),
      rest_sec: ex.rest_sec ?? (Number(plan.rest_sec) || null),
      why: t(plan.why)
    },
    weight_tip: t(data.weight_tip),
    common_mistakes: data.common_mistakes
      .filter((m) => m && t(m.mistake) && t(m.fix))
      .slice(0, 3)
      .map((m) => ({ mistake: t(m.mistake), fix: t(m.fix) })),
    remember: t(data.remember)
  };
}

/**
 * AI 응답 문자열에서 JSON 객체를 꺼내 파싱합니다. (다른 API와 같은 코드블록 제거 로직)
 * @param {string} rawContent - 모델 원문
 * @returns {{ok: true, data: *} | {ok: false, error: string}}
 */
function parseModelJson(rawContent) {
  if (!rawContent || rawContent.trim() === "") return { ok: false, error: "AI가 빈 응답을 보냈습니다." };
  let cleaned = rawContent.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/```$/, "").trim();
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { ok: false, error: "응답에서 JSON 객체를 찾지 못했습니다." };
  try {
    return { ok: true, data: JSON.parse(jsonMatch[0]) };
  } catch (e) {
    return { ok: false, error: `JSON 파싱 오류: ${e.message}` };
  }
}

/**
 * OpenRouter에 코치 설명을 한 번 요청합니다.
 * @param {Object} params - { referer, systemPrompt, userPrompt }
 * @returns {Promise<{ok: true, content: string} | {ok: false, status: number, error: string}>}
 * - 모델 단계(Gemini 직접 → OpenRouter 무료)와 HTTP 오류 처리는 api/_lib/ai.js의 callAI가 맡습니다.
 */
async function requestCoach({ referer, systemPrompt, userPrompt }) {
  return callAI({
    referer,
    label: "코치",
    stages: buildModelStages(COACH_FREE_MODELS),
    payload: {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.4, // 말투가 딱딱하지 않게 루틴(0.3)보다 조금 높게
      max_tokens: MAX_TOKENS,
      reasoning: { effort: "low" }
    }
  });
}

/**
 * Vercel 서버리스 핸들러
 * @param {object} req - 요청
 * @param {object} res - 응답
 */
export default async function handler(req, res) {
  // CORS 헤더 (다른 API와 같음)
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "허용되지 않는 HTTP 메서드입니다. POST 요청을 사용하세요." });
  }

  try {
    const check = validateRequestBody(req.body);
    if (!check.ok) return res.status(400).json({ success: false, error: check.error });

    // AI 키(GEMINI_API_KEY 또는 OPENROUTER_API_KEY)가 하나도 없으면 부를 모델이 없으므로 바로 알려 줍니다.
    if (!hasAnyAIKey()) {
      return res.status(500).json({ success: false, error: NO_KEY_MESSAGE });
    }

    const systemPrompt = loadCoachPrompt();
    if (!systemPrompt) {
      return res.status(500).json({ success: false, error: "서버에서 coach.md를 찾지 못했습니다." });
    }

    // 생성 → 파싱 → 형식 검사. 실패하면 1회만 재시도합니다(다른 API와 같은 정책).
    const referer = getReferer(req);
    const MAX_ATTEMPTS = 2;
    let previousErrors = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[코치 설명 ${attempt}/${MAX_ATTEMPTS}회차] ${check.input.exercise.exercise}`);
      const result = await requestCoach({
        referer,
        systemPrompt,
        userPrompt: buildUserPrompt(check.input, previousErrors)
      });
      if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });

      const parsed = parseModelJson(result.content);
      if (!parsed.ok) {
        previousErrors = [parsed.error, "JSON 객체 하나만 출력해야 한다."];
        console.warn(`[코치 ${attempt}회차 파싱 실패]:`, parsed.error);
        continue;
      }
      const errors = validateCoach(parsed.data);
      if (errors.length > 0) {
        previousErrors = errors;
        console.warn(`[코치 ${attempt}회차 형식 검사 실패]:`, errors);
        continue;
      }
      return res.status(200).json({ success: true, data: normalizeCoach(parsed.data, check.input.exercise) });
    }
    return res.status(502).json({ success: false, error: FAIL_MESSAGE });
  } catch (error) {
    console.error("[Internal Server Error in coach]:", error);
    return res.status(500).json({ success: false, error: `서버 내부 오류가 발생했습니다: ${error.message}` });
  }
}
