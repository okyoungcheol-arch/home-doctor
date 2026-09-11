import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '다중 전문의 AI 문진',
    short_name: 'AI 문진',
    description:
      '통화 녹음, 처방전 등 이미지·PDF 파일을 분석하고 여러 전문의 AI 에이전트가 문진해 종합 소견을 제공하는 개인용 프로토타입입니다.',
    lang: 'ko',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#0066FF',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
