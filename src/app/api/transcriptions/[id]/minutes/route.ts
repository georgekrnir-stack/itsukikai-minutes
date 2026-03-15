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
}

interface CorrectedUtterance {
  index: number;
  corrected_text: string;
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildPromptText(
  utterances: Utterance[],
  correctedUtterances: CorrectedUtterance[] | null,
  speakerMapping: Record<string, string> | null
): string {
  return utterances
    .map((u, i) => {
      const speakerLabel = speakerMapping?.[u.speaker_id || ""] || u.speaker_id || "unknown";
      const timestamp = formatTimestamp(u.start);
      const text = correctedUtterances?.[i]?.corrected_text || u.text;
      return `[${timestamp}] ${speakerLabel}:\n${text}`;
    })
    .join("\n\n");
}

// GET: 議事録取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const minutes = await prisma.minutes.findUnique({
    where: { transcriptionId: id },
  });

  if (!minutes) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(minutes);
}

// POST: 議事録生成
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  console.log(`[minutes] ${id}: Starting minutes generation`);

  const transcription = await prisma.transcription.findUnique({
    where: { id },
  });

  if (!transcription || !transcription.utterances) {
    return NextResponse.json({ error: "Transcription not found" }, { status: 404 });
  }

  const utterances = transcription.utterances as unknown as Utterance[];
  const correctedUtterances = transcription.correctedUtterances as unknown as CorrectedUtterance[] | null;
  const speakerMapping = transcription.speakerMapping as Record<string, string> | null;
  const useCorrected = !!correctedUtterances;
  console.log(`[minutes] ${id}: Using corrected text: ${useCorrected}`);

  const conversationText = buildPromptText(utterances, correctedUtterances, speakerMapping);

  const speakerNames = speakerMapping
    ? Object.values(speakerMapping).filter((n) => n.trim())
    : [];
  const participantsText = speakerNames.length > 0
    ? speakerNames.join("、")
    : "（話者マッピング未設定）";

  const prompt = `あなたは医療法人の会議議事録を作成する専門のアシスタントです。
以下の会議の文字起こしデータから、正式な議事録を作成してください。

## 出力フォーマット

以下のMarkdown形式で出力してください。各セクションは必ず含め、見出しレベルを厳守してください。

---

# 議事録

**会議名:** ${transcription.title}
**日時:** （文字起こしデータから推測、不明なら「記載なし」）
**参加者:** ${participantsText}

---

## 会議概要

（会議全体の目的と流れを3〜5文で要約。簡潔かつ具体的に。）

---

## 議題と討議内容

### 議題1: （議題名を具体的に）

**報告・提案内容:**
- （誰が何を報告・提案したかを簡潔に記載）

**主な意見:**
- （参加者名）: （発言の要点）
- （参加者名）: （発言の要点）

**結論:** （この議題の結論。結論が出ていない場合は「継続審議」）

### 議題2: （議題名）

（同じ構造で繰り返し）

---

## 決定事項

| No. | 決定内容 | 関連議題 |
|-----|---------|---------|
| 1 | （具体的な決定内容） | 議題1 |
| 2 | （具体的な決定内容） | 議題2 |

---

## TODO / 次回アクション

| No. | 担当者 | アクション内容 | 期限 |
|-----|--------|-------------|------|
| 1 | （名前） | （具体的なアクション） | （期限、不明なら「未定」） |
| 2 | （名前） | （具体的なアクション） | （期限、不明なら「未定」） |

---

## 注意事項
- 文字起こしデータの中から議題を自動的に識別し、適切に分割してください
- 議題の区切りが不明確な場合は、話題の変わり目を基準に判断してください
- 発言の要点は原文の意味を正確に保ちつつ、簡潔にまとめてください
- 決定事項とTODOが明示されていない場合でも、文脈から推測して記載してください。推測の場合は「（推測）」と付記してください
- 医療用語は正確に記載してください
- 表（テーブル）は必ずMarkdownテーブル形式で出力してください

## 会議の文字起こしデータ

${conversationText}`;

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });
    const elapsed = Date.now() - startTime;
    console.log(`[minutes] ${id}: Claude API completed in ${elapsed}ms`);

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    // DB保存（upsertで既存があれば上書き）
    const minutes = await prisma.minutes.upsert({
      where: { transcriptionId: id },
      update: {
        content: content.text,
        isEdited: false,
      },
      create: {
        transcriptionId: id,
        content: content.text,
      },
    });

    return NextResponse.json(minutes);
  } catch (error) {
    console.error(`[minutes] ${id}: Error -`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH: 議事録編集保存
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const minutes = await prisma.minutes.findUnique({
    where: { transcriptionId: id },
  });

  if (!minutes) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.minutes.update({
    where: { transcriptionId: id },
    data: {
      content: body.content,
      isEdited: true,
    },
  });

  return NextResponse.json(updated);
}
