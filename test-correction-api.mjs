import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

// 30件のダミーutterancesで清書と同じ形式のプロンプトを構築
const utterances = [];
for (let i = 0; i < 30; i++) {
  utterances.push(`index ${i} [speaker_${i % 5}]: これはテスト用の発言です。守山いつき病院の看護師がかんごしとして記録されています。テスト${i}番目の発言。`);
}
const utteranceText = utterances.join("\n");

const prompt = `あなたは医療法人の会議文字起こしテキストの校正アシスタントです。
以下の文字起こしテキストに含まれる誤りを積極的に修正してください。

## 修正辞書
以下の誤表記→正しい表記の対応に従って修正してください:
- 「もりやまいつき」→「守山いつき病院」（施設名）
- 「かんごし」→「看護師」（医療用語）

## 修正ルール
### 必ず修正すべきもの
- 辞書に載っている誤表記
- 明らかな誤変換

### 修正してはいけないもの
- 発言の意味や意図を変えること

## 出力フォーマット
必ず以下のJSON形式のみで出力してください。JSON以外のテキストは含めないでください。

{
  "corrected_utterances": [
    {
      "index": 0,
      "original_text": "（元のテキスト）",
      "corrected_text": "（補正後のテキスト）",
      "changes": [
        { "original": "誤", "corrected": "正", "reason": "理由" }
      ]
    }
  ],
  "total_changes": 0,
  "summary": "要約"
}

## 注意
- 全てのutteranceを出力に含めてください（変更がないものもchanges: []で含める）
- indexはutterances配列のインデックスと一致させてください

## 文字起こしデータ（utterances）
${utteranceText}`;

console.log(`Prompt length: ${prompt.length} chars`);
console.log(`Sending request with max_tokens: 8192...`);

const startTime = Date.now();
try {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });
  const elapsed = Date.now() - startTime;

  const content = message.content[0];
  console.log(`\nResponse received in ${elapsed}ms`);
  console.log(`Stop reason: ${message.stop_reason}`);
  console.log(`Usage: input=${message.usage.input_tokens}, output=${message.usage.output_tokens}`);
  console.log(`Response length: ${content.type === "text" ? content.text.length : "N/A"} chars`);

  if (content.type === "text") {
    // JSON parse test
    let jsonText = content.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    console.log(`\nFirst 200 chars: ${jsonText.substring(0, 200)}`);
    console.log(`Last 200 chars: ${jsonText.substring(jsonText.length - 200)}`);

    try {
      const parsed = JSON.parse(jsonText);
      console.log(`\nJSON parse: SUCCESS`);
      console.log(`Utterances in response: ${parsed.corrected_utterances.length}`);
      console.log(`Total changes: ${parsed.total_changes}`);
    } catch (e) {
      console.log(`\nJSON parse: FAILED - ${e.message}`);
      console.log(`Full response:\n${content.text}`);
    }
  }
} catch (error) {
  const elapsed = Date.now() - startTime;
  console.log(`Error after ${elapsed}ms:`, error.message);
}
