'use client';

import { useState, type FormEvent } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS, type Gender } from '@/lib/profile/constants';

export function CompleteProfileForm() {
  const { user } = useUser();
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [ageBand, setAgeBand] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [occupation, setOccupation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      await user.update({
        unsafeMetadata: { ...user.unsafeMetadata, phoneNumber, ageBand, gender, occupation },
      });
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">기본 정보 입력</h1>
      <p className="text-sm text-label-alternative">
        문진에 활용할 기본 정보를 입력해주세요. 로그인에는 사용되지 않습니다.
      </p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
      >
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
          저장
        </button>
        {error && <p className="text-sm text-status-negative">{error}</p>}
      </form>
    </main>
  );
}
