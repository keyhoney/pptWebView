/**
 * 슬라이드 상태 관리 API
 * GET: 현재 레슨 ID와 슬라이드 인덱스 조회
 * POST: 레슨 ID와 슬라이드 인덱스 업데이트
 * SSE: Server-Sent Events를 통한 실시간 동기화
 */

// 메모리 기반 클라이언트 연결 추적 (워커 인스턴스별로 관리됨)
// 주의: Cloudflare Workers는 요청 간 메모리가 공유되지 않으므로, 
// 실제 운영 환경에서는 Durable Objects나 KV를 사용하는 것이 권장됩니다.
export const connectedClients = new Map(); // Map<classId, Set<ReadableStreamDefaultController>>

// 학생 수 조회 헬퍼 함수 (slide.js의 connectedClients 사용)
export function getStudentCount(classId) {
  const clients = connectedClients.get(classId);
  return clients ? clients.size : 0;
}

// students.js와의 통합을 위한 함수 (동일한 Map 사용)
export function getConnectedClients() {
  return connectedClients;
}

// SSE 연결 관리 헬퍼 함수
function addClient(classId, controller) {
  if (!connectedClients.has(classId)) {
    connectedClients.set(classId, new Set());
  }
  connectedClients.get(classId).add(controller);
  
  // 디버깅: 연결 수 로그
  const count = connectedClients.get(classId).size;
  console.log(`[SSE] 클라이언트 추가: classId=${classId}, 현재 연결 수=${count}`);
}

function removeClient(classId, controller) {
  if (!classId || !controller) return;
  const clients = connectedClients.get(classId);
  if (clients) {
    const beforeSize = clients.size;
    clients.delete(controller);
    const afterSize = clients.size;
    
    // 디버깅: 제거 로그
    if (beforeSize !== afterSize) {
      console.log(`[SSE] 클라이언트 제거: classId=${classId}, 이전=${beforeSize}, 현재=${afterSize}`);
    }
    
    if (clients.size === 0) {
      connectedClients.delete(classId);
    }
  }
}

// 끊어진 연결 정리 함수 (heartbeat 실패 시 자동 제거되므로 여기서는 로그만)
function cleanupDisconnectedClients(classId) {
  const clients = connectedClients.get(classId);
  if (!clients) return;
  
  // 실제 정리는 heartbeat 실패 시 자동으로 이루어지므로
  // 여기서는 현재 상태만 로그로 기록
  const count = clients.size;
  if (count > 0) {
    console.log(`[SSE] 현재 활성 연결 수: classId=${classId}, 연결 수=${count}`);
  }
}

function broadcastToClients(classId, data) {
  const clients = connectedClients.get(classId);
  if (clients) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach((controller) => {
      try {
        controller.enqueue(new TextEncoder().encode(message));
      } catch (error) {
        // 연결이 끊어진 클라이언트 제거
        clients.delete(controller);
      }
    });
  }
}

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

  // 학생 수 조회 요청 확인
  if (url.searchParams.get("students") === "true") {
    // 조회 전에 끊어진 연결 정리
    cleanupDisconnectedClients(classId);
    const count = getStudentCount(classId);
    console.log(`[학생 수 조회] classId=${classId}, 연결 수=${count}`);
    return new Response(
      JSON.stringify({ count }),
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
  }

  // SSE 요청 확인 (URL 파라미터 또는 Accept 헤더로 구분)
  const isSSE = url.searchParams.get("sse") === "true" || 
                (request.headers.get("Accept") && request.headers.get("Accept").includes("text/event-stream"));
  
  if (isSSE) {
    // SSE 스트림 생성
    const stream = new ReadableStream({
      start(controller) {
        // 클라이언트 추가
        addClient(classId, controller);

        // 초기 상태 전송
        (async () => {
          try {
            const stored = await env.SLIDES.get(classId);
            let lessonId = "lesson1";
            let slideIndex = 0;

            if (stored) {
              try {
                const parsed = JSON.parse(stored);
                if (parsed.lessonId) lessonId = parsed.lessonId;
                if (typeof parsed.slideIndex === "number") slideIndex = parsed.slideIndex;
              } catch {
                const num = Number(stored);
                if (!Number.isNaN(num)) slideIndex = num;
              }
            }

            const initialData = `data: ${JSON.stringify({ lessonId, slideIndex })}\n\n`;
            controller.enqueue(new TextEncoder().encode(initialData));
          } catch (error) {
            console.error("SSE 초기 상태 전송 오류:", error);
          }
        })();

        // Heartbeat 전송 (30초마다 연결 유지)
        // 연결 타임아웃 추적 (60초 동안 heartbeat가 없으면 제거)
        let lastHeartbeatTime = Date.now();
        const heartbeatInterval = setInterval(() => {
          try {
            const heartbeat = `: heartbeat\n\n`;
            controller.enqueue(new TextEncoder().encode(heartbeat));
            lastHeartbeatTime = Date.now();
          } catch (error) {
            // 연결이 끊어진 경우
            console.log(`[SSE] Heartbeat 전송 실패, 연결 제거: classId=${classId}`);
            clearInterval(heartbeatInterval);
            removeClient(classId, controller);
          }
        }, 30000);
        
        // 연결 타임아웃 체크 (90초마다)
        const timeoutCheckInterval = setInterval(() => {
          const timeSinceLastHeartbeat = Date.now() - lastHeartbeatTime;
          if (timeSinceLastHeartbeat > 90000) {
            // 90초 동안 heartbeat가 없으면 연결이 끊어진 것으로 간주
            console.log(`[SSE] 연결 타임아웃, 제거: classId=${classId}, 마지막 heartbeat=${timeSinceLastHeartbeat}ms 전`);
            clearInterval(heartbeatInterval);
            clearInterval(timeoutCheckInterval);
            removeClient(classId, controller);
            try {
              controller.close();
            } catch (e) {
              // 이미 닫혔을 수 있음
            }
          }
        }, 90000);

        // 연결 종료 시 클라이언트 제거 및 정리
        const cleanup = () => {
          console.log(`[SSE] 연결 종료, 정리 시작: classId=${classId}`);
          clearInterval(heartbeatInterval);
          clearInterval(timeoutCheckInterval);
          removeClient(classId, controller);
          try {
            controller.close();
          } catch (e) {
            // 이미 닫혔을 수 있음
          }
        };

        request.signal.addEventListener("abort", cleanup);
      },
      cancel(controller) {
        // heartbeatInterval은 클로저에 있으므로 여기서는 정리할 수 없음
        // start 함수 내에서 cleanup 함수로 처리됨
        removeClient(classId, controller);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // 일반 GET 요청 처리
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

    // 연결된 모든 SSE 클라이언트에 변경사항 브로드캐스트
    broadcastToClients(classId, { lessonId, slideIndex });

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

