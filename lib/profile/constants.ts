export const AGE_BANDS = [
  '10세 미만',
  '10~14세',
  '15~19세',
  '20~24세',
  '25~29세',
  '30~34세',
  '35~39세',
  '40~44세',
  '45~49세',
  '50~54세',
  '55~59세',
  '60~64세',
  '65~69세',
  '70~74세',
  '75~79세',
  '80~84세',
  '85~89세',
  '90세 이상',
] as const;

export type Gender = 'male' | 'female' | 'unspecified';

export const GENDER_OPTIONS: ReadonlyArray<{ value: Gender; label: string }> = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'unspecified', label: '응답 안 함' },
];

export const OCCUPATIONS = [
  '농업',
  '자영업',
  '회사원/직장인',
  '주부',
  '학생',
  '무직/은퇴',
  '기타',
] as const;
