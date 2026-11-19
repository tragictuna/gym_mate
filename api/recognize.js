/**
 * ==============================================================================
 * 파일명: api/recognize.js
 * 역할: 기구 사진 한 장을 받아 OpenRouter 비전 모델로 기구를 알아보고, PRD 7장 스키마로 돌려주는 Vercel 서버리스 함수
 * 모델: process.env.OPENROUTER_MODEL (없으면 "google/gemma-4-26b-a4b-it:free")
 *       실패하면 FREE_VISION_FALLBACKS(이미지를 읽는 무료 모델)로 순서대로 넘어갑니다. 유료 모델은 쓰지 않습니다.
 *
 * 요청:  POST /api/recognize   { "image": "data:image/jpeg;base64,..." }
 * 응답(성공): { success: true, data: {
 *     is_equipment: boolean,         // 헬스장 기구 사진인지
 *     name_ko: string, name_en: string,
 *     target_muscles: string[],      // 주로 쓰이는 근육
 *     role: string,                  // 루틴에서 이 기구가 맡는 역할 (예: "등 운동의 메인 기구")
 *     setup: string[],               // 초보자용 세팅법 (짧게)
 *     cautions: string[],            // 초보자 주의사항 (짧게)
 *     confidence: "high" | "low",    // 확신도
 *     alternatives: string[]         // 확신도가 낮을 때 후보 이름 2~3개 (F1-2)
 *   } }
 * 응답(실패): { success: false, error: "..." }
 *   - 400: 요청 본문이 없거나, image가 data:image/ 형식이 아니거나, 너무 큼(약 4MB 초과)
 *   - 405: POST가 아닌 요청
 *   - 500: 서버에 API 키가 없음 / 서버 내부 오류
 *   - 502: AI 응답이 2번(최초 + 재시도 1회) 모두 JSON이 아니거나 형식 검사에 실패
 *   - 그 밖: OpenRouter가 돌려준 HTTP 오류 코드를 그대로 전달
 * ==============================================================================
 */

// 요청 이미지(base64 문자열)의 최대 길이. Vercel 서버리스 요청 본문 한도(약 4.5MB)보다 조금 작게 잡아
// 한도에 걸리기 전에 우리 쪽에서 알기 쉬운 400 메시지를 돌려줍니다. (1024px JPEG는 보통 수백 KB라 충분)
const MAX_IMAGE_LENGTH = 4 * 1024 * 1024;

// 주 모델이 실패(429 한도 초과·과부하)했을 때 순서대로 넘어갈 무료 비전 모델 목록.
// - 무작위 라우터 openrouter/free는 쓰지 않습니다. 이미지를 못 읽거나 정확도가 낮은 모델이 걸려
//   예시를 베끼거나 빈 응답을 내는 문제가 확인되었기 때문입니다(2026-11-19 진단).
// - 순서: 같은 계열 큰 모델(gemma 31b) → 느리지만(약 50초) 진단 사진을 맞힌 dots-3-note.
// - 유료 모델은 크레딧 차감을 막기 위해 넣지 않습니다(사용자 결정).
const FREE_VISION_FALLBACKS = [
  "google/gemma-4-31b-it:free",
  "dots-studio/dots-3-note-preview:free"
];

// OpenRouter models 배열 최대 길이 (넘으면 400 "models array must have 3 items or fewer").
// 지금은 주 모델 + 2개라 딱 맞지만, 나중에 목록을 늘려도 400이 나지 않게 잘라서 보냅니다.
const MAX_MODELS = 3;

// 응답 최대 토큰. 무료 비전 모델은 모두 '생각(reasoning)'을 먼저 하는 모델이라,
// 생각에 토큰을 다 쓰면 정작 JSON 답이 비어 버립니다(1000일 때 finish_reason=length로 빈 응답 확인).
// JSON 답 자체는 500토큰 안팎이지만, dots-3-note는 4000토큰도 생각에 다 써서 빈 응답을 낸 적이 있어(재시도 → 시간 2배)
// 8000으로 넉넉히 잡습니다. 무료 모델이라 토큰을 늘려도 비용은 없습니다.
const MAX_TOKENS = 8000;

