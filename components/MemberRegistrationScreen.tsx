'use client';

import { useRef, useState, type FormEvent } from 'react';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS, type Gender } from '@/lib/profile/constants';
import { formatPhoneNumber } from '@/lib/phone';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';

const CONSENT_TEXT = `개인정보 수집·이용 동의서

1. 수집 항목: 이름, 전화번호, 성별, 연령대, 직업, 서명 이미지
2. 수집 목적: AI 문진 서비스 제공 및 상담 기록 관리
3. 보유 및 이용 기간: 회원 탈퇴 또는 삭제 요청 시까지
4. 귀하는 개인정보 수집·이용에 동의하지 않을 권리가 있습니다. 다만 위 항목은 서비스 제공을
   위한 필수 정보로, 동의하지 않으실 경우 회원 등록이 제한됩니다.

위 내용에 동의하시면 아래에 서명해 주세요.`;

export function MemberRegistrationScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [ageBand, setAgeBand] = useState('');
  const [occupation, setOccupation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const signaturePadRef = useRef<SignaturePadHandle>(null);

  function handleNext(event: FormEvent) {
    event.preventDefault();
    setStep(2);
  }

  function handleBack() {
    setStep(1);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      setError('서명을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setSuccess(false);
    try {
      const signatureImage = signaturePadRef.current.toDataURL();
      const response = await fetch('/api/dashboard/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phoneNumber, gender, ageBand, occupation, signatureImage }),
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
      signaturePadRef.current.clear();
      setStep(1);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 1) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-bold">회원 등록</h1>
        <form
          onSubmit={handleNext}
          className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
        >
          <label className="flex flex-col gap-1 text-sm">
            이름
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-8 border border-line-normal p-2 text-sm"
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
              className="w-full rounded-8 border border-line-normal p-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            연령대
            <select
              value={ageBand}
              onChange={(e) => setAgeBand(e.target.value)}
              required
              className="w-full rounded-8 border border-line-normal p-2 text-sm"
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
              className="w-full rounded-8 border border-line-normal p-2 text-sm"
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
              className="w-full rounded-8 border border-line-normal p-2 text-sm"
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
            className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white"
          >
            다음
          </button>
          {success && (
            <p className="text-sm text-status-positive">등록되었습니다. 이어서 다른 회원을 등록할 수 있습니다.</p>
          )}
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">개인정보 동의 및 서명</h1>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
      >
        <div className="whitespace-pre-wrap rounded-8 border border-line-normal bg-background-normal p-3 text-sm">
          {CONSENT_TEXT}
        </div>
        <SignaturePad ref={signaturePadRef} />
        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={() => signaturePadRef.current?.clear()}
            className="rounded-8 border border-line-normal px-4 py-2 text-sm font-medium"
          >
            지우기
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="rounded-8 border border-line-normal px-4 py-2 text-sm font-medium"
            >
              이전
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
            >
              등록
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-status-negative">{error}</p>}
      </form>
    </main>
  );
}
