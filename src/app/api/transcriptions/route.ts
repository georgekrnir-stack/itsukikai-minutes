import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import fs from "fs";
import path from "path";
import os from "os";
import { prisma } from "@/lib/prisma";
import { formatTranscription } from "@/lib/format-transcription";

export const maxDuration = 600;

async function processTranscription(id: string, tempFilePath: string) {
  try {
    // status → transcribing
    await prisma.transcription.update({
      where: { id },
      data: { status: "transcribing" },
    });
    console.log(`[transcription] ${id}: Status changed to transcribing`);

    const client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });

    const startTime = Date.now();

    const apiResponse = await client.speechToText.convert({
      file: fs.createReadStream(tempFilePath),
      modelId: "scribe_v2",
      languageCode: "jpn",
      tagAudioEvents: true,
      diarize: true,
      timestampsGranularity: "word",
    });

    const elapsed = Date.now() - startTime;
    console.log(`[transcription] ${id}: ElevenLabs API completed in ${elapsed}ms`);

    // 整形処理
    const formatted = formatTranscription(apiResponse, elapsed);
    console.log(`[transcription] ${id}: Formatted - ${formatted.utterances.length} utterances, ${formatted.speakers.length} speakers`);

    // 音声の長さを推定（最後のutteranceのend）
    const lastUtterance = formatted.utterances[formatted.utterances.length - 1];
    const durationSeconds = lastUtterance ? Math.ceil(lastUtterance.end) : null;

    // DB更新
    await prisma.transcription.update({
      where: { id },
      data: {
        status: "completed",
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
    console.log(`[transcription] ${id}: Status changed to completed`);
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const title = formData.get("title") as string || "無題の会議";

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // DBレコード作成
    const transcription = await prisma.transcription.create({
      data: {
        title,
        status: "uploading",
        originalFilename: file.name,
        fileSize: file.size,
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
    });

    // バックグラウンド処理（awaitしない）
    processTranscription(transcription.id, tempFilePath).catch((error) => {
      console.error(`[transcription] Background processing error:`, error);
    });

    return response;
  } catch (error) {
    console.error(`[transcription] Upload error:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
