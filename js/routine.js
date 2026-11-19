/**
 * ==============================================================================
 * 파일명: js/routine.js
 * 역할: routine.html(오늘의 루틴) 화면 제어
 *   - 조건 칩(목표, 시간, 부위)을 고르게 합니다. 타이핑은 없습니다(F2-1).
 *     경력 선택은 없습니다. 대상이 모두 헬스 0~2개월 초보라 의미가 없다고 보고 뺐습니다(2026-11-19 사용자 결정).
 *     지난번에 고른 값(gm_profile)을 기본값으로 미리 골라 둬서, 바로 '루틴 만들기'만 눌러도 되게 합니다.
 *   - 부위 칩은 등록 기구의 target_muscles를 보고 만들고, 칩마다 쓸 수 있는 기구 수를 보여 줍니다.
 *   - /api/routine 호출 → principle 강조, 워밍업, 순서별 운동 카드 표시 → gm_routines에 저장
 *   - 운동 카드를 누르면 해당 기구 카드(세팅법, 주의사항)가 펼쳐집니다.
 * 의존: js/storage.js(GMStorage)
 * 보안: AI 결과는 모두 textContent로만 넣습니다.
 * ==============================================================================
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const noEquipment = $("noEquipment");
  const conditionSection = $("conditionSection");
  const equipmentSummary = $("equipmentSummary");
  const bodyPartChips = $("bodyPartChips");
  const generateBtn = $("generateBtn");
  const loadingSection = $("loadingSection");
  const resultSection = $("resultSection");
  const principleText = $("principleText");
  const routineMeta = $("routineMeta");
  const warmupText = $("warmupText");
  const exerciseList = $("exerciseList");
  const changeConditionBtn = $("changeConditionBtn");
  const regenerateBtn = $("regenerateBtn");
  const errorBanner = $("errorBanner");
  const errorTitle = $("errorTitle");
  const errorDesc = $("errorDesc");
  const errorCloseBtn = $("errorCloseBtn");

  // 처음 쓰는 사람의 기본 조건 (gm_profile이 없을 때)
  const DEFAULTS = { goal: "근육 늘리기", minutes: "45", body_part: "전신" };

  // 요청 제한 시간. 무료 모델이 느릴 때(약 110초 측정) + 재시도까지 기다리되, 무한정 기다리지 않게 합니다.
  const REQUEST_TIMEOUT_MS = 180000;

  /**
   * 부위 그룹과 근육 이름 키워드. target_muscles 문자열에 키워드가 들어 있으면 그 부위로 봅니다.
   * - AI가 근육 이름을 조금씩 다르게 쓰므로(예: "대퇴사두근", "대사두근") 짧은 키워드로 넓게 잡습니다.
   * - upper: true인 그룹은 '상체'에 포함됩니다.
   */
  const BODY_GROUPS = [
    { label: "하체", upper: false, keys: ["하체", "다리", "대퇴", "사두", "햄스트링", "둔", "엉덩이", "종아리", "비복", "가자미", "내전", "외전", "허벅지"] },
    { label: "가슴", upper: true, keys: ["가슴", "흉"] },
    { label: "등", upper: true, keys: ["등", "광배", "능형", "승모", "척추기립"] },
    { label: "어깨", upper: true, keys: ["어깨", "삼각"] },
    { label: "팔", upper: true, keys: ["팔", "이두", "삼두", "전완"] },
    { label: "코어", upper: false, keys: ["코어", "복근", "복직", "복사", "복부"] }
  ];

  let equipment = []; // gm_equipment
  let lastConditions = null; // 마지막으로 보낸 조건 ('다시 만들기'에 사용)
  let isGenerating = false; // 요청이 겹치지 않게 막는 표시
  let openOrder = null; // 펼쳐 둔 운동 카드 번호

  /* ------------------------------------------------------------------------ */
  /* 1. 화면 전환·도우미                                                       */
  /* ------------------------------------------------------------------------ */

  /**
   * 화면 단계를 바꿉니다. 한 번에 한 섹션만 보이게 합니다.
   * @param {"condition"|"loading"|"result"} step - 보여 줄 단계
   */
  function showStep(step) {
    conditionSection.hidden = step !== "condition";
    loadingSection.hidden = step !== "loading";
    resultSection.hidden = step !== "result";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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

  /* ------------------------------------------------------------------------ */
  /* 2. 조건 칩                                                                */
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
   * 등록 기구를 보고 부위 칩을 만듭니다.
   * - 항상: 전신, 상체, 하체 (쓸 수 있는 기구가 0개인 상체/하체는 숨김)
   * - 추가 제안: 가슴, 등, 어깨, 팔, 코어 중 등록 기구가 있는 부위만
   * - 칩에 그 부위에 쓸 수 있는 기구 수를 붙여, 기구가 적은 부위를 고르기 전에 알 수 있게 합니다.
   */
  function renderBodyPartChips() {
    const groupSets = equipment.map(groupsOf);
    const count = (label) => {
      if (label === "전신") return equipment.length;
      if (label === "상체") {
        const upperLabels = BODY_GROUPS.filter((g) => g.upper).map((g) => g.label);
        return groupSets.filter((s) => upperLabels.some((l) => s.has(l))).length;
      }
      return groupSets.filter((s) => s.has(label)).length;
    };

    const labels = ["전신", "상체", "하체", "가슴", "등", "어깨", "팔", "코어"];
    bodyPartChips.textContent = "";
    labels.forEach((label) => {
      const n = count(label);
      if (label !== "전신" && n === 0) return; // 쓸 기구가 없는 부위는 제안하지 않습니다.
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
   * 칩 그룹에서 고른 값을 읽습니다.
   * @param {string} field - data-field 이름 (goal, minutes, body_part)
   * @returns {string|null}
   */
  function selectedValue(field) {
    const active = conditionSection.querySelector(`.chip-group[data-field="${field}"] .chip.active`);
    return active ? active.dataset.value : null;
  }

  // 칩 클릭: 이벤트 위임으로 모든 칩 그룹을 한 번에 처리합니다(부위 칩은 나중에 만들어지므로).
  conditionSection.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    selectChip(chip.closest(".chip-group"), chip.dataset.value);
  });

  /**
   * gm_profile(지난번 조건)을 기본값으로 칩을 미리 골라 둡니다.
   * - 저장된 값이 지금 칩에 없으면(예: 옛 값) 기본값을 씁니다.
   * - 부위는 gm_profile 필드에 없으므로(PRD 스키마) 항상 '전신'에서 시작합니다.
   */
  function applyDefaults() {
    const profile = GMStorage.getProfile() || {};
    const pick = (field, value) => {
      const group = conditionSection.querySelector(`.chip-group[data-field="${field}"]`);
      if (!selectChip(group, value)) selectChip(group, DEFAULTS[field]);
    };
    pick("goal", profile.goal || DEFAULTS.goal);
    pick("minutes", profile.default_minutes || DEFAULTS.minutes);
    pick("body_part", DEFAULTS.body_part);
  }

  /* ------------------------------------------------------------------------ */
  /* 3. 루틴 요청                                                              */
  /* ------------------------------------------------------------------------ */

  generateBtn.addEventListener("click", () => {
    const conditions = {
      goal: selectedValue("goal"),
      minutes: Number(selectedValue("minutes")),
      body_part: selectedValue("body_part")
    };
    if (!conditions.goal || !conditions.minutes || !conditions.body_part) {
      showError("조건을 모두 골라 주세요", "목표, 시간, 부위에서 하나씩 눌러 주세요.");
      return;
    }
    // 고른 값을 다음 방문의 기본값으로 저장합니다(PRD). 저장에 실패해도 루틴 생성은 계속합니다.
    GMStorage.setProfile({
      goal: conditions.goal,
      default_minutes: conditions.minutes
    });
    generate(conditions);
  });

  regenerateBtn.addEventListener("click", () => {
    if (lastConditions) generate(lastConditions);
  });

  changeConditionBtn.addEventListener("click", () => {
    hideError();
    showStep("condition");
  });

  /**
   * /api/routine에 조건과 등록 기구를 보내 루틴을 받고, 화면에 표시한 뒤 gm_routines에 저장합니다.
   * @param {{goal:string, minutes:number, body_part:string}} conditions - 고른 조건
   * - 예외 처리:
   *   · 제한 시간(3분)을 넘기면 요청을 끊고 다시 시도하라고 안내합니다(무한 로딩 방지).
   *   · JSON이 아닌 응답이나 success:false면 서버 메시지를 보여 주고 조건 화면으로 돌아갑니다.
   *   · 루틴 저장(gm_routines)에 실패해도 화면에는 루틴을 보여 주고 안내만 합니다(운동은 할 수 있게).
   */
  async function generate(conditions) {
    if (isGenerating) return;
    isGenerating = true;
    lastConditions = conditions;
    hideError();
    showStep("loading");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      let json;
      try {
        json = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`서버 응답을 읽지 못했어요 (HTTP ${response.status})`);
      }
      if (!response.ok || !json.success) {
        throw new Error(json.error || "루틴을 만들지 못했어요. 잠시 후 다시 시도해 주세요");
      }

      // 검증용: 서버가 등록 목록에 없는 기구를 몇 개 걸렀는지 콘솔에 남깁니다.
      console.log(`[루틴] 서버가 걸러낸 운동 ${json.filtered_count}개`);

      const routine = json.data;
      renderRoutine(routine, conditions);

      const saved = GMStorage.addRoutine({
        conditions,
        principle: routine.principle,
        warmup: routine.warmup,
        exercises: routine.exercises
      });
      if (!saved) {
        showError("루틴을 기록하지 못했어요", "브라우저 저장 공간이 부족할 수 있어요. 운동은 그대로 하셔도 돼요.");
      }
    } catch (error) {
      console.error("[루틴 생성 실패]:", error);
      showStep("condition");
      const message =
        error.name === "AbortError" ? "응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." : error.message;
      showError("루틴 생성 실패", message);
    } finally {
      clearTimeout(timer);
      isGenerating = false;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* 4. 결과 표시                                                              */
  /* ------------------------------------------------------------------------ */

  /**
   * 루틴 결과를 그립니다. principle → 워밍업 → 운동 카드 순서입니다.
   * @param {Object} routine - { principle, total_minutes, warmup, exercises[] }
   * @param {Object} conditions - 이번에 보낸 조건 (요약 표시용)
   */
  function renderRoutine(routine, conditions) {
    openOrder = null;
    principleText.textContent = routine.principle;
    routineMeta.textContent =
      `${conditions.goal} · ${routine.total_minutes || conditions.minutes}분 · ${conditions.body_part} · ` +
      `운동 ${routine.exercises.length}개`;
    warmupText.textContent = routine.warmup;
    renderExercises(routine.exercises);
    showStep("result");
  }

  /**
   * 순서별 운동 카드를 그립니다.
   * 카드 구조: [순서 번호 | 운동명, 기구 이름, 세트×횟수·휴식, why_this_order] → 누르면 기구 카드(세팅법, 주의사항) 펼침
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
      toggle.appendChild(el("span", "equipment-chevron", "▾"));
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
        [["⚙️ 세팅법", item.setup, false], ["⚠️ 주의사항", item.cautions, true]].forEach(([title, list, warn]) => {
          if (!Array.isArray(list) || list.length === 0) return;
          const block = el("div", "guide-block" + (warn ? " alert-block" : ""));
          block.appendChild(el("h4", "guide-title" + (warn ? " warning" : ""), title));
          const ul = el("ul", "guide-list" + (warn ? " warning-list" : ""));
          list.forEach((t) => ul.appendChild(el("li", "", t)));
          block.appendChild(ul);
          panel.appendChild(block);
        });
      }
      li.appendChild(panel);
      exerciseList.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------------ */
  /* 5. 오류 배너                                                              */
  /* ------------------------------------------------------------------------ */

  /**
   * 오류 배너를 보여 줍니다.
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

  /* ------------------------------------------------------------------------ */
  /* 6. 시작                                                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * 페이지를 처음 그립니다. 등록 기구가 없으면 등록 안내만 보여 줍니다(루틴은 등록 기구로만 만듦).
   */
  function init() {
    equipment = GMStorage.getEquipment();
    if (equipment.length === 0) {
      noEquipment.hidden = false;
      conditionSection.hidden = true;
      return;
    }
    noEquipment.hidden = true;
    equipmentSummary.textContent = `내 헬스장 기구 ${equipment.length}개로만 루틴을 만들어요.`;
    renderBodyPartChips();
    applyDefaults();
    showStep("condition");
  }

  init();

  // 개발용 확인 도구: AI를 부르지 않고 결과 화면을 확인할 수 있게 공개합니다.
  // 예: GMRoutine.render({ principle:"...", total_minutes:45, warmup:"...", exercises:[...] }, {goal:"체력", minutes:45, body_part:"전신"})
  window.GMRoutine = Object.freeze({ render: renderRoutine });
})();
