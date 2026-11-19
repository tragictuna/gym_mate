/**
 * ==============================================================================
 * 파일명: js/storage.js
 * 역할: GymMate의 모든 LocalStorage 읽기·쓰기를 한곳에서 맡는 저장소 모듈
 * 불러오는 법: <script src="js/storage.js"></script> → 전역 객체 window.GMStorage 사용
 *              (번들러·import 없이 일반 <script>로 동작하도록 IIFE + 전역 객체 방식으로 만듭니다)
 *
 * 관리하는 키 (PRD: 서버 DB 없이 브라우저 LocalStorage만 사용)
 *   - gm_equipment : 등록 기구 배열
 *       { id, name_ko, name_en, target_muscles[], role, setup[], cautions[], created_at }
 *   - gm_profile   : 마지막으로 고른 조건 객체 { goal, default_minutes, nickname?, body_part? }
 *                    (PRD의 experience는 대상이 모두 0~2개월 초보라 사용자 결정으로 뺐습니다)
 *                    nickname: 인사말용 선택 필드(작업 6-B), body_part: 마지막 부위(같은 조건 루틴 재사용용, 작업 6-B)
 *   - gm_routines  : 생성된 루틴 배열
 *       { id, date, conditions, principle, warmup, exercises,
 *         title?, focus_tags?, coach_note?, total_minutes? }   ← ?는 작업 6-B 화면용 선택 필드
 *       conditions = { goal, minutes, body_part, energy }, exercises[].coach = 코치 설명(선택)
 *   - gm_logs      : 3단계에서 추가 예정 (이번 작업에서는 다루지 않음)
 *
 * 예외 처리 원칙
 *   - JSON 파싱 실패(손상된 값): 깨진 값을 지우고 빈 값([] 또는 null)으로 복구합니다.
 *     → 한 번 깨진 데이터 때문에 앱 전체가 멈추지 않게 하기 위함입니다.
 *   - 저장 용량 초과(QuotaExceededError) 등 쓰기 실패: false를 반환하고 기존 데이터는 건드리지 않습니다.
 *     → 쓰기에 실패했다고 이미 저장된 기구 목록까지 지우면 사용자 데이터가 사라지기 때문입니다.
 *   - 사생활 보호 모드 등으로 localStorage 자체에 접근할 수 없을 때: 읽기는 빈 값, 쓰기는 false를 반환합니다.
 * ==============================================================================
 */
