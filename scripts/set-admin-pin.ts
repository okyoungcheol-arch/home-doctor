import 'dotenv/config';
import { setAdminPinByPhoneNumber } from '../lib/server/admins/repository';

async function main() {
  const phoneNumber = process.argv[2];
  const pin = process.argv[3];
  if (!phoneNumber || !pin) {
    console.error('사용법: npm run set-admin-pin -- <전화번호> <PIN>');
    console.error('  이미 seed:admin으로 등록된 관리자 계정에만 적용됩니다. PIN은 해시로 저장됩니다.');
    process.exit(1);
  }

  const admin = await setAdminPinByPhoneNumber(phoneNumber, pin);
  if (!admin) {
    console.error(`등록된 관리자를 찾을 수 없습니다: ${phoneNumber}`);
    process.exit(1);
  }
  console.log(`${admin.name}(${admin.phoneNumber}) 관리자에 PIN을 설정했습니다.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
