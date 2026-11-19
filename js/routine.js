/**
 * ==============================================================================
 * 파일명: js/routine.js
 * 역할: routine.html(오늘의 운동) 화면 제어 — 작업 6-B 디자인, 기존 기능은 모두 유지
 *
 * 화면 흐름
 *   1) 들어오면 날짜·인사말을 그리고, gm_profile(목표·시간·부위)이 있으면 바로 오늘 루틴을 보여 줍니다.
 *      - 오늘 날짜 + 같은 조건(목표·시간·부위·컨디션)으로 만든 루틴이 gm_routines에 있으면 다시 만들지 않고 재사용합니다.
 *      - gm_profile이 비어 있으면 '조건' 바텀시트를 먼저 엽니다.
 *   2) STEP 1 컨디션 카드(가볍게/보통/힘차게)를 바꾸면 그 조건의 오늘 루틴을 찾거나 새로 만듭니다.
 *      연타하면 이전 요청은 끊고(AbortController) 마지막 요청만 반영합니다.
 *   3) STEP 2 루틴 카드: 부위 태그 · 이름 · 원칙 · 기구 수 · 시간/세트 · 몸 일러스트, 아래 '선배' 박스(coach_note)
 *   4) 하단 '추천 루틴으로 시작하기' → 루틴 상세(순서별 운동 + why_this_order + 기구 카드 + 코치 설명)를 펼칩니다.
 *
 * 유지한 기존 기능: 목표·시간·부위 칩(F2-1, 바텀시트로 이동), 부위 칩의 기구 수 표시, gm_profile 기본값,
 *   gm_routines 저장, 운동 카드 펼치면 기구 카드, '이 운동 자세히 배우기'(/api/coach + coach.md), 다시 만들기
 * 경력 선택은 없습니다(대상이 모두 0~2개월 초보, 2026-11-19 사용자 결정).
 * 의존: js/storage.js(GMStorage)
 * 보안: AI 결과는 모두 textContent로만 넣습니다.
 * ==============================================================================
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // 상단·인사말
  const todayDate = $("todayDate");
  const greetingLine = $("greetingLine");
  const openSheetBtn = $("openSheetBtn");
  // STEP 1
  const energyGroup = $("energyGroup");
  const energyCards = Array.from(energyGroup.querySelectorAll(".energy-card"));
  // STEP 2
  const routineCard = $("routineCard");
  const routineTags = $("routineTags");
  const routineTitle = $("routineTitle");
  const routineDesc = $("routineDesc");
  const routineEquip = $("routineEquip");
  const routineMinutes = $("routineMinutes");
  const routineSets = $("routineSets");
  const skeletonCard = $("skeletonCard");
  const skeletonNote = $("skeletonNote");
  const slotMessage = $("slotMessage");
  const slotMessageTitle = $("slotMessageTitle");
  const slotMessageDesc = $("slotMessageDesc");
  const slotMessageBtn = $("slotMessageBtn");
  const seniorNote = $("seniorNote");
  const seniorText = $("seniorText");
  // 상세
  const detailSection = $("detailSection");
  const warmupText = $("warmupText");
  const exerciseList = $("exerciseList");
  const regenerateBtn = $("regenerateBtn");
  // 하단 버튼
  const startBtn = $("startBtn");
  // 바텀시트
  const sheet = $("conditionSheet");
  const sheetBackdrop = $("sheetBackdrop");
  const sheetDesc = $("sheetDesc");
  const closeSheetBtn = $("closeSheetBtn");
  const applySheetBtn = $("applySheetBtn");
  const bodyPartChips = $("bodyPartChips");
  const nicknameInput = $("nicknameInput");
  // 오류 배너
  const errorBanner = $("errorBanner");
  const errorTitle = $("errorTitle");
  const errorDesc = $("errorDesc");
  const errorCloseBtn = $("errorCloseBtn");

  // 처음 쓰는 사람의 기본 조건 (바텀시트에 미리 골라 둘 값)
  const DEFAULTS = { goal: "근육 늘리기", minutes: "45", body_part: "전신", energy: "normal" };

  // 루틴 요청 제한 시간. Gemini는 보통 7초, 무료 모델로 넘어가면 1~2분 걸릴 수 있어 넉넉히 잡되 무한정 기다리지 않습니다.
  const REQUEST_TIMEOUT_MS = 180000;

  /**
   * 부위 그룹과 근육 이름 키워드. target_muscles 문자열에 키워드가 들어 있으면 그 부위로 봅니다.
   * - AI가 근육 이름을 조금씩 다르게 쓰므로(예: "대퇴사두근", "대사두근") 짧은 키워드로 넓게 잡습니다.
   * - upper: true인 그룹은 '상체'에 포함됩니다. figure는 몸 일러스트의 path id입니다.
   */
  const BODY_GROUPS = [
    { label: "하체", upper: false, figure: ["legs"], keys: ["하체", "다리", "대퇴", "사두", "햄스트링", "둔", "엉덩이", "종아리", "비복", "가자미", "내전", "외전", "허벅지"] },
    { label: "가슴", upper: true, figure: ["chest"], keys: ["가슴", "흉"] },
    { label: "등", upper: true, figure: ["back"], keys: ["등", "광배", "능형", "승모", "척추기립"] },
    { label: "어깨", upper: true, figure: ["shoulders"], keys: ["어깨", "삼각"] },
    { label: "팔", upper: true, figure: ["arms"], keys: ["팔", "이두", "삼두", "전완"] },
    { label: "코어", upper: false, figure: ["abs"], keys: ["코어", "복근", "복직", "복사", "복부"] }
  ];
  const ALL_FIGURE_PARTS = ["chest", "back", "shoulders", "arms", "abs", "legs"];

  let equipment = []; // gm_equipment
  let baseConditions = null; // 바텀시트로 정한 { goal, minutes, body_part } (컨디션은 energy 변수)
  let energy = DEFAULTS.energy; // STEP 1 컨디션
  let current = null; // 지금 보고 있는 루틴 { data, conditions, id }
  let activeController = null; // 진행 중인 루틴 요청 (컨디션 연타 시 이전 요청을 끊기 위해)
  let requestSeq = 0; // 마지막 요청 번호 (늦게 도착한 옛 응답을 무시하기 위해)
  let openOrder = null; // 펼쳐 둔 운동 카드 번호
  // 운동 번호별 코치 설명 요청 상태 { [order]: { loading, error } } — 카드를 다시 그려도 '만드는 중'이 유지되게 따로 기억
  let coachState = {};
  let lastFocusBeforeSheet = null; // 바텀시트를 닫을 때 포커스를 돌려줄 요소

  /* ------------------------------------------------------------------------ */
  /* 1. 작은 도우미                                                            */
  /* ------------------------------------------------------------------------ */

  /**
   * 요소를 만들고 글자를 textContent로 넣습니다.
   * @param {string} tag - 태그 이름
   * @param {string} [className] - 클래스
   * @param {string} [text] - 글자
   * @returns {HTMLElement}
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /**
   * 오류 배너를 보여 줍니다. (카드 밖 안내: 저장 실패 등)
   * @param {string} title - 굵은 제목
   * @param {string} desc - 설명
   */
  function showError(title, desc) {
    errorTitle.textContent = title;
    errorDesc.textContent = desc;
    errorBanner.hidden = false;
  }
  function hideError() {
    errorBanner.hidden = true;
  }
  errorCloseBtn.addEventListener("click", hideError);

  /**
   * 두 날짜가 사용자 기준(로컬 시간) 같은 날인지 봅니다.
   * @param {string} iso - 저장된 ISO 날짜 문자열
   * @param {Date} now - 오늘
   * @returns {boolean}
   */
  function isSameLocalDay(iso, now) {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  /* ------------------------------------------------------------------------ */
  /* 2. 날짜·인사말                                                            */
  /* ------------------------------------------------------------------------ */

  /**
   * 오늘 날짜("6월 18일 수요일")와 인사말 첫 줄을 그립니다.
   * - 닉네임(gm_profile.nickname)이 있으면 "{닉네임}님, 오늘도", 없으면 "오늘도"
   */
  function renderHeader() {
    todayDate.textContent = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
    const profile = GMStorage.getProfile() || {};
    greetingLine.textContent = profile.nickname ? `${profile.nickname}님, 오늘도` : "오늘도";
  }

  /* ------------------------------------------------------------------------ */
  /* 3. STEP 1 컨디션 카드 (라디오 그룹)                                        */
  /* ------------------------------------------------------------------------ */

  /**
   * 컨디션 카드 하나를 선택 상태로 그립니다. (aria-checked, 키보드 포커스 위치 tabindex 포함)
   * @param {string} value - light | normal | strong
   */
  function paintEnergy(value) {
    energyCards.forEach((card) => {
      const on = card.dataset.value === value;
      card.classList.toggle("is-selected", on);
      card.setAttribute("aria-checked", String(on));
      // 라디오 그룹 규칙: 선택된 카드만 Tab으로 들어올 수 있고, 그룹 안에서는 화살표로 이동합니다.
      card.tabIndex = on ? 0 : -1;
    });
  }

  /**
   * 컨디션을 바꾸고 그 조건의 오늘 루틴을 보여 줍니다.
   * @param {string} value - light | normal | strong
   * @param {boolean} [moveFocus] - 키보드로 바꿨을 때 새 카드로 포커스 이동
   */
  function selectEnergy(value, moveFocus) {
    const changed = value !== energy;
    energy = value;
    paintEnergy(value);
    if (moveFocus) {
      const card = energyCards.find((c) => c.dataset.value === value);
      if (card) card.focus();
    }
    if (changed && baseConditions && equipment.length > 0) loadRoutine();
  }

  energyGroup.addEventListener("click", (e) => {
    const card = e.target.closest(".energy-card");
    if (card) selectEnergy(card.dataset.value, false);
  });

  // 키보드: ←/↑ 이전, →/↓ 다음(끝에서 처음으로 순환), Space/Enter 선택
  energyGroup.addEventListener("keydown", (e) => {
    const index = energyCards.findIndex((c) => c === document.activeElement);
    if (index === -1) return;
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % energyCards.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + energyCards.length) % energyCards.length;
    if (next !== null) {
      e.preventDefault();
      selectEnergy(energyCards[next].dataset.value, true);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      selectEnergy(energyCards[index].dataset.value, false);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* 4. 조건 바텀시트 (목표 · 시간 · 부위 칩 + 닉네임)                           */
  /* ------------------------------------------------------------------------ */

  /**
   * 기구 하나가 어떤 부위 그룹에 속하는지 구합니다.
   * @param {Object} item - 기구 객체 (target_muscles 사용)
   * @returns {Set<string>} 속한 그룹 이름들 (예: {"가슴", "팔"})
   */
  function groupsOf(item) {
    const text = (Array.isArray(item.target_muscles) ? item.target_muscles : []).join(" ");
    const result = new Set();
    BODY_GROUPS.forEach((g) => {
      if (g.keys.some((k) => text.includes(k))) result.add(g.label);
    });
    return result;
  }

  /**
   * 등록 기구를 보고 부위 칩을 만듭니다. (기존 기능 유지)
   * - 항상: 전신, 상체, 하체 (쓸 수 있는 기구가 0개인 상체/하체는 숨김)
   * - 추가 제안: 가슴, 등, 어깨, 팔, 코어 중 등록 기구가 있는 부위만
   * - 칩에 그 부위에 쓸 수 있는 기구 수를 붙여, 기구가 적은 부위를 고르기 전에 알 수 있게 합니다.
   */
  function renderBodyPartChips() {
    const groupSets = equipment.map(groupsOf);
    const upperLabels = BODY_GROUPS.filter((g) => g.upper).map((g) => g.label);
    const count = (label) => {
      if (label === "전신") return equipment.length;
      if (label === "상체") return groupSets.filter((s) => upperLabels.some((l) => s.has(l))).length;
      return groupSets.filter((s) => s.has(label)).length;
    };
    bodyPartChips.textContent = "";
    ["전신", "상체", "하체", "가슴", "등", "어깨", "팔", "코어"].forEach((label) => {
      const n = count(label);
      if (label !== "전신" && n === 0) return;
      const chip = el("button", "chip", `${label} (${n})`);
      chip.type = "button";
      chip.dataset.value = label;
      bodyPartChips.appendChild(chip);
    });
  }

  /**
   * 칩 그룹 안에서 하나를 고릅니다. (라디오 버튼처럼 하나만 active)
   * @param {HTMLElement} group - .chip-group 요소
   * @param {string} value - 고를 칩의 data-value
   * @returns {boolean} 해당 값의 칩이 있어 골랐으면 true
   */
  function selectChip(group, value) {
    let found = false;
    group.querySelectorAll(".chip").forEach((chip) => {
      const on = chip.dataset.value === String(value);
      chip.classList.toggle("active", on);
      chip.setAttribute("aria-checked", String(on));
      chip.setAttribute("role", "radio");
      if (on) found = true;
    });
    return found;
  }

  /**
   * 바텀시트 칩 그룹에서 고른 값을 읽습니다.
   * @param {string} field - goal | minutes | body_part
   * @returns {string|null}
   */
  function selectedValue(field) {
    const active = sheet.querySelector(`.chip-group[data-field="${field}"] .chip.active`);
    return active ? active.dataset.value : null;
  }

  // 칩 클릭: 이벤트 위임 (부위 칩은 나중에 만들어지므로)
  sheet.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) selectChip(chip.closest(".chip-group"), chip.dataset.value);
  });

  /**
   * 지금 조건(없으면 gm_profile, 그것도 없으면 기본값)으로 시트의 칩과 닉네임을 미리 채웁니다.
   * - 저장된 값이 지금 칩에 없으면(예: 기구를 지워 사라진 부위) 기본값을 고릅니다.
   */
  function fillSheet() {
    const profile = GMStorage.getProfile() || {};
    const source = baseConditions || {
      goal: profile.goal,
      minutes: profile.default_minutes,
      body_part: profile.body_part
    };
    ["goal", "minutes", "body_part"].forEach((field) => {
      const group = sheet.querySelector(`.chip-group[data-field="${field}"]`);
      if (!selectChip(group, source[field] || DEFAULTS[field])) selectChip(group, DEFAULTS[field]);
    });
    nicknameInput.value = profile.nickname || "";
  }

  /**
   * 바텀시트를 엽니다.
   * @param {boolean} [isFirst] - 첫 진입(프로필 없음)이면 안내 문구를 바꿉니다.
   */
  function openSheet(isFirst) {
    fillSheet();
    sheetDesc.textContent = isFirst
      ? "처음이시네요. 목표·시간·부위를 고르면 바로 루틴을 짜 드릴게요."
      : "고른 조건은 다음에도 그대로 쓸게요.";
    lastFocusBeforeSheet = document.activeElement;
    sheet.hidden = false;
    sheetBackdrop.hidden = false;
    document.body.classList.add("sheet-open"); // 뒤 화면 스크롤 잠금
    const first = sheet.querySelector(".chip.active") || sheet.querySelector(".chip");
    if (first) first.focus();
  }

  /** 바텀시트를 닫고 포커스를 원래 자리로 돌려줍니다. */
  function closeSheet() {
    sheet.hidden = true;
    sheetBackdrop.hidden = true;
    document.body.classList.remove("sheet-open");
    if (lastFocusBeforeSheet && lastFocusBeforeSheet.focus) lastFocusBeforeSheet.focus();
  }

  openSheetBtn.addEventListener("click", () => openSheet(false));
  closeSheetBtn.addEventListener("click", closeSheet);
  sheetBackdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.hidden) closeSheet();
  });

  // '이 조건으로 추천받기': 고른 값을 gm_profile에 저장(다음 방문 기본값)하고 루틴을 보여 줍니다.
  applySheetBtn.addEventListener("click", () => {
    const next = {
      goal: selectedValue("goal"),
      minutes: Number(selectedValue("minutes")),
      body_part: selectedValue("body_part")
    };
    if (!next.goal || !next.minutes || !next.body_part) return; // 칩은 항상 하나씩 골라져 있지만 만일에 대비
    baseConditions = next;
    GMStorage.setProfile({
      goal: next.goal,
      default_minutes: next.minutes,
      body_part: next.body_part,
      nickname: nicknameInput.value
    });
    renderHeader();
    closeSheet();
    if (equipment.length > 0) loadRoutine();
  });

  /* ------------------------------------------------------------------------ */
  /* 5. 카드 자리 상태 (루틴 / 로딩 / 오류 / 기구 없음 / 조건 고르기 전)         */
  /* ------------------------------------------------------------------------ */

  /**
   * STEP 2 카드 자리의 상태를 바꿉니다. 한 번에 하나만 보이고, 루틴이 없으면 하단 버튼을 막습니다.
   * @param {"routine"|"loading"|"error"|"empty"|"idle"} state - 보여 줄 상태
   * @param {string} [message] - 오류일 때 보여 줄 설명
   */
  function showSlot(state, message) {
    routineCard.hidden = state !== "routine";
    seniorNote.hidden = state !== "routine" || !seniorText.textContent;
    skeletonCard.hidden = state !== "loading";
    skeletonNote.hidden = state !== "loading";
    slotMessage.hidden = !["error", "empty", "idle"].includes(state);
    startBtn.disabled = state !== "routine";
    if (state !== "routine") detailSection.hidden = true;

    if (state === "error") {
      slotMessageTitle.textContent = "루틴을 만들지 못했어요";
      slotMessageDesc.textContent = message || "잠시 후 다시 시도해 주세요.";
      slotMessageBtn.textContent = "다시 시도";
      slotMessageBtn.onclick = () => loadRoutine({ force: true });
    } else if (state === "empty") {
      slotMessageTitle.textContent = "먼저 내 헬스장 기구를 등록해 주세요";
      slotMessageDesc.textContent = "루틴은 등록한 기구로만 만들어요.";
      slotMessageBtn.textContent = "기구 등록하러 가기";
      slotMessageBtn.onclick = () => (window.location.href = "scan.html");
    } else if (state === "idle") {
      slotMessageTitle.textContent = "조건을 고르면 루틴을 짜 드려요";
      slotMessageDesc.textContent = "목표·시간·부위를 한 번만 골라 주세요.";
      slotMessageBtn.textContent = "조건 고르기";
      slotMessageBtn.onclick = () => openSheet(true);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* 6. 루틴 불러오기 (오늘 캐시 → 없으면 생성)                                  */
  /* ------------------------------------------------------------------------ */

  /**
   * 오늘 같은 조건으로 만든 루틴을 gm_routines에서 찾습니다.
   * @param {Object} conditions - { goal, minutes, body_part, energy }
   * @returns {Object|null} 저장된 루틴, 없으면 null
   * - 6-B 화면에 필요한 title이 없는 예전 루틴, 지금은 지워진 기구를 쓰는 루틴은 재사용하지 않습니다.
   */
  function findTodayRoutine(conditions) {
    const now = new Date();
    const ids = new Set(equipment.map((e) => e.id));
    const list = GMStorage.getRoutines();
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      const c = r && r.conditions;
      if (!c || !r.title || !isSameLocalDay(r.date, now)) continue;
      const same =
        c.goal === conditions.goal &&
        Number(c.minutes) === Number(conditions.minutes) &&
        c.body_part === conditions.body_part &&
        (c.energy || "normal") === conditions.energy;
      if (!same) continue;
      if (!Array.isArray(r.exercises) || r.exercises.length === 0) continue;
      if (!r.exercises.every((ex) => ids.has(ex.equipment_id))) continue;
      return r;
    }
    return null;
  }

  /**
   * 지금 조건의 오늘 루틴을 보여 줍니다. 캐시가 있으면 재사용하고, 없거나 force면 새로 만듭니다.
   * @param {{force?: boolean}} [options] - force: '다시 시도'·'다시 만들기'처럼 캐시를 무시할 때
   */
  function loadRoutine(options) {
    hideError();
    const conditions = { ...baseConditions, energy };
    if (!(options && options.force)) {
      const cached = findTodayRoutine(conditions);
      if (cached) {
        if (activeController) activeController.abort(); // 진행 중이던 다른 컨디션 요청은 버립니다.
        requestSeq++;
        renderRoutine(cached, conditions, cached.id);
        return;
      }
    }
    generate(conditions);
  }

  /**
   * /api/routine에 조건과 등록 기구를 보내 루틴을 받고, gm_routines에 저장한 뒤 화면에 그립니다.
   * @param {{goal, minutes, body_part, energy}} conditions - 보낼 조건
   * - 예외 처리:
   *   · 컨디션을 연타하면 이전 요청을 abort하고, 늦게 온 옛 응답은 요청 번호로 걸러 무시합니다.
   *   · 제한 시간(3분)을 넘기면 끊고 '다시 시도'를 보여 줍니다.
   *   · JSON이 아닌 응답이나 success:false면 서버 메시지를 오류 카드에 보여 줍니다.
   *   · 저장(gm_routines)에 실패해도 루틴은 화면에 보여 주고 배너로만 알립니다.
   */
  async function generate(conditions) {
    if (activeController) activeController.abort();
    const controller = new AbortController();
    activeController = controller;
    const seq = ++requestSeq;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    showSlot("loading");

    try {
      const response = await fetch("/api/routine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          conditions,
          // 서버에는 루틴을 짜는 데 필요한 필드만 보냅니다(세팅법·주의사항은 화면에서 직접 씀).
          equipment: equipment.map((e) => ({ id: e.id, name_ko: e.name_ko, target_muscles: e.target_muscles }))
        })
      });
      const text = await response.text();
      if (seq !== requestSeq) return; // 그사이 다른 요청이 시작됐으면 이 응답은 버립니다.
      let json;
      try {
        json = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`서버 응답을 읽지 못했어요 (HTTP ${response.status})`);
      }
      if (!response.ok || !json.success) {
        throw new Error(json.error || "잠시 후 다시 시도해 주세요");
      }

      console.log(`[루틴] 서버가 걸러낸 운동 ${json.filtered_count}개`); // 검증용
      const routine = json.data;
      const saved = GMStorage.addRoutine({
        conditions,
        title: routine.title,
        focus_tags: routine.focus_tags,
        coach_note: routine.coach_note,
        total_minutes: routine.total_minutes,
        principle: routine.principle,
        warmup: routine.warmup,
        exercises: routine.exercises
      });
      renderRoutine(saved || routine, conditions, saved ? saved.id : null);
      if (!saved) {
        showError("루틴을 기록하지 못했어요", "브라우저 저장 공간이 부족할 수 있어요. 운동은 그대로 하셔도 돼요.");
      }
    } catch (error) {
      if (seq !== requestSeq) return; // 새 요청 때문에 끊긴 것은 오류로 보여 주지 않습니다.
      if (error.name === "AbortError" && !timedOut) return;
      console.error("[루틴 생성 실패]:", error);
      showSlot("error", timedOut ? "응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." : error.message);
    } finally {
      clearTimeout(timer);
      if (activeController === controller) activeController = null;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* 7. 루틴 카드 · 선배 박스 · 상세 그리기                                       */
  /* ------------------------------------------------------------------------ */

  /**
   * 부위 태그를 몸 일러스트의 path id로 바꿉니다.
   * @param {string} tag - 예: "가슴", "등", "하체", "상체", "전신"
   * @returns {string[]} path id 목록 (예: ["chest"])
   */
  function figurePartsOf(tag) {
    const t = String(tag || "");
    if (t.includes("전신")) return ALL_FIGURE_PARTS.slice();
    if (t.includes("상체")) return ["chest", "back", "shoulders", "arms"];
    const group = BODY_GROUPS.find((g) => g.label === t || g.keys.some((k) => t.includes(k)));
    return group ? group.figure : [];
  }

  /**
   * 몸 일러스트를 칠합니다. 첫 번째 태그 부위는 진한 초록(주 부위), 두 번째는 연한 초록(보조 부위)입니다.
   * @param {string[]} tags - focus_tags
   */
  function paintFigure(tags) {
    const primary = new Set(figurePartsOf(tags[0]));
    const secondary = new Set(figurePartsOf(tags[1]));
    ALL_FIGURE_PARTS.forEach((part) => {
      const path = $(`part-${part}`);
      if (!path) return;
      path.classList.toggle("is-primary", primary.has(part));
      path.classList.toggle("is-secondary", !primary.has(part) && secondary.has(part));
    });
  }

  /**
   * 루틴을 카드·선배 박스·상세 목록에 그립니다.
   * @param {Object} routine - { title, focus_tags, coach_note, principle, total_minutes, warmup, exercises }
   * @param {Object} conditions - 이 루틴의 조건 (goal은 코치 설명 요청에도 사용)
   * @param {string|null} [routineId] - gm_routines id. 없으면 코치 설명을 화면에만 보여 주고 저장하지 않습니다.
   */
  function renderRoutine(routine, conditions, routineId) {
    current = { data: routine, conditions, id: routineId || null };
    openOrder = null;
    coachState = {};

    const exercises = Array.isArray(routine.exercises) ? routine.exercises : [];
    const tags = Array.isArray(routine.focus_tags) && routine.focus_tags.length > 0 ? routine.focus_tags : [conditions.body_part];
    const equipmentCount = new Set(exercises.map((ex) => ex.equipment_id)).size;
    const totalSets = exercises.reduce((sum, ex) => sum + (Number(ex.sets) || 0), 0);

    routineTags.textContent = tags.join(" · ");
    routineTitle.textContent = routine.title || "오늘의 루틴";
    routineDesc.textContent = routine.principle || "";
    routineEquip.textContent = `등록된 기구 ${equipmentCount}개로 충분해요.`;
    routineMinutes.textContent = `약 ${routine.total_minutes || conditions.minutes}분`;
    routineSets.textContent = `총 ${totalSets}세트`;
    paintFigure(tags);

    seniorText.textContent = routine.coach_note || "";
    warmupText.textContent = routine.warmup || "";
    renderExercises(exercises);
    showSlot("routine");
  }

  // 하단 버튼: 루틴 상세를 펼치고 그 위치로 스크롤합니다.
  startBtn.addEventListener("click", () => {
    if (!current) return;
    detailSection.hidden = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    detailSection.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });

  // 상세의 '같은 조건으로 다시 만들기': 오늘 캐시를 무시하고 새로 만듭니다. (기존 '다시 만들기' 기능)
  regenerateBtn.addEventListener("click", () => {
    if (!baseConditions) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    loadRoutine({ force: true });
  });

  /**
   * 순서별 운동 카드를 그립니다. (기존 기능 유지)
   * 카드 구조: [순서 번호 | 운동명, 기구 이름, 세트×횟수·휴식, why_this_order] → 누르면 기구 카드 + 코치 설명 펼침
   * - why_this_order는 앱의 핵심이므로 접혀 있을 때도 항상 보이게 합니다.
   * @param {Array} exercises - 정렬된 운동 배열
   */
  function renderExercises(exercises) {
    exerciseList.textContent = "";
    exercises.forEach((ex) => {
      const item = GMStorage.getEquipmentById(ex.equipment_id);
      const isOpen = openOrder === ex.order;

      const li = el("li", "exercise-item" + (isOpen ? " open" : ""));
      const toggle = el("button", "exercise-toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(isOpen));

      toggle.appendChild(el("span", "exercise-order", String(ex.order)));
      const body = el("span", "exercise-body");
      body.appendChild(el("span", "exercise-title", ex.exercise));
      body.appendChild(el("span", "exercise-equipment", item ? item.name_ko : "삭제된 기구"));
      body.appendChild(el("span", "exercise-dose", `${ex.sets}세트 × ${ex.reps} · 휴식 ${ex.rest_sec}초`));
      body.appendChild(el("span", "exercise-why", `왜 ${ex.order}번째? ${ex.why_this_order}`));
      toggle.appendChild(body);
      const chevron = el("span", "equipment-chevron");
      chevron.setAttribute("aria-hidden", "true");
      toggle.appendChild(chevron);
      toggle.addEventListener("click", () => {
        openOrder = openOrder === ex.order ? null : ex.order;
        renderExercises(exercises);
      });
      li.appendChild(toggle);

      // 펼친 기구 카드
      const panel = el("div", "exercise-panel");
      panel.hidden = !isOpen;
      if (!item) {
        panel.appendChild(el("p", "list-hint", "내 헬스장에서 지워진 기구라 세팅법을 보여 줄 수 없어요."));
      } else {
        if (item.role) panel.appendChild(el("p", "equipment-role", `역할: ${item.role}`));
        [["세팅법", item.setup, false], ["주의사항", item.cautions, true]].forEach(([title, list, warn]) => {
          if (!Array.isArray(list) || list.length === 0) return;
          const block = el("div", "guide-block" + (warn ? " alert-block" : ""));
          block.appendChild(el("h4", "guide-title" + (warn ? " warning" : ""), title));
          const ul = el("ul", "guide-list" + (warn ? " warning-list" : ""));
          list.forEach((t) => ul.appendChild(el("li", "", t)));
          block.appendChild(ul);
          panel.appendChild(block);
        });
        panel.appendChild(renderCoachArea(ex, item, exercises));
      }
      li.appendChild(panel);
      exerciseList.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------------ */
  /* 8. 코치 설명 (coach.md) — 기존 기능 유지                                    */
  /* ------------------------------------------------------------------------ */

  /**
   * 펼친 운동 카드 아래쪽의 코치 설명 영역을 만듭니다.
   * - 이미 설명이 있으면(이번에 만들었거나 gm_routines에 저장돼 있으면) 바로 보여 줍니다.
   * - 만드는 중이면 안내 문구, 없으면 '이 운동 자세히 배우기' 버튼(+ 지난 오류 메시지)을 보여 줍니다.
   * @param {Object} ex - 운동 항목
   * @param {Object} item - 기구 객체 (gm_equipment)
   * @param {Array} exercises - 전체 운동 배열 (다시 그리기·전체 개수에 사용)
   * @returns {HTMLElement}
   */
  function renderCoachArea(ex, item, exercises) {
    const area = el("div", "coach-area");
    if (ex.coach) {
      area.appendChild(renderCoach(ex.coach));
      return area;
    }
    const state = coachState[ex.order] || {};
    if (state.loading) {
      area.appendChild(el("p", "coach-loading", "코치 설명을 만드는 중이에요..."));
      return area;
    }
    if (state.error) area.appendChild(el("p", "coach-error", state.error));
    const btn = el("button", "btn btn-outline btn-block", state.error ? "다시 시도하기" : "이 운동 자세히 배우기");
    btn.type = "button";
    btn.addEventListener("click", () => requestCoach(ex, item, exercises));
    area.appendChild(btn);
    return area;
  }

  /**
   * /api/coach에 운동 하나의 설명을 요청합니다.
   * @param {Object} ex - 운동 항목 { order, exercise, sets, reps, rest_sec, why_this_order }
   * @param {Object} item - 기구 객체
   * @param {Array} exercises - 전체 운동 배열
   * - 예외 처리: 실패하면 카드 안에 오류 문구와 '다시 시도하기' 버튼을 보여 줍니다(화면 전체는 그대로 둠).
   *   제한 시간(3분)을 넘기면 요청을 끊습니다. 저장에 실패해도 설명은 화면에 보여 줍니다.
   */
  async function requestCoach(ex, item, exercises) {
    if (coachState[ex.order] && coachState[ex.order].loading) return;
    const routineAtStart = current; // 기다리는 사이 다른 루틴으로 바뀌면 결과를 섞지 않기 위해 기억
    coachState[ex.order] = { loading: true, error: null };
    renderExercises(exercises);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          goal: routineAtStart.conditions.goal,
          equipment: {
            name_ko: item.name_ko,
            name_en: item.name_en,
            target_muscles: item.target_muscles,
            role: item.role,
            setup: item.setup,
            cautions: item.cautions
          },
          exercise: {
            exercise: ex.exercise,
            sets: ex.sets,
            reps: ex.reps,
            rest_sec: ex.rest_sec,
            order: ex.order,
            why_this_order: ex.why_this_order
          },
          total_exercises: exercises.length
        })
      });
      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`서버 응답을 읽지 못했어요 (HTTP ${response.status})`);
      }
      if (!response.ok || !json.success) {
        throw new Error(json.error || "설명을 만들지 못했어요. 잠시 후 다시 시도해 주세요");
      }
      ex.coach = json.data;
      if (routineAtStart.id && !GMStorage.saveExerciseCoach(routineAtStart.id, ex.order, json.data)) {
        console.warn("[코치 설명] 저장하지 못했어요. 화면에만 보여 줍니다.");
      }
      if (current === routineAtStart) coachState[ex.order] = { loading: false, error: null };
    } catch (error) {
      console.error("[코치 설명 실패]:", error);
      if (current === routineAtStart) {
        coachState[ex.order] = {
          loading: false,
          error: error.name === "AbortError" ? "응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." : error.message
        };
      }
    } finally {
      clearTimeout(timer);
      if (current === routineAtStart) renderExercises(exercises);
    }
  }

  /**
   * 코치 설명 객체를 카드로 그립니다. 모든 글자는 textContent로만 넣습니다.
   * @param {Object} c - { headline, why_for_goal, setup[], steps[], breathing, feel_check, set_plan, weight_tip, common_mistakes[], remember }
   * @returns {HTMLElement}
   */
  function renderCoach(c) {
    const card = el("div", "coach-card");
    card.appendChild(el("p", "coach-label", "코치 설명"));
    card.appendChild(el("p", "coach-headline", c.headline));
    card.appendChild(el("p", "coach-text", c.why_for_goal));

    /**
     * 제목 + 내용 블록을 만들어 카드에 붙입니다.
     * @param {string} title - 블록 제목
     * @param {HTMLElement|string} content - 요소 또는 문장
     */
    const section = (title, content) => {
      const block = el("div", "coach-section");
      block.appendChild(el("h5", "coach-section-title", title));
      block.appendChild(typeof content === "string" ? el("p", "coach-text", content) : content);
      card.appendChild(block);
    };

    if (Array.isArray(c.setup) && c.setup.length > 0) {
      const ul = el("ul", "coach-list");
      c.setup.forEach((t) => ul.appendChild(el("li", "", t)));
      section("앉기 전에", ul);
    }

    const ol = el("ol", "coach-steps");
    (c.steps || []).forEach((step) => {
      const li = el("li");
      li.appendChild(el("strong", "coach-cue", step.cue));
      li.appendChild(el("span", "coach-text", step.detail));
      ol.appendChild(li);
    });
    section("동작", ol);

    section("호흡", c.breathing);

    const feel = el("div", "coach-feel");
    feel.appendChild(el("p", "coach-right", `맞게 하면: ${c.feel_check.right}`));
    feel.appendChild(el("p", "coach-wrong", `이러면 확인: ${c.feel_check.wrong}`));
    section("느낌 확인", feel);

    const plan = c.set_plan || {};
    const planText = [
      plan.sets ? `${plan.sets}세트` : "",
      plan.reps || "",
      plan.rest_sec !== null && plan.rest_sec !== undefined ? `휴식 ${plan.rest_sec}초` : ""
    ]
      .filter(Boolean)
      .join(" · ");
    const planBox = el("div");
    if (planText) planBox.appendChild(el("p", "coach-plan", planText));
    planBox.appendChild(el("p", "coach-text", plan.why || ""));
    section("오늘 세트", planBox);

    section("무게 고르기", c.weight_tip);

    if (Array.isArray(c.common_mistakes) && c.common_mistakes.length > 0) {
      const ul = el("ul", "coach-mistakes");
      c.common_mistakes.forEach((m) => {
        const li = el("li");
        li.appendChild(el("span", "coach-mistake", m.mistake));
        li.appendChild(el("span", "coach-fix", `→ ${m.fix}`));
        ul.appendChild(li);
      });
      section("흔한 실수", ul);
    }

    card.appendChild(el("p", "coach-remember", `기억할 것: ${c.remember}`));
    return card;
  }

  /* ------------------------------------------------------------------------ */
  /* 9. 시작                                                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * 페이지를 처음 그립니다.
   * - 기구 0개: 카드 자리에 등록 안내 (시트는 열지 않음)
   * - gm_profile에 목표·시간이 없음: 조건 바텀시트를 먼저 엶
   * - 그 밖: 프로필 조건 + 컨디션 '보통'으로 오늘 루틴을 찾거나 만듦
   */
  function init() {
    renderHeader();
    paintEnergy(energy);
    equipment = GMStorage.getEquipment();
    renderBodyPartChips();

    if (equipment.length === 0) {
      showSlot("empty");
      return;
    }

    const profile = GMStorage.getProfile();
    if (!profile || !profile.goal || !profile.default_minutes) {
      showSlot("idle");
      openSheet(true);
      return;
    }

    // 프로필의 부위가 지금 칩에 없으면(그 부위 기구를 지운 경우) 전신으로 시작합니다.
    const bodyOk = profile.body_part && bodyPartChips.querySelector(`.chip[data-value="${profile.body_part}"]`);
    baseConditions = {
      goal: profile.goal,
      minutes: Number(profile.default_minutes),
      body_part: bodyOk ? profile.body_part : DEFAULTS.body_part
    };
    loadRoutine();
  }

  init();

  // 브라우저 콘솔에서 상태를 확인하기 위한 개발용 도구 (AI를 부르지 않고 화면 확인)
  // 예: GMRoutine.showState("loading") / GMRoutine.showState("error", "메시지") / GMRoutine.showState("empty")
  //     GMRoutine.render({ title, focus_tags, coach_note, principle, total_minutes, warmup, exercises }, { goal, minutes, body_part })
  window.GMRoutine = Object.freeze({
    render: (routine, conditions, id) => renderRoutine(routine, { energy, ...conditions }, id),
    renderCoach,
    showState: showSlot
  });
})();
