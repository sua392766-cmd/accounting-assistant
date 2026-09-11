// 영수증 이미지 인식 API (Vercel 서버리스 함수)
// - Gemini API 키는 서버 환경변수(GEMINI_API_KEY)에서만 읽는다 — 프론트엔드에는 절대 노출되지 않음.
// - 나중에 네이버 Clova OCR 등 다른 제공사로 바꿀 때도 이 파일 내부만 고치면 된다
//   (프론트엔드의 recognizeReceipt()는 이 엔드포인트를 호출하는 동일한 인터페이스를 유지).
//
// 요청: POST { imageBase64: string(순수 base64, data: 접두어 제외), mimeType: string }
// 응답: 200 { date, vendor, items: [{name, spec, unit, price, qty}], totalAmount }
//       4xx/5xx { error: string }

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

const PROMPT = `다음은 한국어 영수증 또는 거래명세서 이미지입니다. 아래 JSON 형식으로만 응답하세요.
다른 설명, 코드블록 표시(백틱) 등은 절대 추가하지 말고 JSON 객체 하나만 출력하세요.

{
  "date": "YYYY-MM-DD 형식의 결제일자",
  "vendor": "업체명(상호)",
  "items": [
    { "name": "품목명", "spec": "규격 (없으면 빈 문자열)", "unit": "단위 (예: 개, 박스 - 없으면 '개')", "price": "단가(숫자만, 쉼표/원 표시 제외)", "qty": "수량(숫자만)" }
  ],
  "totalAmount": "합계금액(숫자만, 쉼표/원 표시 제외)"
}

규칙:
- 읽을 수 없거나 확신할 수 없는 값은 빈 문자열("")로 두세요. 추측해서 지어내지 마세요.
- 품목이 여러 개면 items 배열에 모두 포함하세요.
- price와 qty는 숫자 문자열로 주되, 천단위 쉼표는 넣지 마세요.
- 날짜는 반드시 YYYY-MM-DD 형식으로 변환하세요 (예: 2026.9.8 -> 2026-09-08).`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '서버에 GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.' });
    return;
  }

  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    res.status(400).json({ error: 'imageBase64가 필요합니다.' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25초 타임아웃

  try {
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => '');
      res.status(502).json({ error: 'Gemini API 호출 실패 (' + geminiRes.status + ')', detail });
      return;
    }

    const data = await geminiRes.json();
    const text = data && data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
      && data.candidates[0].content.parts[0].text;

    if (!text) {
      res.status(502).json({ error: 'Gemini API가 인식 결과를 반환하지 않았습니다. (이미지가 영수증이 아니거나 인식 불가)' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      res.status(502).json({ error: 'Gemini 응답을 JSON으로 해석할 수 없습니다.', raw: text });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    if (err.name === 'AbortError') {
      res.status(504).json({ error: 'Gemini API 응답이 너무 오래 걸려 취소했습니다. 다시 시도해주세요.' });
    } else {
      res.status(500).json({ error: err.message || String(err) });
    }
  } finally {
    clearTimeout(timeout);
  }
}
