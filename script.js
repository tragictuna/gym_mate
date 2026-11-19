/**
 * ==============================================================================
 * 파일명: script.js
 * 설명: GymMate 통합 제어 스크립트 (1단계 기구인식 + 2단계 맞춤루틴 + 3단계 프로필/기록/대시보드)
 * ==============================================================================
 */

// -----------------------------------------------------------------------------
// 1. 로컬 저장소 키 및 상수 정의
// -----------------------------------------------------------------------------
const STORAGE_KEY_PROFILE = "gymmate_user_profile";
const STORAGE_KEY_SESSIONS = "gymmate_workout_sessions";

// -----------------------------------------------------------------------------
// 2. DOM 요소 캐싱
// -----------------------------------------------------------------------------

// 상단 메인 메뉴 탭 버튼 (독립 네비게이션)
const tabBtnEquipment = document.getElementById("tabBtnEquipment");
const tabBtnRoutine = document.getElementById("tabBtnRoutine");
const tabBtnDashboard = document.getElementById("tabBtnDashboard");

// 헤더 프로필 칩 & 모달
const openProfileModalBtn = document.getElementById("openProfileModalBtn");
const headerAvatarEmoji = document.getElementById("headerAvatarEmoji");
const headerProfileNickname = document.getElementById("headerProfileNickname");
const profileModal = document.getElementById("profileModal");
const profileForm = document.getElementById("profileForm");
const closeProfileModalBtn = document.getElementById("closeProfileModalBtn");
const cancelProfileBtn = document.getElementById("cancelProfileBtn");
const profileNicknameInput = document.getElementById("profileNicknameInput");
const profileExpInput = document.getElementById("profileExpInput");
const profileWeeklyDaysInput = document.getElementById("profileWeeklyDaysInput");
const profileHeightInput = document.getElementById("profileHeightInput");
const profileWeightInput = document.getElementById("profileWeightInput");
const avatarSelectRow = document.getElementById("avatarSelectRow");

// 1단계: 이미지 업로드 & 분석 DOM
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

// 1단계 결과 카드 & 이전 기록 피드백 배너
const pastHistoryBanner = document.getElementById("pastHistoryBanner");
const pastHistoryDate = document.getElementById("pastHistoryDate");
const pastHistoryText = document.getElementById("pastHistoryText");

const equipmentCategory = document.getElementById("equipmentCategory");
const equipmentDifficulty = document.getElementById("equipmentDifficulty");
const equipmentNameKo = document.getElementById("equipmentNameKo");
const equipmentNameEn = document.getElementById("equipmentNameEn");
const primaryMuscle = document.getElementById("primaryMuscle");
const secondaryMuscles = document.getElementById("secondaryMuscles");
const setupGuideList = document.getElementById("setupGuideList");
const executionGuideList = document.getElementById("executionGuideList");
const cautionList = document.getElementById("cautionList");

// 2단계: 루틴 조건 설정 DOM
const routineConfigSection = document.getElementById("routineConfigSection");
const routineConfigForm = document.getElementById("routineConfigForm");
const equipPresetChipGroup = document.getElementById("equipPresetChipGroup");
const targetPartCardGroup = document.getElementById("targetPartCardGroup");
const selectedEquipText = document.getElementById("selectedEquipText");
const backToStep1Btn = document.getElementById("backToStep1Btn");
const routineLoadingSection = document.getElementById("routineLoadingSection");

// 2단계: 루틴 결과 및 실행 DOM
const routineViewSection = document.getElementById("routineViewSection");
const routineFocusMuscle = document.getElementById("routineFocusMuscle");
const routineTotalTime = document.getElementById("routineTotalTime");
const routineTitleText = document.getElementById("routineTitleText");
const routineTimeline = document.getElementById("routineTimeline");
const reconfigRoutineBtn = document.getElementById("reconfigRoutineBtn");
const completeWorkoutBtn = document.getElementById("completeWorkoutBtn");

// 플로팅 휴식 타이머 DOM
const floatingTimerBar = document.getElementById("floatingTimerBar");
const timerCountdown = document.getElementById("timerCountdown");
const timerProgressFill = document.getElementById("timerProgressFill");
const timerAdd10Btn = document.getElementById("timerAdd10Btn");
const timerToggleBtn = document.getElementById("timerToggleBtn");
const timerSkipBtn = document.getElementById("timerSkipBtn");

// 3단계: 운동 기록 작성 섹션 DOM
const recordSaveSection = document.getElementById("recordSaveSection");
const saveSessionDate = document.getElementById("saveSessionDate");
const saveRoutineTitle = document.getElementById("saveRoutineTitle");
const saveSetsContainer = document.getElementById("saveSetsContainer");
const rpeGroup = document.getElementById("rpeGroup");
const saveSessionMemo = document.getElementById("saveSessionMemo");
const cancelSaveBtn = document.getElementById("cancelSaveBtn");
const confirmSaveWorkoutBtn = document.getElementById("confirmSaveWorkoutBtn");

// 3단계: 성장 대시보드 DOM
const dashboardSection = document.getElementById("dashboardSection");
const dashAvatarEmoji = document.getElementById("dashAvatarEmoji");
const dashNickname = document.getElementById("dashNickname");
const dashExpLevel = document.getElementById("dashExpLevel");
const dashGoalText = document.getElementById("dashGoalText");
const dashEditProfileBtn = document.getElementById("dashEditProfileBtn");

const statStreakDays = document.getElementById("statStreakDays");
const statWeeklyAchieve = document.getElementById("statWeeklyAchieve");
const statTotalMinutes = document.getElementById("statTotalMinutes");
const statTotalSets = document.getElementById("statTotalSets");

const calPrevMonthBtn = document.getElementById("calPrevMonthBtn");
const calNextMonthBtn = document.getElementById("calNextMonthBtn");
const calMonthTitle = document.getElementById("calMonthTitle");
const calendarDaysGrid = document.getElementById("calendarDaysGrid");

const balanceBarsContainer = document.getElementById("balanceBarsContainer");
const aiCoachAdviceText = document.getElementById("aiCoachAdviceText");

const historyTotalCount = document.getElementById("historyTotalCount");
const historyItemsContainer = document.getElementById("historyItemsContainer");
const exportDataBtn = document.getElementById("exportDataBtn");
const dashStartNewWorkoutBtn = document.getElementById("dashStartNewWorkoutBtn");

// 날짜 상세 팝업 모달 DOM
const dateDetailModal = document.getElementById("dateDetailModal");
const dateDetailTitle = document.getElementById("dateDetailTitle");
const dateDetailBody = document.getElementById("dateDetailBody");
const closeDateDetailBtn = document.getElementById("closeDateDetailBtn");
const confirmDateDetailBtn = document.getElementById("confirmDateDetailBtn");

// 공통 에러 배너
const errorBanner = document.getElementById("errorBanner");
const errorTitle = document.getElementById("errorTitle");
const errorDesc = document.getElementById("errorDesc");
const errorCloseBtn = document.getElementById("errorCloseBtn");

// -----------------------------------------------------------------------------
// 3. 전역 상태 관리
// -----------------------------------------------------------------------------
let currentBase64Image = null;
let lastAnalyzedEquipmentData = null; // 1단계 기구 분석 결과
let currentRoutineData = null;        // 2단계 생성 루틴 결과
let pendingSessionToSave = null;      // 3단계 저장 대기 세션 데이터

// 타이머 상태
let restTimerInterval = null;
let timerTotalSeconds = 60;
let timerSecondsLeft = 60;
let isTimerPaused = false;

