import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MINUTES_PROMPT } from "@/lib/prompt-defaults";

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
      return `[#${i}][${timestamp}] ${speakerLabel}:\n${text}`;
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

  // DBからテンプレートを取得（なければデフォルト使用）
  let template = DEFAULT_MINUTES_PROMPT;
  try {
    const record = await prisma.promptTemplate.findUnique({
      where: { name: "minutes" },
    });
    if (record) template = record.content;
  } catch (e) {
    console.warn(`[minutes] ${id}: Failed to load prompt template from DB, using default`, e);
  }

  const prompt = template
    .replace("{{会議タイトル}}", transcription.title)
    .replace("{{参加者一覧}}", participantsText)
    .replace("{{会議テキスト}}", conversationText);

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 16384,
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
