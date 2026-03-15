import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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
  index: number;
  original_text: string;
  corrected_text: string;
  changes: { original: string; corrected: string; reason: string }[];
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const transcription = await prisma.transcription.findUnique({
    where: { id },
  });

  if (!transcription) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const utterances = (transcription.utterances as unknown as Utterance[]) || [];
  const corrected = (transcription.correctedUtterances as unknown as CorrectedUtterance[]) || [];
  const speakers = (transcription.speakers as string[]) || [];

  if (speakers.length < 2) {
    return NextResponse.json({ error: "話者が2人未満のため分析できません" }, { status: 400 });
  }

  // 各話者ごとの発言数をカウント
  const speakerCounts: Record<string, number> = {};
  for (const u of utterances) {
    const sid = u.speaker_id || "unknown";
    speakerCounts[sid] = (speakerCounts[sid] || 0) + 1;
  }

  // 各話者ごとに代表的な発言を抽出（最大8件、均等に分散）
  const speakerSamples: Record<string, { time: string; text: string }[]> = {};
  const speakerIndices: Record<string, number[]> = {};

  for (let i = 0; i < utterances.length; i++) {
    const sid = utterances[i].speaker_id || "unknown";
    if (!speakerIndices[sid]) speakerIndices[sid] = [];
    speakerIndices[sid].push(i);
  }

  const MAX_SAMPLES = 8;
  for (const sid of speakers) {
    const indices = speakerIndices[sid] || [];
    // 均等にサンプリング
    const step = Math.max(1, Math.floor(indices.length / MAX_SAMPLES));
    const selected: number[] = [];
    for (let j = 0; j < indices.length && selected.length < MAX_SAMPLES; j += step) {
      selected.push(indices[j]);
    }
    speakerSamples[sid] = selected.map((idx) => {
      const u = utterances[idx];
      const text = corrected[idx] ? corrected[idx].corrected_text : u.text;
      return {
        time: formatTimestamp(u.start),
        text: text.length > 150 ? text.slice(0, 150) + "…" : text,
      };
    });
  }

  // 話者ごとサンプル
  let samplesText = "## 各話者の発言サンプル\n\n";
  for (const sid of speakers) {
    const count = speakerCounts[sid] || 0;
    const samples = speakerSamples[sid] || [];
    samplesText += `[${sid}] (${count}件)\n`;
    for (const s of samples) {
      samplesText += `- [${s.time}] ${s.text}\n`;
    }
    samplesText += "\n";
  }

  // 会話の流れ（時系列順、最大60発言を均等サンプリング）
  const MAX_FLOW = 60;
  const flowStep = Math.max(1, Math.floor(utterances.length / MAX_FLOW));
  let flowText = "## 会話の流れ（時系列順の抜粋）\n\n";
  let flowCount = 0;
  for (let i = 0; i < utterances.length && flowCount < MAX_FLOW; i += flowStep) {
    const u = utterances[i];
    const sid = u.speaker_id || "unknown";
    const text = corrected[i] ? corrected[i].corrected_text : u.text;
    const truncated = text.length > 80 ? text.slice(0, 80) + "…" : text;
    flowText += `[${formatTimestamp(u.start)}] ${sid}: ${truncated}\n`;
    flowCount++;
  }

  const prompt = `あなたは会議の文字起こしデータを分析する専門家です。
音声認識の仕組み上、同一人物が複数のspeaker_idに分かれてしまうことがよくあります。
特に発言数が少ないspeaker_id（1〜5件程度）は、別の話者のフラグメント（断片）である可能性が高いです。

以下のデータを分析してください:

${samplesText}
${flowText}

## 分析指示

### 1. 名前推定
発言内容から各話者の名前や役割を推定してください。確信度が低い場合は「?」をつけてください。

### 2. マージ候補（重要）
同一人物と思われるspeaker_idのグループを特定してください。以下の観点で積極的に判断してください:
- **発言数が少ない話者**（1〜5件）は、発言数が多い別の話者の断片である可能性が非常に高い
- **会話の流れ**で、あるspeaker_idの発言の直前・直後に別のspeaker_idが同じ文脈で話している場合
- **話題・語彙・話し方**が似ている話者
- **発言のタイミング**が近接している（同じ時間帯に交互に出現する）話者
- 音声認識は完璧ではないため、**可能性がある場合は積極的に提案**してください（ユーザーが最終判断します）

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

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }, { timeout: 60000 });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected response type" }, { status: 500 });
    }

    let jsonText = content.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonText);

    return NextResponse.json(result);
  } catch (error) {
    console.error(`[analyze-speakers] ${id}: Error -`, error);
    return NextResponse.json(
      { error: "話者分析に失敗しました。もう一度お試しください。" },
      { status: 500 }
    );
  }
}
