# design.md — 시각 디자인 시스템

이 문서는 `app/globals.css`와 `app/wanted-sans.css`(Task A에서 추가됨)에 정의된 디자인 토큰을
설명한다. 아래 토큰명/값은 모두 실제 파일을 읽어 옮긴 것이다.

## 토큰 출처

색상/radius/shadow 값과 폰트 파일은 Claude Design 캔버스 목업 "Elderly Care AI Triage"에서
1회성 추출 스크립트 `scripts/extract-design-fonts.mjs`로 확보했다. 이 스크립트는 목업 소스
HTML을 인자로 받아 폰트 `@font-face` 규칙과 색상/radius/shadow CSS 커스텀 프로퍼티를 추출해
`public/fonts/wanted-sans/`와 `app/wanted-sans.css`를 생성한다. 디자인 소스가 바뀌면 스크립트를
다시 실행해 재생성하는 방식이며, 생성된 파일을 손으로 고치지 않는다.

## 색상 시스템 (2계층)

### 1계층 — atomic 원시 팔레트

`--atomic-{hue}-{step}` 형태의 원시 색상 스케일(예: `--atomic-blue-50: #0066FF`,
`--atomic-red-50: #FF4242`, `--atomic-green-50: #00BF40` 등). hue는 `neutral`, `coolNeutral`,
`blue`, `red`, `green`, `orange`, `redOrange`, `lime`, `cyan`, `lightBlue`, `purple`, `violet`,
`pink`, `common`이 있으며 step은 0~99(밝을수록 큰 값)이다. 이 레이어는 컴포넌트에서 직접 쓰지
않고 아래 semantic 레이어가 참조하는 원료로만 존재한다.

### 2계층 — semantic 별칭

컴포넌트에서 실제로 사용해야 하는 레이어. `app/globals.css`에 정의된 전체 목록:

- **primary**: `--color-primary-normal`, `--color-primary-strong`, `--color-primary-heavy`
- **label(텍스트)**: `--color-label-strong`, `--color-label-normal`, `--color-label-neutral`,
  `--color-label-alternative`, `--color-label-assistive`, `--color-label-disable`
- **background**: `--color-background-normal`, `--color-background-alternative`,
  `--color-background-elevated`, `--color-background-elevated-alt`
- **line(테두리)**: `--color-line-normal`, `--color-line-neutral`, `--color-line-solid`
- **fill**: `--color-fill-normal`, `--color-fill-strong`, `--color-fill-alternative`
- **status**: `--color-status-positive`, `--color-status-cautionary`, `--color-status-negative`,
  `--color-status-info`
- **accent 배경**: `--color-accent-blue-bg`, `--color-accent-red-bg`, `--color-accent-green-bg`,
  `--color-accent-orange-bg`, `--color-accent-violet-bg`
- **inverse(반전 배경 위 색)**: `--color-inverse-label`, `--color-inverse-primary`,
  `--color-inverse-background`
- **static**: `--color-static-white`, `--color-static-black`
- **기타**: `--color-dim` (딤 처리용, `rgba(0, 0, 0, 0.52)`)

모두 `@theme inline` 블록에서 동일 이름으로 다시 매핑되어 있어 Tailwind 유틸리티
(`bg-status-positive`, `text-label-normal`, `border-line-normal` 등)로 바로 쓸 수 있다.

## Radius 스케일

`app/globals.css`에 정의된 `--radius-*` 값(그대로 `rounded-*` Tailwind 유틸리티가 됨):

`--radius-4: 4px`, `--radius-6: 6px`, `--radius-8: 8px`, `--radius-10: 10px`,
`--radius-12: 12px`, `--radius-16: 16px`, `--radius-20: 20px`, `--radius-24: 24px`,
`--radius-full: 9999px`.

## Shadow 스케일

`--shadow-*` 값(그대로 `shadow-*` Tailwind 유틸리티가 됨):

- `--shadow-xs: 0px 1px 2px -1px rgba(23, 23, 23, 0.1)`
- `--shadow-sm: 0px 4px 6px -1px rgba(23, 23, 23, 0.06), 0px 2px 4px -2px rgba(23, 23, 23, 0.06)`
- `--shadow-md: 0px 10px 15px -3px rgba(23, 23, 23, 0.07), 0px 4px 6px -2px rgba(0, 0, 0, 0.07)`
- `--shadow-lg: 0px 16px 24px -6px rgba(23, 23, 23, 0.08), 0px 6px 10px -4px rgba(23, 23, 23, 0.08)`
- `--shadow-xl: 0px 24px 38px -10px rgba(23, 23, 23, 0.12), 0px 10px 15px -5px rgba(23, 23, 23, 0.1)`

## 폰트

