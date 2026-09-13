import { transcribeAudio } from '@/lib/ai/transcription';
import { extractDocumentText } from '@/lib/ai/documentExtraction';

export const maxDuration = 60;

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const documents = formData.getAll('documents').filter((entry): entry is File => entry instanceof File).slice(0, 2);
  const audioEntry = formData.get('audio');
  const audio = audioEntry instanceof File ? audioEntry : null;

  if (documents.length === 0 && !audio) {
    return Response.json({ error: '파일 또는 녹음이 필요합니다.' }, { status: 400 });
  }

  try {
    const documentTexts: string[] = [];
    for (const file of documents) {
      const isImage = file.type.startsWith('image/');
      if (!isImage && !isPdf(file)) {
        return Response.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const mediaType = isPdf(file) ? 'application/pdf' : file.type;
      const result = await extractDocumentText({ data: buffer, mediaType, filename: file.name });
      documentTexts.push(result.text);
    }

    let recordingText: string | null = null;
    if (audio) {
      if (!audio.type.startsWith('audio/')) {
        return Response.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 });
      }
      const buffer = Buffer.from(await audio.arrayBuffer());
      const result = await transcribeAudio(buffer);
      recordingText = result.text;
    }

    const sections: string[] = documentTexts.map((text, index) => `[문서 ${index + 1}]\n${text}`);
    if (recordingText !== null) {
      sections.push(`[음성 녹음]\n${recordingText}`);
    }
    const combinedTranscript = sections.join('\n\n');

    return Response.json({ documentTexts, recordingText, combinedTranscript });
  } catch (error) {
    console.error('intake error', error);
    return Response.json({ error: '파일을 텍스트로 변환하지 못했습니다.' }, { status: 502 });
  }
}
