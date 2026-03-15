import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeWithElevenLabs, formatTranscription } from "@/lib/transcription";
import { correctTranscription } from "@/lib/llm/correct";
import { analyzeSpeakers } from "@/lib/llm/analyze-speakers";

export const maxDuration = 600;

async function processTranscription(id: string, tempFilePath: string, keyterms?: string[]) {
  try {
    // status → transcribing
    await prisma.transcription.update({
      where: { id },
      data: { status: "transcribing" },
    });
    console.log(`[transcription] ${id}: Status changed to transcribing`);

    const startTime = Date.now();

    const apiResponse = await transcribeWithElevenLabs(tempFilePath, {
      apiKey: process.env.ELEVENLABS_API_KEY!,
      languageCode: "jpn",
      diarize: true,
      keyterms,
    });

    if (keyterms?.length) {
      console.log(`[transcription] ${id}: Keyterms sent: ${keyterms.join(", ")}`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[transcription] ${id}: ElevenLabs API completed in ${elapsed}ms`);

    // 整形処理
    const formatted = formatTranscription(apiResponse, elapsed);
    console.log(`[transcription] ${id}: Formatted - ${formatted.utterances.length} utterances, ${formatted.speakers.length} speakers`);

    // 音声の長さを推定（最後のutteranceのend）
    const lastUtterance = formatted.utterances[formatted.utterances.length - 1];
    const durationSeconds = lastUtterance ? Math.ceil(lastUtterance.end) : null;

    // DB更新（文字起こし完了、清書前）
    await prisma.transcription.update({
      where: { id },
      data: {
        languageCode: formatted.language_code,
        transcriptText: formatted.text,
        utterances: JSON.parse(JSON.stringify(formatted.utterances)),
        speakers: formatted.speakers as string[],
        speakerCount: formatted.speakers.length,
        utteranceCount: formatted.utterances.length,
        durationSeconds,
        processingTimeMs: elapsed,
      },
    });
    console.log(`[transcription] ${id}: Transcription saved, starting correction`);

    // LLM清書を自動実行（完了後は "analyzing" ステータスに）
    await correctTranscription(id, "analyzing");

    // AI話者分析を自動実行
    await analyzeSpeakers(id);
  } catch (error) {
    console.error(`[transcription] ${id}: Error -`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.transcription.update({
      where: { id },
      data: { status: "error", errorMessage: message },
    }).catch((e) => console.error(`[transcription] ${id}: Failed to update error status -`, e));
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log(`[transcription] ${id}: Temp file deleted`);
    }
  }
}

// GET: 一覧取得
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";

  const where: Record<string, unknown> = {};
  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }
  if (status && status !== "all") {
    where.status = status;
  }

  const transcriptions = await prisma.transcription.findMany({
    where,
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      speakerCount: true,
      createdAt: true,
      errorMessage: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // 議事録の存在チェック
  const transcriptionIds = transcriptions.map((t) => t.id);
  const minutesRecords = await prisma.minutes.findMany({
    where: { transcriptionId: { in: transcriptionIds } },
    select: { transcriptionId: true },
  });
  const minutesSet = new Set(minutesRecords.map((m) => m.transcriptionId));

  const result = transcriptions.map((t) => ({
    ...t,
    hasMinutes: minutesSet.has(t.id),
  }));

  return NextResponse.json({ transcriptions: result });
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const title = formData.get("title") as string || "無題の会議";
    const category = formData.get("category") as string || null;
    const useKeyterms = formData.get("useKeyterms") === "true";

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const userId = (session.user as Record<string, unknown>)?.id as string | undefined;

    // DBレコード作成
    const transcription = await prisma.transcription.create({
      data: {
        title,
        category,
        status: "uploading",
        originalFilename: file.name,
        fileSize: file.size,
        userId: userId ?? null,
      },
    });

    console.log(`[transcription] Created: ${transcription.id}, title: ${title}, file: ${file.name}, size: ${file.size}`);

    // 一時ファイルに保存
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `upload-${Date.now()}-${file.name}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(tempFilePath, buffer);

    // レスポンスを先に返す
    const response = NextResponse.json({
      id: transcription.id,
      status: "uploading",
      fileSize: file.size,
    });

    // Keyterm取得
    let keyterms: string[] | undefined;
    if (useKeyterms) {
      const keytermEntries = await prisma.customDictionary.findMany({
        where: { isKeyterm: true },
        select: { correctTerm: true },
        take: 100,
      });
      keyterms = keytermEntries.map((e) => e.correctTerm);
      console.log(`[transcription] ${transcription.id}: Keyterms enabled, ${keyterms.length} terms`);
    }

    // バックグラウンド処理（awaitしない）
    processTranscription(transcription.id, tempFilePath, keyterms).catch((error) => {
      console.error(`[transcription] Background processing error:`, error);
    });

    return response;
  } catch (error) {
    console.error(`[transcription] Upload error:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