// confidence에 허용되는 값
const CONFIDENCE_VALUES = ["high", "low"];

// 최종 실패 시 사용자에게 보여 줄 문구 (PRD)
const FAIL_MESSAGE = "기구를 알아보지 못했어요. 다시 찍어 주세요";

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
    // 값이 "https,http"처럼 여러 개일 수 있어 첫 번째 값만 씁니다.
    const proto = String(headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    return `${proto}://${headers.host}`;
  }
  return "http://localhost:3000";
}

/**
 * 요청 본문을 검사해 이미지 문자열을 꺼냅니다.
 * @param {*} body - req.body (정상이면 { image: "data:image/...;base64,..." })
 * @returns {{ok: true, image: string} | {ok: false, error: string}}
 * - 예외 처리: AI를 부르기 전에 잘못된 요청을 걸러, 쓸모없는 API 호출(시간·무료 한도 낭비)을 막습니다.
 *   body가 문자열이면 JSON 파싱에 실패한 본문이므로 잘못된 요청으로 봅니다.
 */
function validateRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "요청 본문이 없거나 JSON 형식이 아닙니다. { \"image\": \"data:image/...\" } 형태로 보내 주세요." };
  }
  const image = body.image;
  if (typeof image !== "string" || image.trim() === "") {
    return { ok: false, error: "분석할 이미지(image)가 없습니다." };
  }
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image)) {
    return { ok: false, error: "image는 data:image/...;base64, 로 시작하는 데이터 URL이어야 합니다." };
  }
  if (image.length > MAX_IMAGE_LENGTH) {
    const mb = (image.length / 1024 / 1024).toFixed(1);
    return { ok: false, error: `이미지가 너무 큽니다(약 ${mb}MB). 4MB 이하로 줄여서 보내 주세요.` };
  }
  return { ok: true, image };
}

/**
 * AI가 돌려준 객체가 PRD 7장 스키마에 맞는지 검사합니다.
 * @param {*} data - JSON.parse 결과
 * @returns {string[]} 문제 목록. 빈 배열이면 통과입니다. (재시도할 때 AI에게 무엇이 틀렸는지 알려 주는 데도 씁니다)
 * - 검사 내용: 필수 필드가 있는지, 타입이 맞는지, confidence가 "high"/"low" 중 하나인지.
 *   기구가 아닌 사진(is_equipment:false)이면 나머지 필드는 비어 있어도 됩니다.
 */
function validateRecognition(data) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["응답이 JSON 객체가 아닙니다."];
  }
  if (typeof data.is_equipment !== "boolean") {
    errors.push("is_equipment는 true 또는 false여야 합니다.");
    return errors; // 기구 여부를 모르면 나머지를 검사할 기준이 없습니다.
  }
  if (!data.is_equipment) {
    return errors; // 기구가 아닌 사진은 이름·근육 등이 없어도 정상 응답입니다.
  }

  const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";
  const isStringArray = (v) => Array.isArray(v) && v.every((item) => typeof item === "string");

  if (!isNonEmptyString(data.name_ko)) errors.push("name_ko는 비어 있지 않은 문자열이어야 합니다.");
  // 형식 안내의 <설명> 자리를 그대로 베낀 응답은 사진을 보지 않은 것이므로 실패로 봅니다.
  if (typeof data.name_ko === "string" && /[<>]/.test(data.name_ko)) {
    errors.push("name_ko에 <> 안내 문구가 그대로 들어 있습니다. 사진 속 실제 기구 이름을 써야 합니다.");
  }
  if (typeof data.name_en !== "string") errors.push("name_en은 문자열이어야 합니다.");
  if (!isStringArray(data.target_muscles) || data.target_muscles.length === 0) {
    errors.push("target_muscles는 문자열 1개 이상의 배열이어야 합니다.");
  }
  if (!isNonEmptyString(data.role)) errors.push("role은 비어 있지 않은 문자열이어야 합니다.");
  if (!isStringArray(data.setup) || data.setup.length === 0) errors.push("setup은 문자열 1개 이상의 배열이어야 합니다.");
  if (!isStringArray(data.cautions) || data.cautions.length === 0) {
    errors.push("cautions는 문자열 1개 이상의 배열이어야 합니다.");
  }

  const confidence = typeof data.confidence === "string" ? data.confidence.trim().toLowerCase() : data.confidence;
  if (!CONFIDENCE_VALUES.includes(confidence)) {
    errors.push('confidence는 "high" 또는 "low"여야 합니다.');
  }
  if (!isStringArray(data.alternatives)) {
    errors.push("alternatives는 문자열 배열이어야 합니다(없으면 []).");
  } else if (confidence === "low" && data.alternatives.filter((s) => s.trim() && !/[<>]/.test(s)).length === 0) {
    // 확신도가 낮은데 후보가 없으면 사용자가 고를 수 없으므로(F1-2) 형식 실패로 봅니다.
    errors.push('confidence가 "low"이면 alternatives에 후보 이름을 2~3개 넣어야 합니다.');
  }
  return errors;
}

