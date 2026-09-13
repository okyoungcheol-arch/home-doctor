import { transcribeAudio } from '@/lib/ai/transcription';
import { extractDocumentText } from '@/lib/ai/documentExtraction';
import { isPdf } from '@/lib/ai/fileType';

export const maxDuration = 60;

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10MB — 처방전/소견서 이미지·PDF 1건당
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB — 문진 녹음 1건

export async function POST(request: Request) {
  const formData = await request.formData();
  const documents = formData.getAll('documents').filter((entry): entry is File => entry instanceof File).slice(0, 2);
  const audioEntry = formData.get('audio');
  const audio = audioEntry instanceof File ? audioEntry : null;

  if (documents.length === 0 && !audio) {
    return Response.json({ error: '파일 또는 녹음이 필요합니다.' }, { status: 400 });
  }

  // 크기/형식 검증은 AI 호출(비용 발생) 전에 전부 끝낸다 — 문서 2개 중 하나가 잘못됐다면 다른
  // 문서를 굳이 먼저 추출해보고 나서 거부하지 않는다.
  for (const file of documents) {
    if (file.size > MAX_DOCUMENT_BYTES) {
      return Response.json({ error: '파일 크기가 너무 큽니다(문서 최대 10MB).' }, { status: 400 });
    }
    if (!file.type.startsWith('image/') && !isPdf(file)) {
      return Response.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 });
    }
  }
  if (audio) {
    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: '파일 크기가 너무 큽니다(녹음 최대 25MB).' }, { status: 400 });
    }
    if (!audio.type.startsWith('audio/')) {
      return Response.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 });
    }
  }

  try {
    // 문서 추출과 음성 전사는 서로 독립적인 AI 호출이므로 순서대로 기다리지 않고 동시에 실행한다.
    const [documentTexts, recordingText] = await Promise.all([
      Promise.all(
        documents.map(async (file) => {
          const buffer = Buffer.from(await file.arrayBuffer());
          const mediaType = isPdf(file) ? 'application/pdf' : file.type;
          const result = await extractDocumentText({ data: buffer, mediaType, filename: file.name });
          return result.text;
        }),
      ),
      audio
        ? transcribeAudio(Buffer.from(await audio.arrayBuffer())).then((result) => result.text)
        : Promise.resolve(null),
    ]);

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
