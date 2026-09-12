import { currentUser } from '@clerk/nextjs/server';
import type { PatientProfile } from '../../agents/patientProfile';
import type { Gender } from '../../profile/constants';

const VALID_GENDERS: readonly string[] = ['male', 'female', 'unspecified'];

function readMetadata(unsafeMetadata: unknown): Record<string, unknown> {
  return (unsafeMetadata ?? {}) as Record<string, unknown>;
}

function readGender(metadata: Record<string, unknown>): Gender | '' {
  const raw = metadata.gender;
  return typeof raw === 'string' && VALID_GENDERS.includes(raw) ? (raw as Gender) : '';
}

export async function getPatientProfile(): Promise<PatientProfile | null> {
  const user = await currentUser();
  if (!user) return null;

  const metadata = readMetadata(user.unsafeMetadata);
  return {
    ageBand: typeof metadata.ageBand === 'string' ? metadata.ageBand : '',
    gender: readGender(metadata),
    occupation: typeof metadata.occupation === 'string' ? metadata.occupation : '',
  };
}

export function isProfileComplete(user: { unsafeMetadata?: unknown } | null | undefined): boolean {
  if (!user) return false;
  const metadata = readMetadata(user.unsafeMetadata);

  const phoneNumber = typeof metadata.phoneNumber === 'string' ? metadata.phoneNumber.trim() : '';
  const ageBand = typeof metadata.ageBand === 'string' ? metadata.ageBand.trim() : '';
  const occupation = typeof metadata.occupation === 'string' ? metadata.occupation.trim() : '';
  const gender = readGender(metadata);

  return phoneNumber.length > 0 && ageBand.length > 0 && occupation.length > 0 && gender !== '';
}
