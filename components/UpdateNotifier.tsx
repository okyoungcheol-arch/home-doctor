'use client';

import { useEffect, useState } from 'react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function fetchVersion(): Promise<string | null> {
  try {
    const response = await fetch('/api/version', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    // 오프라인 등 — 다음 확인 때 다시 시도한다
    return null;
  }
}

/**
 * 화면이 열린 뒤 새 배포가 올라오면 "업데이트" 배너를 띄운다. 서비스 워커가 없으므로 새로고침만
 * 하면 최신 버전이 로드되지만, 홈 화면에 설치된 앱은 주소창/새로고침 버튼이 없고 며칠씩 닫히지
 * 않아 옛 화면이 계속 남는다 — 그래서 직접 누를 수 있는 버튼을 제공한다. 진행 중인 문진이
 * 사라지지 않도록 자동으로 새로고침하지는 않는다.
 */
export function UpdateNotifier() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let loadedVersion: string | null = null;
    let cancelled = false;

    async function check() {
      if (document.visibilityState !== 'visible') return;
      const version = await fetchVersion();
      if (cancelled || !version) return;
      if (loadedVersion === null) {
        // 첫 응답을 "이 화면이 로드된 버전"으로 삼는다.
        loadedVersion = version;
      } else if (version !== loadedVersion) {
        setUpdateAvailable(true);
      }
    }

    void check();
    // 앱을 다시 꺼냈을 때(백그라운드 → 포그라운드) 바로 확인하고, 켜둔 채로 두는 기기를 위해
    // 주기적으로도 확인한다.
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(timer);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 bg-primary-normal px-4 py-3 text-sm text-static-white shadow-lg"
    >
      <span>새 버전이 배포되었습니다.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-8 bg-static-white px-3 py-1.5 text-sm font-medium text-primary-normal"
      >
        업데이트
      </button>
    </div>
  );
}
