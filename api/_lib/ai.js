/**
 * ==============================================================================
 * 파일명: api/_lib/ai.js
 * 역할: 세 API(recognize, routine, coach)가 함께 쓰는 AI 호출 도우미
 *   - '_'로 시작하는 폴더라 Vercel이 API 주소(/api/...)로 만들지 않습니다. dev-server.js도 같은 규칙으로 막습니다.
 *
 * 모델 단계 (2026-11-19 사용자 결정)
 *   1단계 "Google Gemini": 내 Google AI Studio 키로 Gemini API를 직접 호출합니다.
 *       - 이유: OpenRouter 무료 모델은 느리고(최대 1~2분) 품질이 낮았고, 쓰고 있는 OpenRouter 계정이 본인 것이 아니라
 *         Google 키를 OpenRouter에 연결(BYOK)할 수 없어서, Google API를 직접 부르기로 했습니다(돈은 쓰지 않음).
 *       - Google의 OpenAI 호환 주소를 써서 메시지·사진 형식을 OpenRouter와 똑같이 보냅니다.
 *       - gemini-3-flash-preview → 3.1-flash-lite → 3.5-flash-lite 순서로 시도합니다(모델당 최대 40초).
 *       - GEMINI_API_KEY가 없으면 이 단계는 건너뜁니다(쓸데없는 호출 없음).
 *   2단계 "OpenRouter 무료": 1단계가 실패(키 없음, 무료 한도 초과 429 등)하면 각 API의 :free 모델 목록으로 넘어갑니다.
 *       - AGENTS.md 규칙대로 OPENROUTER_API_KEY, HTTP-Referer, X-Title: GymMate 헤더를 씁니다.
 *
 * 환경 변수 (.env.local / Vercel 환경 변수)
 *   - GEMINI_API_KEY     : 내 Google AI Studio 키 (있으면 1단계 사용)
 *   - GEMINI_MODEL       : 1단계 첫 모델을 바꿀 때만 (없으면 gemini-3-flash-preview)
 *   - OPENROUTER_API_KEY : OpenRouter 키 (2단계에 필요)
 *   - OPENROUTER_MODEL   : 2단계 첫 모델을 바꿀 때만 (없으면 각 API 목록의 첫 모델, 기본 google/gemma-4-26b-a4b-it:free)
 * ==============================================================================
 */

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// OpenRouter models 배열 최대 길이 (넘으면 HTTP 400 "models array must have 3 items or fewer")
export const MAX_MODELS = 3;

// 1단계 Gemini 모델 (모두 사진을 읽을 수 있어 세 API 모두에 씁니다).
// 2026-11-19 실측(예시 사진 = 레그 익스텐션):
//   gemini-3-flash-preview 6초 정답 / gemini-3.1-flash-lite 4초 정답 / gemini-3.5-flash-lite 11초 정답
//   gemini-3.5-flash·3.8-flash는 503(수요 많음), 3.7-flash는 5분 넘게 응답 없음 → 제외
//   gemini-2.5-flash·flash-lite는 "새 사용자에게 더 이상 제공되지 않음"(404) → 제외
// 순서: 정확도가 가장 높을 것으로 기대되는 flash-preview → 가장 빠른 3.1-flash-lite → 3.5-flash-lite
export const GEMINI_MODELS = ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];

// Gemini 요청 한 번의 제한 시간. 붐비는 모델은 몇 분 동안 응답 없이 붙잡고 있다가 503을 주기도 해서(실측 64~308초),
// 이 시간이 지나면 끊고 다음 모델로 넘어갑니다. 정상 응답은 4~11초였으므로 40초면 충분합니다.
const GEMINI_TIMEOUT_MS = 40000;

// OpenRouter 무료 단계의 제한 시간. 가장 느린 무료 모델(dots-3-note)이 약 110초 걸려서 넉넉히 잡습니다.
const OPENROUTER_TIMEOUT_MS = 150000;

