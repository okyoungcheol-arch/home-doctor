/** 기기(localStorage)에 매니저 로그인 전화번호를 저장할 때 쓰는 키. */
export const MANAGER_PHONE_STORAGE_KEY = 'hd_manager_phone';

/**
 * 입력값을 011-1234-5678 형태(3-4-4자리)로 표시용 포맷팅한다. 숫자가 아닌 문자는 제거하고
 * 최대 11자리까지만 받는다 — 타이핑 중간 상태(자릿수 미달)에도 맞춰 하이픈을 붙인다.
 */
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/**
 * 저장/조회용으로 숫자만 남긴다. 화면에는 하이픈 포맷으로 보여주더라도 DB에는 항상 이 형태로
 * 저장/조회해야, 표시 포맷이 바뀌어도 기존에 저장된 전화번호와 계속 일치한다.
 */
export function normalizePhoneNumber(value: string): string {
  return value.replace(/\D/g, '');
}
