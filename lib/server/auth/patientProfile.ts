import { readSession } from './session';
import { findMemberInOrganization } from '../organizations/repository';
import type { PatientProfile } from '../../agents/patientProfile';
import { AGE_BANDS, GENDER_VALUES, OCCUPATIONS, type Gender } from '../../profile/constants';

function readEnumField<T extends string>(raw: unknown, allowed: readonly T[]): T | '' {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : '';
}

export async function getPatientProfile(): Promise<PatientProfile | null> {
  const session = await readSession();
  if (!session || session.role !== 'manager' || !session.activeMemberId) return null;

  // findMemberInOrganization scopes the lookup to the session's own organizationId at the DB
  // level, so a member belonging to a different organization comes back as null here exactly
  // like a missing member — no separate org-mismatch check needed in this function.
  const member = await findMemberInOrganization(session.activeMemberId, session.organizationId);
  if (!member) return null;

  return {
    ageBand: readEnumField(member.ageBand, AGE_BANDS),
    gender: readEnumField<Gender>(member.gender, GENDER_VALUES),
    occupation: readEnumField(member.occupation, OCCUPATIONS),
  };
}
