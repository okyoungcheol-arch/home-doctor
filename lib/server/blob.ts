import { put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

export async function uploadSignature(organizationId: string, image: Buffer): Promise<string> {
  const blob = await put(`signatures/${organizationId}/${randomUUID()}.png`, image, {
    access: 'private',
    contentType: 'image/png',
  });
  return blob.url;
}
