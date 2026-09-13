import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import {
  managers,
  members,
  organizations,
  type Manager,
  type Member,
  type NewManager,
  type NewMember,
  type Organization,
} from '@/lib/server/db/schema';

export async function findManagerByPhoneNumber(phoneNumber: string): Promise<Manager | null> {
  const db = getDb();
  const [row] = await db.select().from(managers).where(eq(managers.phoneNumber, phoneNumber));
  return row ?? null;
}

export async function createOrganization(name: string): Promise<Organization> {
  const db = getDb();
  const [row] = await db.insert(organizations).values({ name }).returning();
  return row;
}

export async function listOrganizations(): Promise<Organization[]> {
  const db = getDb();
  return db.select().from(organizations).orderBy(asc(organizations.name));
}

export async function createManager(input: NewManager): Promise<Manager> {
  const db = getDb();
  const [row] = await db.insert(managers).values(input).returning();
  return row;
}

export async function createMember(input: NewMember): Promise<Member> {
  const db = getDb();
  const [row] = await db.insert(members).values(input).returning();
  return row;
}

export async function listMembersForOrganization(organizationId: string): Promise<Member[]> {
  const db = getDb();
  return db
    .select()
    .from(members)
    .where(eq(members.organizationId, organizationId))
    .orderBy(asc(members.name));
}

/**
 * id로 회원을 조회하되, 그 회원이 `organizationId`(호출자의 소속단체)에 속하지 않으면 존재하지
 * 않는 것과 동일하게 `null`을 반환한다. 다른 단체 소속 회원 id를 넘겨 조회를 시도해도 단체 경계를
 * 넘어 정보가 새지 않도록, DB 쿼리 자체를 두 조건으로 제한한다(조회 후 JS에서 비교하지 않음).
 * 회원 조회가 필요한 모든 곳(문진 프로필 조회, 회원 선택, 문진 저장)이 이 함수 하나를 공유한다.
 */
export async function findMemberInOrganization(
  id: string,
  organizationId: string,
): Promise<Member | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, id), eq(members.organizationId, organizationId)));
  return row ?? null;
}
