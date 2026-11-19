/**
 * ==============================================================================
 * 파일명: js/scan.js
 * 역할: scan.html(기구 등록) 화면 제어
 *   사진 고르기(촬영/앨범/드래그) → GMImage로 축소 → /api/recognize 호출 → 결과 카드 표시
 *   → 확신도 낮으면 후보 선택(F1-2) → 이름 수정(F1-3) → GMStorage로 gm_equipment에 저장
 * 의존: js/storage.js(GMStorage), js/image.js(GMImage) — scan.html에서 이 파일보다 먼저 불러옵니다.
 * 보안: AI 결과는 모두 textContent로만 화면에 넣습니다. (innerHTML을 쓰면 AI가 만든 문자열 속 HTML이 실행될 수 있음)
 * ==============================================================================
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------------ */
  /* 0. DOM 요소                                                               */
  /* ------------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);

  const captureSection = $("captureSection");
  const cameraInput = $("cameraInput");
  const albumInput = $("albumInput");
  const cameraBtn = $("cameraBtn");
  const albumBtn = $("albumBtn");
  const dropZone = $("dropZone");
  const dropPrompt = $("dropPrompt");
  const previewContainer = $("previewContainer");
  const previewImage = $("previewImage");
  const reselectBtn = $("reselectBtn");
  const analyzeBtn = $("analyzeBtn");

  const loadingSection = $("loadingSection");

  const resultSection = $("resultSection");
  const lowConfidenceBox = $("lowConfidenceBox");
  const candidateChips = $("candidateChips");
  const nameInput = $("nameInput");
  const equipmentNameEn = $("equipmentNameEn");
  const targetMuscles = $("targetMuscles");
  const equipmentRole = $("equipmentRole");
  const setupList = $("setupList");
  const cautionList = $("cautionList");
  const retakeBtn = $("retakeBtn");
  const saveBtn = $("saveBtn");

  const savedSection = $("savedSection");
  const savedTitle = $("savedTitle");
  const savedDesc = $("savedDesc");
  const continueBtn = $("continueBtn");

  const errorBanner = $("errorBanner");
  const errorTitle = $("errorTitle");
  const errorDesc = $("errorDesc");
  const errorCloseBtn = $("errorCloseBtn");

  /* ------------------------------------------------------------------------ */
  /* 1. 상태                                                                   */
  /* ------------------------------------------------------------------------ */
  // 현재 고른 사진의 base64. 서버로 보내는 데만 쓰고 어디에도 저장하지 않습니다(PRD).
  let currentImage = null;
  // 마지막 인식 결과(/api/recognize의 data). 저장할 때 세팅법·주의사항 등을 여기서 가져옵니다.
  let lastResult = null;
  // 확신도가 낮을 때 사용자가 후보를 고르거나 이름을 직접 고쳤는지. 고르기 전에는 저장을 막습니다(F1-2).
  let nameConfirmed = true;
  // 인식 요청이 진행 중인지. 버튼을 여러 번 눌러 요청이 겹치는 것을 막습니다.
  let isAnalyzing = false;

  /**
   * 화면 단계를 바꿉니다. 한 번에 한 섹션만 보이게 합니다.
   * @param {"capture"|"loading"|"result"|"saved"} step - 보여 줄 단계
   */
  function showStep(step) {
    captureSection.hidden = step !== "capture";
    loadingSection.hidden = step !== "loading";
    resultSection.hidden = step !== "result";
    savedSection.hidden = step !== "saved";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ------------------------------------------------------------------------ */
  /* 2. 사진 고르기                                                            */
  /* ------------------------------------------------------------------------ */

  // 촬영 버튼 → 카메라 input, 앨범 버튼 → 앨범 input을 엽니다.
  cameraBtn.addEventListener("click", () => cameraInput.click());
  albumBtn.addEventListener("click", () => albumInput.click());
  // '다시 고르기'는 휴대폰·PC 모두에서 동작하도록 앨범 input을 엽니다.
  reselectBtn.addEventListener("click", () => albumInput.click());

  /**
   * 파일 input의 change 이벤트 처리. 같은 사진을 다시 골라도 이벤트가 오도록 처리 후 value를 비웁니다.
   * @param {Event} e - change 이벤트
   */
  function onFileChange(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) handleFile(file);
  }
  cameraInput.addEventListener("change", onFileChange);
  albumInput.addEventListener("change", onFileChange);

  // PC 드래그 앤 드롭
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  /**
   * 고른 사진을 줄여(긴 변 1024px, JPEG 0.85 — F1-1) 미리보기에 띄웁니다.
   * @param {File} file - 사용자가 고른 이미지 파일
   * - 예외 처리: 이미지가 아니거나 읽지 못하면 GMImage가 reject하고, 그 메시지를 오류 배너로 보여 줍니다.
   */
  function handleFile(file) {
    hideError();
    GMImage.resizeToBase64(file)
      .then((base64) => {
        currentImage = base64;
        previewImage.src = base64;
        dropPrompt.hidden = true;
        previewContainer.hidden = false;
      })
      .catch((error) => {
        console.error("[사진 처리 실패]:", error);
        showError("사진을 처리하지 못했어요", error.message || "다른 사진을 골라 주세요.");
      });
  }

  /**
   * 사진 고르기 화면을 처음 상태로 되돌립니다. ('다시 찍기', '계속 등록'에서 사용)
   */
  function resetCapture() {
    currentImage = null;
    lastResult = null;
    previewImage.removeAttribute("src");
    previewContainer.hidden = true;
    dropPrompt.hidden = false;
    hideError();
    showStep("capture");
  }

  /* ------------------------------------------------------------------------ */
  /* 3. 인식 요청                                                              */
  /* ------------------------------------------------------------------------ */

  analyzeBtn.addEventListener("click", analyze);

  /**
   * /api/recognize에 사진을 보내 결과를 받아 카드로 보여 줍니다.
   * - 예외 처리:
   *   · 서버가 JSON이 아닌 응답(예: Vercel 413 HTML)을 보내도 멈추지 않게 text로 받은 뒤 파싱합니다.
   *   · success:false면 서버가 준 메시지(예: "기구를 알아보지 못했어요. 다시 찍어 주세요")를 그대로 보여 줍니다.
   *   · 기구가 아닌 사진(is_equipment:false)이면 다시 찍으라고 안내합니다.
   */
  async function analyze() {
    if (isAnalyzing) return;
    if (!currentImage) {
      showError("사진이 없어요", "먼저 기구 사진을 찍거나 골라 주세요.");
      return;
    }

    isAnalyzing = true;
    hideError();
    showStep("loading");

    try {
      const response = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: currentImage })
      });

      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`서버 응답을 읽지 못했어요 (HTTP ${response.status})`);
      }
      if (!response.ok || !json.success) {
        throw new Error(json.error || "기구를 알아보지 못했어요. 다시 찍어 주세요");
      }

      if (!json.data || !json.data.is_equipment) {
        showStep("capture");
        showError("기구가 보이지 않아요", "기구만 나오게 다시 찍어 주세요.");
        return;
      }

      showResult(json.data);
    } catch (error) {
      console.error("[기구 인식 실패]:", error);
      showStep("capture");
      showError("인식 실패", error.message || "잠시 후 다시 시도해 주세요.");
    } finally {
      isAnalyzing = false;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* 4. 결과 카드                                                              */
  /* ------------------------------------------------------------------------ */

  /**
   * 목록(<ul>)을 문자열 배열로 채웁니다. textContent만 사용합니다.
   * @param {HTMLElement} listEl - 채울 목록 요소
   * @param {string[]} items - 항목 배열
   * @param {string} fallback - 항목이 없을 때 보여 줄 문구
   */
  function fillList(listEl, items, fallback) {
    listEl.textContent = "";
    const values = Array.isArray(items) && items.length > 0 ? items : [fallback];
    values.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      listEl.appendChild(li);
    });
  }

  /**
   * 인식 결과를 카드에 표시합니다.
   * @param {Object} data - /api/recognize의 data
   *   { is_equipment, name_ko, name_en, target_muscles[], role, setup[], cautions[], confidence, alternatives[] }
   * - confidence가 "low"면 후보 버튼을 보여 주고, 사용자가 고르거나 이름을 고치기 전까지 저장 버튼을 막습니다.
   */
  function showResult(data) {
    lastResult = data;

    nameInput.value = data.name_ko || "";
    equipmentNameEn.textContent = data.name_en || "";
    targetMuscles.textContent =
      Array.isArray(data.target_muscles) && data.target_muscles.length > 0 ? data.target_muscles.join(", ") : "-";
    equipmentRole.textContent = data.role || "-";
    fillList(setupList, data.setup, "의자와 핀 높이를 몸에 맞게 조절하세요.");
    fillList(cautionList, data.cautions, "가벼운 무게로 시작하세요.");

    renderCandidates(data);
    showStep("result");
  }

  /**
   * 확신도가 낮을 때 후보 버튼을 만듭니다. (F1-2)
   * - 첫 번째 버튼은 AI가 인식한 이름, 그 뒤는 alternatives입니다.
   * - 버튼을 누르면 이름 칸에 그 이름이 들어가고 저장 버튼이 열립니다.
   * @param {Object} data - 인식 결과
   */
  function renderCandidates(data) {
    candidateChips.textContent = "";
    const isLow = data.confidence === "low";
    lowConfidenceBox.hidden = !isLow;
    nameConfirmed = !isLow;
    updateSaveButton();
    if (!isLow) return;

    // 인식된 이름 + 후보. 같은 이름이 겹치면 한 번만 보여 줍니다.
    const names = [data.name_ko].concat(Array.isArray(data.alternatives) ? data.alternatives : []);
    const unique = names.filter((name, i) => name && names.indexOf(name) === i);

    unique.forEach((name) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = name;
      chip.addEventListener("click", () => {
        candidateChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        nameInput.value = name;
        nameConfirmed = true;
        updateSaveButton();
      });
      candidateChips.appendChild(chip);
    });
  }

  // 이름 칸을 직접 고치면: 후보 선택 표시를 지우고, 이름이 있으면 고른 것으로 봅니다(F1-3).
  nameInput.addEventListener("input", () => {
    candidateChips.querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c.textContent === nameInput.value.trim());
    });
    if (!lowConfidenceBox.hidden) {
      nameConfirmed = nameInput.value.trim() !== "";
    }
    updateSaveButton();
  });

  /**
   * 저장 버튼을 켜고 끕니다. 이름이 비었거나, 확신도 낮음 상태에서 아직 고르지 않았으면 끕니다.
   */
  function updateSaveButton() {
    const hasName = nameInput.value.trim() !== "";
    saveBtn.disabled = !(hasName && nameConfirmed);
    saveBtn.textContent = nameConfirmed ? "💾 내 헬스장에 저장" : "위에서 기구를 골라 주세요";
  }

  retakeBtn.addEventListener("click", resetCapture);

  /* ------------------------------------------------------------------------ */
  /* 5. 저장                                                                   */
  /* ------------------------------------------------------------------------ */

  saveBtn.addEventListener("click", save);

  /**
   * 이름 칸의 이름으로 gm_equipment에 저장합니다.
   * - 같은 이름(띄어쓰기·대소문자 무시)이 이미 있으면 덮어쓸지 확인합니다. 덮어쓰면 기존 id는 유지됩니다.
   * - 이름을 AI 인식 결과와 다르게 바꿨다면 영어 이름(name_en)은 맞지 않을 수 있어 비워서 저장합니다.
   * - 예외 처리: 저장에 실패(용량 초과·사생활 보호 모드)하면 오류 배너로 알리고 결과 화면에 그대로 둡니다.
   */
  function save() {
    if (!lastResult) return;
    const name = nameInput.value.trim();
    if (!name) {
      showError("이름이 비었어요", "기구 이름을 입력해 주세요.");
      nameInput.focus();
      return;
    }

    const data = {
      name_ko: name,
      name_en: name === lastResult.name_ko ? lastResult.name_en : "",
      target_muscles: lastResult.target_muscles,
      role: lastResult.role,
      setup: lastResult.setup,
      cautions: lastResult.cautions
    };

    const existing = GMStorage.findEquipmentByName(name);
    let saved;
    if (existing) {
      const ok = window.confirm(`"${existing.name_ko}"은(는) 이미 내 헬스장에 있어요.\n새 정보로 덮어쓸까요?`);
      if (!ok) return;
      saved = GMStorage.updateEquipment(existing.id, data);
    } else {
      saved = GMStorage.addEquipment(data);
    }

    if (!saved) {
      showError("저장하지 못했어요", "브라우저 저장 공간이 부족하거나 사생활 보호 모드일 수 있어요.");
      return;
    }

    hideError();
    savedTitle.textContent = existing ? "✅ 새 정보로 바꿨어요" : "✅ 내 헬스장에 저장했어요";
    savedDesc.textContent = `${saved.name_ko} · 지금 등록된 기구 ${GMStorage.getEquipment().length}개`;
    showStep("saved");
  }

  // 저장 후 '계속 등록' → 처음 화면으로. ('홈으로'는 index.html 링크)
  continueBtn.addEventListener("click", resetCapture);

  /* ------------------------------------------------------------------------ */
  /* 6. 오류 배너                                                              */
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
  /* 7. 개발용 확인 도구                                                       */
  /* ------------------------------------------------------------------------ */
  // 브라우저 콘솔에서 AI를 부르지 않고 결과 화면을 확인할 수 있게 showResult만 공개합니다.
  // 예: GMScan.showResult({ is_equipment:true, name_ko:"랫 풀 다운", confidence:"low", alternatives:["시티드 로우"], ... })
  window.GMScan = Object.freeze({ showResult });
})();
