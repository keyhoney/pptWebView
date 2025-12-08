/**
 * 슬라이드 상태 관리 API
 * GET: 현재 레슨 ID와 슬라이드 인덱스 조회
 * POST: 레슨 ID와 슬라이드 인덱스 업데이트
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
    // KV에서 상태 가져오기
    const stored = await env.SLIDES.get(classId);
    let lessonId = "lesson1";
    let slideIndex = 0;

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // 새 형식: { lessonId, slideIndex }
        if (parsed.lessonId) lessonId = parsed.lessonId;
        if (typeof parsed.slideIndex === "number") slideIndex = parsed.slideIndex;
      } catch {
        // 혹시 예전처럼 숫자만 저장돼 있었다면 (하위 호환성)
        const num = Number(stored);
        if (!Number.isNaN(num)) slideIndex = num;
      }
    }

    return new Response(
      JSON.stringify({ lessonId, slideIndex }),
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
    const { classId, lessonId, slideIndex } = body || {};

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

    if (!lessonId || typeof lessonId !== "string") {
      return new Response(
        JSON.stringify({ error: "lessonId is required and must be a string" }),
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

    // KV에 JSON 형식으로 저장 { lessonId, slideIndex }
    const value = JSON.stringify({ lessonId, slideIndex });
    await env.SLIDES.put(classId, value);

    return new Response(
      JSON.stringify({ ok: true, lessonId, slideIndex }),
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

