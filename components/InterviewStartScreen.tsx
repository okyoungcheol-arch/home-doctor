'use client';

import { useEffect, useMemo, useState, type DependencyList } from 'react';
import { useRouter } from 'next/navigation';
import type { Member, MedicalRecord } from '@/lib/server/db/schema';
import { normalizePhoneNumber } from '@/lib/phone';
import { getSeverityColor, getSeverityLabel } from '@/lib/severity';

type DisplayRecord = Pick<MedicalRecord, 'id' | 'recordDate' | 'isCritical' | 'notableFindings'>;
type MemberWithSeverity = Member & { latestSeverityLevel: number | null };

function SeverityIndicator({ level }: { level: number | null }) {
  const label = `심각도: ${getSeverityLabel(level)}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: getSeverityColor(level) }}
    />
  );
}
type FetchStatus = 'loading' | 'ready' | 'error';

/**
 * GET 요청 + loading/ready/error 상태 추적을 한 곳에 모은 훅. `deps`는 요청을 다시 보내야 할 때만
 * 바꿔 넘긴다(예: 조회 대상 id) — 마운트 후 안 바뀌는 한 재조회하지 않으므로 로딩 상태로 되돌리는
 * 코드가 따로 필요 없다.
 */
function useJsonFetch<T>(url: string, deps: DependencyList): { data: T | null; status: FetchStatus } {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<FetchStatus>('loading');

  useEffect(() => {
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('조회에 실패했습니다.');
        return response.json();
      })
      .then((json) => {
        setData(json);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, status };
}

function MemberRecordsPanel({
  memberId,
  memberName,
  onClose,
}: {
  memberId: string;
  memberName: string;
  onClose: () => void;
}) {
  const { data, status } = useJsonFetch<{ records: DisplayRecord[] }>(
    `/api/dashboard/records?memberId=${encodeURIComponent(memberId)}`,
    [memberId],
  );
  const records = data?.records ?? [];

  // 사용자가 콤보에서 고른 일자. 아직 안 골랐거나(null) 목록이 바뀌어 더는 존재하지 않는 id면
  // 최신 기록(records[0])으로 대체한다 — 데이터 도착 시점에 state를 동기화하는 effect 없이
  // 매 렌더에서 파생시킨다.
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const effectiveRecordId =
    selectedRecordId && records.some((r) => r.id === selectedRecordId) ? selectedRecordId : (records[0]?.id ?? null);
  const selectedRecord = records.find((r) => r.id === effectiveRecordId) ?? null;

  // 복사 성공/실패 표시를 특정 기록 id에 묶어둔다 — 그래야 "복사됨" 표시가 다른 일자로 바꾼 뒤에도
  // 잘못 남아있지 않는다(매번 effectiveRecordId와 비교해서만 보여줌).
  const [copyState, setCopyState] = useState<{ recordId: string; status: 'copied' | 'error' } | null>(null);

  function handleCopy() {
    if (!selectedRecord) return;
    const dateLabel = new Date(selectedRecord.recordDate).toLocaleDateString('ko-KR');
    const text = `[${memberName}] ${dateLabel} 문진 특이사항\n${selectedRecord.notableFindings ?? '특이사항 없음'}`;
    const recordId = selectedRecord.id;
    if (!navigator.clipboard) {
      setCopyState({ recordId, status: 'error' });
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => setCopyState({ recordId, status: 'copied' }))
      .catch(() => setCopyState({ recordId, status: 'error' }));
  }

  return (
    <div className="flex flex-col gap-3 rounded-8 border border-line-normal bg-background-normal p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{memberName}님 문진 기록</h3>
        <div className="flex items-center gap-2">
          {records.length > 0 && (
            <select
              value={effectiveRecordId ?? ''}
              onChange={(e) => setSelectedRecordId(e.target.value)}
              className="rounded-8 border border-line-normal p-1 text-xs"
            >
              {records.map((record) => (
                <option key={record.id} value={record.id}>
                  {new Date(record.recordDate).toLocaleDateString('ko-KR')}
                </option>
              ))}
            </select>
          )}
          {selectedRecord && (
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-8 border border-line-normal px-2 py-1 text-xs"
            >
              {copyState?.recordId === selectedRecord.id && copyState.status === 'copied' ? '복사됨' : '복사'}
            </button>
          )}
          <button type="button" onClick={onClose} className="text-xs text-label-alternative underline">
            닫기
          </button>
        </div>
      </div>
      {status === 'loading' && <p className="text-sm text-label-alternative">불러오는 중입니다...</p>}
      {status === 'error' && <p className="text-sm text-status-negative">기록을 불러오지 못했습니다.</p>}
      {status === 'ready' && records.length === 0 && (
        <p className="text-sm text-label-alternative">아직 기록이 없습니다.</p>
      )}
      {status === 'ready' && selectedRecord && (
        <div className="rounded-8 border border-line-normal bg-background-elevated p-3 text-sm">
          <div className="mb-2 flex items-center gap-3 text-xs text-label-alternative">
            <span>{new Date(selectedRecord.recordDate).toLocaleDateString('ko-KR')}</span>
            <span>
              중대성 유무:{' '}
              {selectedRecord.isCritical ? (
                <span className="font-medium text-status-negative">있음</span>
              ) : (
                '없음'
              )}
            </span>
          </div>
          <p className="whitespace-pre-wrap">{selectedRecord.notableFindings ?? '특이사항 없음'}</p>
          {copyState?.recordId === selectedRecord.id && copyState.status === 'error' && (
            <p className="mt-2 text-xs text-status-negative">복사에 실패했습니다. 직접 선택해 복사해 주세요.</p>
          )}
        </div>
      )}
    </div>
  );
}

function MemberSelectionList() {
  const router = useRouter();
  const { data, status } = useJsonFetch<{ members: MemberWithSeverity[] }>('/api/dashboard/members', []);
  const members = useMemo(() => data?.members ?? [], [data]);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [viewingRecordsFor, setViewingRecordsFor] = useState<string | null>(null);

  async function handleSelect(memberId: string) {
    setSelectError(null);
    try {
      const response = await fetch('/api/dashboard/select-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? '선택에 실패했습니다.');
      }
      router.push('/');
    } catch (err) {
      setSelectError(err instanceof Error ? err.message : '선택에 실패했습니다.');
    }
  }

  const filteredMembers = useMemo(() => {
    const normalizedNameQuery = query.trim().toLowerCase();
    const normalizedPhoneQuery = normalizePhoneNumber(query);
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(normalizedNameQuery) ||
        member.phoneNumber.includes(normalizedPhoneQuery),
    );
  }, [members, query]);

  return (
    <section className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <h2 className="text-lg font-semibold">회원 선택</h2>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름 또는 전화번호로 검색"
        className="w-full rounded-8 border border-line-normal p-2 text-sm"
      />
      {status === 'loading' && <p className="text-sm text-label-alternative">불러오는 중입니다...</p>}
      {status === 'error' && <p className="text-sm text-status-negative">회원 목록을 불러오지 못했습니다.</p>}
      {status === 'ready' && members.length === 0 && (
        <p className="text-sm text-label-alternative">등록된 회원이 없습니다.</p>
      )}
      {status === 'ready' && members.length > 0 && filteredMembers.length === 0 && (
        <p className="text-sm text-label-alternative">검색 결과가 없습니다.</p>
      )}
      {status === 'ready' && filteredMembers.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-normal">
          {filteredMembers.map((member) => (
            <li key={member.id} className="flex flex-col gap-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{member.name}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelect(member.id)}
                    className="rounded-8 bg-primary-normal px-3 py-1 text-xs font-medium text-static-white"
                  >
                    문진 시작
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setViewingRecordsFor((current) => (current === member.id ? null : member.id))
                    }
                    className="rounded-8 border border-line-normal px-3 py-1 text-xs"
                  >
                    {viewingRecordsFor === member.id ? '기록 닫기' : '기록 보기'}
                  </button>
                  <SeverityIndicator level={member.latestSeverityLevel} />
                </div>
              </div>
              {viewingRecordsFor === member.id && (
                <MemberRecordsPanel
                  memberId={member.id}
                  memberName={member.name}
                  onClose={() => setViewingRecordsFor(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {selectError && <p className="text-sm text-status-negative">{selectError}</p>}
    </section>
  );
}

export function InterviewStartScreen() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <MemberSelectionList />
    </main>
  );
}
