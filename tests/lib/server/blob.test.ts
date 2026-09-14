import { describe, it, expect, vi, beforeEach } from 'vitest';

const putMock = vi.fn();

vi.mock('@vercel/blob', () => ({
  put: (path: string, data: Buffer, options: unknown) => putMock(path, data, options),
}));

import { uploadSignature } from '@/lib/server/blob';

describe('uploadSignature', () => {
  beforeEach(() => {
    putMock.mockReset();
  });

  it('uploads the image under a signatures/{organizationId}/ path with private access', async () => {
    putMock.mockResolvedValue({ url: 'https://blob.example.com/signatures/org_1/abc.png' });
    const buffer = Buffer.from('fake-png-bytes');

    const url = await uploadSignature('org_1', buffer);

    expect(url).toBe('https://blob.example.com/signatures/org_1/abc.png');
    expect(putMock).toHaveBeenCalledTimes(1);
    const [path, data, options] = putMock.mock.calls[0];
    expect(path).toMatch(/^signatures\/org_1\/[0-9a-f-]+\.png$/);
    expect(data).toBe(buffer);
    expect(options).toEqual({ access: 'private', contentType: 'image/png' });
  });

  it('generates a different path on each call', async () => {
    putMock.mockResolvedValue({ url: 'https://blob.example.com/x.png' });
    const buffer = Buffer.from('fake-png-bytes');

    await uploadSignature('org_1', buffer);
    await uploadSignature('org_1', buffer);

    const [firstPath] = putMock.mock.calls[0];
    const [secondPath] = putMock.mock.calls[1];
    expect(firstPath).not.toBe(secondPath);
  });
});
