'use client';

import { useState, type FormEvent } from 'react';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS, type Gender } from '@/lib/profile/constants';
import { formatPhoneNumber } from '@/lib/phone';

export function MemberRegistrationScreen() {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [ageBand, setAgeBand] = useState('');
  const [occupation, setOccupation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
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
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">회원 등록</h1>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
      >
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
            onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
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
        {success && (
          <p className="text-sm text-status-positive">등록되었습니다. 이어서 다른 회원을 등록할 수 있습니다.</p>
        )}
        {error && <p className="text-sm text-status-negative">{error}</p>}
      </form>
    </main>
  );
}
