import 'dotenv/config';
import { clerkClient } from '@clerk/nextjs/server';

async function main() {
  // Login identifier is email, not phone (Clerk's phone identifier is Pro-plan only —
  // see Global Constraints), so admin lookup is by email too.
  const email = process.argv[2];
  if (!email) {
    console.error('사용법: npm run seed:admin -- admin@example.com');
    process.exit(1);
  }

  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ emailAddress: [email] });
  const user = users[0];

  if (!user) {
    console.error(`이메일 ${email}로 가입된 사용자를 찾을 수 없습니다. 먼저 회원가입을 완료하세요.`);
    process.exit(1);
  }

  await client.users.updateUserMetadata(user.id, {
    publicMetadata: { role: 'admin' },
  });

  console.log(`사용자 ${user.id}를 admin으로 지정했습니다.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