// 캘린더 현재 조회 년/월 상태
let currentCalendarDate = new Date();

// -----------------------------------------------------------------------------
// 4. 로컬 스토리지 헬퍼 함수
// -----------------------------------------------------------------------------

/** 기본 사용자 프로필 반환 */
function getDefaultProfile() {
  return {
    nickname: "헬린이",
    avatar: "🦁",
    expLevel: "완전 초보(1개월 미만)",
    goal: "체지방 감량 & 체력 증진",
    weeklyTarget: 3,
    height: "",
    weight: "",
    recognizedEquipments: [] // 인식한 기구 목록 누적 보관
  };
}

/** 프로필에 인식된 기구 추가 (중복 방지 및 영구 보관) */
function addRecognizedEquipmentToProfile(equipment) {
  if (!equipment || !equipment.name_ko) return;
  const profile = loadUserProfile();
  if (!Array.isArray(profile.recognizedEquipments)) {
    profile.recognizedEquipments = [];
  }

  // 동일한 기구명이 이미 있는지 검사
  const exists = profile.recognizedEquipments.some((eq) => eq.name_ko === equipment.name_ko);
  if (!exists) {
    profile.recognizedEquipments.unshift({
      name_ko: equipment.name_ko,
      primary_muscle: equipment.primary_muscle || "전신",
      category: equipment.category || "머신 웨이트",
      recognizedAt: new Date().toISOString()
    });
    saveUserProfile(profile);
    console.log(`[프로필 저장 완료]: 인식된 기구 '${equipment.name_ko}' 추가됨.`);
  }
}

/** 사진으로 인식해 저장한 기구를 프로필과 현재 분석 상태에서 삭제합니다. */
function removeRecognizedEquipmentFromProfile(equipmentName) {
  if (!equipmentName) return;

  const profile = loadUserProfile();
  profile.recognizedEquipments = (Array.isArray(profile.recognizedEquipments)
    ? profile.recognizedEquipments
    : []).filter((equipment) => equipment.name_ko !== equipmentName);
  saveUserProfile(profile);

  // 현재 분석 결과가 삭제 대상이면 선택 목록에서 다시 보이지 않도록 비웁니다.
  if (lastAnalyzedEquipmentData?.equipment?.name_ko === equipmentName) {
    lastAnalyzedEquipmentData = null;
  }

  updateRoutineEquipSelectionUI();
}

/** 프로필 불러오기 */
function loadUserProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILE);
    if (!raw) return getDefaultProfile();
    return Object.assign(getDefaultProfile(), JSON.parse(raw));
  } catch (e) {
    console.error("프로필 로드 실패:", e);
    return getDefaultProfile();
  }
}

/** 프로필 저장하기 */
function saveUserProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
    updateHeaderProfileUI(profile);
  } catch (e) {
    console.error("프로필 저장 실패:", e);
  }
}

/** 운동 세션 목록 불러오기 (최신순) */
function loadWorkoutSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error("운동 세션 로드 실패:", e);
    return [];
  }
}

/** 운동 세션 목록 저장하기 */
function saveWorkoutSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  } catch (e) {
    console.error("운동 세션 저장 실패:", e);
  }
}

// -----------------------------------------------------------------------------
// 5. 메인 메뉴 독립 탭 네비게이션 제어
// -----------------------------------------------------------------------------

/**
 * 기구 인식('equipment'), 루틴 추천('routine'), 성장 대시보드('dashboard') 간 독립 전환
 * @param {string} tabName - 'equipment' | 'routine' | 'dashboard'
 */
function switchTab(tabName) {
  // 1. 모든 탭 버튼 active 클래스 리셋
  tabBtnEquipment.classList.remove("active");
  tabBtnRoutine.classList.remove("active");
  tabBtnDashboard.classList.remove("active");

  // 2. 모든 섹션 숨김
  uploadSection.style.display = "none";
  loadingSection.style.display = "none";
  resultSection.style.display = "none";
  routineConfigSection.style.display = "none";
  routineLoadingSection.style.display = "none";
  routineViewSection.style.display = "none";
  recordSaveSection.style.display = "none";
  dashboardSection.style.display = "none";
  hideError();

  // 3. 선택된 탭 활성화 및 화면 표시
  if (tabName === "equipment") {
    tabBtnEquipment.classList.add("active");
    if (lastAnalyzedEquipmentData) {
      resultSection.style.display = "flex";
    } else {
      uploadSection.style.display = "block";
    }
  } else if (tabName === "routine") {
    tabBtnRoutine.classList.add("active");
    if (currentRoutineData) {
      routineViewSection.style.display = "flex";
    } else {
      updateRoutineEquipSelectionUI();
      routineConfigSection.style.display = "flex";
    }
  } else if (tabName === "dashboard") {
    tabBtnDashboard.classList.add("active");
    dashboardSection.style.display = "flex";
    renderDashboard();
  }
}

// 하위 호환성을 위한 래퍼 함수 (기존 setStep(1|2|3) 호출부 지원)
function setStep(stepNum) {
  if (stepNum === 1) switchTab("equipment");
  else if (stepNum === 2) switchTab("routine");
  else if (stepNum === 3) switchTab("dashboard");
}

// 상단 독립 탭 버튼 클릭 이벤트 바인딩 (언제든 자유롭게 이동 가능)
tabBtnEquipment.addEventListener("click", () => switchTab("equipment"));
tabBtnRoutine.addEventListener("click", () => switchTab("routine"));
tabBtnDashboard.addEventListener("click", () => switchTab("dashboard"));

/** 
 * 2단계 기구 선택 UI 상태 갱신:
 * 프로필에 누적 저장된 인식 기구들 + '기구 미지정(부위만 선택)' + 대중적 프리셋 칩 동적 생성
 */