본문 폰트는 "Wanted Sans Variable"(가변 폰트, weight 400~1000)이며 `public/fonts/wanted-sans/`
아래 다수의 `.woff2` 서브셋 파일로 자체 호스팅된다. 로딩은 `app/wanted-sans.css`의 `@font-face`
규칙들이 담당하며, 이 파일은 `app/globals.css`가 `@import`한다. `app/wanted-sans.css`는 첫 줄에
`GENERATED FILE — do not edit by hand. Regenerate with: node scripts/extract-design-fonts.mjs <source-html-path>`
라고 명시되어 있으므로 직접 수정하지 말고, 디자인 소스가 바뀌면 추출 스크립트로 재생성한다.
`@theme inline`은 `--font-wanted-sans: "Wanted Sans Variable", -apple-system, BlinkMacSystemFont, sans-serif;`로
매핑되어 있고, `body`의 `font-family`가 이 토큰을 사용한다.

## `components/` UI 컴포넌트의 토큰 사용 현황

`components/` 아래 UI 컴포넌트는 모두 구현되어 있다. 각 컴포넌트가 실제로 쓰는 토큰은 다음과 같다.

- **`DisclaimerBanner`**(`components/DisclaimerBanner.tsx`, 상시 노출 상단 배너): 배경
  `--color-accent-orange-bg`, 테두리 `--color-status-cautionary`. 배너 텍스트 자체는 WCAG AA 대비
  4.5:1을 만족해야 해서 `--color-status-cautionary`(주황 50단계, 밝은 주황 배경 위에서 대비 부족)
  대신 더 어두운 atomic 토큰 `--atomic-orange-30`을 직접 사용한다(`text-[var(--atomic-orange-30)]`,
  대비 약 5.07:1).
- **응급 경고 배너**(`app/page.tsx`의 emergency 배너, `SynthesisReport`의 redFlags 박스): 배경은
  `--color-accent-red-bg`. 여기도 같은 이유로 텍스트는 `--color-status-negative`(빨강 50단계) 대신
  `--atomic-red-30`을 직접 사용한다(`text-[var(--atomic-red-30)]`, 대비 약 6.24:1). 일반 에러
  메시지(`UploadPanel`, `InterviewChat`의 오류 문구)처럼 흰 배경 위에 놓이는 텍스트는 대비가 이미
  충분하므로 `--color-status-negative`를 그대로 쓴다.
- **`SpecialistCard` / `SynthesisReport` 카드**: 모서리는 `rounded-12`(`SpecialistCard`) /
  `rounded-16`(`SynthesisReport`), 그림자는 `shadow-sm`(`SpecialistCard`) / `shadow-md`(강조 카드인
  `SynthesisReport`), 테두리는 `border-line-normal`(`SpecialistCard`) 또는 강조를 위한
  `border-2 border-primary-normal`(`SynthesisReport`)을 쓴다.
- **`UploadPanel` / `InterviewChat` / `SpecialtySelector`의 카드 컨테이너**: `rounded-12`,
  `border-line-normal`, `bg-background-elevated`, `shadow-sm` 조합 재사용. `SpecialtySelector`의
  개별 전문분야 행은 `rounded-8 border-line-normal`.
- **주요 액션 버튼**(`InterviewChat`의 "답변 제출", `SpecialtySelector`의 "문진 시작" 등): 알약형
  `rounded-full` + `bg-primary-normal` + `text-static-white`을 쓴다. 보조 버튼(음성 녹음, 파일 첨부
  트리거, "처음으로" 리셋 버튼, `InstallButton`의 "설치" 버튼)은 `rounded-8` + `bg-fill-normal`.
  `SpecialtySelector`에서 0개 선택 시 뜨는 경고 문구는 흰 배경 위 일반 에러 문구 컨벤션과 동일하게
  `text-status-negative`.
- **확신도(confidence) 표시**: `SpecialistCard`는 확신도를 퍼센트 텍스트로만 표시하며
  `--color-label-alternative`를 쓴다(상태색으로 위험도를 구분하는 것은 계획 문서 범위 밖).
- **`InstallButton`의 iOS 안내 팝오버**: 카드 컨테이너 컨벤션(`rounded-8 border-line-normal
  bg-background-elevated shadow-md`)을 재사용한 작은 말풍선.

## PWA 아이콘

`public/icons/`의 매니페스트 아이콘 배경색은 `--atomic-blue-50`(`#0066FF`, `--color-primary-normal`과
동일)을 사용한다. 주황 계열(`--color-status-cautionary`/`--color-accent-orange-bg`)은 이 디자인
시스템에서 주의/경고 용도로 예약되어 있어(`DisclaimerBanner` 등) 앱 아이콘에는 사용하지 않는다.
