import type { SpecialistOpinion } from '@/lib/ai/schemas';

export function SpecialistCard({ opinion }: { opinion: SpecialistOpinion }) {
  return (
    <div className="rounded-12 border border-line-normal bg-background-elevated p-4 shadow-sm">
      <h3 className="font-semibold">{opinion.specialtyName}</h3>
      <ul className="mt-2 space-y-2">
        {opinion.suspectedConditions.map((condition) => (
          <li key={condition.name} className="text-sm">
            <span className="font-medium">{condition.name}</span>
            <span className="ml-2 text-label-alternative">확신도 {Math.round(condition.confidence * 100)}%</span>
            <p className="text-label-neutral">{condition.rationale}</p>
          </li>
        ))}
      </ul>
      {opinion.precautions && opinion.precautions.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line-normal pt-2">
          {opinion.precautions.map((precaution) => (
            <li key={precaution} className="text-sm text-label-neutral">
              · {precaution}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
