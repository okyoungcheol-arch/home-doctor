import 'dotenv/config';
import { createAdmin } from '../lib/server/admins/repository';

const POSTGRES_UNIQUE_VIOLATION = '23505';

async function main() {
  const phoneNumber = process.argv[2];
  const name = process.argv[3];
  if (!phoneNumber || !name) {
    console.error('사용법: npm run seed:admin -- <전화번호> <이름>');
    process.exit(1);
  }

  try {
    const admin = await createAdmin({ phoneNumber, name });
    console.log(`관리자 ${admin.name}(${admin.phoneNumber})을 등록했습니다.`);
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
      console.error(`이미 등록된 전화번호입니다: ${phoneNumber}`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
