import type { SpecialistOpinion } from '@/lib/ai/schemas';

export type QueuedQuestion = {
  id: string;
  question: string;
  options: string[];
  reason: string;
  askedBy: { specialtyId: string; specialtyName: string }[];
};

export function normalize(text: string): string {
  return text.replace(/[\s.,?!~()]/g, '').toLowerCase();
}

export function isSimilar(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

export function mergeQuestions(
  opinions: Pick<SpecialistOpinion, 'specialtyId' | 'specialtyName' | 'followUpQuestions'>[],
): QueuedQuestion[] {
  const merged: QueuedQuestion[] = [];

  for (const opinion of opinions) {
    for (const followUp of opinion.followUpQuestions) {
      const normalized = normalize(followUp.question);
      const existing = merged.find((item) => isSimilar(normalize(item.question), normalized));

      if (existing) {
        existing.askedBy.push({ specialtyId: opinion.specialtyId, specialtyName: opinion.specialtyName });
      } else {
        merged.push({
          id: globalThis.crypto.randomUUID(),
          question: followUp.question,
          options: followUp.options,
          reason: followUp.reason,
          askedBy: [{ specialtyId: opinion.specialtyId, specialtyName: opinion.specialtyName }],
        });
      }
    }
  }

  return merged;
}
