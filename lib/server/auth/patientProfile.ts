import { currentUser } from '@clerk/nextjs/server';
import type { PatientProfile } from '../../agents/patientProfile';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS, type Gender } from '../../profile/constants';

const VALID_GENDERS: readonly string[] = GENDER_OPTIONS.map((option) => option.value);

function readMetadata(unsafeMetadata: unknown): Record<string, unknown> {
  return (unsafeMetadata ?? {}) as Record<string, unknown>;
}

function readGender(metadata: Record<string, unknown>): Gender | '' {
  const raw = metadata.gender;
  return typeof raw === 'string' && VALID_GENDERS.includes(raw) ? (raw as Gender) : '';
}

function readEnumField(metadata: Record<string, unknown>, key: string, allowed: readonly string[]): string {
  const raw = metadata[key];
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? raw : '';
}

export async function getPatientProfile(): Promise<PatientProfile | null> {
  const user = await currentUser();
  if (!user) return null;

  const metadata = readMetadata(user.unsafeMetadata);
  return {
    ageBand: readEnumField(metadata, 'ageBand', AGE_BANDS),
    gender: readGender(metadata),
    occupation: readEnumField(metadata, 'occupation', OCCUPATIONS),
  };
}

export function isProfileComplete(user: { unsafeMetadata?: unknown } | null | undefined): boolean {
  if (!user) return false;
  const metadata = readMetadata(user.unsafeMetadata);

  const phoneNumber = typeof metadata.phoneNumber === 'string' ? metadata.phoneNumber.trim() : '';
  const ageBand = readEnumField(metadata, 'ageBand', AGE_BANDS);
  const occupation = readEnumField(metadata, 'occupation', OCCUPATIONS);
  const gender = readGender(metadata);

  return phoneNumber.length > 0 && ageBand.length > 0 && occupation.length > 0 && gender !== '';
}