/**
 * 키 값이 실제로 설정됐는지 확인합니다. (빈 값, 예시 값은 없는 것으로 봄)
 * @param {string|undefined} key - 환경 변수 값
 * @returns {boolean}
 */
function hasKey(key) {
  return Boolean(key && key.trim() && !/^your_/.test(key.trim()));
}

/**
 * 시도할 모델 단계를 만듭니다.
 * @param {string[]} freeModels - 2단계 OpenRouter 무료 모델 목록 (API마다 다름: 사진 인식은 비전 모델만)
 * @returns {Array<{name: string, type: "gemini"|"openrouter", models: string[]}>} 순서대로 시도할 단계
 */
export function buildModelStages(freeModels) {
  const stages = [];

  if (hasKey(process.env.GEMINI_API_KEY)) {
    const primary = process.env.GEMINI_MODEL || GEMINI_MODELS[0];
    stages.push({
      name: "Google Gemini",
      type: "gemini",
      models: [primary].concat(GEMINI_MODELS.filter((m) => m !== primary))
    });
  }

  if (hasKey(process.env.OPENROUTER_API_KEY)) {
    const freePrimary = process.env.OPENROUTER_MODEL || freeModels[0];
    stages.push({
      name: "OpenRouter 무료",
      type: "openrouter",
      models: [freePrimary].concat(freeModels.filter((m) => m !== freePrimary)).slice(0, MAX_MODELS)
    });
  }
  return stages;
}

/**
 * AI 키가 하나라도 설정됐는지 확인합니다. 각 API가 AI를 부르기 전에 씁니다.
 * @returns {boolean} GEMINI_API_KEY나 OPENROUTER_API_KEY 중 하나라도 있으면 true
 */
export function hasAnyAIKey() {
  return hasKey(process.env.GEMINI_API_KEY) || hasKey(process.env.OPENROUTER_API_KEY);
}

// 키가 하나도 없을 때 각 API가 돌려줄 안내 문구
export const NO_KEY_MESSAGE =
  "서버에 AI 키가 설정되지 않았습니다. .env.local에 GEMINI_API_KEY 또는 OPENROUTER_API_KEY를 넣어 주세요.";

/**
 * 모델 하나(또는 OpenRouter 모델 묶음)에 한 번 요청합니다.
 * @param {Object} stage - 단계 정보
 * @param {string|string[]} model - Gemini는 모델 하나, OpenRouter는 모델 목록(서버 쪽 fallback)
 * @param {Object} payload - messages, max_tokens 등 공통 요청 본문
 * @param {string} referer - OpenRouter HTTP-Referer
 * @returns {Promise<Response>} fetch 응답
 * - Gemini와 OpenRouter의 차이(주소, 키, 생각량 옵션 이름)를 여기서만 처리합니다.
 */