function updateRoutineEquipSelectionUI() {
  if (!equipPresetChipGroup) return;

  const profile = loadUserProfile();
  const savedEquips = Array.isArray(profile.recognizedEquipments) ? profile.recognizedEquipments : [];

  // 기본 칩 목록 구성
  equipPresetChipGroup.innerHTML = "";

  // 1. '기구 미지정 (부위만 선택)' 칩 (초보자용 추천 기본 옵션)
  const unspecChip = document.createElement("button");
  unspecChip.type = "button";
  unspecChip.className = "chip";
  unspecChip.setAttribute("data-equip", "기구 미지정");
  unspecChip.setAttribute("data-muscle", "선택 부위");
  unspecChip.innerHTML = "✨ 기구 미지정 (부위만 선택)";
  equipPresetChipGroup.appendChild(unspecChip);

  // 2. 1단계에서 방금 분석하고 넘어온 기구가 있다면 최우선 칩 추가
  if (lastAnalyzedEquipmentData?.equipment) {
    const eq = lastAnalyzedEquipmentData.equipment;
    const latestChip = document.createElement("button");
    latestChip.type = "button";
    latestChip.className = "chip";
    latestChip.setAttribute("data-equip", eq.name_ko);
    latestChip.setAttribute("data-muscle", eq.primary_muscle || "전신");
    latestChip.innerHTML = `📷 방금 인식: ${eq.name_ko} <span class="recognized-equip-remove" aria-hidden="true" title="인식 목록에서 삭제">×</span>`;
    equipPresetChipGroup.appendChild(latestChip);
  }

  // 3. 프로필에 누적 저장된 내 기구 목록 칩 추가 (방금 분석한 기구 제외)
  savedEquips.forEach((eq) => {
    if (lastAnalyzedEquipmentData?.equipment?.name_ko === eq.name_ko) return;
    const myChip = document.createElement("button");
    myChip.type = "button";
    myChip.className = "chip";
    myChip.setAttribute("data-equip", eq.name_ko);
    myChip.setAttribute("data-muscle", eq.primary_muscle || "전신");
    myChip.innerHTML = `📷 ${eq.name_ko} <span class="recognized-equip-remove" aria-hidden="true" title="인식 목록에서 삭제">×</span>`;
    equipPresetChipGroup.appendChild(myChip);
  });

  // 4. 헬스장 대표 인기 프리셋 기구 추가
  const defaultPresets = [
    { name: "체스트 프레스", muscle: "가슴" },
    { name: "랫 풀 다운", muscle: "등" },
    { name: "레그 프레스", muscle: "허벅지/하체" },
    { name: "숄더 프레스", muscle: "어깨" }
  ];

  defaultPresets.forEach((p) => {
    // 이미 프로필이나 방금 분석에 있는 이름은 중복 추가 방지
    const alreadyIn = savedEquips.some((eq) => eq.name_ko.includes(p.name)) ||
                      lastAnalyzedEquipmentData?.equipment?.name_ko?.includes(p.name);
    if (!alreadyIn) {
      const pChip = document.createElement("button");
      pChip.type = "button";
      pChip.className = "chip";
      pChip.setAttribute("data-equip", p.name);
      pChip.setAttribute("data-muscle", p.muscle);
      pChip.textContent = `${p.name}(${p.muscle})`;
      equipPresetChipGroup.appendChild(pChip);
    }
  });

  // 칩 클릭 이벤트 바인딩
  const allChips = equipPresetChipGroup.querySelectorAll(".chip");
  allChips.forEach((chip) => {
    // 사진 인식으로 추가된 기구에만 표시되는 × 버튼으로 해당 기구를 삭제합니다.
    const removeButton = chip.querySelector(".recognized-equip-remove");
    if (removeButton) {
      const removeEquipment = (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeRecognizedEquipmentFromProfile(chip.getAttribute("data-equip"));
      };
      removeButton.addEventListener("click", removeEquipment);
    }

    chip.addEventListener("click", () => {
      allChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");

      const equip = chip.getAttribute("data-equip");
      const muscle = chip.getAttribute("data-muscle");

      if (equip === "기구 미지정") {
        selectedEquipText.textContent = "기구 미지정: 아래에서 원하는 부위를 선택하면 AI가 최적의 기구를 골라줍니다.";
        // 기구 미지정 시: 부위 선택 창 노출
        if (targetPartCardGroup) {
          targetPartCardGroup.style.display = "flex";
        }
      } else {
        selectedEquipText.textContent = `선택된 메인 운동: ${equip} (${muscle})`;
        // 특정 기구 선택 시: 부위 선택 창을 즉시 완전히 숨김 (불일치 오류 원천 차단)
        if (targetPartCardGroup) {
          targetPartCardGroup.style.display = "none";
        }

        // 스마트 부위 매칭: 해당 기구의 주동근과 일치하는 부위 칩을 내부적으로 자동 설정
        autoSelectMatchingTargetPart(muscle);
      }
    });
  });

  // 프로필에 설정된 운동 경력을 루틴 추천 화면에 자동 사전 선택 동기화
  syncProfileExperienceToRoutine();

  // 초기 활성화 상태 결정: 방금 인식된 기구가 있으면 그것을 활성화, 없으면 '기구 미지정' 활성화
  if (lastAnalyzedEquipmentData?.equipment) {
    const latest = equipPresetChipGroup.querySelector(`[data-equip="${lastAnalyzedEquipmentData.equipment.name_ko}"]`);
    if (latest) {
      allChips.forEach((c) => c.classList.remove("active"));
      latest.classList.add("active");
      selectedEquipText.textContent = `선택된 메인 운동: ${lastAnalyzedEquipmentData.equipment.name_ko} (${lastAnalyzedEquipmentData.equipment.primary_muscle || "주동근"})`;
      // 특정 기구 선택 상태이므로 부위 선택 창 즉시 숨김
      if (targetPartCardGroup) {
        targetPartCardGroup.style.display = "none";
      }
      autoSelectMatchingTargetPart(lastAnalyzedEquipmentData.equipment.primary_muscle);
      return;
    }
  }

  // 기본값: '기구 미지정' 칩 활성화 (부위 선택 창 노출)
  allChips.forEach((c) => c.classList.remove("active"));
  unspecChip.classList.add("active");
  selectedEquipText.textContent = "기구 미지정: 아래에서 원하는 부위를 선택하면 AI가 최적의 기구를 골라줍니다.";
  if (targetPartCardGroup) {
    targetPartCardGroup.style.display = "flex";
  }
}

/** 프로필에 저장된 운동 경력을 루틴 설정 칩에 자동으로 사전 선택 동기화 */
function syncProfileExperienceToRoutine() {
  const profile = loadUserProfile();
  const expGroup = document.getElementById("experienceChipGroup");
  if (!expGroup || !profile.expLevel) return;

  const expChips = expGroup.querySelectorAll(".chip");
  let matched = false;

  expChips.forEach((chip) => {
    const val = chip.getAttribute("data-val");
    if (val === profile.expLevel || profile.expLevel.includes(val) || val.includes(profile.expLevel)) {
      expChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      matched = true;
    }
  });

  // 만약 정확한 문자열 매치가 없으면 기본 1번째 칩 활성화
  if (!matched && expChips.length > 0) {
    expChips[0].classList.add("active");
  }
}

/** 기구의 주동근 문자열과 매칭되는 집중 부위 칩을 자동 선택 */
function autoSelectMatchingTargetPart(muscleStr) {
  if (!muscleStr) return;
  const targetGroup = document.getElementById("targetPartChipGroup");
  if (!targetGroup) return;

  const chips = targetGroup.querySelectorAll(".chip");
  let matched = null;

  chips.forEach((chip) => {
    const val = chip.getAttribute("data-val");
    if (muscleStr.includes("가슴") && val === "가슴") matched = chip;
    else if ((muscleStr.includes("등") || muscleStr.includes("광배")) && val === "등") matched = chip;
    else if ((muscleStr.includes("하체") || muscleStr.includes("대퇴") || muscleStr.includes("허벅지")) && val === "허벅지/하체") matched = chip;
    else if ((muscleStr.includes("어깨") || muscleStr.includes("삼각")) && val === "어깨") matched = chip;
    else if ((muscleStr.includes("팔") || muscleStr.includes("이두") || muscleStr.includes("삼두") || muscleStr.includes("복근")) && val === "팔/복근") matched = chip;
  });

  if (matched) {
    chips.forEach((c) => c.classList.remove("active"));
    matched.classList.add("active");
  }
}

// -----------------------------------------------------------------------------
// 6. [프로필 관리] 모달 및 UI 동기화
// -----------------------------------------------------------------------------
function updateHeaderProfileUI(profile) {
  headerAvatarEmoji.textContent = profile.avatar || "🦁";
  headerProfileNickname.textContent = profile.nickname || "헬린이";
}

function openProfileModal() {
  const profile = loadUserProfile();
  profileNicknameInput.value = profile.nickname;
  profileExpInput.value = profile.expLevel;
  profileWeeklyDaysInput.value = profile.weeklyTarget;
  profileHeightInput.value = profile.height || "";
  profileWeightInput.value = profile.weight || "";

  // 아바타 칩 활성화
  avatarSelectRow.querySelectorAll(".avatar-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-emoji") === profile.avatar);
  });

  profileModal.style.display = "flex";
}

function closeProfileModal() {
  profileModal.style.display = "none";
}

