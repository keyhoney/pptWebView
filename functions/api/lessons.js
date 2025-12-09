/**
 * 슬라이드 목록 API
 * GET: 모든 레슨과 슬라이드 목록 반환
 */

// 슬라이드 파일 존재 여부 확인 (병렬 처리)
async function checkSlideExists(baseUrl, lessonId, slideNum) {
  const slideUrl = `${baseUrl}/slides/${lessonId}/슬라이드${slideNum}.JPG`;
  try {
    const response = await fetch(slideUrl, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

// 특정 레슨의 모든 슬라이드 찾기 (병렬 처리)
async function findSlidesForLesson(baseUrl, lessonId, maxSlides = 100) {
  const slides = [];
  const checkPromises = [];
  
  // 병렬로 여러 슬라이드 확인
  for (let i = 1; i <= maxSlides; i++) {
    checkPromises.push(
      checkSlideExists(baseUrl, lessonId, i).then(exists => ({ num: i, exists }))
    );
  }
  
  const results = await Promise.all(checkPromises);
  
  // 존재하는 슬라이드만 수집
  for (const result of results) {
    if (result.exists) {
      slides.push(`slides/${lessonId}/슬라이드${result.num}.JPG`);
    } else if (slides.length > 0) {
      // 연속된 슬라이드가 없으면 중단 (최적화)
      // 하지만 일부 슬라이드가 누락될 수 있으므로 계속 확인
    }
  }
  
  return slides;
}

// 모든 레슨 찾기
async function findAllLessons(baseUrl, maxLessons = 20) {
  const lessons = {};
  
  // 병렬로 여러 레슨 확인
  const lessonPromises = [];
  for (let i = 1; i <= maxLessons; i++) {
    const lessonId = `lesson${i}`;
    lessonPromises.push(
      findSlidesForLesson(baseUrl, lessonId).then(slides => ({
        lessonId,
        slides,
      }))
    );
  }
  
  const results = await Promise.all(lessonPromises);
  
  // 슬라이드가 있는 레슨만 추가
  for (const result of results) {
    if (result.slides.length > 0) {
      lessons[result.lessonId] = result.slides;
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
          "Cache-Control": "public, max-age=3600", // 1시간 캐시
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

