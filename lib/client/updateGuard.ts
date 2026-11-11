'use client';

import { useEffect } from 'react';

// 새 배포가 감지됐을 때 자동 새로고침을 해도 되는지 판단하기 위한 전역 표시(브라우저 전용).
// 새로고침하면 메모리에만 있는 작업(진행 중인 문진, 방금 한 녹음 등)이 사라지므로, 그런 작업을
// 들고 있는 컴포넌트가 `useBlockAutoUpdate(true)`로 "지금은 안 됨"을 알린다.
let blockers = 0;

export function useBlockAutoUpdate(active: boolean) {
  useEffect(() => {
    if (!active) return;
    blockers += 1;
    return () => {
      blockers -= 1;
    };
  }, [active]);
}

// 사용자가 입력해 둔 폼 값(회원 등록 등)이 있는지 — 컴포넌트마다 표시를 달지 않아도 잡히도록
// DOM에서 직접 확인한다.
function hasUnsavedFormInput(): boolean {
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input, textarea, select',
  );
  for (const field of fields) {
    if (field instanceof HTMLSelectElement) {
      if (Array.from(field.options).some((option) => option.selected !== option.defaultSelected)) return true;
    } else if (field instanceof HTMLInputElement && field.type === 'file') {
      if (field.files && field.files.length > 0) return true;
    } else if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
      if (field.checked !== field.defaultChecked) return true;
    } else if (field.value !== field.defaultValue) {
      return true;
    }
  }
  return false;
}

export function isAutoUpdateSafe(): boolean {
  return blockers === 0 && !hasUnsavedFormInput();
}