openProfileModalBtn.addEventListener("click", openProfileModal);
dashEditProfileBtn.addEventListener("click", openProfileModal);
closeProfileModalBtn.addEventListener("click", closeProfileModal);
cancelProfileBtn.addEventListener("click", closeProfileModal);

// 아바타 이모지 선택 이벤트
avatarSelectRow.querySelectorAll(".avatar-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    avatarSelectRow.querySelectorAll(".avatar-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// 프로필 저장 서밋
profileForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const activeAvatar = avatarSelectRow.querySelector(".avatar-btn.active");
  const avatar = activeAvatar ? activeAvatar.getAttribute("data-emoji") : "🦁";
  const nickname = profileNicknameInput.value.trim() || "헬린이";
  const expLevel = profileExpInput.value;
  const weeklyTarget = parseInt(profileWeeklyDaysInput.value, 10) || 3;
  const height = profileHeightInput.value.trim();
  const weight = profileWeightInput.value.trim();

  const current = loadUserProfile();
  const updated = Object.assign(current, {
    avatar,
    nickname,
    expLevel,
    weeklyTarget,
    height,
    weight
  });

  saveUserProfile(updated);
  closeProfileModal();
  renderDashboard(); // 대시보드 갱신
  syncProfileExperienceToRoutine(); // 루틴 설정 화면의 숙련도 칩 동기화
});

// -----------------------------------------------------------------------------
// 7. [1단계] 이미지 업로드, 리사이징 & 분석
// -----------------------------------------------------------------------------
selectBtn.addEventListener("click", () => imageInput.click());
reselectBtn.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) processSelectedFile(file);
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files?.[0];
  if (file) processSelectedFile(file);
});

function processSelectedFile(file) {
  if (!file.type.startsWith("image/")) {
    showError("지원되지 않는 파일", "이미지 파일(.jpg, .png, .webp)만 업로드 가능합니다.");
    return;
  }
  hideError();

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX_DIM = 1280;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        }
      } else {
        if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      currentBase64Image = canvas.toDataURL("image/jpeg", 0.85);
      previewImage.src = currentBase64Image;
      dropPrompt.style.display = "none";
      previewContainer.style.display = "flex";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

analyzeBtn.addEventListener("click", async () => {
  if (!currentBase64Image) {
    showError("이미지 없음", "먼저 기구 사진을 선택해 주세요.");
    return;
  }

  uploadSection.style.display = "none";
  loadingSection.style.display = "flex";
  resultSection.style.display = "none";
  hideError();

  try {
    const response = await fetch("/api/analyze-equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: currentBase64Image })
    });

    const responseText = await response.text();
    let resJson;
    try {
      resJson = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[서버 응답 파싱 실패]:", response.status, responseText);
      throw new Error(`서버 응답 오류 (HTTP ${response.status}): ${responseText.substring(0, 150)}`);
    }

    if (!response.ok || !resJson.success) {
      throw new Error(resJson.error || "기구 분석 중 오류가 발생했습니다.");
    }

    const result = resJson.data;

    if (!result.is_gym_equipment) {
      loadingSection.style.display = "none";
      uploadSection.style.display = "block";
      showError(
        "기구 인식 불가",
        result.non_equipment_message || "헬스장 기구가 명확히 보이는 사진을 다시 촬영해 주세요."
      );
      return;
    }

    lastAnalyzedEquipmentData = result;
    renderAnalysisResult(result);
    checkPastHistoryForEquipment(result.equipment?.name_ko);

    // 1단계에서 인식된 기구를 프로필에 자동 저장 (루틴 추천 탭에 영구 등록)
    if (result.equipment) {
      addRecognizedEquipmentToProfile(result.equipment);
    }

    loadingSection.style.display = "none";
    resultSection.style.display = "flex";

  } catch (error) {
    console.error("[기구 분석 실패]:", error);
    loadingSection.style.display = "none";
    uploadSection.style.display = "block";
    showError("분석 실패", error.message || "서버 통신에 실패했습니다.");
  }
});

/** 1단계 결과 렌더링 */
function renderAnalysisResult(data) {
  const equip = data.equipment || {};
  equipmentCategory.textContent = equip.category || "머신 웨이트";
  equipmentDifficulty.textContent = equip.difficulty || "초급";
  equipmentNameKo.textContent = equip.name_ko || "기구명 미상";
  equipmentNameEn.textContent = equip.name_en || "";

  primaryMuscle.textContent = equip.primary_muscle || "전신";
  secondaryMuscles.textContent = Array.isArray(equip.secondary_muscles)
    ? equip.secondary_muscles.join(", ")
    : "없음";

  setupGuideList.innerHTML = "";
  (equip.setup_guide || ["의자 및 핀 높이를 체형에 맞추세요."]).forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step;
    setupGuideList.appendChild(li);
  });

  executionGuideList.innerHTML = "";
  (equip.execution_guide || ["호흡을 일정하게 유지하며 동작을 수행하세요."]).forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step;
    executionGuideList.appendChild(li);
  });

  cautionList.innerHTML = "";
  (equip.beginner_cautions || ["무리한 중량을 사용하지 마세요."]).forEach((caution) => {
    const li = document.createElement("li");
    li.textContent = caution;
    cautionList.appendChild(li);
  });
}

/** 1단계: 동일 기구 과거 운동 기록 피드백 배너 (FR-4.1) */
function checkPastHistoryForEquipment(equipName) {
  if (!equipName) {
    pastHistoryBanner.style.display = "none";
    return;
  }

  const sessions = loadWorkoutSessions();
  let matchedSession = null;
  let matchedItem = null;

  for (const s of sessions) {
    const found = s.items?.find((it) => it.name && (it.name.includes(equipName) || equipName.includes(it.name)));
    if (found) {
      matchedSession = s;
      matchedItem = found;
      break;
    }
  }

  if (matchedSession && matchedItem) {
    const dateStr = new Date(matchedSession.completedAt).toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric"
    });
    const maxWeight = Math.max(...(matchedItem.sets?.map((st) => Number(st.weight) || 0) || [0]));
    const setCnt = matchedItem.sets?.length || 0;

    pastHistoryDate.textContent = dateStr;
    pastHistoryText.textContent = `지난 ${dateStr}에 이 기구로 최고 ${maxWeight}kg x ${setCnt}세트를 수행했습니다.`;
    pastHistoryBanner.style.display = "flex";
  } else {
    pastHistoryBanner.style.display = "none";
  }
}

resetBtn.addEventListener("click", () => {
  // 분석 결과 및 이미지 상태 초기화 (lastAnalyzedEquipmentData를 먼저 비워야
  // switchTab 내부에서 resultSection이 다시 열리는 버그를 방지할 수 있음)
  currentBase64Image = null;
  lastAnalyzedEquipmentData = null;

  imageInput.value = "";
  previewImage.src = "";
  previewContainer.style.display = "none";
  dropPrompt.style.display = "block";
  pastHistoryBanner.style.display = "none";
  hideError();

  // 상태를 비운 뒤 탭 전환 → uploadSection이 정상 노출됨
  setStep(1);
});

// -----------------------------------------------------------------------------
// 8. [2단계] 루틴 조건 설정 및 생성
// -----------------------------------------------------------------------------

// 1단계 카드에서 '이 기구로 루틴 추천받기' 클릭 시
goToStep2Btn.addEventListener("click", () => {
  switchTab("routine");
});

// 2단계에서 '기구 사진 찍기' 클릭 시
backToStep1Btn.addEventListener("click", () => {
  switchTab("equipment");
});

