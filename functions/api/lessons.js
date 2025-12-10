/**
 * 슬라이드 목록 API
 * GET: 모든 레슨과 슬라이드 목록 반환
 */

// 슬라이드 파일 존재 여부 확인 (대소문자 확장자 모두 시도, 첫 번째에서 찾으면 즉시 반환)
async function checkSlideExists(baseUrl, lessonId, slideNum) {
  const fileName = `슬라이드${slideNum}.JPG`;
  const encoded = encodeURIComponent(fileName);
  const candidates = [
    `${baseUrl}/slides/${lessonId}/${fileName}`, // 가장 일반적인 경우
    `${baseUrl}/slides/${lessonId}/${encoded}`, // URL 인코딩 필요 시
    `${baseUrl}/slides/${lessonId}/슬라이드${slideNum}.jpg`, // 소문자 확장자
    `${baseUrl}/slides/${lessonId}/${encodeURIComponent(`슬라이드${slideNum}.jpg`)}`, // 소문자 + 인코딩
  ];

  // 첫 번째 URL에서 찾으면 즉시 반환 (비용 절감)
  for (const url of candidates) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        return { exists: true, url };
      }
    } catch {
      // 무시하고 다음 후보 시도
    }
  }
  return { exists: false, url: candidates[0] };
}

// 특정 레슨의 모든 슬라이드 찾기 (배치 처리, 조기 종료 완화)
async function findSlidesForLesson(baseUrl, lessonId, maxSlides = 300) {
  const slides = [];
  const batchSize = 10; // 한 번에 확인할 슬라이드 수
  let consecutiveMisses = 0; // 연속으로 못 찾은 슬라이드 수
  let foundAny = false;

  for (let i = 1; i <= maxSlides; i += batchSize) {
    const checkPromises = [];
    for (let j = 0; j < batchSize; j++) {
      const slideNum = i + j;
      if (slideNum > maxSlides) break;
      checkPromises.push(
        checkSlideExists(baseUrl, lessonId, slideNum).then((res) => ({
          num: slideNum,
          exists: res.exists,
          url: res.url,
        }))
      );
    }

    const results = await Promise.all(checkPromises);

    for (const result of results) {
      if (result.exists) {
        slides.push(`slides/${lessonId}/슬라이드${result.num}.JPG`);
        foundAny = true;
        consecutiveMisses = 0;
      } else {
        consecutiveMisses++;
      }
    }

    // 이미 슬라이드를 찾은 이후에 30개 연속 실패하면 중단 (비용 최적화)
    // 실제로는 슬라이드가 연속적으로 존재하므로 30개면 충분
    if (foundAny && consecutiveMisses >= 30) {
      console.log(
        `[레슨 ${lessonId}] 슬라이드 연속 30개 미발견, 탐색 종료 (${slides.length}개 발견)`
      );
      break;
    }
  }

  // 슬라이드 번호 순으로 정렬
  slides.sort((a, b) => {
    const numA = parseInt(a.match(/슬라이드(\d+)\.JPG/)[1]);
    const numB = parseInt(b.match(/슬라이드(\d+)\.JPG/)[1]);
    return numA - numB;
  });

  return slides;
}

// 모든 레슨 찾기 (레슨별 병렬 처리 제한)
async function findAllLessons(baseUrl, maxLessons = 20) {
  const lessons = {};
  const lessonBatchSize = 5; // 한 번에 확인할 레슨 수

  for (let i = 1; i <= maxLessons; i += lessonBatchSize) {
    const lessonPromises = [];
    
    for (let j = 0; j < lessonBatchSize; j++) {
      const lessonNum = i + j;
      if (lessonNum > maxLessons) break;
      
      const lessonId = `lesson${lessonNum}`;
      lessonPromises.push(
        findSlidesForLesson(baseUrl, lessonId).then(slides => ({
          lessonId,
          slides,
        }))
      );
    }

    const results = await Promise.all(lessonPromises);
    
    for (const result of results) {
      if (result.slides.length > 0) {
        lessons[result.lessonId] = result.slides;
      }
    }
  }
  
  return lessons;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  try {
    // 기본 URL 구성 (현재 요청의 origin 사용)
    const baseUrl = url.origin;
    
    // 모든 레슨과 슬라이드 목록 가져오기
    const lessons = await findAllLessons(baseUrl);
    
    return new Response(
      JSON.stringify(lessons),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Cache-Control": "no-cache, no-store, must-revalidate", // 캐시 비활성화
        },
      }
    );
  } catch (error) {
    console.error("레슨 목록 조회 오류:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// OPTIONS 요청 처리 (CORS preflight)
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

