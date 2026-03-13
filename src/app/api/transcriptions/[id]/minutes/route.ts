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

  const prompt = `あなたは医療法人の会議議事録を作成する専門のアシスタントです。
以下の会議の文字起こしデータから、議事録を作成してください。

## 出力フォーマット（Markdown）

以下の構成で出力してください。各セクションは必ず含めてください。

### 会議概要
- 会議の目的と全体の流れを3〜5文で要約

### 議題と発言要点
- 議題ごとに見出しをつけて整理
- 誰が何を発言したかを明記（「田中理事長は〜と述べた」のように）
- 重要な数字や固有名詞は正確に記載

### 決定事項
- 会議で決まったことを箇条書きで列挙
- 各項目に関連する発言者を記載

### TODO / 次回アクション
- 誰が・何を・いつまでに行うかを明記
- 期限が明示されていない場合は「期限未定」と記載

## 注意事項
- 文字起こしの誤変換と思われる部分は文脈から推測して補正してください
- 発言の意図を汲み取り、要点を簡潔にまとめてください
- 医療用語は正確に記載してください
- 議事録として第三者が読んで理解できる文章にしてください

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
