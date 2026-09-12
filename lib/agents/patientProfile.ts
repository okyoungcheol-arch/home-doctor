import { GENDER_OPTIONS, type Gender } from '../profile/constants';

export type PatientProfile = {
  ageBand: string;
  gender: Gender | '';
  occupation: string;
};

function genderLabel(gender: Gender | ''): string {
  return GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? '';
}

export function formatPatientProfileLine(profile: PatientProfile | null): string {
  if (!profile) return '';

  const parts: string[] = [];
  if (profile.ageBand) parts.push(`연령대 ${profile.ageBand}`);
  const label = genderLabel(profile.gender);
  if (label) parts.push(`성별 ${label}`);
  if (profile.occupation) parts.push(`직업 ${profile.occupation}`);

  if (parts.length === 0) return '';
  return `환자 기본정보: ${parts.join(', ')}\n\n`;
}
