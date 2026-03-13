import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import fs from "fs";
import path from "path";
import os from "os";

export const maxDuration = 600; // 10 minutes timeout for long audio files

interface Utterance {
  speaker_id: string | null;
  start: number;
  end: number;
  text: string;
  type?: "audio_event";
}

interface FormattedTranscription {
  language_code: string;
  language_probability: number;
  text: string;
  utterances: Utterance[];
  speakers: string[];
  raw_words_count: number;
  processing_time_ms: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTranscription(apiResponse: any, processingTimeMs: number): FormattedTranscription {
  const words = apiResponse.words || [];
  const utterances: Utterance[] = [];
  let currentUtterance: Utterance | null = null;

  for (const word of words) {
    // spacingはスキップ
    if (word.type === "spacing") continue;

    // audio_eventは独立ブロック
    if (word.type === "audio_event") {
      if (currentUtterance) {
        utterances.push(currentUtterance);
        currentUtterance = null;
      }
      utterances.push({
        speaker_id: null,
        start: word.start,
        end: word.end,
        text: word.text,
        type: "audio_event",
      });
      continue;
    }

    // wordの処理
    const speakerId = word.speakerId || word.speaker_id || null;

    if (!currentUtterance || currentUtterance.speaker_id !== speakerId) {
      // 話者が変わった → 現在のブロック確定、新ブロック開始
      if (currentUtterance) {
        utterances.push(currentUtterance);
      }
      currentUtterance = {
        speaker_id: speakerId,
        start: word.start,
        end: word.end,
        text: word.text,
      };
    } else {
      // 同じ話者 → テキスト結合、end更新
      currentUtterance.text += word.text;
      currentUtterance.end = word.end;
    }
  }

  // 最後のブロック
  if (currentUtterance) {
    utterances.push(currentUtterance);
  }

  // ユニークな話者リスト
  const speakers = [
    ...new Set(
      utterances
        .map((u) => u.speaker_id)
        .filter((id): id is string => id !== null)
    ),
  ];

  return {
    language_code: apiResponse.language_code || apiResponse.languageCode,
    language_probability:
      apiResponse.language_probability || apiResponse.languageProbability,
    text: apiResponse.text,
    utterances,
    speakers,
    raw_words_count: words.length,
    processing_time_ms: processingTimeMs,
  };
}

export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    console.log(
      `[transcribe] File received: ${file.name}, size: ${file.size} bytes`
    );

    // Write file to temp directory
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `upload-${Date.now()}-${file.name}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(tempFilePath, buffer);

    console.log(`[transcribe] File written to temp: ${tempFilePath}`);
    console.log(`[transcribe] Sending to ElevenLabs API...`);

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
    console.log(
      `[transcribe] API response received in ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s)`
    );

    // 整形処理
    const formatted = formatTranscription(apiResponse, elapsed);

    console.log(`[transcribe] Raw words count: ${(apiResponse as any).words?.length ?? 0}`);
    console.log(`[transcribe] Formatted utterances count: ${formatted.utterances.length}`);
    console.log(`[transcribe] Speakers detected: ${formatted.speakers.join(", ")}`);
    console.log(`[transcribe] Raw JSON size: ~${Math.round(JSON.stringify(apiResponse).length / 1024 / 1024)}MB`);
    console.log(`[transcribe] Formatted JSON size: ~${Math.round(JSON.stringify(formatted).length / 1024)}KB`);

    return NextResponse.json(formatted);
  } catch (error) {
    console.error(`[transcribe] Error:`, error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log(`[transcribe] Temp file cleaned up: ${tempFilePath}`);
    }
  }
}
