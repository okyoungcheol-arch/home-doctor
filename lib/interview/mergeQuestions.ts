import type { SpecialistOpinion } from '@/lib/ai/schemas';

export type QueuedQuestion = {
  id: string;
  question: string;
  reason: string;
  askedBy: { specialtyId: string; specialtyName: string }[];
};

function normalize(text: string): string {
  return text.replace(/[\s.,?!~()]/g, '').toLowerCase();
}

export function mergeQuestions(
  opinions: Pick<SpecialistOpinion, 'specialtyId' | 'specialtyName' | 'followUpQuestions'>[],
): QueuedQuestion[] {
  const merged: QueuedQuestion[] = [];

  for (const opinion of opinions) {
    for (const followUp of opinion.followUpQuestions) {
      const normalized = normalize(followUp.question);
      const existing = merged.find((item) => {
        const itemNormalized = normalize(item.question);
        return (
          itemNormalized === normalized ||
          itemNormalized.includes(normalized) ||
          normalized.includes(itemNormalized)
        );
      });

      if (existing) {
        existing.askedBy.push({ specialtyId: opinion.specialtyId, specialtyName: opinion.specialtyName });
      } else {
        merged.push({
          id: globalThis.crypto.randomUUID(),
          question: followUp.question,
          reason: followUp.reason,
          askedBy: [{ specialtyId: opinion.specialtyId, specialtyName: opinion.specialtyName }],
        });
      }
    }
  }

  return merged;
}
