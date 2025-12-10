/**
 * 이해도 체크 API
 * POST: 이해도 체크 제출 / 이해도 체크 시작
 * GET: 이해도 통계 조회 / 활성 이해도 체크 조회
 * DELETE: 이해도 체크 종료
 */

import { broadcastUnderstandingCheck } from './slide.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    const body = await request.json();

    if (action === "start") {
      // 이해도 체크 시작
      const { classId, slideIndex, lessonId } = body;

      if (!classId || slideIndex === undefined) {
        return new Response(
          JSON.stringify({ error: "classId and slideIndex are required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const understandingCheckKey = `understanding:check:${classId}`;
      const checkData = {
        classId,
        lessonId: lessonId || "default",
        slideIndex,
        active: true,
        startedAt: Date.now(),
      };

      await env.SLIDES.put(
        understandingCheckKey,
        JSON.stringify(checkData),
        { expirationTtl: 3600 } // 1시간 후 자동 삭제
      );

      // SSE로 이해도 체크 시작 브로드캐스트
      try {
        broadcastUnderstandingCheck(classId, checkData);
      } catch (error) {
        console.error('[이해도 체크] SSE 브로드캐스트 오류:', error);
      }

      return new Response(
        JSON.stringify({ ok: true, check: checkData }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 이해도 체크 제출
    const { classId, studentId, slideIndex, lessonId, understood } = body;

    if (!classId || !studentId || slideIndex === undefined || understood === undefined) {
      return new Response(
        JSON.stringify({ error: "classId, studentId, slideIndex, and understood are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 이해도 데이터 저장
    const understandingKey = `understanding:${classId}:${lessonId || "default"}:${slideIndex}`;
    const understandingDataStr = await env.SLIDES.get(understandingKey);
    
    let understandingData = understandingDataStr 
      ? JSON.parse(understandingDataStr)
      : {
          classId,
          lessonId: lessonId || "default",
          slideIndex,
          understood: {},
          notUnderstood: {},
          lastUpdated: Date.now(),
        };

    // 이전 답변 제거 (한 학생은 하나의 답변만)
    Object.keys(understandingData.understood).forEach(key => {
      if (key === studentId) {
        delete understandingData.understood[key];
      }
    });
    Object.keys(understandingData.notUnderstood).forEach(key => {
      if (key === studentId) {
        delete understandingData.notUnderstood[key];
      }
    });

    // 새 답변 추가
    if (understood) {
      understandingData.understood[studentId] = Date.now();
    } else {
      understandingData.notUnderstood[studentId] = Date.now();
    }

    understandingData.lastUpdated = Date.now();

    await env.SLIDES.put(
      understandingKey,
      JSON.stringify(understandingData),
      { expirationTtl: 86400 } // 24시간 후 자동 삭제
    );

    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("이해도 체크 오류:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const classId = url.searchParams.get("classId");
  const lessonId = url.searchParams.get("lessonId");
  const slideIndex = url.searchParams.get("slideIndex");
  const checkActive = url.searchParams.get("checkActive") === "true";

  if (!classId) {
    return new Response(
      JSON.stringify({ error: "classId required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    if (checkActive) {
      // 활성 이해도 체크 조회
      const understandingCheckKey = `understanding:check:${classId}`;
      const checkDataStr = await env.SLIDES.get(understandingCheckKey);
      
      if (!checkDataStr) {
        return new Response(
          JSON.stringify({ active: false }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      const checkData = JSON.parse(checkDataStr);
      return new Response(
        JSON.stringify({ active: checkData.active || false, check: checkData }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } else if (slideIndex !== null) {
      // 특정 슬라이드의 이해도 통계
      const understandingKey = `understanding:${classId}:${lessonId || "default"}:${slideIndex}`;
      const understandingDataStr = await env.SLIDES.get(understandingKey);
      
      if (!understandingDataStr) {
        return new Response(
          JSON.stringify({
            understood: 0,
            notUnderstood: 0,
            total: 0,
            percentage: 0,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      const understandingData = JSON.parse(understandingDataStr);
      const understoodCount = Object.keys(understandingData.understood || {}).length;
      const notUnderstoodCount = Object.keys(understandingData.notUnderstood || {}).length;
      const total = understoodCount + notUnderstoodCount;
      const percentage = total > 0 ? Math.round((understoodCount / total) * 100) : 0;

      return new Response(
        JSON.stringify({
          understood: understoodCount,
          notUnderstood: notUnderstoodCount,
          total,
          percentage,
          slideIndex: parseInt(slideIndex),
          lessonId: understandingData.lessonId,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } else {
      // 레슨 전체의 이해도 통계
      // 주의: KV에서 모든 슬라이드의 데이터를 가져오는 것은 비효율적
      // 실제로는 특정 슬라이드만 조회하는 것이 권장됨
      return new Response(
        JSON.stringify({ error: "slideIndex is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("이해도 조회 오류:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const classId = url.searchParams.get("classId");

  if (!classId) {
    return new Response(
      JSON.stringify({ error: "classId required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const understandingCheckKey = `understanding:check:${classId}`;
    const checkDataStr = await env.SLIDES.get(understandingCheckKey);
    
    if (checkDataStr) {
      const checkData = JSON.parse(checkDataStr);
      checkData.active = false;
      await env.SLIDES.put(understandingCheckKey, JSON.stringify(checkData), { expirationTtl: 3600 });
      
      // SSE로 이해도 체크 종료 브로드캐스트
      try {
        broadcastUnderstandingCheck(classId, checkData);
      } catch (error) {
        console.error('[이해도 체크] SSE 브로드캐스트 오류:', error);
      }
    }

    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("이해도 체크 종료 오류:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