function setupChipGroup(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const chips = group.querySelectorAll(".chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");

      // 만약 메인 기구 프리셋 칩인 경우, 선택된 기구 텍스트 즉시 갱신
      if (groupId === "equipPresetChipGroup") {
        const equip = chip.getAttribute("data-equip");
        const muscle = chip.getAttribute("data-muscle");
        selectedEquipText.textContent = `선택된 메인 운동: ${equip} (${muscle})`;
      }
    });
  });
}

setupChipGroup("goalChipGroup");
setupChipGroup("durationChipGroup");
setupChipGroup("targetPartChipGroup");
setupChipGroup("experienceChipGroup");

function getSelectedChipValue(groupId, defaultVal) {
  const group = document.getElementById(groupId);
  const activeChip = group ? group.querySelector(".chip.active") : null;
  return activeChip ? activeChip.getAttribute("data-val") : defaultVal;
}

routineConfigForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const goal = getSelectedChipValue("goalChipGroup", "체지방 감량 & 체력 증진");
  const duration = parseInt(getSelectedChipValue("durationChipGroup", "40"), 10);
  const targetPart = getSelectedChipValue("targetPartChipGroup", "가슴");
  const experience = getSelectedChipValue("experienceChipGroup", "완전 초보(1개월 미만)");

  const selectedCautions = [];
  document.querySelectorAll('input[name="cautionPart"]:checked').forEach((cb) => {
    selectedCautions.push(cb.value);
  });

  // 메인 기구 데이터 결정 (기구 미지정 또는 선택된 기구 반영)
  const activeEquipChip = equipPresetChipGroup?.querySelector(".chip.active");
  const selectedEquipName = activeEquipChip ? activeEquipChip.getAttribute("data-equip") : "기구 미지정";
  const selectedEquipMuscle = activeEquipChip ? activeEquipChip.getAttribute("data-muscle") : targetPart;
  const isUnspecified = !selectedEquipName || selectedEquipName === "기구 미지정";

  let equipmentDataToSend = null;
  if (isUnspecified) {
    // 기구를 모르는 초보자를 위해 부위 중심으로 추천
    equipmentDataToSend = {
      is_unspecified: true,
      equipment: {
        name_ko: "기구 미지정",
        primary_muscle: targetPart,
        category: "머신 웨이트",
        difficulty: "초급"
      }
    };
  } else if (lastAnalyzedEquipmentData?.equipment?.name_ko === selectedEquipName) {
    // 방금 1단계에서 분석한 기구 사용
    equipmentDataToSend = lastAnalyzedEquipmentData;
  } else {
    // 프로필에 저장된 기구 또는 프리셋 기구 사용
    equipmentDataToSend = {
      is_gym_equipment: true,
      equipment: {
        name_ko: selectedEquipName,
        primary_muscle: selectedEquipMuscle,
        category: "머신 웨이트",
        difficulty: "초급"
      }
    };
  }

  const equipName = equipmentDataToSend.equipment?.name_ko || "기구 미지정";

  // 과거 기록 피드백 컨텍스트 추출 (점진적 과부하 연동)
  let pastHistorySummary = "과거 수행 이력 없음";
  const sessions = loadWorkoutSessions();
  const pastItem = sessions.flatMap((s) => s.items || []).find((it) => it.name && it.name.includes(equipName));
  if (pastItem && pastItem.sets?.length > 0) {
    const maxW = Math.max(...pastItem.sets.map((s) => Number(s.weight) || 0));
    const avgR = Math.round(pastItem.sets.reduce((a, b) => a + (Number(b.reps) || 0), 0) / pastItem.sets.length);
    pastHistorySummary = `이전 세션에서 최고 ${maxW}kg, 평균 ${avgR}회 수행함.`;
  }

  // 최종 유효 타겟 부위 결정 (기구 선택 시 해당 기구의 주동근을 무조건 사용하여 불일치 오류 원천 방지)
  const finalTargetPart = isUnspecified ? targetPart : selectedEquipMuscle;

  const userPreferences = {
    goal,
    duration,
    targetPart: finalTargetPart,
    experience,
    cautions: selectedCautions,
    pastHistorySummary
  };

  routineConfigSection.style.display = "none";
  routineLoadingSection.style.display = "flex";
  routineViewSection.style.display = "none";
  hideError();

  try {
    const response = await fetch("/api/recommend-routine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipmentData: equipmentDataToSend,
        userPreferences
      })
    });

    const responseText = await response.text();
    let resJson;
    try {
      resJson = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[루틴 파싱 실패]:", response.status, responseText);
      throw new Error(`루틴 생성 서버 오류 (HTTP ${response.status}): ${responseText.substring(0, 150)}`);
    }

    if (!response.ok || !resJson.success) {
      throw new Error(resJson.error || "루틴 생성에 실패했습니다.");
    }

    currentRoutineData = resJson.data;
    renderRoutineTimeline(currentRoutineData);

    routineLoadingSection.style.display = "none";
    routineViewSection.style.display = "flex";

  } catch (error) {
    console.error("[루틴 생성 실패]:", error);
    routineLoadingSection.style.display = "none";
    routineConfigSection.style.display = "flex";
    showError("루틴 생성 실패", error.message || "서버 통신에 실패했습니다.");
  }
});

// -----------------------------------------------------------------------------
// 9. [2단계] 타임라인 & 휴식 타이머
// -----------------------------------------------------------------------------
function renderRoutineTimeline(routineData) {
  routineFocusMuscle.textContent = routineData.focus_muscle || "타겟 부위";
  routineTotalTime.textContent = `${routineData.total_estimated_time_min || 40}분 소요`;
  routineTitleText.textContent = routineData.routine_title || "맞춤 운동 루틴";

  routineTimeline.innerHTML = "";

  const steps = routineData.steps || [];
  steps.forEach((step, stepIdx) => {
    const card = document.createElement("div");
    card.className = "timeline-card";

    let phaseClass = "phase-main";
    if (step.phase.includes("웜업") || step.phase.includes("워밍업")) phaseClass = "phase-warmup";
    else if (step.phase.includes("보조")) phaseClass = "phase-accessory";
    else if (step.phase.includes("쿨다운") || step.phase.includes("스트레칭")) phaseClass = "phase-cooldown";

    const headerDiv = document.createElement("div");
    headerDiv.className = "exercise-header";
    headerDiv.innerHTML = `
      <div>
        <span class="timeline-phase-badge ${phaseClass}">단계 ${step.step_order || stepIdx + 1}: ${step.phase}</span>
        <h3 class="exercise-name">${step.exercise_name}</h3>
      </div>
      <span class="exercise-equip-tag">도구: ${step.equipment_needed}</span>
    `;
    card.appendChild(headerDiv);

    const setsWrap = document.createElement("div");
    setsWrap.className = "sets-wrap";

    const totalSets = Math.max(1, step.sets || 1);
    for (let s = 1; s <= totalSets; s++) {
      // label 태그로 생성하여 글씨 영역 터치/클릭 시에도 체크박스 토글 지원
      const setRow = document.createElement("label");
      setRow.className = "set-check-row";

      const leftInfo = document.createElement("div");
      leftInfo.innerHTML = `
        <span class="set-label-text">${s}세트</span>
        <span class="set-target-text">목표: ${step.reps_or_duration} ${step.weight_guide ? `(${step.weight_guide})` : ""}</span>
      `;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "set-checkbox";
      checkbox.title = `${s}세트 완료 체크`;

      checkbox.addEventListener("change", () => {
        // 체크 여부에 따른 행 배경 하이라이트 토글
        setRow.classList.toggle("checked", checkbox.checked);

        if (checkbox.checked) {
          const restSec = step.rest_seconds || 60;
          if (restSec > 0) startRestTimer(restSec);
        }
        checkCardCompletion(card);
      });

      setRow.appendChild(leftInfo);
      setRow.appendChild(checkbox);
      setsWrap.appendChild(setRow);
    }
    card.appendChild(setsWrap);

    if (step.coach_tip) {
      const tipBox = document.createElement("div");
      tipBox.className = "coach-tip-box";
      tipBox.innerHTML = `<span class="tip-prefix">💡 TIP</span> ${step.coach_tip}`;
      card.appendChild(tipBox);
    }

    routineTimeline.appendChild(card);
  });
}

