/**
 * 슬라이드 목록 API
 * GET: 모든 레슨과 슬라이드 목록 반환
 */

// 슬라이드 검색 관련 상수
const MAX_SLIDES_PER_LESSON = 200; // 레슨당 최대 탐색 슬라이드 수(과도한 요청 방지)
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
    } catch {
      // 무시하고 다음 후보 시도
    }
  }
  return { exists: false, url: candidates[0] };
}

// 존재하는 슬라이드의 최댓값을 탐색 (지수 증가 후 이진 탐색)
async function findMaxSlideNumber(baseUrl, lessonId, maxSlides = MAX_SLIDES_PER_LESSON) {
  // 1번 슬라이드부터 존재하는지 확인
  const first = await checkSlideExists(baseUrl, lessonId, 1);
  if (!first.exists) return 0;

  let low = 1;
  let high = 2;

  // 지수 증가로 상한선 추정
  while (high <= maxSlides) {
    const res = await checkSlideExists(baseUrl, lessonId, high);
    if (res.exists) {
      low = high;
      high = Math.min(high * 2, maxSlides);
    } else {
      break;
    }
  }

  // 이진 탐색으로 정확한 최댓값 결정
  let left = low + 1;
  let right = Math.min(high, maxSlides);
  let maxFound = low;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const res = await checkSlideExists(baseUrl, lessonId, mid);
    if (res.exists) {
      maxFound = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return maxFound;
}

// 특정 레슨의 모든 슬라이드 찾기 (최댓값을 먼저 찾은 뒤 전체 수집)
async function findSlidesForLesson(
  baseUrl,
  lessonId,
  maxSlides = MAX_SLIDES_PER_LESSON
) {
  const maxSlideNum = await findMaxSlideNumber(baseUrl, lessonId, maxSlides);
  if (maxSlideNum === 0) return [];

  const slides = [];
  const batchSize = SLIDE_BATCH_SIZE;

  for (let i = 1; i <= maxSlideNum; i += batchSize) {
    const checkPromises = [];
    for (let j = 0; j < batchSize; j++) {
      const slideNum = i + j;
      if (slideNum > maxSlideNum) break;
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
      }
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

