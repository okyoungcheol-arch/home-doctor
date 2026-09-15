/**
 * 5단계 심각도 등급(`SynthesisReport.severityLevel`, `medical_records.severityLevel`)에 대한
 * 공통 색상/라벨. 종합 소견 화면과 매니저 대시보드의 회원별 경고등이 이 헬퍼를 공유해, 두 곳의
 * 색상이 어긋나지 않도록 한다. Zod 스키마가 1~5 범위를 보장하긴 하지만 타입 자체는 `number`이므로
 * (리터럴 유니온이 아님), 범위를 벗어나거나 `null`(미평가)인 값도 안전하게 처리하는 함수 형태로
 * 노출한다 — `Record<1|2|3|4|5, ...>`를 그대로 내보내면 호출부마다 `number`를 좁혀야 한다.
 */
const SEVERITY_COLOR_BY_LEVEL: Record<number, string> = {
  1: 'var(--atomic-green-50)',
  2: 'var(--atomic-lime-50)',
  3: 'var(--atomic-orange-50)',
  4: 'var(--atomic-redOrange-50)',
  5: 'var(--atomic-red-40)',
};

const SEVERITY_LABEL_BY_LEVEL: Record<number, string> = {
  1: '경미',
  2: '관찰 필요',
  3: '주의',
  4: '심각',
  5: '응급',
};

/** 기록이 없거나(신규 회원) 이 필드가 생기기 전에 저장된 기존 기록이면 회색으로 "미평가"를 표시한다. */
export const SEVERITY_UNASSESSED_COLOR = 'var(--atomic-coolNeutral-70)';
const SEVERITY_UNASSESSED_LABEL = '미평가';

export function getSeverityColor(level: number | null | undefined): string {
  if (level == null) return SEVERITY_UNASSESSED_COLOR;
  return SEVERITY_COLOR_BY_LEVEL[level] ?? SEVERITY_UNASSESSED_COLOR;
}

export function getSeverityLabel(level: number | null | undefined): string {
  if (level == null) return SEVERITY_UNASSESSED_LABEL;
  return SEVERITY_LABEL_BY_LEVEL[level] ?? SEVERITY_UNASSESSED_LABEL;
}
