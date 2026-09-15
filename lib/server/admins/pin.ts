import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LENGTH = 32;

/**
 * PIN을 `salt:hash` 형태의 문자열로 해시한다 — `admins.pinCode`에는 이 결과만 저장하고, 평문
 * PIN은 어디에도 남기지 않는다. salt를 매번 새로 생성하므로 같은 PIN이라도 저장값은 매번 다르다.
 */
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * 입력된 PIN이 저장된 해시와 일치하는지 확인한다. 길이가 다른 값을 `timingSafeEqual`에 넘기면
 * 예외가 나므로 그 전에 길이를 맞춰 비교하고, 형식이 깨진 저장값(구분자 없음 등)은 불일치로
 * 처리한다 — 어떤 경우든 비교 자체는 타이밍 공격을 막기 위해 상수 시간으로 수행한다.
 */
export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;

  const candidate = scryptSync(pin, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;

  return timingSafeEqual(candidate, expected);
}
