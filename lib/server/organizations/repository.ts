import { asc, eq } from 'drizzle-orm';
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

export async function findMemberById(id: string): Promise<Member | null> {
  const db = getDb();
  const [row] = await db.select().from(members).where(eq(members.id, id));
  return row ?? null;
}