function checkCardCompletion(card) {
  const allChecks = card.querySelectorAll(".set-checkbox");
  const checkedChecks = card.querySelectorAll(".set-checkbox:checked");
  if (allChecks.length > 0 && allChecks.length === checkedChecks.length) {
    card.classList.add("completed");
  } else {
    card.classList.remove("completed");
  }
}

function startRestTimer(seconds) {
  stopRestTimer();
  timerTotalSeconds = seconds;
  timerSecondsLeft = seconds;
  isTimerPaused = false;
  timerToggleBtn.textContent = "일시정지";

  updateTimerUI();
  floatingTimerBar.style.display = "block";

  restTimerInterval = setInterval(() => {
    if (!isTimerPaused) {
      timerSecondsLeft--;
      updateTimerUI();

      if (timerSecondsLeft <= 0) {
        stopRestTimer();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        timerCountdown.textContent = "휴식 끝!";
        setTimeout(() => {
          floatingTimerBar.style.display = "none";
        }, 1500);
      }
    }
  }, 1000);
}

function stopRestTimer() {
  if (restTimerInterval) {
    clearInterval(restTimerInterval);
    restTimerInterval = null;
  }
}

function updateTimerUI() {
  timerCountdown.textContent = `${timerSecondsLeft}s`;
  const pct = Math.max(0, (timerSecondsLeft / timerTotalSeconds) * 100);
  timerProgressFill.style.width = `${pct}%`;
}

timerAdd10Btn.addEventListener("click", () => {
  timerSecondsLeft += 10;
  timerTotalSeconds += 10;
  updateTimerUI();
});

timerToggleBtn.addEventListener("click", () => {
  isTimerPaused = !isTimerPaused;
  timerToggleBtn.textContent = isTimerPaused ? "재개" : "일시정지";
});

timerSkipBtn.addEventListener("click", () => {
  stopRestTimer();
  floatingTimerBar.style.display = "none";
});

reconfigRoutineBtn.addEventListener("click", () => {
  // 생성된 루틴 데이터 완전 삭제 (다른 탭에 다녀와도 조건 설정 화면이 유지되도록)
  currentRoutineData = null;
  stopRestTimer();
  floatingTimerBar.style.display = "none";
  if (routineTimeline) routineTimeline.innerHTML = "";

  // 기구 선택 UI 최신화 및 조건 설정 화면 표시
  updateRoutineEquipSelectionUI();
  routineViewSection.style.display = "none";
  routineConfigSection.style.display = "flex";
  hideError();
});

// -----------------------------------------------------------------------------
// 10. [3단계 연계] 오늘 운동 완료 클릭 -> 기록 보정 화면 오픈
// -----------------------------------------------------------------------------
completeWorkoutBtn.addEventListener("click", () => {
  stopRestTimer();
  floatingTimerBar.style.display = "none";

  if (!currentRoutineData) {
    showError("루틴 없음", "먼저 추천 루틴을 생성해 주세요.");
    return;
  }

  // 3단계 기록 저장 화면 구성 및 렌더링
  openRecordSaveSection(currentRoutineData);
});

