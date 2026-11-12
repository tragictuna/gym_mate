/**
 * ==============================================================================
 * 파일명: script.js
 * 설명: GymMate 1단계 클라이언트 제어 스크립트
 * 주요 기능: 이미지 업로드/리사이징, 비전 분석 API 요청, 기구 정보 카드 렌더링
 * ==============================================================================
 */

// DOM 요소 캐싱
const imageInput = document.getElementById("imageInput");
const dropZone = document.getElementById("dropZone");
const dropPrompt = document.getElementById("dropPrompt");
const selectBtn = document.getElementById("selectBtn");
const previewContainer = document.getElementById("previewContainer");
const previewImage = document.getElementById("previewImage");
const reselectBtn = document.getElementById("reselectBtn");
const analyzeBtn = document.getElementById("analyzeBtn");

const uploadSection = document.getElementById("uploadSection");
const loadingSection = document.getElementById("loadingSection");
const resultSection = document.getElementById("resultSection");
const resetBtn = document.getElementById("resetBtn");
const goToStep2Btn = document.getElementById("goToStep2Btn");

const errorBanner = document.getElementById("errorBanner");
const errorTitle = document.getElementById("errorTitle");
const errorDesc = document.getElementById("errorDesc");
const errorCloseBtn = document.getElementById("errorCloseBtn");

// 기구 분석 결과 DOM 요소
const equipmentCategory = document.getElementById("equipmentCategory");
const equipmentDifficulty = document.getElementById("equipmentDifficulty");
const equipmentNameKo = document.getElementById("equipmentNameKo");
const equipmentNameEn = document.getElementById("equipmentNameEn");
const primaryMuscle = document.getElementById("primaryMuscle");
const secondaryMuscles = document.getElementById("secondaryMuscles");
const setupGuideList = document.getElementById("setupGuideList");
const executionGuideList = document.getElementById("executionGuideList");
const cautionList = document.getElementById("cautionList");

// 애플리케이션 상태 (현재 선택된 Base64 이미지 데이터 보관)
let currentBase64Image = null;
let lastAnalyzedEquipmentData = null;

/* -------------------------------------------------------------------------- */
/* 1. 이미지 선택 및 드래그 앤 드롭 이벤트 리스너                              */
/* -------------------------------------------------------------------------- */

// 사진 선택 버튼 클릭 시 숨겨진 input[type=file] 트리거
selectBtn.addEventListener("click", () => imageInput.click());
reselectBtn.addEventListener("click", () => imageInput.click());

// 파일 선택 변경 이벤트
imageInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) {
    processSelectedFile(file);
  }
});

// 드래그 앤 드롭 진입/이탈 효과
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files?.[0];
  if (file) {
    processSelectedFile(file);
  }
});

/* -------------------------------------------------------------------------- */
/* 2. 클라이언트 단 이미지 리사이징 및 Base64 인코딩                           */
/* -------------------------------------------------------------------------- */

/**
 * 선택된 이미지 파일을 캔버스로 리사이징하여 Base64 데이터 URL을 생성합니다.
 * 모바일 고해상도 사진(5~10MB)의 전송 지연과 OpenRouter 페이로드 한도를 방지합니다.
 * @param {File} file - 업로드된 이미지 파일 객체
 */
function processSelectedFile(file) {
  // 이미지 파일 형식 검증
  if (!file.type.startsWith("image/")) {
    showError("지원되지 않는 파일 형식", "이미지 파일(.jpg, .png, .webp 등)만 업로드할 수 있습니다.");
    return;
  }

  hideError();

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // 긴 변 기준 최대 1280px로 축소
      const MAX_DIMENSION = 1280;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        }
      } else {
        if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      // 오프스크린 캔버스에 렌더링
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // JPEG 압축(품질 0.85)으로 Base64 생성
      currentBase64Image = canvas.toDataURL("image/jpeg", 0.85);

      // 미리보기 화면 전환
      previewImage.src = currentBase64Image;
      dropPrompt.style.display = "none";
      previewContainer.style.display = "flex";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* -------------------------------------------------------------------------- */
/* 3. API 호출 및 기구 분석 실행                                               */
/* -------------------------------------------------------------------------- */

analyzeBtn.addEventListener("click", async () => {
  if (!currentBase64Image) {
    showError("이미지 없음", "먼저 분석할 기구 사진을 선택해 주세요.");
    return;
  }

  // UI 상태 전환: 업로드 숨김, 로딩 표시
  uploadSection.style.display = "none";
  loadingSection.style.display = "flex";
  resultSection.style.display = "none";
  hideError();

  try {
    // Vercel 서버리스 API 호출 (/api/analyze-equipment)
    const response = await fetch("/api/analyze-equipment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image: currentBase64Image
      })
    });

    // 응답 텍스트 수신 후 안전하게 JSON 파싱 시도 (비정형 에러 및 상태코드 확인)
    const responseText = await response.text();
    let resJson;
    try {
      resJson = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[서버 응답 JSON 파싱 실패]:", response.status, responseText);
      throw new Error(`서버 응답 오류 (HTTP ${response.status}): ${responseText.substring(0, 150)}`);
    }

    if (!response.ok || !resJson.success) {
      throw new Error(resJson.error || "기구 분석 중 오류가 발생했습니다.");
    }

    const result = resJson.data;

    // 헬스장 기구가 아닌 것으로 판별된 경우 예외 처리
    if (!result.is_gym_equipment) {
      loadingSection.style.display = "none";
      uploadSection.style.display = "block";
      showError(
        "기구 인식 불가",
        result.non_equipment_message || "헬스장 기구가 명확히 보이는 사진을 다시 촬영해 주세요."
      );
      return;
    }

    // 분석 결과 캐싱 및 카드 렌더링
    lastAnalyzedEquipmentData = result;
    renderAnalysisResult(result);

    // 로딩 숨김 및 결과 표시
    loadingSection.style.display = "none";
    resultSection.style.display = "flex";

  } catch (error) {
    console.error("[기구 분석 실패]:", error);
    loadingSection.style.display = "none";
    uploadSection.style.display = "block";
    showError("분석 실패", error.message || "서버 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
});

