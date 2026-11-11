// 마이크 녹음 공통 헬퍼(UploadPanel·InterviewChat 공용, 브라우저 전용).

// 음성 전사에는 32kbps면 충분하다. 브라우저 기본값(Chrome 기준 약 120kbps)으로 두면 5분 남짓한
// 녹음만으로도 Vercel 함수의 요청 본문 한도(4.5MB)를 넘어 업로드 자체가 거부된다.
const SPEECH_BITS_PER_SECOND = 32_000;

export function createSpeechRecorder(stream: MediaStream): MediaRecorder {
  return new MediaRecorder(stream, { audioBitsPerSecond: SPEECH_BITS_PER_SECOND });
}

// 녹음 컨테이너는 브라우저마다 다르다(Chrome/Firefox는 webm·ogg, Safari/iOS는 mp4). 실제 형식과
// 다른 타입·확장자를 붙이지 않도록 MediaRecorder가 알려주는 mimeType을 그대로 쓴다.
export function buildRecording(chunks: Blob[], recorderMimeType: string): { blob: Blob; filename: string } {
  const mimeType = recorderMimeType || chunks[0]?.type || 'audio/webm';
  const baseType = mimeType.split(';')[0].trim().toLowerCase();
  const extension = baseType.includes('mp4') ? 'm4a' : baseType.includes('ogg') ? 'ogg' : 'webm';
  return { blob: new Blob(chunks, { type: baseType }), filename: `recording.${extension}` };
}

// 서버가 JSON이 아닌 응답(예: 본문 한도 초과 시 플랫폼이 돌려주는 413)을 줘도 사용자에게 보여줄
// 한국어 오류 문구를 얻는다.
export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  if (response.status === 413) return '녹음이 너무 깁니다. 더 짧게 나누어 녹음해 주세요.';
  try {
    const data = await response.json();
    return typeof data?.error === 'string' ? data.error : fallback;
  } catch {
    return fallback;
  }
}
