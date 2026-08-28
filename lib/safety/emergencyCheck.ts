export type EmergencyCheckResult = {
  isEmergency: boolean;
  matchedFlags: string[];
};

const SINGLE_TRIGGERS: { flag: string; keywords: string[] }[] = [
  { flag: '의식 소실', keywords: ['의식을 잃', '기절', '의식소실', '반응이 없'] },
  { flag: '심한 출혈', keywords: ['피가 멈추지', '심한 출혈', '피를 많이', '지혈이 안'] },
  {
    flag: '마비/발음 이상(뇌졸중 의심)',
    keywords: ['한쪽이 마비', '발음이 어눌', '입이 돌아가', '얼굴이 한쪽만'],
  },
  { flag: '자살/자해 위험', keywords: ['자살', '죽고 싶', '자해'] },
  { flag: '심한 알레르기 반응', keywords: ['목이 부어', '숨을 못 쉬', '아나필락시스'] },
];

const PAIR_TRIGGERS: { flag: string; a: string[]; b: string[] }[] = [
  {
    flag: '가슴 통증 동반 호흡곤란',
    a: ['가슴이 아프', '가슴 통증', '가슴이 답답'],
    b: ['숨이 차', '호흡곤란', '숨쉬기 힘들', '숨 쉬기 힘들'],
  },
];

export function checkEmergency(text: string): EmergencyCheckResult {
  const matchedFlags: string[] = [];

  for (const trigger of SINGLE_TRIGGERS) {
    if (trigger.keywords.some((keyword) => text.includes(keyword))) {
      matchedFlags.push(trigger.flag);
    }
  }

  for (const trigger of PAIR_TRIGGERS) {
    const hasA = trigger.a.some((keyword) => text.includes(keyword));
    const hasB = trigger.b.some((keyword) => text.includes(keyword));
    if (hasA && hasB) {
      matchedFlags.push(trigger.flag);
    }
  }

  return { isEmergency: matchedFlags.length > 0, matchedFlags };
}
