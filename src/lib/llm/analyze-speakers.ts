import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

interface Utterance {
  speaker_id: string | null;
  start: number;
  end: number;
  text: string;
  type?: string;
}

interface CorrectedUtterance {
  corrected_text: string;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * AI話者分析を実行し、提案結果をDBに保存する（適用はしない）。
 * 話者が2人未満の場合はスキップ。
 */
export async function analyzeSpeakers(transcriptionId: string): Promise<void> {
  console.log(`[analyze] ${transcriptionId}: Starting auto speaker analysis`);

  await prisma.transcription.update({
    where: { id: transcriptionId },
    data: { status: "analyzing" },
  });

  try {
    const transcription = await prisma.transcription.findUnique({
      where: { id: transcriptionId },
    });

    if (!transcription) {
      console.error(`[analyze] ${transcriptionId}: Not found`);
      return;
    }

    const utterances = (transcription.utterances as unknown as Utterance[]) || [];
    const corrected = (transcription.correctedUtterances as unknown as CorrectedUtterance[]) || [];
    const speakers = (transcription.speakers as string[]) || [];

    if (speakers.length < 2) {
      console.log(`[analyze] ${transcriptionId}: Only ${speakers.length} speaker(s), skipping`);
      await prisma.transcription.update({
        where: { id: transcriptionId },
        data: { status: "completed" },
      });
      return;
    }

    // 発言数カウント
    const speakerCounts: Record<string, number> = {};
    for (const u of utterances) {
      const sid = u.speaker_id || "unknown";
      speakerCounts[sid] = (speakerCounts[sid] || 0) + 1;
    }

    // プロンプト構築
    let fullText = "## 会議の全文字起こし（時系列順）\n\n";
    for (let i = 0; i < utterances.length; i++) {
      const u = utterances[i];
      const sid = u.speaker_id || "unknown";
      const text = corrected[i] ? corrected[i].corrected_text : u.text;
      fullText += `[${formatTimestamp(u.start)}] ${sid}: ${text}\n`;
    }

    let summaryText = "## 話者一覧\n\n";
    for (const sid of speakers) {
      summaryText += `- ${sid}: ${speakerCounts[sid] || 0}件\n`;
    }

    const prompt = `あなたは会議の文字起こしデータを分析する専門家です。
音声認識の仕組み上、同一人物が複数のspeaker_idに分かれてしまうことがよくあります。
特に発言数が少ないspeaker_id（1〜5件程度）は、別の話者のフラグメント（断片）である可能性が高いです。

以下のデータを分析してください:

${summaryText}

${fullText}

## 分析指示

### 1. 名前推定
発言内容から各話者の名前や役割を推定してください。確信度が低い場合は「?」をつけてください。

### 2. マージ候補（重要）
同一人物と思われるspeaker_idのグループを特定してください。以下の観点で積極的に判断してください:
- **発言数が少ない話者**（1〜5件）は、発言数が多い別の話者の断片である可能性が非常に高い
- **会話の流れ**で、あるspeaker_idの発言の直前・直後に別のspeaker_idが同じ文脈で話している場合
- **話題・語彙・話し方**が似ている話者
- **発言のタイミング**が近接している（同じ時間帯に交互に出現する）話者
- 音声認識は完璧ではないため、**可能性がある場合は積極的に提案**してください（ユーザーが確認して判断します）

以下のJSON形式で回答してください（JSON以外は出力しないでください）:
{
  "nameSuggestions": {
    "speaker_0": { "name": "推定名（役職?）", "reason": "推定理由" },
    ...
  },
  "mergeGroups": [
    { "speakerIds": ["speaker_2", "speaker_5"], "reason": "同一人物と判断した理由" },
    ...
  ]
}

注意:
- nameSuggestionsには全話者を含めてください
- mergeGroupsは可能性がある限り積極的に提案してください（ユーザーが確認して判断します）
- 各mergeGroupのspeakerIdsは2つ以上含めてください
- 発言数が極端に少ない話者は、他の話者へのマージ候補として特に注目してください`;

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }, { timeout: 120000 });
    const elapsed = Date.now() - startTime;
    console.log(`[analyze] ${transcriptionId}: Analysis completed in ${elapsed}ms`);

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    let jsonText = content.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonText);

    // 提案結果をDBに保存（適用はしない。ユーザーが詳細ページで確認・適用する）
    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        speakerSuggestions: result,
      },
    });

    console.log(`[analyze] ${transcriptionId}: Suggestions saved (${Object.keys(result.nameSuggestions || {}).length} names, ${(result.mergeGroups || []).length} merge groups)`);
  } catch (error) {
    console.error(`[analyze] ${transcriptionId}: Error -`, error);
    // 分析エラーは致命的ではないのでログのみ
  } finally {
    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: { status: "completed" },
    });
  }
}
