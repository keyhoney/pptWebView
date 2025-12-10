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

// 특정 레슨의 모든 슬라이드 찾기 (배치 처리 + 조기 종료)
async function findSlidesForLesson(baseUrl, lessonId, maxSlides = 100) {
  const slides = [];
  const batchSize = 10; // 한 번에 확인할 슬라이드 수
  let emptyBatchCount = 0; // 빈 배치가 연속으로 나온 횟수

  for (let i = 1; i <= maxSlides; i += batchSize) {
    const checkPromises = [];
    // 배치 크기만큼 요청 생성
    for (let j = 0; j < batchSize; j++) {
      const slideNum = i + j;
      if (slideNum > maxSlides) break;
      checkPromises.push(
        checkSlideExists(baseUrl, lessonId, slideNum).then(exists => ({ num: slideNum, exists }))
      );
    }

    // 배치 실행
    const results = await Promise.all(checkPromises);
    let foundInBatch = false;

    for (const result of results) {
      if (result.exists) {
        slides.push(`slides/${lessonId}/슬라이드${result.num}.JPG`);
        foundInBatch = true;
      }
    }

    // 이번 배치에서 슬라이드를 하나도 못 찾았다면 카운트 증가
    if (!foundInBatch) {
      emptyBatchCount++;
      // 연속으로 3번의 배치(30개 슬라이드)가 비어있으면 중단
      // (슬라이드 번호가 연속적이지 않을 수 있으므로 여유를 둠)
      if (emptyBatchCount >= 3) {
        console.log(`[레슨 ${lessonId}] 연속 3개 빈 배치 감지, 슬라이드 탐색 종료 (${slides.length}개 발견)`);
        break;
      }
    } else {
      emptyBatchCount = 0; // 슬라이드를 찾았으면 카운터 리셋
    }
  }
  
  // 슬라이드 번호 순으로 정렬 (병렬 처리로 순서가 섞일 수 있음)
  // 파일명이 '슬라이드1.JPG', '슬라이드10.JPG' 등이므로 숫자 기준으로 정렬
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

