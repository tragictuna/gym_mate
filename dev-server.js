/**
 * ==============================================================================
 * 파일명: dev-server.js
 * 설명: Vercel 서버리스 함수 및 정적 파일을 로컬에서 npm 설치 없이 즉시 실행하는 경량 개발 서버
 * 특징: Node.js 내장 http, fs, path 모듈만 사용, .env.local 자동 파싱
 * ==============================================================================
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

// 1. .env.local 파일 파싱 및 환경 변수 등록
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...values] = trimmed.split("=");
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join("=").trim();
      }
    }
  });
  console.log("✅ [.env.local] 환경 변수가 성공적으로 로드되었습니다.");
} else {
  console.warn("⚠️ [.env.local] 파일이 존재하지 않습니다.");
}

// MIME 타입 매핑
const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// 2. HTTP 서버 생성
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // 2-1. Vercel 서버리스 함수 라우팅 (/api/*)
  if (pathname.startsWith("/api/")) {
    const apiName = pathname.replace("/api/", "").replace(/\/$/, "");
    const apiFilePath = path.join(__dirname, "api", `${apiName}.js`);

    if (fs.existsSync(apiFilePath)) {
      try {
        // 동적 모듈 임포트 (Vercel 핸들러 호출)
        const apiModule = await import(`file://${apiFilePath}?t=${Date.now()}`);
        const handler = apiModule.default;

        // Vercel req/res 간이 에뮬레이션 래퍼
        let rawBody = "";
        req.on("data", (chunk) => {
          rawBody += chunk;
        });

        req.on("end", async () => {
          try {
            req.body = rawBody ? JSON.parse(rawBody) : {};
          } catch (e) {
            req.body = rawBody;
          }

          // res.status().json() 헬퍼 메서드 추가
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (data) => {
            res.setHeader("Content-Type", "application/json; charset=UTF-8");
            res.end(JSON.stringify(data));
            return res;
          };

          // 핸들러 실행
          await handler(req, res);
        });
        return;
      } catch (err) {
        console.error(`[API 실행 오류 - ${pathname}]:`, err);
        res.writeHead(500, { "Content-Type": "application/json; charset=UTF-8" });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
    } else {
      res.writeHead(404, { "Content-Type": "application/json; charset=UTF-8" });
      res.end(JSON.stringify({ success: false, error: "API 엔드포인트를 찾을 수 없습니다." }));
      return;
    }
  }

  // 2-2. 정적 파일 서빙 (index.html, style.css, script.js 등)
  let relativeFilePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const safeFilePath = path.join(__dirname, path.normalize(relativeFilePath));

  // 상위 디렉터리 탐색 방지
  if (!safeFilePath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=UTF-8" });
    res.end("403 Forbidden");
    return;
  }

  fs.stat(safeFilePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(safeFilePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    const readStream = fs.createReadStream(safeFilePath);
    readStream.pipe(res);
  });
});

// 서버 기동
server.listen(PORT, () => {
  console.log(`
======================================================
  🏋️‍♂️ GymMate 로컬 개발 서버가 구동되었습니다!
  - 로컬 주소: http://localhost:${PORT}
  - 1단계 기구 인식 API: http://localhost:${PORT}/api/analyze-equipment
======================================================
  `);
});
