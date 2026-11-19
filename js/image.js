/**
 * ==============================================================================
 * 파일명: js/image.js
 * 역할: 기구 사진을 서버로 보내기 전에 브라우저에서 줄이고 압축하는 모듈 (PRD F1-1)
 * 불러오는 법: <script src="js/image.js"></script> → 전역 객체 window.GMImage 사용
 *
 * 왜 줄이나요?
 *   - 휴대폰 원본 사진(5~10MB)을 그대로 보내면 전송이 느리고, Vercel 요청 본문 한도(약 4.5MB)와
 *     OpenRouter 입력 한도를 넘을 수 있습니다. 긴 변 1024px·JPEG 0.85면 보통 수백 KB로 줄어듭니다.
 *   - 사진은 인식에만 쓰고 저장하지 않습니다(PRD). 이 모듈도 결과를 어디에도 저장하지 않습니다.
 * ==============================================================================
 */
(function (global) {
  "use strict";

  // 기본 설정값 (PRD F1-1: 긴 변 1024px 이하, JPEG 품질 0.85)
  const DEFAULT_MAX_SIZE = 1024;
  const DEFAULT_QUALITY = 0.85;

  /**
   * 원래 크기를 비율을 지키며 긴 변이 maxSize 이하가 되도록 계산합니다.
   * @param {number} width - 원본 가로(px)
   * @param {number} height - 원본 세로(px)
   * @param {number} maxSize - 긴 변의 최대 길이(px)
   * @returns {{width:number, height:number}} 줄인 크기 (원본이 이미 작으면 그대로, 키우지는 않음)
   */
  function fitSize(width, height, maxSize) {
    const longSide = Math.max(width, height);
    if (longSide <= maxSize) {
      return { width, height };
    }
    const scale = maxSize / longSide;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  /**
   * 이미지 파일을 줄이고 JPEG로 압축해 base64 데이터 URL로 돌려줍니다.
   * - 동작 원리: 파일 → 임시 URL(createObjectURL) → <img>로 디코딩 → 캔버스에 줄여 그림 → toDataURL("image/jpeg")
   *   요즘 브라우저는 <img>를 그릴 때 사진의 EXIF 회전 정보를 자동 반영하므로 세로 사진도 바로 섭니다.
   * @param {File|Blob} file - <input type="file">에서 고른 이미지 파일
   * @param {{maxSize?:number, quality?:number}} [options] - 긴 변 최대 길이(기본 1024), JPEG 품질 0~1(기본 0.85)
   * @returns {Promise<string>} "data:image/jpeg;base64,..." 형식의 문자열
   * - 예외 처리(Promise reject):
   *   · 파일이 없거나 이미지가 아니면 → 서버에 쓸모없는 요청을 보내지 않도록 미리 막습니다.
   *   · 이미지 디코딩 실패(손상 파일, 브라우저가 지원하지 않는 HEIC 등) → 사용자에게 다시 고르라고 안내할 수 있게 합니다.
   *   · 캔버스를 만들 수 없는 환경 → 드물지만 오래된 브라우저 대비.
   */
  function resizeToBase64(file, options) {
    const maxSize = (options && options.maxSize) || DEFAULT_MAX_SIZE;
    const quality = (options && options.quality) || DEFAULT_QUALITY;

    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("이미지 파일이 없습니다."));
        return;
      }
      if (!file.type || !file.type.startsWith("image/")) {
        reject(new Error("이미지 파일(.jpg, .png, .webp 등)만 올릴 수 있어요."));
        return;
      }

      // FileReader보다 메모리를 덜 쓰는 임시 URL 방식. 다 쓴 뒤 revokeObjectURL로 꼭 해제합니다.
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        try {
          const size = fitSize(img.naturalWidth, img.naturalHeight, maxSize);
          const canvas = document.createElement("canvas");
          canvas.width = size.width;
          canvas.height = size.height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            throw new Error("이 브라우저에서는 사진을 줄일 수 없어요.");
          }
          // PNG의 투명한 부분이 JPEG에서 검게 나오지 않도록 흰 배경을 먼저 칠합니다.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size.width, size.height);
          ctx.drawImage(img, 0, 0, size.width, size.height);

          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("사진을 읽지 못했어요. 다른 사진을 골라 주세요."));
      };

      img.src = objectUrl;
    });
  }

  // 전역 공개: GMImage.resizeToBase64(file).then(base64 => ...)
  global.GMImage = Object.freeze({
    DEFAULT_MAX_SIZE,
    DEFAULT_QUALITY,
    fitSize,
    resizeToBase64
  });
})(window);
