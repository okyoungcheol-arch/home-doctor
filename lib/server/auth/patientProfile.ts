import { readSession } from './session';
import { findMemberById } from '../organizations/repository';
import type { PatientProfile } from '../../agents/patientProfile';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS, type Gender } from '../../profile/constants';

const VALID_GENDERS: readonly string[] = GENDER_OPTIONS.map((option) => option.value);

function readGender(raw: unknown): Gender | '' {
  return typeof raw === 'string' && VALID_GENDERS.includes(raw) ? (raw as Gender) : '';
}

function readEnumField(raw: unknown, allowed: readonly string[]): string {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? raw : '';
}

export async function getPatientProfile(): Promise<PatientProfile | null> {
  const session = await readSession();
  if (!session || !session.activeMemberId) return null;

  const member = await findMemberById(session.activeMemberId);
  // Defense in depth: /api/dashboard/select-member already refuses to set activeMemberId to a
  // member outside the manager's own organization, so this should never diverge in practice —
  // but re-checking here means a bug or future direct session-state change can't leak another
  // organization's member's ageBand/gender/occupation into this session's AI prompts.
  if (!member || member.organizationId !== session.organizationId) return null;

  return {
    ageBand: readEnumField(member.ageBand, AGE_BANDS),
    gender: readGender(member.gender),
    occupation: readEnumField(member.occupation, OCCUPATIONS),
  };
}
