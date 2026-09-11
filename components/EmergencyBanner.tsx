export function EmergencyBanner({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-12 border-2 border-status-negative bg-accent-red-bg p-4 text-[var(--atomic-red-30)]">
      <span
        aria-hidden="true"
        className="h-3 w-3 flex-shrink-0 animate-pulse rounded-full bg-status-negative"
      />
      <p className="flex-1 text-sm font-medium">
        응급 신호가 감지되었습니다: {flags.join(', ')}. 즉시 119 또는 응급실을 방문하세요.
      </p>
      <a
        href="tel:119"
        className="flex-shrink-0 rounded-full bg-status-negative px-4 py-2 text-sm font-semibold text-static-white"
      >
        119 전화하기
      </a>
    </div>
  );
}
