import { runSynthesis } from '@/lib/agents/synthesize';

export async function POST(request: Request) {
  const body = await request.json();
  const opinions = Array.isArray(body.opinions) ? body.opinions : [];

  if (opinions.length === 0) {
    return Response.json({ error: 'opinions가 필요합니다.' }, { status: 400 });
  }

  const report = await runSynthesis(opinions);
  return Response.json({ report });
}
