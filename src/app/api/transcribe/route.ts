import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import fs from "fs";
import path from "path";
import os from "os";

export const maxDuration = 600; // 10 minutes timeout for long audio files

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

    // Write file to temp directory using stream
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

    const result = await client.speechToText.convert({
      file: fs.createReadStream(tempFilePath),
      modelId: "scribe_v2",
      languageCode: "jpn",
      tagAudioEvents: true,
      diarize: true,
    });

    const elapsed = Date.now() - startTime;
    console.log(
      `[transcribe] API response received in ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s)`
    );
    console.log(
      `[transcribe] Processing took ${elapsed}ms for file size ${file.size} bytes`
    );

    return NextResponse.json(result);
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
