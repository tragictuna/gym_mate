/**
 * ==============================================================================
 * 파일명: js/home.js
 * 역할: index.html(홈 = 내 헬스장) 화면 제어
 *   - gm_equipment의 기구 목록을 그립니다(이름, 타겟 근육).
 *   - 기구를 누르면 아래로 기구 카드(역할, 세팅법, 주의사항)가 펼쳐집니다(F1-5).
 *   - 기구마다 삭제 버튼이 있고, 삭제 전에 확인을 받습니다(F1-4).
 *   - 등록 기구가 없으면 빈 화면 안내를 보여 주고 '오늘 운동 시작'을 막습니다.
 * 의존: js/storage.js(GMStorage) — index.html에서 이 파일보다 먼저 불러옵니다.
 * 보안: 저장된 값은 원래 AI가 만든 문자열이므로 textContent로만 화면에 넣습니다.
 * ==============================================================================
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const startWorkoutBtn = $("startWorkoutBtn");
  const emptyState = $("emptyState");
  const equipmentSection = $("equipmentSection");
  const equipmentCount = $("equipmentCount");
  const equipmentList = $("equipmentList");

  const errorBanner = $("errorBanner");
  const errorTitle = $("errorTitle");
  const errorDesc = $("errorDesc");
  const errorCloseBtn = $("errorCloseBtn");

  // 지금 펼쳐 둔 기구 id. 다시 그릴 때(삭제 후 등) 펼침 상태를 유지하기 위해 기억합니다.
  let openId = null;

  /* ------------------------------------------------------------------------ */
  /* 1. 작은 DOM 도우미                                                        */
  /* ------------------------------------------------------------------------ */

  /**
   * 요소를 만들고 클래스와 글자를 넣습니다. 글자는 항상 textContent로 넣습니다.
   * @param {string} tag - 태그 이름
   * @param {string} [className] - 클래스 이름
   * @param {string} [text] - 넣을 글자
   * @returns {HTMLElement}
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /**
   * 제목 + 목록(<ul>) 블록을 만듭니다. 항목이 없으면 블록을 만들지 않습니다.
   * @param {string} title - 블록 제목
   * @param {string[]} items - 항목 배열
   * @param {string} [extraClass] - 블록에 더할 클래스 (주의사항 강조 등)
   * @returns {HTMLElement|null}
   */
  function listBlock(title, items, extraClass) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const block = el("div", "guide-block" + (extraClass ? " " + extraClass : ""));
    block.appendChild(el("h3", "guide-title" + (extraClass ? " warning" : ""), title));
    const ul = el("ul", "guide-list" + (extraClass ? " warning-list" : ""));
    items.forEach((text) => ul.appendChild(el("li", "", text)));
    block.appendChild(ul);
    return block;
  }

  /* ------------------------------------------------------------------------ */
  /* 2. 목록 그리기                                                            */
  /* ------------------------------------------------------------------------ */

  /**
   * gm_equipment를 읽어 화면 전체를 다시 그립니다.
   * - 기구가 없으면 빈 화면 안내를 보이고 '오늘 운동 시작'을 막습니다(루틴은 등록 기구로만 만들기 때문).
   * - 최근에 등록한 기구가 위에 오도록 created_at 내림차순으로 보여 줍니다.
   */
  function render() {
    const list = GMStorage.getEquipment()
      .slice()
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

    const isEmpty = list.length === 0;
    emptyState.hidden = !isEmpty;
    equipmentSection.hidden = isEmpty;
    setStartEnabled(!isEmpty);

    equipmentList.textContent = "";
    if (isEmpty) return;

    equipmentCount.textContent = `${list.length}개`;
    list.forEach((item) => equipmentList.appendChild(renderItem(item)));
  }

  /**
   * '오늘 운동 시작' 링크를 켜고 끕니다. <a>에는 disabled가 없어 클래스와 aria로 처리하고 클릭을 막습니다.
   * @param {boolean} enabled - 켤지 여부
   */
  function setStartEnabled(enabled) {
    startWorkoutBtn.classList.toggle("is-disabled", !enabled);
    startWorkoutBtn.setAttribute("aria-disabled", String(!enabled));
  }
  startWorkoutBtn.addEventListener("click", (e) => {
    if (startWorkoutBtn.getAttribute("aria-disabled") === "true") {
      e.preventDefault();
      showError("기구를 먼저 등록해 주세요", "등록한 기구로만 루틴을 만들어요.");
    }
  });

  /**
   * 기구 하나의 목록 항목을 만듭니다.
   * 구조: [이름 + 타겟 근육 (누르면 펼침)] [삭제 버튼]
   *       [펼친 카드: 영어 이름, 역할, 세팅법, 주의사항, 통증 문구]
   * @param {Object} item - gm_equipment의 기구 객체
   * @returns {HTMLLIElement}
   */
  function renderItem(item) {
    const li = el("li", "equipment-item");
    const panelId = `panel_${item.id}`;
    const isOpen = item.id === openId;

    // 윗줄: 펼침 버튼 + 삭제 버튼
    const row = el("div", "equipment-row");

    const toggle = el("button", "equipment-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-controls", panelId);
    toggle.appendChild(el("span", "equipment-name", item.name_ko || "이름 없는 기구"));
    const muscles = Array.isArray(item.target_muscles) ? item.target_muscles.join(", ") : "";
    toggle.appendChild(el("span", "equipment-muscles", muscles || "타겟 근육 정보 없음"));
    // 펼침 화살표는 CSS로 그립니다(글자 기호는 글꼴마다 모양이 달라서). 화면 낭독기에는 읽히지 않게 숨깁니다.
    const chevron = el("span", "equipment-chevron");
    chevron.setAttribute("aria-hidden", "true");
    toggle.appendChild(chevron);
    toggle.addEventListener("click", () => toggleItem(item.id));

    const del = el("button", "icon-btn delete-btn", "🗑");
    del.type = "button";
    del.setAttribute("aria-label", `${item.name_ko} 삭제`);
    del.addEventListener("click", () => deleteItem(item));

    row.appendChild(toggle);
    row.appendChild(del);
    li.appendChild(row);

    // 펼친 기구 카드
    const panel = el("div", "equipment-panel");
    panel.id = panelId;
    panel.hidden = !isOpen;
    if (item.name_en) panel.appendChild(el("p", "equipment-name-en", item.name_en));
    if (item.role) {
      const role = el("p", "equipment-role");
      role.appendChild(el("span", "muscle-label", "역할 "));
      role.appendChild(el("span", "", item.role));
      panel.appendChild(role);
    }
    const setup = listBlock("⚙️ 세팅법", item.setup);
    if (setup) panel.appendChild(setup);
    const cautions = listBlock("⚠️ 주의사항", item.cautions, "alert-block");
    if (cautions) panel.appendChild(cautions);
    panel.appendChild(el("p", "pain-notice", "🛑 통증이 있으면 즉시 멈추세요"));
    li.appendChild(panel);

    if (isOpen) li.classList.add("open");
    return li;
  }

  /**
   * 기구 카드를 펼치거나 접습니다. 한 번에 하나만 펼쳐 화면이 너무 길어지지 않게 합니다.
   * @param {string} id - 기구 id
   */
  function toggleItem(id) {
    openId = openId === id ? null : id;
    render();
  }

  /**
   * 삭제 전에 확인을 받고 gm_equipment에서 지웁니다. (F1-4)
   * @param {Object} item - 지울 기구
   * - 예외 처리: 저장에 실패하면(사생활 보호 모드 등) 목록은 그대로 두고 오류 배너로 알립니다.
   */
  function deleteItem(item) {
    const ok = window.confirm(`"${item.name_ko}"을(를) 내 헬스장에서 삭제할까요?\n삭제하면 되돌릴 수 없어요.`);
    if (!ok) return;
    if (!GMStorage.removeEquipment(item.id)) {
      showError("삭제하지 못했어요", "잠시 후 다시 시도해 주세요.");
      return;
    }
    if (openId === item.id) openId = null;
    hideError();
    render();
  }

  /* ------------------------------------------------------------------------ */
  /* 3. 오류 배너                                                              */
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
  /* 4. 시작 및 다시 그리기 시점                                                */
  /* ------------------------------------------------------------------------ */

  render();

  // scan.html에서 '뒤로 가기'로 돌아오면 브라우저가 이전 화면을 캐시(bfcache)에서 그대로 보여 줄 수 있어,
  // 새로 등록한 기구가 안 보이는 일이 생깁니다. pageshow에서 persisted면 다시 그립니다.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) render();
  });
  // 다른 탭에서 기구를 등록·삭제하면 이 탭 목록도 맞춰 다시 그립니다.
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === GMStorage.KEYS.equipment) render();
  });
})();
