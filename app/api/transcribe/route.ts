import { transcribeAudio } from '@/lib/ai/transcription';
import { extractDocumentText } from '@/lib/ai/documentExtraction';
import { isPdf } from '@/lib/ai/fileType';

export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('audio');

  if (!(file instanceof File)) {
    return Response.json({ error: '파일이 필요합니다.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (file.type.startsWith('audio/')) {
      const result = await transcribeAudio(buffer);
      return Response.json({ ...result, kind: 'audio' as const });
    }

    if (file.type.startsWith('image/') || isPdf(file)) {
      const mediaType = isPdf(file) ? 'application/pdf' : file.type;
      const result = await extractDocumentText({ data: buffer, mediaType, filename: file.name });
      return Response.json({ ...result, kind: 'document' as const });
    }

    return Response.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 });
  } catch (error) {
    console.error('transcribe error', error);
    return Response.json({ error: '파일을 텍스트로 변환하지 못했습니다.' }, { status: 502 });
  }
}
