'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIPhoneOrIPod = /iphone|ipod/i.test(ua);
  const isIPadUA = /ipad/i.test(ua);
  const isIPadOs13Plus = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return isIPhoneOrIPod || isIPadUA || isIPadOs13Plus;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as NavigatorWithStandalone;
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    // These must run client-side only, after hydration: window/navigator don't exist during
    // SSR, so both helpers return false there — computing them during render (even via a lazy
    // useState initializer) would make the client's first hydration pass disagree with the
    // server-rendered HTML whenever the app actually is already installed, causing a real
    // hydration mismatch. Deferring to this effect keeps the first paint SSR-safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(isStandalone());
    setIosDevice(isIosDevice());

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (installed) return null;
  if (!deferredPrompt && !iosDevice) return null;

  async function handleClick() {
    if (iosDevice && !deferredPrompt) {
      setShowIosHelp((prev) => !prev);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        className="rounded-8 bg-fill-normal px-3 py-1.5 text-sm"
      >
        설치
      </button>

      {showIosHelp && (
        <div className="absolute right-0 z-10 mt-2 w-64 rounded-8 border border-line-normal bg-background-elevated p-3 text-xs text-label-neutral shadow-md">
          Safari 하단의 공유 버튼을 누른 뒤 &quot;홈 화면에 추가&quot;를 선택하세요.
        </div>
      )}
    </div>
  );
}
