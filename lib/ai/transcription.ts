import { transcribe } from 'ai';
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
