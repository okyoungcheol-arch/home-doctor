import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { InstallButton } from "@/components/InstallButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "홈 닥터",
  description: "통화 녹음, 처방전 등 이미지·PDF 파일을 분석하고 여러 전문의 AI 에이전트가 문진해 종합 소견을 제공하는 개인용 프로토타입입니다.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "홈 닥터",
  },
};

export const viewport: Viewport = {
  themeColor: "#0066FF",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DisclaimerBanner />
        <div className="flex justify-end px-4 py-2">
          <InstallButton />
        </div>
        {children}
      </body>
    </html>
  );
}