/** 3단계 세션 보정 폼 렌더링 */
function openRecordSaveSection(routine) {
  const now = new Date();
  saveSessionDate.textContent = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  saveRoutineTitle.textContent = routine.routine_title || "오늘의 운동 세션 완료";

  saveSetsContainer.innerHTML = "";

  // 각 운동 스텝을 순회하며 입력 항목 생성
  const steps = routine.steps || [];
  steps.forEach((step, sIdx) => {
    const itemBlock = document.createElement("div");
    itemBlock.className = "save-item-block";
    itemBlock.setAttribute("data-item-name", step.exercise_name);
    itemBlock.setAttribute("data-item-muscle", routine.focus_muscle || "전신");

    itemBlock.innerHTML = `
      <div class="save-item-title">${step.step_order || sIdx + 1}. ${step.exercise_name} (${step.phase})</div>
    `;

    const totalSets = Math.max(1, step.sets || 1);
    // 기본 무게 추정치 추출 (예: "20kg" -> 20, 없으면 0)
    let defaultWeight = 0;
    if (step.weight_guide) {
      const match = step.weight_guide.match(/(\d+(\.\d+)?)\s*kg/i);
      if (match) defaultWeight = parseFloat(match[1]);
    }
    // 기본 반복수 추정치 추출
    let defaultReps = 10;
    if (step.reps_or_duration) {
      const matchR = step.reps_or_duration.match(/(\d+)/);
      if (matchR) defaultReps = parseInt(matchR[1], 10);
    }

    for (let s = 1; s <= totalSets; s++) {
      const setRow = document.createElement("div");
      setRow.className = "save-set-row";
      setRow.innerHTML = `
        <span class="save-set-num">${s}세트</span>
        <div class="save-adjust-wrap">
          <!-- 무게 조절 -->
          <div class="adjust-unit">
            <button type="button" class="adjust-btn btn-minus-weight">-</button>
            <input type="number" class="adjust-input input-weight" value="${defaultWeight}" min="0" step="2.5">
            <span class="adjust-label">kg</span>
            <button type="button" class="adjust-btn btn-plus-weight">+</button>
          </div>
          <!-- 횟수 조절 -->
          <div class="adjust-unit">
            <button type="button" class="adjust-btn btn-minus-reps">-</button>
            <input type="number" class="adjust-input input-reps" value="${defaultReps}" min="1" step="1">
            <span class="adjust-label">회</span>
            <button type="button" class="adjust-btn btn-plus-reps">+</button>
          </div>
        </div>
      `;

      // +/- 증감 버튼 이벤트
      const inputW = setRow.querySelector(".input-weight");
      const inputR = setRow.querySelector(".input-reps");
      setRow.querySelector(".btn-minus-weight").addEventListener("click", () => {
        inputW.value = Math.max(0, (parseFloat(inputW.value) || 0) - 2.5);
      });
      setRow.querySelector(".btn-plus-weight").addEventListener("click", () => {
        inputW.value = (parseFloat(inputW.value) || 0) + 2.5;
      });
      setRow.querySelector(".btn-minus-reps").addEventListener("click", () => {
        inputR.value = Math.max(1, (parseInt(inputR.value, 10) || 1) - 1);
      });
      setRow.querySelector(".btn-plus-reps").addEventListener("click", () => {
        inputR.value = (parseInt(inputR.value, 10) || 0) + 1;
      });

      itemBlock.appendChild(setRow);
    }

    saveSetsContainer.appendChild(itemBlock);
  });

  // RPE 버튼 활성화 이벤트
  rpeGroup.querySelectorAll(".rpe-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      rpeGroup.querySelectorAll(".rpe-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  routineViewSection.style.display = "none";
  recordSaveSection.style.display = "flex";
  hideError();
}

cancelSaveBtn.addEventListener("click", () => {
  recordSaveSection.style.display = "none";
  routineViewSection.style.display = "flex";
});

// -----------------------------------------------------------------------------
// 11. [3단계] 운동 기록 실제 저장 및 대시보드 연동
// -----------------------------------------------------------------------------
confirmSaveWorkoutBtn.addEventListener("click", () => {
  const activeRpeBtn = rpeGroup.querySelector(".rpe-btn.active");
  const rpe = activeRpeBtn ? parseInt(activeRpeBtn.getAttribute("data-rpe"), 10) : 3;
  const memo = saveSessionMemo.value.trim();

  // 입력된 항목 및 세트 데이터 수집
  const items = [];
  const itemBlocks = saveSetsContainer.querySelectorAll(".save-item-block");
  itemBlocks.forEach((block) => {
    const name = block.getAttribute("data-item-name");
    const muscle = block.getAttribute("data-item-muscle");
    const setRows = block.querySelectorAll(".save-set-row");
    const sets = [];

    setRows.forEach((row, idx) => {
      const weight = parseFloat(row.querySelector(".input-weight").value) || 0;
      const reps = parseInt(row.querySelector(".input-reps").value, 10) || 10;
      sets.push({
        setNum: idx + 1,
        weight,
        reps,
        completed: true
      });
    });

    items.push({ name, muscle, sets });
  });

  const durationMin = currentRoutineData?.total_estimated_time_min || 40;

  const newSession = {
    id: "session_" + Date.now(),
    completedAt: new Date().toISOString(),
    routineTitle: currentRoutineData?.routine_title || "초보자 맞춤 루틴",
    durationMin,
    rpe,
    memo,
    items
  };

  // 로컬 스토리지에 세션 저장 (최신순 prepend)
  const sessions = loadWorkoutSessions();
  sessions.unshift(newSession);
  saveWorkoutSessions(sessions);

  // 저장 완료 후 루틴 진행 상태 초기화
  currentRoutineData = null;
  stopRestTimer();
  floatingTimerBar.style.display = "none";
  saveSessionMemo.value = "";

  // 저장 완료 후 성장 대시보드 탭으로 자동 이동하여 기록 및 출석 잔디 확인
  switchTab("dashboard");

  alert(
    "✅ 오늘 운동 기록이 성공적으로 저장되었습니다!\n\n" +
    "성장 대시보드에서 방금 완료한 운동과 출석 잔디를 확인해보세요."
  );
});

// -----------------------------------------------------------------------------
// 12. [3단계] 대시보드 렌더링 & 통계 계산
// -----------------------------------------------------------------------------
function renderDashboard() {
  const profile = loadUserProfile();
  const sessions = loadWorkoutSessions();

  // 1. 프로필 요약 카드
  dashAvatarEmoji.textContent = profile.avatar || "🦁";
  dashNickname.textContent = profile.nickname || "헬린이";
  dashExpLevel.textContent = profile.expLevel.split("(")[0];
  dashGoalText.textContent = `목표: ${profile.goal} (주 ${profile.weeklyTarget}일 권장)`;

  // 2. 4대 핵심 통계 계산
  // 2-1. Streak(연속 운동 일수)
  const streak = calculateStreak(sessions);
  statStreakDays.textContent = `${streak}일`;

  // 2-2. 이번 주 운동 횟수
  const weeklyCount = calculateWeeklyWorkouts(sessions);
  const targetDays = profile.weeklyTarget || 3;
  statWeeklyAchieve.textContent = `${weeklyCount}/${targetDays}회`;

  // 2-3. 누적 총 시간
  const totalMin = sessions.reduce((acc, s) => acc + (s.durationMin || 0), 0);
  statTotalMinutes.textContent = `${totalMin}분`;

  // 2-4. 누적 완수 세트수
  const totalSets = sessions.reduce((acc, s) => {
    return acc + (s.items || []).reduce((iAcc, it) => iAcc + (it.sets?.length || 0), 0);
  }, 0);
  statTotalSets.textContent = `${totalSets}세트`;

  // 3. 월간 잔디 캘린더 렌더링
  renderMonthlyCalendar(currentCalendarDate, sessions);

  // 4. 부위별 밸런스 차트 렌더링
  renderMuscleBalanceChart(sessions);

  // 5. 최근 운동 히스토리 타임라인 렌더링
  renderHistoryList(sessions);
}

/** 연속 운동 일수 (Streak) 계산 */
function calculateStreak(sessions) {
  if (sessions.length === 0) return 0;

  // 세션들의 날짜(YYYY-MM-DD) 유니크 정렬
  const dateSet = new Set(
    sessions.map((s) => new Date(s.completedAt).toISOString().split("T")[0])
  );
  const sortedDates = Array.from(dateSet).sort().reverse();

  let streak = 0;
  let checkDate = new Date();

  // 오늘 날짜 문자열
  let checkStr = checkDate.toISOString().split("T")[0];

  // 오늘 운동하지 않았더라도 어제 운동했으면 스트릭 유지
  if (!dateSet.has(checkStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
    checkStr = checkDate.toISOString().split("T")[0];
  }

  while (dateSet.has(checkStr)) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
    checkStr = checkDate.toISOString().split("T")[0];
  }

  return streak;
}

/** 이번 주(월~일) 운동 횟수 계산 */
function calculateWeeklyWorkouts(sessions) {
  const now = new Date();
  const day = now.getDay() || 7; // 월요일=1, 일요일=7
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  monday.setHours(0, 0, 0, 0);

  const datesThisWeek = new Set();
  sessions.forEach((s) => {
    const sDate = new Date(s.completedAt);
    if (sDate >= monday && sDate <= now) {
      datesThisWeek.add(sDate.toISOString().split("T")[0]);
    }
  });

  return datesThisWeek.size;
}

/** 월간 출석 캘린더 렌더링 */
function renderMonthlyCalendar(viewDate, sessions) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0~11

  calMonthTitle.textContent = `${year}년 ${month + 1}월`;

  // 이번 달 1일의 요일 (0=일요일)
  const firstDayIndex = new Date(year, month, 1).getDay();
  // 이번 달의 총 일수
  const lastDay = new Date(year, month + 1, 0).getDate();

  // 오늘 날짜 정보
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  // 세션 날짜 매핑 (YYYY-MM-DD -> [session])
  const sessionDateMap = {};
  sessions.forEach((s) => {
    const dateKey = new Date(s.completedAt).toISOString().split("T")[0];
    if (!sessionDateMap[dateKey]) sessionDateMap[dateKey] = [];
    sessionDateMap[dateKey].push(s);
  });

  calendarDaysGrid.innerHTML = "";

  // 1일 이전의 빈 셀 채우기
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "cal-day empty";
    calendarDaysGrid.appendChild(emptyCell);
  }

  // 1일부터 말일까지 채우기
  for (let d = 1; d <= lastDay; d++) {
    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = d;

    const monthStr = String(month + 1).padStart(2, "0");
    const dayStr = String(d).padStart(2, "0");
    const fullDateKey = `${year}-${monthStr}-${dayStr}`;

    if (isCurrentMonth && d === todayDate) {
      cell.classList.add("today");
    }

    if (sessionDateMap[fullDateKey]) {
      cell.classList.add("has-workout");
      cell.title = `${sessionDateMap[fullDateKey].length}회 운동 완료 (클릭하여 상세 조회)`;

      // 날짜 클릭 시 상세 팝업 열기
      cell.addEventListener("click", () => {
        openDateDetailModal(fullDateKey, sessionDateMap[fullDateKey]);
      });
    }

    calendarDaysGrid.appendChild(cell);
  }
}

