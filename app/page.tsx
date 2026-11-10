import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/server/auth/authorize';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { InterviewApp } from '@/components/InterviewApp';

export default async function Home() {
  const viewer = await getViewer();

  if (viewer.role === 'guest') {
    return <WelcomeScreen />;
  }

  // 회원을 선택한 상태(매니저, 또는 매니저 권한으로 행동 중인 관리자)면 그 회원 명의로 문진한다.
  if (viewer.activeMemberId) {
    return <InterviewApp canSave />;
  }

  redirect(viewer.role === 'admin' ? '/admin' : '/dashboard');
}
