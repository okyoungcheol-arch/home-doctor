import { generateText } from 'ai';
import { FAST_TEXT_MODEL } from './models';

export type DocumentExtractionOutput = {
  text: string;
};

export type DocumentFile = {
  data: Uint8Array | Buffer;
  mediaType: string;
  filename?: string;
};

export async function extractDocumentText(file: DocumentFile): Promise<DocumentExtractionOutput> {
  const { text } = await generateText({
    model: FAST_TEXT_MODEL,
    instructions:
      '당신은 병원 접수 담당자입니다. 첨부된 이미지 또는 PDF는 처방전, 진단서, 검사 결과지, 증상 메모 등 환자가 제출한 의료 관련 문서입니다. 문서에 적힌 증상, 진단명, 처방 약물과 용량, 의사 소견 등 환자 상담에 참고할 내용을 빠짐없이 한국어 텍스트로 정리하세요. 통화 녹음 전사문을 대신할 내용이므로, 뒤에 이어지는 진료 파이프라인이 그대로 읽을 수 있도록 자연스러운 문장으로 작성하고 이미지/PDF라는 형식 언급 없이 내용만 전달하세요.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'file', data: file.data, mediaType: file.mediaType, filename: file.filename },
          { type: 'text', text: '위 문서의 내용을 정리해주세요.' },
        ],
      },
    ],
  });

  return { text };
}