(function (global) {
  "use strict";

  // LocalStorage 키 이름 상수. 오타로 다른 키에 저장하는 실수를 막기 위해 한곳에서만 정의합니다.
  const KEYS = Object.freeze({
    equipment: "gm_equipment",
    profile: "gm_profile",
    routines: "gm_routines"
  });

  /* ------------------------------------------------------------------------ */
  /* 1. 내부 공통 함수                                                         */
  /* ------------------------------------------------------------------------ */

  /**
   * localStorage 객체를 안전하게 가져옵니다.
   * - 동작 원리: 일부 브라우저(사파리 사생활 보호 모드, 쿠키 차단)는 window.localStorage에 접근만 해도
   *   예외를 던지므로 try/catch로 감쌉니다.
   * @returns {Storage|null} 사용할 수 있으면 localStorage, 없으면 null
   */
  function getStore() {
    try {
      return global.localStorage || null;
    } catch (e) {
      console.warn("[GMStorage] localStorage에 접근할 수 없습니다:", e);
      return null;
    }
  }

  /**
   * 키에 저장된 JSON 값을 읽어 자바스크립트 값으로 돌려줍니다.
   * @param {string} key - LocalStorage 키
   * @param {*} emptyValue - 값이 없거나 깨졌을 때 돌려줄 빈 값 (배열이면 [], 객체면 null)
   * @returns {*} 파싱된 값 또는 emptyValue
   * - 예외 처리: JSON.parse가 실패하면 깨진 값을 지우고 emptyValue로 복구합니다.
   *   배열을 기대하는데 배열이 아닌 값이 들어 있는 경우도 깨진 데이터로 보고 복구합니다.
   */
  function readJSON(key, emptyValue) {
    const store = getStore();
    if (!store) return emptyValue;

    let raw;
    try {
      raw = store.getItem(key);
    } catch (e) {
      console.warn(`[GMStorage] ${key} 읽기 실패:`, e);
      return emptyValue;
    }
    if (raw === null) return emptyValue;

    try {
      const parsed = JSON.parse(raw);
      // 배열 키(gm_equipment, gm_routines)인데 배열이 아니면 형식이 깨진 것으로 봅니다.
      if (Array.isArray(emptyValue) && !Array.isArray(parsed)) {
        throw new Error("배열 형식이 아닙니다.");
      }
      return parsed;
    } catch (e) {
      console.warn(`[GMStorage] ${key} 값이 손상되어 빈 값으로 복구합니다:`, e);
      try {
        store.removeItem(key);
      } catch (removeError) {
        // 지우기마저 실패해도 빈 값을 돌려주면 앱은 계속 동작하므로 무시합니다.
      }
      return emptyValue;
    }
  }

  /**
   * 값을 JSON 문자열로 바꿔 키에 저장합니다.
   * @param {string} key - LocalStorage 키
   * @param {*} value - 저장할 값 (JSON으로 바꿀 수 있어야 함)
   * @returns {boolean} 저장에 성공하면 true, 실패하면 false
   * - 예외 처리: 용량 초과(QuotaExceededError)나 접근 불가 시 false를 반환합니다.
   *   이때 setItem은 기존 값을 바꾸지 않으므로 이미 저장된 데이터는 그대로 남습니다.
   */
  function writeJSON(key, value) {
    const store = getStore();
    if (!store) return false;
    try {
      store.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      const isQuota =
        e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22);
      console.warn(
        isQuota
          ? `[GMStorage] 저장 용량을 넘어 ${key}를 저장하지 못했습니다. 기존 데이터는 유지됩니다.`
          : `[GMStorage] ${key} 저장 실패:`,
        e
      );
      return false;
    }
  }

  /**
   * 짧은 고유 id를 만듭니다. 예: "eq_lq3k9x2a7f"
   * - 동작 원리: 현재 시각(36진수) + 무작위 4글자를 붙여, 같은 밀리초에 여러 개를 만들어도 겹칠 확률을 낮춥니다.
   * @param {string} prefix - id 앞에 붙일 접두어 ("eq_", "rt_")
   * @param {Array<{id:string}>} existing - 이미 있는 항목 목록. 혹시 겹치면 다시 만듭니다.
   * @returns {string} 고유 id
   */
  function makeId(prefix, existing) {
    const used = new Set((existing || []).map((item) => item && item.id));
    let id;
    do {
      id = prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    } while (used.has(id));
    return id;
  }

  /**
   * 값을 문자열 배열로 정리합니다. AI 응답이 문자열 하나로 오거나 빈 값이 섞여 와도 화면이 깨지지 않게 합니다.
   * @param {*} value - 배열, 문자열, 또는 그 밖의 값
   * @returns {string[]} 공백을 제거하고 빈 문자열을 뺀 문자열 배열
   */
  function toStringArray(value) {
    if (Array.isArray(value)) {
      return value.map((v) => String(v ?? "").trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
    return [];
  }

  /**
   * 배열에서 id가 일치하는 항목을 지우고 저장합니다. (기구·루틴 삭제에 공통으로 사용)
   * @param {string} key - LocalStorage 키
   * @param {string} id - 지울 항목의 id
   * @returns {boolean} 실제로 지웠고 저장에 성공하면 true, 없는 id거나 저장 실패면 false
   */
  function removeById(key, id) {
    const list = readJSON(key, []);
    const next = list.filter((item) => item && item.id !== id);
    if (next.length === list.length) return false; // 지울 항목이 없음
    return writeJSON(key, next);
  }

  /* ------------------------------------------------------------------------ */
  /* 2. gm_equipment (등록 기구)                                               */
  /* ------------------------------------------------------------------------ */

  /**
   * 등록 기구 목록 전체를 읽습니다.
   * @returns {Array<Object>} 기구 배열 (없거나 깨졌으면 [])
   */
  function getEquipment() {
    return readJSON(KEYS.equipment, []);
  }

  /**
   * 등록 기구 목록 전체를 덮어씁니다. (덮어쓰기 확인 후 교체 등에 사용)
   * @param {Array<Object>} list - 저장할 기구 배열
   * @returns {boolean} 성공 여부
   */
  function setEquipment(list) {
    if (!Array.isArray(list)) {
      console.warn("[GMStorage] setEquipment에는 배열만 넣을 수 있습니다.");
      return false;
    }
    return writeJSON(KEYS.equipment, list);
  }

  /**
   * 기구 하나를 목록 끝에 추가합니다. id와 created_at은 여기서 자동으로 채웁니다.
   * @param {Object} data - 기구 정보 { name_ko, name_en, target_muscles, role, setup, cautions }
   * @returns {Object|null} 저장된 기구 객체(id 포함), 이름이 없거나 저장에 실패하면 null
   * - 예외 처리: name_ko가 비어 있으면 목록에서 알아볼 수 없으므로 저장하지 않습니다.
   *   배열 필드는 toStringArray로 정리해 잘못된 AI 응답이 그대로 저장되지 않게 합니다.
   */
  function addEquipment(data) {
    const fields = buildEquipmentFields(data);
    if (!fields) return null;

    const list = getEquipment();
    const item = Object.assign({ id: makeId("eq_", list) }, fields, { created_at: new Date().toISOString() });

    list.push(item);
    return writeJSON(KEYS.equipment, list) ? item : null;
  }

  /**
   * 기구 데이터에서 저장할 필드만 골라 정리합니다. (추가와 덮어쓰기에 공통으로 사용)
   * @param {Object} data - { name_ko, name_en, target_muscles, role, setup, cautions }
   * @returns {Object|null} 정리된 필드 객체, name_ko가 비어 있으면 null
   * - 예외 처리: 이름이 없으면 목록에서 알아볼 수 없으므로 저장하지 않습니다.
   *   배열 필드는 toStringArray로 정리해 잘못된 AI 응답이 그대로 저장되지 않게 합니다.
   */
  function buildEquipmentFields(data) {
    const nameKo = String((data && data.name_ko) || "").trim();
    if (!nameKo) {
      console.warn("[GMStorage] 기구 이름(name_ko)이 없어 저장하지 않았습니다.");
      return null;
    }
    return {
      name_ko: nameKo,
      name_en: String(data.name_en || "").trim(),
      target_muscles: toStringArray(data.target_muscles),
      role: String(data.role || "").trim(),
      setup: toStringArray(data.setup),
      cautions: toStringArray(data.cautions)
    };
  }

  /**
   * 이미 저장된 기구의 내용을 새 정보로 덮어씁니다. (같은 이름 기구를 다시 등록할 때 사용)
   * @param {string} id - 덮어쓸 기구 id
   * @param {Object} data - 새 기구 정보 (addEquipment와 같은 형식)
   * @returns {Object|null} 덮어쓴 기구 객체, id가 없거나 이름이 비었거나 저장에 실패하면 null
   * - id와 created_at은 그대로 둡니다. 루틴(gm_routines)이 equipment_id로 이 기구를 가리키고 있을 수 있어서,
   *   id를 바꾸면 기존 루틴의 연결이 끊기기 때문입니다.
   */
  function updateEquipment(id, data) {
    const fields = buildEquipmentFields(data);
    if (!fields) return null;

    const list = getEquipment();
    const index = list.findIndex((item) => item && item.id === id);
    if (index === -1) return null;

    const item = Object.assign({ id: list[index].id }, fields, { created_at: list[index].created_at });
    list[index] = item;
    return writeJSON(KEYS.equipment, list) ? item : null;
  }

  /**
   * 이름으로 기구를 찾습니다. 띄어쓰기와 대소문자는 무시합니다. ("랫풀다운" = "랫 풀 다운")
   * @param {string} name - 찾을 기구 이름
   * @returns {Object|null} 같은 이름의 기구, 없으면 null
   * - 이유: 같은 기구를 띄어쓰기만 다르게 두 번 저장하는 일을 막기 위해서입니다.
   */
  function findEquipmentByName(name) {
    const normalize = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
    const target = normalize(name);
    if (!target) return null;
    return getEquipment().find((item) => item && normalize(item.name_ko) === target) || null;
  }

  /**
   * id로 기구 하나를 찾습니다.
   * @param {string} id - 기구 id ("eq_...")
   * @returns {Object|null} 찾은 기구, 없으면 null
   */
  function getEquipmentById(id) {
    return getEquipment().find((item) => item && item.id === id) || null;
  }

  /**
   * id로 기구 하나를 삭제합니다.
   * @param {string} id - 지울 기구 id
   * @returns {boolean} 삭제·저장에 성공하면 true
   */
  function removeEquipment(id) {
    return removeById(KEYS.equipment, id);
  }

  /* ------------------------------------------------------------------------ */
  /* 3. gm_profile (마지막 조건)                                               */
  /* ------------------------------------------------------------------------ */

  // 프로필에 저장을 허용하는 필드. 다른 값이 섞여 저장되지 않도록 걸러냅니다.
  const PROFILE_FIELDS = ["goal", "default_minutes", "nickname", "body_part"];

  // 닉네임 최대 길이 (인사말 한 줄에 들어가도록)
  const NICKNAME_MAX = 12;

  /**
   * 프로필을 읽습니다.
   * @returns {{goal:?string, default_minutes:?number, nickname:?string, body_part:?string}|null} 저장된 프로필, 없으면 null
   * - 예외 처리: 객체가 아닌 값(배열, 숫자 등)이 들어 있으면 깨진 것으로 보고 null을 돌려줍니다.
   */
  function getProfile() {
    const profile = readJSON(KEYS.profile, null);
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
    return profile;
  }

  /**
   * 프로필을 저장합니다. 넘긴 필드만 바꾸고 나머지는 기존 값을 유지합니다(병합).
   * @param {{goal?:string, default_minutes?:number, nickname?:string, body_part?:string}} partial - 바꿀 필드
   * - nickname은 앞뒤 공백을 지우고 12자로 자릅니다. 빈 문자열이면 null(닉네임 없음)로 저장합니다.
   * @returns {Object|null} 저장된 전체 프로필, 실패하면 null
   */
  function setProfile(partial) {
    // 허용 필드만 골라 새 객체를 만듭니다. 예전에 저장된 experience 같은 필드는 이때 자연스럽게 빠집니다.
    const saved = getProfile() || {};
    const next = {};
    PROFILE_FIELDS.forEach((field) => {
      next[field] = saved[field] !== undefined ? saved[field] : null;
    });
    PROFILE_FIELDS.forEach((field) => {
      if (partial && partial[field] !== undefined) {
        if (field === "default_minutes") {
          next[field] = Number(partial[field]) || null;
        } else if (field === "nickname") {
          next[field] = String(partial[field] || "").trim().slice(0, NICKNAME_MAX) || null;
        } else {
          next[field] = partial[field];
        }
      }
    });
    return writeJSON(KEYS.profile, next) ? next : null;
  }

  /**
   * 프로필을 지웁니다.
   * @returns {boolean} 성공 여부 (원래 없던 경우도 true)
   */
  function removeProfile() {
    const store = getStore();
    if (!store) return false;
    try {
      store.removeItem(KEYS.profile);
      return true;
    } catch (e) {
      console.warn("[GMStorage] 프로필 삭제 실패:", e);
      return false;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* 4. gm_routines (생성 루틴)                                                */
  /* ------------------------------------------------------------------------ */

  /**
   * 저장된 루틴 목록 전체를 읽습니다.
   * @returns {Array<Object>} 루틴 배열 (없거나 깨졌으면 [])
   */
  function getRoutines() {
    return readJSON(KEYS.routines, []);
  }

  /**
   * 루틴 목록 전체를 덮어씁니다.
   * @param {Array<Object>} list - 저장할 루틴 배열
   * @returns {boolean} 성공 여부
   */
  function setRoutines(list) {
    if (!Array.isArray(list)) {
      console.warn("[GMStorage] setRoutines에는 배열만 넣을 수 있습니다.");
      return false;
    }
    return writeJSON(KEYS.routines, list);
  }

  /**
   * 루틴 하나를 추가합니다. id("rt_...")와 date(ISO 시각)는 자동으로 채웁니다.
   * @param {{conditions:Object, principle:string, warmup:string, exercises:Array,
   *          title?:string, focus_tags?:string[], coach_note?:string, total_minutes?:number}} data - 루틴 내용
   *   (title·focus_tags·coach_note·total_minutes는 작업 6-B '오늘의 운동' 카드를 다시 그릴 때 씁니다)
   * @returns {Object|null} 저장된 루틴 객체, 실패하면 null
   * - 예외 처리: exercises가 배열이 아니면 빈 배열로 바꿔, 화면에서 반복문이 터지지 않게 합니다.
   */
  function addRoutine(data) {
    const list = getRoutines();
    const item = {
      id: makeId("rt_", list),
      date: new Date().toISOString(),
      conditions: (data && data.conditions) || {},
      principle: String((data && data.principle) || ""),
      warmup: String((data && data.warmup) || ""),
      exercises: Array.isArray(data && data.exercises) ? data.exercises : [],
      title: String((data && data.title) || ""),
      focus_tags: Array.isArray(data && data.focus_tags) ? data.focus_tags.map(String) : [],
      coach_note: String((data && data.coach_note) || ""),
      total_minutes: Number(data && data.total_minutes) || null
    };
    list.push(item);
    return writeJSON(KEYS.routines, list) ? item : null;
  }

  /**
   * 저장된 루틴의 운동 하나에 코치 설명(/api/coach 결과)을 붙여 저장합니다.
   * - 새 LocalStorage 키를 만들지 않고 gm_routines 안의 해당 운동 항목에 coach 필드로 넣습니다.
   *   (PRD가 정한 키 4개를 늘리지 않기 위해서, 그리고 같은 루틴을 다시 열면 기다리지 않고 바로 보이게 하기 위해서)
   * @param {string} routineId - 루틴 id ("rt_...")
   * @param {number} order - 운동 순서 번호
   * @param {Object} coach - 코치 설명 객체
   * @returns {boolean} 저장에 성공하면 true, 루틴·운동을 못 찾거나 저장에 실패하면 false
   */
  function saveExerciseCoach(routineId, order, coach) {
    const list = getRoutines();
    const routine = list.find((r) => r && r.id === routineId);
    if (!routine || !Array.isArray(routine.exercises)) return false;
    const exercise = routine.exercises.find((ex) => ex && Number(ex.order) === Number(order));
    if (!exercise) return false;
    exercise.coach = coach;
    return writeJSON(KEYS.routines, list);
  }

  /**
   * id로 루틴 하나를 삭제합니다.
   * @param {string} id - 지울 루틴 id
   * @returns {boolean} 삭제·저장에 성공하면 true
   */
  function removeRoutine(id) {
    return removeById(KEYS.routines, id);
  }

  /* ------------------------------------------------------------------------ */
  /* 5. 전역 공개                                                              */
  /* ------------------------------------------------------------------------ */

  // 다른 스크립트에서 GMStorage.addEquipment(...)처럼 쓸 수 있게 전역 객체로 내보냅니다.
  global.GMStorage = Object.freeze({
    KEYS,
    getEquipment,
    setEquipment,
    addEquipment,
    updateEquipment,
    findEquipmentByName,
    getEquipmentById,
    removeEquipment,
    getProfile,
    setProfile,
    removeProfile,
    getRoutines,
    setRoutines,
    addRoutine,
    saveExerciseCoach,
    removeRoutine
  });
})(window);
