import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import fs from "fs";
import { ElevenLabsResponse, TranscribeOptions } from "./types";

/**
 * ElevenLabs Scribe v2 APIで音声ファイルを文字起こしする
 * @param filePath 音声ファイルのパス（一時ファイル）
 * @param options API呼び出しオプション
 * @returns ElevenLabs APIの生レスポンス
 */
export async function transcribeWithElevenLabs(
  filePath: string,
  options: TranscribeOptions
): Promise<ElevenLabsResponse> {
  const client = new ElevenLabsClient({
    apiKey: options.apiKey,
  });

  const result = await client.speechToText.convert({
    file: fs.createReadStream(filePath),
    modelId: "scribe_v2",
    languageCode: options.languageCode ?? "jpn",
    tagAudioEvents: options.tagAudioEvents ?? true,
    diarize: options.diarize ?? true,
    timestampsGranularity: "word",
    ...(options.keyterms?.length ? { keyterms: options.keyterms } : {}),
  });

  return result as unknown as ElevenLabsResponse;
}