/**
 * 검사를 통과한 응답을 화면에서 바로 쓰기 좋게 정리합니다.
 * @param {Object} data - validateRecognition을 통과한 객체
 * @returns {Object} 공백 제거, 빈 항목 제거, confidence 소문자화, 후보 최대 3개로 정리한 객체
 * - 이유: 같은 스키마라도 앞뒤 공백·빈 문자열·대문자 "LOW" 등이 섞여 오면 화면과 저장 데이터가 지저분해지기 때문입니다.
 */
function normalizeRecognition(data) {
  const cleanList = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);
  if (!data.is_equipment) {
    return {
      is_equipment: false,
      name_ko: "",
      name_en: "",
      target_muscles: [],
      role: "",
      setup: [],
      cautions: [],
      confidence: "low",
      alternatives: []
    };
  }
  const nameKo = data.name_ko.trim();
  return {
    is_equipment: true,
    name_ko: nameKo,
    name_en: data.name_en.trim(),
    target_muscles: cleanList(data.target_muscles),
    role: data.role.trim(),
    setup: cleanList(data.setup),
    cautions: cleanList(data.cautions),
    confidence: data.confidence.trim().toLowerCase(),
    // 확신이 높으면 후보 버튼을 보여 주지 않으므로 비웁니다.
    // 낮으면 인식된 이름과 같은 후보(버튼 중복)와 <> 안내 문구를 베낀 후보를 빼고 최대 3개만 남깁니다.
    alternatives:
      data.confidence.trim().toLowerCase() === "high"
        ? []
        : cleanList(data.alternatives).filter((name) => name !== nameKo && !/[<>]/.test(name)).slice(0, 3)
  };
}

