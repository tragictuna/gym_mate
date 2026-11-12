/**
 * ==============================================================================
 * 파일명: api/recommend-routine.js
 * 설명: 2단계 - 사용자 조건 및 1단계 기구 기반 맞춤형 초보자 운동 루틴 생성 API
 * 모델: OpenRouter (기본값: google/gemma-4-26b-a4b-it:free) + Fallback 체인
 * ==============================================================================
 */

export default async function handler(req, res) {
  // CORS 헤더 설정 (로컬 개발 및 Vercel 배포 환경 지원)
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // OPTIONS 사전 요청 처리
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
    // 환경 변수 로드
    const apiKey = process.env.OPENROUTER_API_KEY;
    const modelName = process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";

    if (!apiKey || apiKey.trim() === "" || apiKey === "your_openrouter_api_key_here") {
      return res.status(500).json({
        success: false,
        error: "서버에 OPENROUTER_API_KEY 환경 변수가 설정되지 않았습니다. .env.local 파일을 확인해 주세요."
      });
    }

    // 클라이언트로부터 전달받은 사용자 조건 및 기구 정보 추출
    const { equipmentData, userPreferences } = req.body || {};

    const equipName = equipmentData?.equipment?.name_ko || "선택된 기구";
    const primaryMuscle = equipmentData?.equipment?.primary_muscle || "전신";
    
    const goal = userPreferences?.goal || "체지방 감량 & 체력 증진";
    const duration = userPreferences?.duration || 40; // 분 단위
    const targetPart = userPreferences?.targetPart || "기구 중심";
    const experience = userPreferences?.experience || "완전 초보(1개월 미만)";
    const cautions = Array.isArray(userPreferences?.cautions) && userPreferences.cautions.length > 0
      ? userPreferences.cautions.join(", ")
      : "없음";

    // 시스템 프롬프트: 헬스 초보자를 위한 전문 트레이너 페르소나
    const systemPrompt = `당신은 헬스장 초보자(헬린이)를 지도하는 친절하고 전문적인 퍼스널 트레이너 AI입니다.
사용자가 헬스장에서 방금 식별한 머신 기구와 본인의 운동 목표, 가용 시간, 신체 컨디션에 맞춰 안전하고 효과적인 당일 맞춤 운동 루틴을 설계해야 합니다.

[루틴 설계 필수 원칙]
1. 루틴의 전체 플로우는 반드시 4단계 구조를 따릅니다:
   - 1단계: 동적 웜업 및 관절 가동성 스트레칭 (약 3~5분)
   - 2단계: 메인 기구 운동 (1단계에서 인식된 "${equipName}" 머신을 메인으로 활용)
   - 3단계: 보조 연계 운동 (주변에서 초보자가 쉽게 병행 가능한 덤벨/맨몸 운동 1~2종목)
   - 4단계: 쿨다운 정적 스트레칭 (약 3~5분)
2. 총 소요 시간이 사용자가 요청한 "${duration}분"에 꼭 맞도록 세트 수와 휴식 시간을 합리적으로 배분하십시오.
3. 초보자가 다치지 않도록 구체적인 무게 설정 팁(예: "머신 핀을 2~3번째 칸에 꽂으세요", "여성 10kg, 남성 20kg 내외 권장")과 호흡법을 coach_tip에 꼭 작성하십시오.
4. 반드시 유효한 순수 JSON 단일 객체({...})만 반환하십시오. 마크다운 코드블록이나 불필요한 인사말은 일체 금지합니다.`;

    const userPromptText = `다음 사용자 조건과 기구 정보를 바탕으로 초보자 맞춤 루틴을 작성하여 지정된 JSON 포맷으로만 응답하세요:

- 메인 인식 기구: ${equipName} (주 타겟: ${primaryMuscle})
- 운동 목적: ${goal}
- 총 가용 시간: ${duration}분
- 희망 집중 부위: ${targetPart}
- 숙련도: ${experience}
- 주의할 신체 부위/통증: ${cautions}

[응답할 JSON 스키마 규격]
{
  "routine_title": "string (예: 40분 초보자 맞춤 등 & 상체 활력 루틴)",
  "total_estimated_time_min": ${Number(duration)},
  "intensity_level": "초급",
  "focus_muscle": "${primaryMuscle}",
  "steps": [
    {
      "step_order": 1,
      "phase": "워밍업",
      "exercise_name": "운동명 (예: 어깨 회전 & 암 서클)",
      "equipment_needed": "맨몸",
      "sets": 1,
      "reps_or_duration": "3분",
      "weight_guide": "체중 활용",
      "rest_seconds": 30,
      "coach_tip": "어깨 관절에 열감이 돌 때까지 부드럽게 원을 그리세요."
    },
    {
      "step_order": 2,
      "phase": "메인 운동",
      "exercise_name": "${equipName}",
      "equipment_needed": "${equipName}",
      "sets": 3,
      "reps_or_duration": "10~12회",
      "weight_guide": "초보자 기준 핀 위치 및 중량 팁",
      "rest_seconds": 60,
      "coach_tip": "당길 때 숨을 내쉬고 광배근의 긴장을 느끼며 천천히 놓으세요."
    },
    {
      "step_order": 3,
      "phase": "보조 운동",
      "exercise_name": "보조 운동명 (예: 덤벨 벤치 프레스 또는 덤벨 로우 등)",
      "equipment_needed": "덤벨 또는 매트",
      "sets": 3,
      "reps_or_duration": "10회",
      "weight_guide": "가벼운 덤벨 2~4kg 권장",
      "rest_seconds": 60,
      "coach_tip": "반동을 이용하지 말고 타겟 부위 자극에 집중하세요."
    },
    {
      "step_order": 4,
      "phase": "쿨다운",
      "exercise_name": "마무리 스트레칭",
      "equipment_needed": "매트 또는 벽",
      "sets": 1,
      "reps_or_duration": "4분",
      "weight_guide": "체중 이완",
      "rest_seconds": 0,
      "coach_tip": "심호흡과 함께 긴장된 근육을 길게 늘려주며 정리합니다."
    }
  ]
}`;

    // OpenRouter 호출 (Fallback 체인 적용)
    console.log(`[루틴 생성 요청 시작] 기구: ${equipName}, 목표: ${goal}, 시간: ${duration}분`);
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
            content: userPromptText
          }
        ],
        response_format: {
          type: "json_object"
        },
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    // OpenRouter 에러 처리
    if (!openrouterResponse.ok) {
      const errorText = await openrouterResponse.text();
      console.error("[OpenRouter Routine Error]:", openrouterResponse.status, errorText);

      let parsedErrorMsg = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        parsedErrorMsg = errorJson.error?.message || errorText;
      } catch (e) {
        // 일반 텍스트
      }

      return res.status(openrouterResponse.status).json({
        success: false,
        error: `AI 루틴 생성 서버 요청 실패 (${openrouterResponse.status}): ${parsedErrorMsg}`
      });
    }

    const data = await openrouterResponse.json();
    const rawContent = data.choices?.[0]?.message?.content;

    console.log("[루틴 AI 응답 수신 완료]:", rawContent ? rawContent.substring(0, 150) + "..." : "null");

    if (!rawContent || rawContent.trim() === "") {
      return res.status(500).json({
        success: false,
        error: "AI 모델로부터 루틴 응답을 전달받지 못했습니다."
      });
    }

    // 마크다운 제거 및 JSON 발췌
    let cleanedContent = rawContent.trim();
    if (cleanedContent.startsWith("```json")) {
      cleanedContent = cleanedContent.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    } else if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent.replace(/^```\s*/, "").replace(/```$/, "").trim();
    }

    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[루틴 JSON 추출 실패]:", rawContent);
      return res.status(500).json({
        success: false,
        error: `AI 모델이 JSON 규격이 아닌 텍스트로 응답했습니다: "${rawContent.substring(0, 120)}"`,
        rawResponse: rawContent
      });
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("[루틴 JSON 파싱 오류]:", parseError);
      return res.status(500).json({
        success: false,
        error: `루틴 데이터 파싱 오류: ${parseError.message}`,
        rawResponse: rawContent
      });
    }

    // 성공 결과 반환
    return res.status(200).json({
      success: true,
      data: parsedResult
    });

  } catch (error) {
    console.error("[Internal Server Error in recommend-routine]:", error);
    return res.status(500).json({
      success: false,
      error: `서버 내부 오류가 발생했습니다: ${error.message}`
    });
  }
}