/* -------------------------------------------------------------------------- */
/* 4. 분석 결과 DOM 렌더링                                                     */
/* -------------------------------------------------------------------------- */

/**
 * AI로부터 전달받은 기구 정보 JSON 데이터를 화면 카드에 렌더링합니다.
 * @param {Object} data - 분석 결과 데이터 객체
 */
function renderAnalysisResult(data) {
  const equip = data.equipment || {};

  equipmentCategory.textContent = equip.category || "머신 웨이트";
  equipmentDifficulty.textContent = equip.difficulty || "초급";
  equipmentNameKo.textContent = equip.name_ko || "이름 미상 기구";
  equipmentNameEn.textContent = equip.name_en || "";

  primaryMuscle.textContent = equip.primary_muscle || "전신";
  secondaryMuscles.textContent = Array.isArray(equip.secondary_muscles)
    ? equip.secondary_muscles.join(", ")
    : "없음";

  // 머신 세팅법 리스트 채우기
  setupGuideList.innerHTML = "";
  if (Array.isArray(equip.setup_guide) && equip.setup_guide.length > 0) {
    equip.setup_guide.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      setupGuideList.appendChild(li);
    });
  } else {
    setupGuideList.innerHTML = "<li>의자 및 핀 높이를 체형에 맞게 조절하세요.</li>";
  }

  // 올바른 운동 동작 가이드 채우기
  executionGuideList.innerHTML = "";
  if (Array.isArray(equip.execution_guide) && equip.execution_guide.length > 0) {
    equip.execution_guide.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      executionGuideList.appendChild(li);
    });
  } else {
    executionGuideList.innerHTML = "<li>반동을 주지 않고 타겟 근육에 집중하여 수행하세요.</li>";
  }

  // 초보자 필수 주의사항 채우기
  cautionList.innerHTML = "";
  if (Array.isArray(equip.beginner_cautions) && equip.beginner_cautions.length > 0) {
    equip.beginner_cautions.forEach((caution) => {
      const li = document.createElement("li");
      li.textContent = caution;
      cautionList.appendChild(li);
    });
  } else {
    cautionList.innerHTML = "<li>무리한 중량을 사용하지 말고 올바른 자세를 유지하세요.</li>";
  }
}

/* -------------------------------------------------------------------------- */
/* 5. 화면 초기화 및 네비게이션                                               */
/* -------------------------------------------------------------------------- */

// '다른 기구 찍기' 버튼 클릭 시 초기 상태로 복구
resetBtn.addEventListener("click", () => {
  currentBase64Image = null;
  imageInput.value = "";
  previewImage.src = "";
  previewContainer.style.display = "none";
  dropPrompt.style.display = "block";

  resultSection.style.display = "none";
  loadingSection.style.display = "none";
  uploadSection.style.display = "block";
  hideError();
});

// '이 기구로 루틴 만들기 (2단계)' 클릭 이벤트 (2단계 구현 안내)
goToStep2Btn.addEventListener("click", () => {
  if (!lastAnalyzedEquipmentData) return;
  alert(
    `[2단계 연계 예정]\n"${lastAnalyzedEquipmentData.equipment?.name_ko}" 기구를 기반으로 맞춤 루틴을 생성하는 기능은 2단계(PRD_step2)에서 구현됩니다.`
  );
});

/* -------------------------------------------------------------------------- */
/* 6. 에러 배너 헬퍼 함수                                                      */
/* -------------------------------------------------------------------------- */

function showError(title, desc) {
  errorTitle.textContent = title;
  errorDesc.textContent = desc;
  errorBanner.style.display = "flex";
}

function hideError() {
  errorBanner.style.display = "none";
}

errorCloseBtn.addEventListener("click", hideError);
