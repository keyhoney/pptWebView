/**
 * 학생 참여도 추적 API
 * GET: 연결된 학생 수 조회
 * 
 * 주의: Cloudflare Pages Functions는 각 파일이 독립적으로 작동하므로,
 * slide.js의 connectedClients에 직접 접근할 수 없습니다.
 * 
 * 해결책: slide.js의 getStudentCount 함수를 사용하도록 수정
 * 하지만 모듈 import가 제한적이므로, 대신 slide.js에 직접 학생 수 조회 기능을 추가
 */

// slide.js의 함수를 import 시도 (Cloudflare Workers 제약으로 작동하지 않을 수 있음)
// 대안: slide.js에서 직접 학생 수를 반환하도록 수정

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  // classId 파라미터 확인
  const classId = url.searchParams.get("classId");
  if (!classId) {
    return new Response(
      JSON.stringify({ error: "classId required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    // slide.js의 connectedClients에 직접 접근할 수 없으므로,
    // slide.js의 getStudentCount를 호출하는 대신,
    // slide.js에 학생 수 조회 엔드포인트를 추가하거나,
    // 여기서는 slide.js의 함수를 직접 호출할 수 없으므로
    // 임시로 slide.js의 엔드포인트를 호출하여 학생 수를 가져옵니다.
    
    // 실제 해결책: slide.js에 학생 수 조회 기능을 추가하거나,
    // 두 파일을 통합해야 합니다.
    // 현재는 slide.js의 connectedClients를 직접 사용할 수 없으므로
    // 0을 반환합니다 (임시)
    
    // TODO: slide.js와 통합하거나 Durable Objects 사용
    const count = 0; // slide.js의 connectedClients.size를 가져올 수 없음
    
    return new Response(
      JSON.stringify({ count, note: "학생 수 추적은 slide.js와 통합 필요" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error("학생 수 조회 오류:", error);
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