function sendRequest(stage, model, payload, referer) {
  const { reasoning, ...common } = payload;
  // 제한 시간이 지나면 요청을 끊습니다(AbortSignal.timeout → fetch가 TimeoutError로 실패 → callAI가 다음 모델로 넘어감).
  const signal = AbortSignal.timeout(stage.type === "gemini" ? GEMINI_TIMEOUT_MS : OPENROUTER_TIMEOUT_MS);

  if (stage.type === "gemini") {
    return fetch(GEMINI_URL, {
      method: "POST",
      signal,
      headers: {
        "Authorization": `Bearer ${process.env.GEMINI_API_KEY.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...common,
        model,
        // Google 호환 주소는 생각량을 reasoning_effort("low" 등)로 받습니다.
        ...(reasoning && reasoning.effort ? { reasoning_effort: reasoning.effort } : {})
      })
    });
  }

  return fetch(OPENROUTER_URL, {
    method: "POST",
    signal,
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "GymMate"
    },
    body: JSON.stringify({
      ...common,
      model: model[0],
      models: model,
      ...(reasoning ? { reasoning } : {})
    })
  });
}

/**
 * 단계(와 Gemini 단계 안의 모델)를 차례로 시도하며 AI를 호출합니다.
 * @param {Object} params
 * @param {string} params.referer - OpenRouter HTTP-Referer 헤더 값
 * @param {string} params.label - 로그에 붙일 이름 (예: "기구 인식")
 * @param {Array} params.stages - buildModelStages의 결과
 * @param {Object} params.payload - messages, response_format, max_tokens, temperature, reasoning 등
 * @returns {Promise<{ok: true, content: string, model: string, stage: string} | {ok: false, status: number, error: string}>}
 * - 예외 처리:
 *   · HTTP 오류(키 오류 400·401·403, 한도 429, 서버 오류 5xx)나 네트워크 오류는 다음 모델/단계로 넘어갑니다.
 *   · 모두 실패하면 마지막 오류를 돌려줍니다. 429는 쉬운 말로 바꿉니다.
 *   · 응답 내용(JSON 형식) 검사는 각 API가 맡습니다. 여기서는 HTTP 수준 실패만 다룹니다.
 */
export async function callAI({ referer, label, stages, payload }) {
  let lastError = { ok: false, status: 502, error: "AI 서버에 요청하지 못했어요." };

  for (const stage of stages) {
    // Gemini는 모델을 하나씩 직접 시도하고, OpenRouter는 모델 목록을 한 번에 보내 서버 쪽 fallback을 씁니다.
    const attempts = stage.type === "gemini" ? stage.models : [stage.models];

    for (const model of attempts) {
      const modelLabel = Array.isArray(model) ? model[0] : model;
      let response;
      try {
        response = await sendRequest(stage, model, payload, referer);
      } catch (e) {
        // 제한 시간 초과(TimeoutError)와 네트워크 오류를 구분해 로그와 안내를 남깁니다.
        const isTimeout = e && (e.name === "TimeoutError" || e.name === "AbortError");
        console.warn(`[${label}] ${stage.name}(${modelLabel}) ${isTimeout ? "제한 시간 초과" : "네트워크 오류: " + e.message} → 다음`);
        lastError = isTimeout
          ? { ok: false, status: 504, error: "AI 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." }
          : { ok: false, status: 502, error: "AI 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요." };
        continue;
      }

      if (response.ok) {
        const data = await response.json();
        const choice = data.choices && data.choices[0];
        // 어느 단계·모델이 답했는지, 잘렸는지(length) 남겨 두면 속도·품질 문제를 추적하기 쉽습니다.
        console.log(
          `[${label} 응답] 단계: ${stage.name}, 실제 모델: ${data.model || modelLabel}, finish_reason: ${choice && choice.finish_reason}`
        );
        return {
          ok: true,
          content: (choice && choice.message && choice.message.content) || "",
          model: data.model || modelLabel,
          stage: stage.name
        };
      }

      const errorText = await response.text();
      let message = errorText;
      try {
        // Google은 오류를 [{ error: {...} }]처럼 배열로 보낼 때가 있어 첫 항목을 꺼냅니다.
        let parsed = JSON.parse(errorText);
        if (Array.isArray(parsed)) parsed = parsed[0];
        message = (parsed && parsed.error && parsed.error.message) || errorText;
      } catch (e) {
        // JSON이 아닌 일반 텍스트 오류면 원문을 그대로 씁니다.
      }
      console.warn(`[${label}] ${stage.name}(${modelLabel}) 실패 (HTTP ${response.status}): ${String(message).slice(0, 200)} → 다음`);
      lastError =
        response.status === 429
          ? { ok: false, status: 429, error: "AI가 지금 붐벼요. 1~2분 뒤에 다시 시도해 주세요." }
          : { ok: false, status: response.status, error: `AI 서버 요청 실패 (${response.status}): ${message}` };
    }
  }

  return lastError;
}
