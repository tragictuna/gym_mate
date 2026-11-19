/**
 * ==============================================================================
 * 파일명: scripts/check-routine.mjs
 * 역할: PRD 3장 지표 '등록 기구 준수율'을 자동으로 세는 검증 스크립트
 *   - scripts/routine-sample.json의 가짜 기구 8개로 30·45·60분 루틴을 차례로 요청합니다.
 *   - 최종 루틴의 모든 운동이 등록 기구 id를 쓰는지(준수율 100%여야 함) 셉니다.
 *   - filtered_count로 AI가 처음에 낸 운동 중 서버가 걸러낸 수도 함께 보여 줍니다(AI 자체 준수율).
 *   - principle, warmup, 운동별 why_this_order가 모두 있는지도 확인합니다.
 * 실행: 먼저 다른 터미널에서 npm run dev → 이 폴더(C:\gymmate)에서
 *       node scripts/check-routine.mjs                  (기본 주소 http://localhost:3000)
 *       node scripts/check-routine.mjs https://배포주소    (Vercel 배포 확인)
 * 종료 코드: 모두 통과하면 0, 하나라도 실패하면 1 (나중에 자동 검사에 붙이기 쉽게)
 * 비용: 무료 모델만 호출합니다. 다만 무료 한도를 쓰므로 너무 자주 돌리지 마세요.
 * ==============================================================================
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const sample = JSON.parse(fs.readFileSync(path.join(here, "routine-sample.json"), "utf8"));
const allowedIds = new Set(sample.equipment.map((e) => e.id));
const nameById = Object.fromEntries(sample.equipment.map((e) => [e.id, e.name_ko]));

let totalExercises = 0; // 최종 루틴의 운동 수 합계
let compliantExercises = 0; // 그중 등록 기구 id를 쓴 운동 수
let totalFiltered = 0; // 서버가 걸러낸 운동 수 합계
let failed = 0; // 실패한 시간 조건 수

/**
 * 한 가지 시간 조건으로 루틴을 요청하고 결과를 검사·출력합니다.
 * @param {number} minutes - 30, 45, 60
 * - 예외 처리: 서버가 꺼져 있거나 JSON이 아닌 응답이면 그 조건만 실패로 세고 다음 조건으로 넘어갑니다.
 */
async function checkOnce(minutes) {
  const body = { conditions: { ...sample.conditions, minutes }, equipment: sample.equipment };
  const started = Date.now();
  let res;
  let json;
  try {
    res = await fetch(`${baseUrl}/api/routine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    json = await res.json();
  } catch (e) {
    console.log(`\n[${minutes}분] ❌ 요청 실패: ${e.message} (npm run dev로 서버를 켰는지 확인하세요)`);
    failed++;
    return;
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(0);

  if (!res.ok || !json.success) {
    console.log(`\n[${minutes}분] ❌ HTTP ${res.status} (${seconds}초): ${json.error}`);
    failed++;
    return;
  }

  const r = json.data;
  const exercises = r.exercises || [];
  const ok = exercises.filter((ex) => allowedIds.has(ex.equipment_id));
  const missingWhy = exercises.filter((ex) => !String(ex.why_this_order || "").trim());
  totalExercises += exercises.length;
  compliantExercises += ok.length;
  totalFiltered += json.filtered_count || 0;

  const pass = ok.length === exercises.length && exercises.length > 0 && missingWhy.length === 0 && r.principle && r.warmup;
  if (!pass) failed++;

  console.log(`\n[${minutes}분] ${pass ? "✅" : "❌"} ${seconds}초 · 운동 ${exercises.length}개 · 등록 기구 사용 ${ok.length}/${exercises.length} · 서버가 걸러낸 운동 ${json.filtered_count}개`);
  console.log(`  원칙: ${r.principle}`);
  console.log(`  워밍업: ${r.warmup}`);
  exercises.forEach((ex) => {
    const mark = allowedIds.has(ex.equipment_id) ? "" : " ⚠️목록에 없음";
    console.log(`  ${ex.order}. ${ex.exercise} [${nameById[ex.equipment_id] || ex.equipment_id}${mark}] ${ex.sets}×${ex.reps}, 휴식 ${ex.rest_sec}초`);
    console.log(`     └ 이유: ${ex.why_this_order || "⚠️없음"}`);
  });
}

console.log(`등록 기구 준수율 검증 — 대상: ${baseUrl}/api/routine, 가짜 기구 ${sample.equipment.length}개`);
// 무료 모델 한도를 덜 건드리도록 동시에 보내지 않고 하나씩 보냅니다.
for (const minutes of [30, 45, 60]) {
  await checkOnce(minutes);
}

const rate = totalExercises ? ((compliantExercises / totalExercises) * 100).toFixed(1) : "0.0";
const aiRate = totalExercises + totalFiltered ? ((totalExercises / (totalExercises + totalFiltered)) * 100).toFixed(1) : "0.0";
console.log("\n==================== 결과 ====================");
console.log(`최종 루틴 등록 기구 준수율: ${compliantExercises}/${totalExercises} = ${rate}%  (PRD 목표 100%)`);
console.log(`AI가 처음 낸 운동 기준 준수율(걸러내기 전): ${aiRate}%  (걸러낸 운동 ${totalFiltered}개)`);
console.log(`실패한 조건: ${failed}/3`);
process.exit(failed === 0 && rate === "100.0" ? 0 : 1);
