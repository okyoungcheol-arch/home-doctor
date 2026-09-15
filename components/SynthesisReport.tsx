import type { SynthesisReport as SynthesisReportType } from '@/lib/ai/schemas';
import { getSeverityColor, getSeverityLabel } from '@/lib/severity';

export function SynthesisReport({ report }: { report: SynthesisReportType }) {
  return (
    <div className="rounded-16 border-2 border-primary-normal bg-accent-blue-bg p-6 shadow-md">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">종합 소견</h2>
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: getSeverityColor(report.severityLevel) }}
          />
          {getSeverityLabel(report.severityLevel)}
        </span>
      </div>
      <p className="mt-2 text-sm">{report.overallImpression}</p>

      {report.redFlags.length > 0 && (
        <div className="mt-4 rounded-8 bg-accent-red-bg p-3 text-sm text-[var(--atomic-red-30)]">
          <strong>주의 신호:</strong> {report.redFlags.join(', ')}
        </div>
      )}

      <h3 className="mt-4 text-sm font-semibold">가능성 높은 진단</h3>
      <ul className="mt-1 space-y-1">
        {report.topDifferentials.map((d) => (
          <li key={d.condition} className="text-sm">
            {d.condition} — {d.supportingSpecialties.join(', ')} (확신도 {Math.round(d.confidence * 100)}%)
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm font-semibold">권장 조치</h3>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {report.recommendedActions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
    </div>
  );
}
