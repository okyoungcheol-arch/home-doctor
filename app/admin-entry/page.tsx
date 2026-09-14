import { PhoneEntryForm } from '@/components/PhoneEntryForm';

export default function AdminEntryPage() {
  return (
    <PhoneEntryForm
      title="관리자 입장"
      description="등록된 관리자 전화번호를 입력해주세요."
      apiPath="/api/admin-entry"
      redirectPath="/admin"
    />
  );
}
