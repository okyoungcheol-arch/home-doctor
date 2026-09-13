import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/server/auth/authorize';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { InterviewApp } from '@/components/InterviewApp';

export default async function Home() {
  const viewer = await getViewer();

  if (viewer.role === 'admin') {
    redirect('/admin');
  }

  if (viewer.role === 'manager' && !viewer.activeMemberId) {
    redirect('/dashboard');
  }

  if (viewer.role === 'guest') {
    return <WelcomeScreen />;
  }

  return <InterviewApp />;
}
