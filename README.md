# 영수증 자동서식 웹앱

원주시정신건강복지센터 회계증빙 서식 자동 작성 도구.

## 배포 (Vercel)

1. 이 저장소를 GitHub에 푸시
2. https://vercel.com 에서 "Add New Project" → 이 저장소 선택 → Import
3. 프로젝트 설정 → **Environment Variables**에 추가:
   - `GEMINI_API_KEY` = (Google AI Studio에서 발급받은 키, https://aistudio.google.com/apikey)
4. Deploy

배포되면 `https://<프로젝트명>.vercel.app` 에서 바로 앱을 쓸 수 있습니다.
`app.html`이 루트 경로(`/`)로 서빙되도록 `vercel.json`에 rewrite가 설정되어 있습니다.

## 로컬 개발

Node.js/npm 설치가 없어도 정적 파일(`app.html`)은 아무 로컬 서버로나 열어보면 됩니다:

```powershell
powershell -File serve.ps1 -Port 5500
```

그다음 `http://localhost:5500` 접속. 단, `/api/recognize` (Gemini 연동)는 Vercel에
배포해야만 동작합니다 — 로컬 정적 서버에는 서버리스 함수를 실행할 방법이 없습니다.

## 구조

- `app.html` — 앱 전체 (4단계 흐름 + 서식 5종 임베드)
- `api/recognize.js` — 영수증 이미지 인식 서버리스 함수 (Gemini API 프록시, 키는 서버에만 존재)
- `html2pdf.bundle.min.js` — PDF 생성 라이브러리 (CDN 대신 로컬 번들, 방화벽/차단 문제 회피)
- `*_템플릿.html` — 서식 5종 원본 템플릿 (app.html에 문자열로 임베드되어 있음, 참고용으로 보관)

## AI 제공사 교체

`app.html`의 `recognizeReceipt(file)` 함수 내부만 고치면 됩니다. 지금은
`/api/recognize`(Gemini)를 호출하지만, 다른 제공사(네이버 Clova OCR 등)로 바꿀 때는
이 함수 안에서 호출하는 엔드포인트만 바꾸면 되도록 설계되어 있습니다.