/**
 * AI 응답 문자열에서 JSON 객체를 꺼내 파싱합니다. (기존 코드블록 제거 로직 재사용)
 * @param {string} rawContent - 모델이 돌려준 원문
 * @returns {{ok: true, data: *} | {ok: false, error: string}}
 * - 예외 처리: 모델이 ```json 코드블록이나 앞뒤 설명을 붙이는 경우가 있어, 코드블록을 벗기고 가장 바깥 {...}만 파싱합니다.
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

// 시스템 프롬프트: 역할, 출력 규칙, 확신도 규칙
const SYSTEM_PROMPT = `너는 헬스장 기구 사진을 보고 기구를 알아보는 도우미다. 사용자는 헬스 0~2개월 차 초보자다.

[출력 규칙]
1. 반드시 JSON 객체 하나만 출력한다. 인사말, 설명, 마크다운 코드블록(\`\`\`)은 쓰지 않는다.
2. 사진을 직접 보고 손잡이, 케이블, 핀, 패드, 롤러, 등받이, 프레임 등 보이는 부품을 근거로 기구를 판단한다.
   형식 안내에 있는 <> 자리는 설명일 뿐이다. 사진에서 본 기구의 실제 이름과 내용으로 채운다.
3. 조금이라도 헷갈리면 confidence를 "low"로 하고, alternatives에 가능성 있는 다른 기구 이름 2~3개를 넣는다.
   확실하면 confidence를 "high"로 하고 alternatives는 []로 둔다.
4. setup(세팅법)과 cautions(주의사항)는 초보자 기준으로 짧게, 각 항목 한 문장(30자 안팎)으로 2~4개씩 쓴다.
5. role은 이 기구가 운동 루틴에서 맡는 역할을 한 문장으로 쓴다. (예: "등 운동의 메인 기구", "하체 운동 마무리용 고립 기구")
6. 헬스장 기구가 아닌 사진(음식, 사람만, 풍경 등)이면 {"is_equipment": false}만 출력한다. 자연어로 거절하지 않는다.
7. 자세 교정은 하지 않는다.`;

// 사용자 프롬프트: 응답 형식 안내
// - 실제 기구 이름(예: "랫 풀 다운")을 예시로 넣으면 사진을 제대로 못 보는 모델이 그 이름을 그대로 베낍니다
//   (진단 사진은 레그 익스텐션인데 3번 모두 "랫 풀 다운"으로 답함). 그래서 값 자리는 <설명>으로만 둡니다.
const USER_PROMPT = `이 사진 속 헬스장 기구를 알아보고 아래 형식의 JSON 하나로만 답해. <> 안은 설명이니 사진에서 본 실제 값으로 바꿔 써.
{
  "is_equipment": true,
  "name_ko": "<기구 한국어 이름>",
  "name_en": "<기구 영어 이름>",
  "target_muscles": ["<주로 쓰는 근육>", "<보조 근육>"],
  "role": "<운동 루틴에서 이 기구의 역할 한 문장>",
  "setup": ["<초보자 세팅법 한 문장>", "<세팅법 한 문장>"],
  "cautions": ["<초보자 주의사항 한 문장>", "<주의사항 한 문장>"],
  "confidence": "<high 또는 low>",
  "alternatives": ["<low일 때만: 다른 후보 기구 이름>"]
}`;

/**
 * OpenRouter에 사진 인식을 한 번 요청합니다.
 * @param {Object} params
 * @param {string} params.apiKey - OpenRouter API 키
 * @param {string} params.modelName - 주 모델 이름
 * @param {string} params.referer - HTTP-Referer 헤더 값
 * @param {string} params.image - data:image/... base64 문자열
 * @param {string[]} [params.previousErrors] - 재시도일 때 지난 응답의 문제 목록. 프롬프트에 붙여 같은 실수를 줄입니다.
 * @returns {Promise<{ok: true, content: string} | {ok: false, status: number, error: string}>}
 * - 예외 처리: HTTP 오류는 재시도 대상이 아니므로(키 오류, 한도 초과 등은 다시 해도 같음) 상태 코드와 메시지를 그대로 돌려줍니다.
 */
async function requestRecognition({ apiKey, modelName, referer, image, previousErrors }) {
  let userText = USER_PROMPT;
  if (previousErrors && previousErrors.length > 0) {
    userText += `\n\n[주의] 바로 전 응답이 형식에 맞지 않았다. 다음 문제를 고쳐서 JSON만 다시 출력해:\n- ${previousErrors.join("\n- ")}`;
  }

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
      // 주 모델이 실패하면 무료 비전 모델로 순서대로 넘어갑니다. 주 모델과 같은 이름은 한 번만 넣고, 최대 3개로 자릅니다.
      models: [modelName].concat(FREE_VISION_FALLBACKS.filter((m) => m !== modelName)).slice(0, MAX_MODELS),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: image } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: MAX_TOKENS,
      // 생각하는 양을 줄여 응답 시간과 토큰을 아낍니다. 지원하지 않는 모델은 이 값을 무시합니다.
      reasoning: { effort: "low" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[OpenRouter API Error]:", response.status, errorText);
    let message = errorText;
    try {
      message = JSON.parse(errorText).error?.message || errorText;
    } catch (e) {
      // JSON이 아닌 일반 텍스트 오류면 원문을 그대로 씁니다.
    }
    // 429: 무료 모델 공유 한도가 찼다는 뜻입니다. 사용자가 할 수 있는 일은 잠시 뒤 다시 시도하는 것뿐이라 쉬운 말로 바꿉니다.
    if (response.status === 429) {
      return { ok: false, status: 429, error: "무료 AI가 지금 붐벼요. 1~2분 뒤에 다시 시도해 주세요." };
    }
    return { ok: false, status: response.status, error: `AI 서버 요청 실패 (${response.status}): ${message}` };
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  // 어떤 모델이 실제로 답했는지, 토큰이 모자라 잘렸는지(length) 서버 로그에 남겨 문제를 추적하기 쉽게 합니다.
  console.log(`[기구 인식 응답] 실제 모델: ${data.model}, finish_reason: ${choice?.finish_reason}`);
  return { ok: true, content: choice?.message?.content || "" };
}

