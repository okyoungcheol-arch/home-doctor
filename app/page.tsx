import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { getViewer } from '@/lib/server/auth/authorize';
import { isProfileComplete } from '@/lib/server/auth/patientProfile';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { InterviewApp } from '@/components/InterviewApp';

export default async function Home() {
  const viewer = await getViewer();

  if (viewer.role === 'guest') {
    return <WelcomeScreen />;
  }

  // Login uses email, not phone (Clerk's phone identifier is a paid-plan feature — see
  // Global Constraints). Phone number, age band, gender, and occupation are collected
  // separately into unsafeMetadata right after signup, so every signed-in viewer must have
  // all four before reaching the app itself.
  const user = await currentUser();
  if (!isProfileComplete(user)) {
    redirect('/complete-profile');
  }

  if (viewer.role === 'manager') {
    redirect('/dashboard');
  }
  if (viewer.role === 'admin') {
    redirect('/admin');
  }

  return <InterviewApp />;
}
