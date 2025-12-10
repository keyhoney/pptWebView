/**
 * 실시간 퀴즈/투표 API
 * POST: 퀴즈 생성
 * POST: 답변 제출
 * GET: 퀴즈 결과 조회
 * DELETE: 퀴즈 종료
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    const body = await request.json();

    if (action === "create") {
      // 퀴즈 생성
      const { classId, quizId, question, options, type, slideIndex } = body;

      if (!classId || !quizId || !question) {
        return new Response(
          JSON.stringify({ error: "classId, quizId, and question are required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const quizData = {
        quizId,
        question,
        options: options || [],
        type: type || "multiple", // multiple, single, yesno
        slideIndex: slideIndex || null,
        createdAt: Date.now(),
        active: true,
        answers: {},
      };

      // KV에 저장: classId:quizId 형식
      await env.SLIDES.put(
        `quiz:${classId}:${quizId}`,
        JSON.stringify(quizData),
        { expirationTtl: 3600 } // 1시간 후 자동 삭제
      );

      // 활성 퀴즈 목록에 추가
      const activeQuizzesKey = `quiz:active:${classId}`;
      const activeQuizzes = await env.SLIDES.get(activeQuizzesKey);
      const quizzes = activeQuizzes ? JSON.parse(activeQuizzes) : [];
      if (!quizzes.includes(quizId)) {
        quizzes.push(quizId);
        await env.SLIDES.put(activeQuizzesKey, JSON.stringify(quizzes), { expirationTtl: 3600 });
      }

      return new Response(
        JSON.stringify({ ok: true, quiz: quizData }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } else if (action === "answer") {
      // 답변 제출
      const { classId, quizId, studentId, answer } = body;

      if (!classId || !quizId || !studentId || answer === undefined) {
        return new Response(
          JSON.stringify({ error: "classId, quizId, studentId, and answer are required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // 퀴즈 데이터 가져오기
      const quizKey = `quiz:${classId}:${quizId}`;
      const quizDataStr = await env.SLIDES.get(quizKey);
      
      if (!quizDataStr) {
        return new Response(
          JSON.stringify({ error: "Quiz not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const quizData = JSON.parse(quizDataStr);
      
      if (!quizData.active) {
        return new Response(
          JSON.stringify({ error: "Quiz is not active" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // 답변 저장
      quizData.answers[studentId] = {
        answer,
        timestamp: Date.now(),
      };

      await env.SLIDES.put(quizKey, JSON.stringify(quizData), { expirationTtl: 3600 });

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
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Quiz API 오류:", error);
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
  const quizId = url.searchParams.get("quizId");

  if (!classId) {
    return new Response(
      JSON.stringify({ error: "classId required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    if (quizId) {
      // 특정 퀴즈 결과 조회
      const quizKey = `quiz:${classId}:${quizId}`;
      const quizDataStr = await env.SLIDES.get(quizKey);
      
      if (!quizDataStr) {
        return new Response(
          JSON.stringify({ error: "Quiz not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const quizData = JSON.parse(quizDataStr);
      
      // 결과 집계
      const results = {};
      const answerCounts = {};
      let totalAnswers = 0;

      Object.values(quizData.answers).forEach(({ answer }) => {
        const answerKey = Array.isArray(answer) ? answer.join(",") : String(answer);
        answerCounts[answerKey] = (answerCounts[answerKey] || 0) + 1;
        totalAnswers++;
      });

      results.summary = {
        totalAnswers,
        answerCounts,
        options: quizData.options,
      };

      return new Response(
        JSON.stringify({ quiz: quizData, results }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } else {
      // 활성 퀴즈 목록 조회
      const activeQuizzesKey = `quiz:active:${classId}`;
      const activeQuizzesStr = await env.SLIDES.get(activeQuizzesKey);
      const quizIds = activeQuizzesStr ? JSON.parse(activeQuizzesStr) : [];

      const quizzes = [];
      for (const qId of quizIds) {
        const quizKey = `quiz:${classId}:${qId}`;
        const quizDataStr = await env.SLIDES.get(quizKey);
        if (quizDataStr) {
          const quizData = JSON.parse(quizDataStr);
          if (quizData.active) {
            quizzes.push({
              quizId: qId,
              question: quizData.question,
              type: quizData.type,
              slideIndex: quizData.slideIndex,
              answerCount: Object.keys(quizData.answers || {}).length,
            });
          }
        }
      }

      return new Response(
        JSON.stringify({ quizzes }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  } catch (error) {
    console.error("Quiz 조회 오류:", error);
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
  const quizId = url.searchParams.get("quizId");

  if (!classId || !quizId) {
    return new Response(
      JSON.stringify({ error: "classId and quizId required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const quizKey = `quiz:${classId}:${quizId}`;
    const quizDataStr = await env.SLIDES.get(quizKey);
    
    if (quizDataStr) {
      const quizData = JSON.parse(quizDataStr);
      quizData.active = false;
      await env.SLIDES.put(quizKey, JSON.stringify(quizData), { expirationTtl: 3600 });
    }

    // 활성 퀴즈 목록에서 제거
    const activeQuizzesKey = `quiz:active:${classId}`;
    const activeQuizzesStr = await env.SLIDES.get(activeQuizzesKey);
    if (activeQuizzesStr) {
      const quizIds = JSON.parse(activeQuizzesStr);
      const filtered = quizIds.filter(id => id !== quizId);
      await env.SLIDES.put(activeQuizzesKey, JSON.stringify(filtered), { expirationTtl: 3600 });
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
    console.error("퀴즈 종료 오류:", error);
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

