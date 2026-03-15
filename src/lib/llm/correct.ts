import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

interface DictEntry {
  correctTerm: string;
  incorrectTerm: string;
  category: string;
}

interface Utterance {
  speaker_id: string | null;
  start: number;
  end: number;
  text: string;
  type?: string;
}

interface CorrectedUtterance {
  index: number;
  original_text: string;
  corrected_text: string;
  changes: { original: string; corrected: string; reason: string }[];
}

interface CorrectionResult {
  corrected_utterances: CorrectedUtterance[];
  total_changes: number;
  summary: string;
}

export async function correctTranscription(transcriptionId: string): Promise<void> {
  console.log(`[correct] ${transcriptionId}: Starting LLM correction`);

  const transcription = await prisma.transcription.findUnique({
    where: { id: transcriptionId },
  });

  if (!transcription || !transcription.utterances) {
    console.error(`[correct] ${transcriptionId}: No utterances found`);
    return;
  }

  await prisma.transcription.update({
    where: { id: transcriptionId },
    data: { status: "correcting" },
  });

  try {
    const utterances = transcription.utterances as unknown as Utterance[];
    const dictEntries = await prisma.customDictionary.findMany();
    console.log(`[correct] ${transcriptionId}: Dictionary entries: ${dictEntries.length}`);

    const prompt = buildCorrectionPrompt(utterances, dictEntries);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
    });
    const elapsed = Date.now() - startTime;
    console.log(`[correct] ${transcriptionId}: Claude API completed in ${elapsed}ms`);

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    // JSONをパース（コードブロックで囲まれている場合に対応）
    let jsonText = content.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const result: CorrectionResult = JSON.parse(jsonText);
    console.log(`[correct] ${transcriptionId}: ${result.total_changes} corrections made`);

    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        correctedUtterances: JSON.parse(JSON.stringify(result.corrected_utterances)),
        correctionSummary: result.summary,
        status: "completed",
      },
    });
  } catch (error) {
    console.error(`[correct] ${transcriptionId}: Error -`, error);
    // 清書失敗でもcompletedに進める（文字起こし結果は使える）
    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        status: "completed",
        correctionSummary: "清書処理でエラーが発生しました",
      },
    });
  }
}

function buildCorrectionPrompt(utterances: Utterance[], dictEntries: DictEntry[]): string {
  let dictSection = "";
  if (dictEntries.length > 0) {
    dictSection = "## 修正辞書\n以下の誤表記→正しい表記の対応に従って修正してください:\n";
    for (const entry of dictEntries) {
      if (entry.incorrectTerm !== entry.correctTerm) {
        dictSection += `- 「${entry.incorrectTerm}」→「${entry.correctTerm}」（${entry.category}）\n`;
      } else {
        dictSection += `- 「${entry.correctTerm}」（${entry.category}）: 正しい表記として認識してください\n`;
      }
    }
  }

  const utteranceText = utterances
    .map((u, i) => `index ${i} [${u.speaker_id || "unknown"}]: ${u.text}`)
    .join("\n");

  return `あなたは医療法人の会議文字起こしテキストの校正アシスタントです。
以下の文字起こしテキストに含まれる誤りを積極的に修正してください。

${dictSection}
## 修正ルール

### 必ず修正すべきもの
- 辞書に載っている誤表記（完全一致でなくても、明らかに同じ語句を指しているものは修正する）
- 明らかな誤変換（例:「感ごし」→「看護師」、「異常」→「以上」など文脈で判断できるもの）
- 固有名詞の表記揺れ（人名、施設名、組織名の誤り）
- 医療用語の誤変換（例:「じょくそう」→「褥瘡」、「かいご」→「介護」）
- 送り仮名の明らかな誤り

### 修正してはいけないもの
- 発言の意味や意図を変えること
- 話し言葉を書き言葉に直すこと（「〜っすね」→「〜ですね」のような変換はしない）
- 文法的に正しくても意味が通る口語表現の修正
- 発言者が実際に間違ったことを言っている場合の内容の補正

### 判断が難しい場合
- 迷った場合は修正する側に倒してください（消極的すぎるよりは積極的に補正する方が望ましい）
- ただし、修正する場合は必ずchangesに記録してください

## 出力フォーマット
必ず以下のJSON形式のみで出力してください。JSON以外のテキストは含めないでください。

{
  "corrected_utterances": [
    {
      "index": 0,
      "original_text": "（元のテキスト）",
      "corrected_text": "（補正後のテキスト、変更がなければ元テキストと同じ）",
      "changes": [
        {
          "original": "森山樹病院",
          "corrected": "守山いつき病院",
          "reason": "辞書: 施設名の補正"
        }
      ]
    }
  ],
  "total_changes": 5,
  "summary": "施設名3件、人名2件の補正を行いました"
}

## 注意
- 全てのutteranceを出力に含めてください（変更がないものもchanges: []で含める）
- indexはutterances配列のインデックスと一致させてください
- 1つのutteranceに複数の修正がある場合は、changesに全て記録してください

## 文字起こしデータ（utterances）
${utteranceText}`;
}
