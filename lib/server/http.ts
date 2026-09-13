import { NextResponse } from 'next/server';

/**
 * 요청 본문을 JSON으로 파싱한다. 실패(빈 본문, 잘못된 JSON 등) 시 그대로 반환할 수 있는 400
 * Response를 함께 준다 — 호출부는 `if (!parsed.ok) return parsed.response;` 한 줄로 처리한다.
 */
export async function parseJsonBody(
  request: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 }),
    };
  }
}

/**
 * `requireAdmin`/`requireManager`/`requireMember` 같은 인가 함수를 호출하고, 실패(예외) 시
 * 지정한 에러 메시지/상태 코드로 곧바로 반환할 수 있는 Response를 만들어준다. 호출부는
 * `if (!guarded.ok) return guarded.response;` 한 줄로 401/403 분기를 처리한다.
 */
export async function guard<T>(
  fn: () => Promise<T>,
  errorMessage: string,
  status: number,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false, response: NextResponse.json({ error: errorMessage }, { status }) };
  }
}