// 캘린더 이전/다음 달 이동
calPrevMonthBtn.addEventListener("click", () => {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  renderMonthlyCalendar(currentCalendarDate, loadWorkoutSessions());
});

calNextMonthBtn.addEventListener("click", () => {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderMonthlyCalendar(currentCalendarDate, loadWorkoutSessions());
});

/** 날짜별 운동 상세 내역 모달 팝업 */
function openDateDetailModal(dateKey, sessionsOnDate) {
  dateDetailTitle.textContent = `📅 ${dateKey} 운동 기록 (${sessionsOnDate.length}회)`;
  dateDetailBody.innerHTML = "";

  sessionsOnDate.forEach((s, idx) => {
    const card = document.createElement("div");
    card.className = "save-item-block";
    card.style.marginBottom = "10px";

    let itemsHtml = "";
    (s.items || []).forEach((it) => {
      const setsStr = (it.sets || [])
        .map((st) => `${st.setNum}세트: ${st.weight}kg x ${st.reps}회`)
        .join("<br>");
      itemsHtml += `
        <div style="margin-top: 6px;">
          <strong style="color: var(--primary-accent);">${it.name}</strong> (${it.muscle || "전신"})<br>
          <small style="color: var(--text-muted); line-height: 1.4;">${setsStr}</small>
        </div>
      `;
    });

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-weight:700;">
        <span>#${idx + 1} ${s.routineTitle}</span>
        <span style="color: var(--warning-color);">체감 RPE ${s.rpe}/5</span>
      </div>
      <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
        소요 시간: ${s.durationMin}분
      </div>
      ${itemsHtml}
      ${s.memo ? `<div class="history-item-memo" style="margin-top:8px;">"${s.memo}"</div>` : ""}
    `;
    dateDetailBody.appendChild(card);
  });

  dateDetailModal.style.display = "flex";
}

function closeDateDetailModal() {
  dateDetailModal.style.display = "none";
}

closeDateDetailBtn.addEventListener("click", closeDateDetailModal);
confirmDateDetailBtn.addEventListener("click", closeDateDetailModal);

/** 부위별 운동 밸런스 차트 */
function renderMuscleBalanceChart(sessions) {
  // 최근 30일 세션 필터링
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const muscleCounts = {
    "등": 0,
    "가슴": 0,
    "하체": 0,
    "어깨": 0,
    "팔/복근": 0
  };

  let totalSets = 0;

  sessions.forEach((s) => {
    if (new Date(s.completedAt) >= thirtyDaysAgo) {
      (s.items || []).forEach((it) => {
        const setCount = it.sets?.length || 1;
        const m = it.muscle || "";
        totalSets += setCount;

        if (m.includes("등") || m.includes("광배")) muscleCounts["등"] += setCount;
        else if (m.includes("가슴") || m.includes("흉")) muscleCounts["가슴"] += setCount;
        else if (m.includes("하체") || m.includes("다리") || m.includes("대퇴") || m.includes("둔근")) muscleCounts["하체"] += setCount;
        else if (m.includes("어깨") || m.includes("삼각")) muscleCounts["어깨"] += setCount;
        else muscleCounts["팔/복근"] += setCount;
      });
    }
  });

  balanceBarsContainer.innerHTML = "";

  const entries = Object.entries(muscleCounts);
  entries.forEach(([part, count]) => {
    const pct = totalSets > 0 ? Math.round((count / totalSets) * 100) : 0;

    const row = document.createElement("div");
    row.className = "balance-bar-row";
    row.innerHTML = `
      <span class="balance-label">${part}</span>
      <div class="balance-track">
        <div class="balance-fill" style="width: ${pct}%;"></div>
      </div>
      <span class="balance-pct">${pct}%</span>
    `;
    balanceBarsContainer.appendChild(row);
  });

  // AI 코치 피드백 조언 생성
  if (totalSets === 0) {
    aiCoachAdviceText.textContent = "최근 30일간의 기록이 없습니다. 오늘 첫 운동을 저장해 보세요!";
  } else {
    // 가장 적게 한 부위 찾기
    const sorted = [...entries].sort((a, b) => a[1] - b[1]);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    if (lowest[1] === 0) {
      aiCoachAdviceText.textContent = `최근 '${lowest[0]}' 부위 운동이 0%입니다! 균형 잡힌 성장을 위해 다음엔 ${lowest[0]} 머신을 추천해요.`;
    } else {
      aiCoachAdviceText.textContent = `'${highest[0]}' 운동(${highest[1]}세트)을 가장 활발히 하셨습니다! 다음엔 '${lowest[0]}'을 보강해 보세요.`;
    }
  }
}

/** 최근 운동 히스토리 타임라인 목록 */
function renderHistoryList(sessions) {
  historyTotalCount.textContent = `총 ${sessions.length}회`;
  historyItemsContainer.innerHTML = "";

  if (sessions.length === 0) {
    historyItemsContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">
        아직 저장된 운동 기록이 없습니다.
      </div>
    `;
    return;
  }

  sessions.forEach((s) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const dateStr = new Date(s.completedAt).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short"
    });

    const equipNames = (s.items || []).map((it) => it.name).join(", ") || "맨몸 운동";
    const totalSetCount = (s.items || []).reduce((acc, it) => acc + (it.sets?.length || 0), 0);

    item.innerHTML = `
      <div class="history-item-top">
        <span class="history-item-title">${s.routineTitle}</span>
        <button type="button" class="history-item-del-btn" title="기록 삭제">&times;</button>
      </div>
      <div class="history-item-meta">
        <span>📅 ${dateStr}</span>
        <span>⏱️ ${s.durationMin}분</span>
        <span>💪 ${totalSetCount}세트</span>
        <span>🔥 RPE ${s.rpe}/5</span>
      </div>
      <div style="font-size: 0.8rem; color: var(--text-main);">종목: ${equipNames}</div>
      ${s.memo ? `<div class="history-item-memo">"${s.memo}"</div>` : ""}
    `;

    // 개별 삭제 버튼
    item.querySelector(".history-item-del-btn").addEventListener("click", () => {
      if (confirm(`'${s.routineTitle}' 운동 기록을 삭제하시겠습니까?`)) {
        const updated = sessions.filter((sess) => sess.id !== s.id);
        saveWorkoutSessions(updated);
        renderDashboard();
      }
    });

    historyItemsContainer.appendChild(item);
  });
}

// JSON 백업 데이터 내보내기 (NFR-3)
exportDataBtn.addEventListener("click", () => {
  const profile = loadUserProfile();
  const sessions = loadWorkoutSessions();
  const exportPayload = {
    profile,
    sessions,
    exportedAt: new Date().toISOString(),
    version: "1.0.0"
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `gymmate_backup_${new Date().toISOString().split("T")[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
});

// 대시보드에서 '새 기구 인식하러 가기' 클릭 시 1단계 이동
dashStartNewWorkoutBtn.addEventListener("click", () => {
  setStep(1);
});

// -----------------------------------------------------------------------------
// 13. 공통 에러 배너 헬퍼
// -----------------------------------------------------------------------------
function showError(title, desc) {
  errorTitle.textContent = title;
  errorDesc.textContent = desc;
  errorBanner.style.display = "flex";
}

function hideError() {
  errorBanner.style.display = "none";
}

errorCloseBtn.addEventListener("click", hideError);

// -----------------------------------------------------------------------------
// 14. 앱 초기 실행 (온보딩 및 초기화)
// -----------------------------------------------------------------------------
(function initApp() {
  const profile = loadUserProfile();
  updateHeaderProfileUI(profile);
  syncProfileExperienceToRoutine(); // 프로필 운동 경력 자동 선택 동기화
})();
