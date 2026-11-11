import { NoTranscriptGeneratedError, transcribe } from 'ai';
import { TRANSCRIPTION_MODEL } from './models';

export type TranscriptionOutput = {
  text: string;
  language?: string;
  durationInSeconds?: number;
};

export async function transcribeAudio(audio: Uint8Array | Buffer): Promise<TranscriptionOutput> {
  const result = await transcribe({
    model: TRANSCRIPTION_MODEL,
    audio,
  });

  return {
    text: result.text,
    language: result.language,
    durationInSeconds: result.durationInSeconds,
  };
}

// 전사/문서 추출 실패를 사용자에게 보여줄 응답으로 바꾼다. 원인이 분명한 두 경우(말소리 없음,
// AI Gateway 인증 실패)는 "변환 실패"로 뭉뚱그리지 않고 따로 알려준다.
export function describeConversionError(error: unknown): { status: number; error: string } {
  if (NoTranscriptGeneratedError.isInstance(error)) {
    return { status: 422, error: '녹음에서 말소리를 인식하지 못했습니다. 다시 녹음해 주세요.' };
  }
  if (error instanceof Error && error.name === 'GatewayAuthenticationError') {
    return {
      status: 502,
      error: 'AI 서비스 인증에 실패했습니다. 서버의 AI Gateway 인증 설정(토큰 만료 여부)을 확인해 주세요.',
    };
  }
  return { status: 502, error: '파일을 텍스트로 변환하지 못했습니다.' };
}
