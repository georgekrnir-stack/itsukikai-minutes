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

  // 各話者ごとに代表的な発言を抽出（最大5件）
  const speakerSamples: Record<string, { time: string; text: string }[]> = {};
  const speakerCounts: Record<string, number> = {};

  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    const sid = u.speaker_id || "unknown";
    speakerCounts[sid] = (speakerCounts[sid] || 0) + 1;

    if (!speakerSamples[sid]) speakerSamples[sid] = [];
    if (speakerSamples[sid].length < 5) {
      const text = corrected[i] ? corrected[i].corrected_text : u.text;
      speakerSamples[sid].push({
        time: formatTimestamp(u.start),
        text: text.length > 100 ? text.slice(0, 100) + "…" : text,
      });
    }
  }

  // プロンプト構築
  let samplesText = "各話者の発言サンプル:\n\n";
  for (const sid of speakers) {
    const count = speakerCounts[sid] || 0;
    const samples = speakerSamples[sid] || [];
    samplesText += `[${sid}] (${count}件)\n`;
    for (const s of samples) {
      samplesText += `- [${s.time}] ${s.text}\n`;
    }
    samplesText += "\n";
  }

  const prompt = `あなたは会議の文字起こしデータを分析する専門家です。
以下は音声文字起こしの各話者の発言サンプルです。音声認識により、同一人物が複数のspeaker_idに分かれている可能性があります。

${samplesText}

以下の2点を分析してください:

1. **名前推定**: 発言内容から各話者の名前や役割を推定してください。確信度が低い場合は「?」をつけてください。
2. **マージ候補**: 同一人物と思われるspeaker_idのグループを特定してください。発言の文脈、話し方の特徴、会話の流れから判断してください。確信が持てないものは含めないでください。

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
- mergeGroupsは確信がある場合のみ含めてください。なければ空配列で構いません
- 各mergeGroupのspeakerIdsは2つ以上含めてください`;

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
