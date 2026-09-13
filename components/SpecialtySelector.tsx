'use client';

import { useState } from 'react';

export type TriageSpecialty = { id: string; name: string; reason: string };

type SpecialtySelectorProps = {
  specialties: TriageSpecialty[];
  onConfirm: (selectedIds: string[]) => void;
};

export function SpecialtySelector({ specialties, onConfirm }: SpecialtySelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(specialties.map((s) => s.id)));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">의심되는 증상을 확인해주세요</h2>
        <p className="text-sm text-label-alternative">
          분석 결과 다음의 증상이 의심되며, 해당 전문분야의 전문의를 추천드립니다. 포함하지 않을 분야는 체크를 해제하세요.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {specialties.map((s) => (
          <label key={s.id} className="flex items-start gap-3 rounded-8 border border-line-normal p-3">
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block font-medium">{s.reason}</span>
              <span className="block text-sm text-label-neutral">{s.name}</span>
            </span>
          </label>
        ))}
      </div>

      {selected.size === 0 && (
        <p className="text-sm text-status-negative">최소 한 개 이상의 전문분야를 선택해주세요.</p>
      )}

      <button
        type="button"
        onClick={() => onConfirm(Array.from(selected))}
        disabled={selected.size === 0}
        className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
      >
        문진 시작
      </button>
    </div>
  );
}
