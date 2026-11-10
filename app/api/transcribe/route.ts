import { transcribeAudio } from '@/lib/ai/transcription';

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB — /api/intake의 녹음 제한과 동일

// 문진 중 "음성으로 답변"한 녹음을 텍스트로 바꾼다(InterviewChat 전용). 문서/이미지는 이 라우트가
// 아니라 /api/intake(최초 업로드) 또는 /api/interview(답변 첨부)가 처리한다.
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('audio');

  if (!(file instanceof File)) {
    return Response.json({ error: '파일이 필요합니다.' }, { status: 400 });
  }
  if (!file.type.startsWith('audio/')) {
    return Response.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: '파일 크기가 너무 큽니다(녹음 최대 25MB).' }, { status: 400 });
  }

  try {
    const result = await transcribeAudio(Buffer.from(await file.arrayBuffer()));
    return Response.json(result);
  } catch (error) {
    console.error('transcribe error', error);
    return Response.json({ error: '파일을 텍스트로 변환하지 못했습니다.' }, { status: 502 });
  }
}
