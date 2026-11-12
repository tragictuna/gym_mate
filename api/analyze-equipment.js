/**
 * ==============================================================================
 * 파일명: api/analyze-equipment.js
 * 설명: 1단계 - 헬스장 기구 이미지 비전 분석 Vercel 서버리스 함수
 * 모델: OpenRouter (기본값: google/gemma-4-26b-a4b-it:free)
 * ==============================================================================
 */

export default async function handler(req, res) {
  // CORS 헤더 설정 (로컬 개발 및 Vercel 배포 환경 대응)
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
    // 환경 변수에서 OpenRouter API 키 및 모델명 로드
    const apiKey = process.env.OPENROUTER_API_KEY;
    const modelName = process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";

    // API 키 유효성 검증
    if (!apiKey || apiKey.trim() === "" || apiKey === "your_openrouter_api_key_here") {
      return res.status(500).json({
        success: false,
        error: "서버에 OPENROUTER_API_KEY 환경 변수가 설정되지 않았습니다. .env.local 파일을 확인해 주세요."
      });
    }

    // 클라이언트에서 전달받은 요청 바디 파싱
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({
        success: false,
        error: "분석할 이미지 데이터(Base64)가 전달되지 않았습니다."
      });
    }

    // OpenRouter 비전 분석용 시스템 프롬프트 정의
    const systemPrompt = `당신은 헬스장 기구 및 운동 기구를 전문으로 분석하는 AI 비전 어시스턴트입니다.
사용자가 제공한 사진을 직접 시각적으로 관찰하여 헬스장 기구, 케이블 머신, 랙, 소도구 등을 식별하세요.

[필수 출력 규칙]
1. 반드시 유효한 JSON 단일 객체({...})만 반환하십시오.
2. 어떠한 인사말, 설명, 마크다운 코드블록(\`\`\`json)도 붙이지 마십시오.
3. 기구의 일부만 보이거나 각도가 특이하더라도 관찰 가능한 부품(손잡이, 케이블, 핀, 패드, 프레임 등)을 바탕으로 가장 유력한 기구명을 추론하여 JSON에 담으십시오.
4. 만약 운동 기구가 전혀 아닌 일반 사물/음식/풍경이거나 도저히 판별할 수 없는 경우, 자연어로 거절하지 말고 반드시 {"is_gym_equipment": false, "non_equipment_message": "..."} 형태의 JSON을 반환하십시오.`;

    const userPromptText = `첨부된 헬스장 기구 사진을 정밀 분석하여 다음 JSON 스키마 규격으로만 응답하세요. 다른 문장은 일체 출력하지 마세요:
{
  "is_gym_equipment": true,
  "confidence_score": 0.95,
  "equipment": {
    "name_ko": "기구 한국어 이름 (예: 랫 풀 다운, 딥스 머신 등)",
    "name_en": "기구 영어 이름",
    "category": "머신 웨이트 / 케이블 머신 / 프리웨이트 등",
    "primary_muscle": "주동근 부위 (예: 등, 가슴, 어깨 등)",
    "secondary_muscles": ["보조 근육1", "보조 근육2"],
    "difficulty": "초급",
    "setup_guide": [
      "초보자를 위한 기구 세팅 팁 1",
      "초보자를 위한 기구 세팅 팁 2"
    ],
    "execution_guide": [
      "올바른 운동 동작 순서 1",
      "올바른 운동 동작 순서 2"
    ],
    "beginner_cautions": [
      "초보자 부상 방지 주의사항 1",
      "초보자 부상 방지 주의사항 2"
    ]
  },
  "non_equipment_message": null
}`;

    // OpenRouter API 호출 (Fallback 모델 체인 설정으로 503 및 가용성 오류 방지)
    console.log(`[OpenRouter 호출 시작] 주 모델: ${modelName}`);
    const openrouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "GymMate"
      },
      body: JSON.stringify({
        model: modelName,
        models: [
          modelName,
          "google/gemma-4-26b-a4b-it",
          "openrouter/free"
        ],
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userPromptText
              },
              {
                type: "image_url",
                image_url: {
                  url: image
                }
              }
            ]
          }
        ],
        response_format: {
          type: "json_object"
        },
        temperature: 0.1,
        max_tokens: 1500
      })
    });

    // OpenRouter API 오류 응답 처리
    if (!openrouterResponse.ok) {
      const errorText = await openrouterResponse.text();
      console.error("[OpenRouter API Error]:", openrouterResponse.status, errorText);

      let parsedErrorMsg = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        parsedErrorMsg = errorJson.error?.message || errorText;
      } catch (e) {
        // 일반 텍스트 에러
      }

      return res.status(openrouterResponse.status).json({
        success: false,
        error: `AI 서버 요청 실패 (${openrouterResponse.status}): ${parsedErrorMsg}`
      });
    }

    const data = await openrouterResponse.json();
    const rawContent = data.choices?.[0]?.message?.content;

    console.log("[AI 원본 응답 수신 완료]:", rawContent ? rawContent.substring(0, 200) + "..." : "null");

    if (!rawContent || rawContent.trim() === "") {
      return res.status(500).json({
        success: false,
        error: "AI 모델로부터 응답 내용을 전달받지 못했습니다."
      });
    }

    // 마크다운 코드블록 제거 및 JSON 문자열 발췌
    let cleanedContent = rawContent.trim();
    if (cleanedContent.startsWith("```json")) {
      cleanedContent = cleanedContent.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    } else if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent.replace(/^```\s*/, "").replace(/```$/, "").trim();
    }

    // 정규식으로 가장 바깥쪽 {...} 추출
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[JSON 추출 실패 - 원본 응답]:", rawContent);
      return res.status(500).json({
        success: false,
        error: `AI 모델이 JSON 규격이 아닌 일반 텍스트로 응답했습니다: "${rawContent.substring(0, 120)}"`,
        rawResponse: rawContent
      });
    }

    // JSON 파싱 시도
    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("[JSON Parsing Error]:", parseError, "Extracted:", jsonMatch[0]);
      return res.status(500).json({
        success: false,
        error: `JSON 파싱 오류: ${parseError.message}`,
        rawResponse: rawContent
      });
    }

    // 성공적으로 파싱된 분석 결과 반환
    return res.status(200).json({
      success: true,
      data: parsedResult
    });

  } catch (error) {
    console.error("[Internal Server Error in analyze-equipment]:", error);
    return res.status(500).json({
      success: false,
      error: `서버 내부 오류가 발생했습니다: ${error.message}`
    });
  }
}