/**
 * Vercel 서버리스 핸들러
 * @param {object} req - 요청 (req.method, req.headers, req.body)
 * @param {object} res - 응답 (res.status().json(), res.setHeader, res.end)
 */
export default async function handler(req, res) {
  // CORS 헤더 설정 (로컬 개발 및 Vercel 배포 환경 대응) — 기존 로직 재사용
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // OPTIONS 사전 요청(Preflight) 처리
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // POST 메서드만 허용
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "허용되지 않는 HTTP 메서드입니다. POST 요청을 사용하세요."
    });
  }

  try {
    // 1) 요청 본문 검사 — 잘못된 요청은 키 검사보다 먼저 400으로 돌려보냅니다(클라이언트 잘못이므로).
    const bodyCheck = validateRequestBody(req.body);
    if (!bodyCheck.ok) {
      return res.status(400).json({ success: false, error: bodyCheck.error });
    }

    // 2) 환경 변수에서 API 키와 모델명 읽기
    const apiKey = process.env.OPENROUTER_API_KEY;
    const modelName = process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";
    if (!apiKey || apiKey.trim() === "" || apiKey === "your_openrouter_api_key_here") {
      return res.status(500).json({
        success: false,
        error: "서버에 OPENROUTER_API_KEY 환경 변수가 설정되지 않았습니다. .env.local 파일을 확인해 주세요."
      });
    }

    // 3) AI 호출 → JSON 파싱 → 형식 검사. 파싱/검사가 실패하면 1회만 재시도합니다(총 최대 2번 호출).
    //    재시도를 1회로 제한하는 이유: 무료 모델의 요청 한도와 응답 시간(Vercel 함수 제한 시간)을 아끼기 위해서입니다.
    const referer = getReferer(req);
    const MAX_ATTEMPTS = 2;
    let previousErrors = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[기구 인식 ${attempt}/${MAX_ATTEMPTS}회차] 주 모델: ${modelName}`);
      const result = await requestRecognition({
        apiKey,
        modelName,
        referer,
        image: bodyCheck.image,
        previousErrors
      });

      // OpenRouter HTTP 오류는 다시 해도 같을 가능성이 높아 재시도하지 않고 바로 전달합니다.
      if (!result.ok) {
        return res.status(result.status).json({ success: false, error: result.error });
      }

      const parsed = parseModelJson(result.content);
      if (!parsed.ok) {
        previousErrors = [parsed.error, "JSON 객체 하나만 출력해야 한다."];
        console.warn(`[기구 인식 ${attempt}회차 파싱 실패]:`, parsed.error, (result.content || "").slice(0, 200));
        continue;
      }

      const errors = validateRecognition(parsed.data);
      if (errors.length > 0) {
        previousErrors = errors;
        console.warn(`[기구 인식 ${attempt}회차 형식 검사 실패]:`, errors);
        continue;
      }

      // 통과: 정리해서 돌려줍니다.
      return res.status(200).json({ success: true, data: normalizeRecognition(parsed.data) });
    }

    // 2번 모두 실패: 사용자에게는 PRD 문구만 보여 주고, 원인은 서버 로그(위 console.warn)로 확인합니다.
    return res.status(502).json({ success: false, error: FAIL_MESSAGE });
  } catch (error) {
    console.error("[Internal Server Error in recognize]:", error);
    return res.status(500).json({
      success: false,
      error: `서버 내부 오류가 발생했습니다: ${error.message}`
    });
  }
}
