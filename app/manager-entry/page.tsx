import { PhoneEntryForm } from '@/components/PhoneEntryForm';

export default function ManagerEntryPage() {
  return (
    <PhoneEntryForm
      title="매니저 입장"
      description="등록된 전화번호를 입력해주세요."
      apiPath="/api/manager-entry"
      redirectPath="/dashboard"
    />
  );
}
