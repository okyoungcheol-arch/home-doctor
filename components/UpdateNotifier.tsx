'use client';

import { useEffect, useState } from 'react';
import { isAutoUpdateSafe } from '@/lib/client/updateGuard';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
// 자동 새로고침을 시도한 버전을 적어둔다 — 새로고침 뒤에도 옛 화면이 다시 뜨는 경우(캐시 등)에
// 무한 새로고침에 빠지지 않고 배너로 물러나기 위함이다.
const ATTEMPTED_KEY = 'hd_update_attempted';

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

function alreadyAttempted(version: string): boolean {
  try {
    return window.sessionStorage.getItem(ATTEMPTED_KEY) === version;
  } catch {
    return false;
  }
}

function markAttempted(version: string): boolean {
  try {
    window.sessionStorage.setItem(ATTEMPTED_KEY, version);
    return true;
  } catch {
    // 저장소를 못 쓰면 무한 새로고침을 막을 방법이 없으므로 자동 새로고침을 하지 않는다
    return false;
  }
}

/**
 * 새 배포가 올라오면 화면을 최신 버전으로 바꾼다. 서비스 워커가 없으므로 새로고침만 하면 최신
 * 버전이 로드되지만, 홈 화면에 설치된 앱은 주소창/새로고침 버튼이 없고 며칠씩 닫히지 않아 옛
 * 화면이 계속 남는다.
 *
 * - 앱을 열었을 때(마운트)와 다시 꺼냈을 때(백그라운드 → 포그라운드): 진행 중인 작업이 없으면
 *   자동으로 새로고침한다.
 * - 진행 중인 문진·입력해 둔 폼이 있거나, 화면을 켜둔 채 주기 확인에서 발견된 경우: 작업이
 *   사라지지 않도록 "업데이트" 배너만 띄우고 사용자가 누를 때 새로고침한다.
 *
 * `loadedVersion`은 이 화면을 렌더링한 배포의 식별자다(`app/layout.tsx`가 넣어준다).
 */
export function UpdateNotifier({ loadedVersion }: { loadedVersion: string }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check(allowAutoReload: boolean) {
      if (document.visibilityState !== 'visible') return;
      const version = await fetchVersion();
      if (cancelled || !version || version === loadedVersion) return;

      if (allowAutoReload && isAutoUpdateSafe() && !alreadyAttempted(version) && markAttempted(version)) {
        window.location.reload();
        return;
      }
      setUpdateAvailable(true);
    }

    const onVisibilityChange = () => void check(true);
    void check(true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    // 켜둔 채로 두는 기기를 위한 주기 확인 — 보고 있는 화면이 갑자기 바뀌지 않도록 배너만 띄운다.
    const timer = window.setInterval(() => void check(false), CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [loadedVersion]);

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
