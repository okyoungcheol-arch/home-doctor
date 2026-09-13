'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Member } from '@/lib/server/db/schema';
import type { MedicalRecordWithMemberName } from '@/lib/server/records/repository';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS, type Gender } from '@/lib/profile/constants';

type DisplayRecord = Pick<
  MedicalRecordWithMemberName,
  'id' | 'recordDate' | 'memberName' | 'isCritical' | 'notableFindings'
>;

function MemberRegistrationForm({ onRegistered }: { onRegistered: () => void }) {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [ageBand, setAgeBand] = useState('');
  const [occupation, setOccupation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboard/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phoneNumber, gender, ageBand, occupation }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? '등록에 실패했습니다.');
      }
      setName('');
      setPhoneNumber('');
      setGender('');
      setAgeBand('');
      setOccupation('');
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold">회원 등록</h2>
      <label className="flex flex-col gap-1 text-sm">
        이름
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        전화번호
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="010-1234-5678"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        연령대
        <select
          value={ageBand}
          onChange={(e) => setAgeBand(e.target.value)}
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        >
          <option value="" disabled>
            선택해주세요
          </option>
          {AGE_BANDS.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        성별
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as Gender)}
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        >
          <option value="" disabled>
            선택해주세요
          </option>
          {GENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        직업
        <select
          value={occupation}
          onChange={(e) => setOccupation(e.target.value)}
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        >
          <option value="" disabled>
            선택해주세요
          </option>
          {OCCUPATIONS.map((job) => (
            <option key={job} value={job}>
              {job}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
      >
        등록
      </button>
      {error && <p className="text-sm text-status-negative">{error}</p>}
    </form>
  );
}

function MemberSelectionList() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectError, setSelectError] = useState<string | null>(null);

  function refreshMembers() {
    fetch('/api/dashboard/members')
      .then((response) => {
        if (!response.ok) throw new Error('조회에 실패했습니다.');
        return response.json();
      })
      .then((data) => {
        setMembers(data.members);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }

  useEffect(() => {
    refreshMembers();
  }, []);

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

  return (
    <section className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <h2 className="text-lg font-semibold">회원 선택</h2>
      {status === 'loading' && <p className="text-sm text-label-alternative">불러오는 중입니다...</p>}
      {status === 'error' && <p className="text-sm text-status-negative">회원 목록을 불러오지 못했습니다.</p>}
      {status === 'ready' && members.length === 0 && (
        <p className="text-sm text-label-alternative">등록된 회원이 없습니다.</p>
      )}
      {status === 'ready' && members.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-normal">
          {members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => handleSelect(member.id)}
                className="w-full py-2 text-left text-sm hover:text-primary-normal"
              >
                {member.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectError && <p className="text-sm text-status-negative">{selectError}</p>}
    </section>
  );
}

export function ManagerDashboard() {
  const [records, setRecords] = useState<DisplayRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [membersRefreshKey, setMembersRefreshKey] = useState(0);

  useEffect(() => {
    fetch('/api/dashboard/records')
      .then((response) => {
        if (!response.ok) throw new Error('조회에 실패했습니다.');
        return response.json();
      })
      .then((data) => {
        setRecords(data.records);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <MemberRegistrationForm onRegistered={() => setMembersRefreshKey((key) => key + 1)} />
      <MemberSelectionList key={membersRefreshKey} />
      <RecordsTable records={records} status={status} />
    </main>
  );
}

function RecordsTable({
  records,
  status,
}: {
  records: DisplayRecord[];
  status: 'loading' | 'ready' | 'error';
}) {
  if (status === 'loading') return <p className="p-6 text-sm text-label-alternative">불러오는 중입니다...</p>;
  if (status === 'error') return <p className="p-6 text-sm text-status-negative">데이터를 불러오지 못했습니다.</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">소속단체 문진 기록</h1>
      {records.length === 0 ? (
        <p className="text-sm text-label-alternative">아직 기록이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-12 border border-line-normal bg-background-elevated shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line-normal">
                <th className="p-3">일자</th>
                <th className="p-3">회원명</th>
                <th className="p-3">중대성 유무</th>
                <th className="p-3">특이사항</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-line-normal last:border-0">
                  <td className="p-3">{new Date(record.recordDate).toLocaleDateString('ko-KR')}</td>
                  <td className="p-3">{record.memberName}</td>
                  <td className="p-3">
                    {record.isCritical ? (
                      <span className="text-status-negative font-medium">있음</span>
                    ) : (
                      '없음'
                    )}
                  </td>
                  <td className="p-3">{record.notableFindings ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
