/**
 * 슬라이드 상태 관리 API
 * GET: 현재 슬라이드 인덱스 조회
 * POST: 슬라이드 인덱스 업데이트
 */

export async function onRequestGet(context) {
  const { request, env } = context;
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
    // KV에서 슬라이드 인덱스 가져오기
    const value = await env.SLIDES.get(classId);
    const slideIndex = value ? Number(value) : 0;

    return new Response(
      JSON.stringify({ slideIndex }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error("KV 읽기 오류:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // 요청 본문 파싱
    const body = await request.json();
    const { classId, slideIndex } = body || {};

    // 유효성 검사
    if (!classId || typeof classId !== "string") {
      return new Response(
        JSON.stringify({ error: "classId is required and must be a string" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (typeof slideIndex !== "number" || slideIndex < 0) {
      return new Response(
        JSON.stringify({ error: "slideIndex is required and must be a non-negative number" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // KV에 슬라이드 인덱스 저장
    await env.SLIDES.put(classId, String(slideIndex));

    return new Response(
      JSON.stringify({ ok: true, slideIndex }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error("KV 쓰기 오류:", error);
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

