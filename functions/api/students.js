/**
 * 학생 참여도 추적 API
 * GET: 연결된 학생 수 조회
 * 
 * 주의: Cloudflare Pages Functions는 각 파일이 독립적으로 작동하므로,
 * slide.js의 connectedClients에 직접 접근할 수 없습니다.
 * 실제 구현에서는 Durable Objects나 KV를 사용하여 학생 수를 추적해야 합니다.
 * 
 * 현재는 slide.js와 동일한 메모리 공간을 공유하지 않으므로,
 * 이 API는 별도의 추적 메커니즘이 필요합니다.
 */

// slide.js의 connectedClients를 직접 접근할 수 없으므로,
// 별도의 추적 메커니즘 사용 (임시 해결책)
// 실제로는 Durable Objects나 KV를 사용하는 것이 권장됩니다.
const studentConnections = new Map(); // Map<classId, Set<connectionId>>

export function addStudentConnection(classId, connectionId) {
  if (!studentConnections.has(classId)) {
    studentConnections.set(classId, new Set());
  }
  studentConnections.get(classId).add(connectionId);
}

export function removeStudentConnection(classId, connectionId) {
  const connections = studentConnections.get(classId);
  if (connections) {
    connections.delete(connectionId);
    if (connections.size === 0) {
      studentConnections.delete(classId);
    }
  }
}

export function getStudentCount(classId) {
  const connections = studentConnections.get(classId);
  return connections ? connections.size : 0;
}

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
    // 주의: 이 카운트는 students.js의 메모리 기반 추적을 사용하므로,
    // slide.js의 SSE 연결과 동기화되지 않을 수 있습니다.
    // 실제 운영 환경에서는 Durable Objects나 KV를 사용해야 합니다.
    const count = getStudentCount(classId);
    
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

