/**
 * 레슨 및 슬라이드 목록 API
 * GET /api/lessons: 모든 레슨 목록 반환 (레슨 존재 여부만 확인)
 * GET /api/lessons?lessonId=lesson1: 특정 레슨의 슬라이드 목록 반환
 */

// 슬라이드 검색 관련 상수
const MAX_SLIDES_PER_LESSON = 30; // 레슨당 최대 탐색 슬라이드 수(과도한 요청 방지)
const SLIDE_BATCH_SIZE = 10; // 한 번에 확인할 슬라이드 수

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
    } catch (error) {
      // 무시하고 다음 후보 시도
    }
  }
  return { exists: false, url: candidates[0] };
}

// 특정 레슨의 모든 슬라이드 찾기 (조기 종료 없이 최대값까지 모두 확인)
async function findSlidesForLesson(
  baseUrl,
  lessonId,
  maxSlides = MAX_SLIDES_PER_LESSON
) {
  const slides = [];
  const batchSize = SLIDE_BATCH_SIZE;

  // 조기 종료 없이 최대 슬라이드 수까지 모두 확인
  for (let i = 1; i <= maxSlides; i += batchSize) {
    const checkPromises = [];
    for (let j = 0; j < batchSize; j++) {
      const slideNum = i + j;
      if (slideNum > maxSlides) break;
      checkPromises.push(
        checkSlideExists(baseUrl, lessonId, slideNum)
          .then((res) => ({
            num: slideNum,
            exists: res.exists,
            url: res.url,
          }))
          .catch((error) => {
            // 개별 슬라이드 확인 실패 시에도 계속 진행
            console.error(`[${lessonId}] 슬라이드${slideNum} 확인 중 오류:`, error.message);
            return {
              num: slideNum,
              exists: false,
              url: null,
            };
          })
      );
    }

    // Promise.allSettled를 사용하여 일부 실패해도 계속 진행
    const results = await Promise.allSettled(checkPromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.exists) {
        slides.push(`slides/${lessonId}/슬라이드${result.value.num}.JPG`);
      } else if (result.status === 'rejected') {
        console.error(`[${lessonId}] 배치 처리 중 오류:`, result.reason);
      }
    }
  }

  // 슬라이드 번호 순으로 정렬
  if (slides.length > 0) {
    slides.sort((a, b) => {
      const numA = parseInt(a.match(/슬라이드(\d+)\.JPG/)[1]);
      const numB = parseInt(b.match(/슬라이드(\d+)\.JPG/)[1]);
      return numA - numB;
    });
  }

  console.log(`[${lessonId}] 총 ${slides.length}개 슬라이드 발견`);
  return slides;
}

// 레슨 존재 여부 확인 (슬라이드 1개만 확인하여 레슨 존재 여부 판단)
async function checkLessonExists(baseUrl, lessonId) {
  // 첫 번째 슬라이드가 존재하면 레슨이 존재하는 것으로 판단
  const result = await checkSlideExists(baseUrl, lessonId, 1);
  return result.exists;
}

// 모든 레슨 목록 찾기 (레슨 존재 여부만 확인)
async function findAllLessons(baseUrl, maxLessons = 50) {
  const lessons = [];
  const lessonBatchSize = 10; // 레슨 존재 여부만 확인하므로 병렬 처리 가능

  for (let i = 1; i <= maxLessons; i += lessonBatchSize) {
    const checkPromises = [];
    
    for (let j = 0; j < lessonBatchSize; j++) {
      const lessonNum = i + j;
      if (lessonNum > maxLessons) break;
      
      const lessonId = `lesson${lessonNum}`;
      checkPromises.push(
        checkLessonExists(baseUrl, lessonId)
          .then(exists => ({ lessonId, exists }))
          .catch(error => {
            console.error(`[${lessonId}] 레슨 존재 여부 확인 중 오류:`, error.message);
            return { lessonId, exists: false };
          })
      );
    }

    const results = await Promise.allSettled(checkPromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.exists) {
        lessons.push(result.value.lessonId);
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
    
    // lessonId 파라미터 확인
    const lessonId = url.searchParams.get("lessonId");
    
    if (lessonId) {
      // 특정 레슨의 슬라이드 목록 반환
      const slides = await findSlidesForLesson(baseUrl, lessonId);
      
      return new Response(
        JSON.stringify({ [lessonId]: slides }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    } else {
      // 모든 레슨 목록만 반환 (레슨 존재 여부만 확인)
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
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }
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

