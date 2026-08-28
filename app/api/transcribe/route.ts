import { transcribeAudio } from '@/lib/ai/transcription';

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('audio');

  if (!(file instanceof File)) {
    return Response.json({ error: 'audio 파일이 필요합니다.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await transcribeAudio(buffer);
    return Response.json(result);
  } catch (error) {
    console.error('transcribe error', error);
    return Response.json({ error: '음성을 텍스트로 변환하지 못했습니다.' }, { status: 502 });
  }
}
