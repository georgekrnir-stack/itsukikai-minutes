import { ElevenLabsResponse, FormattedTranscription, Utterance } from "./types";

/**
 * ElevenLabs APIの生レスポンスを、話者ごとの発言ブロックに整形する
 * 日本語の場合、APIは1文字単位でデータを返すため、
 * 同一話者の連続する文字を結合して1つの発言ブロックにまとめる
 *
 * @param apiResponse ElevenLabs APIの生レスポンス
 * @param processingTimeMs API処理時間（ミリ秒）
 * @returns 整形済み文字起こし結果
 */
export function formatTranscription(
  apiResponse: ElevenLabsResponse,
  processingTimeMs: number
): FormattedTranscription {
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
    language_code: apiResponse.language_code,
    language_probability: apiResponse.language_probability,
    text: apiResponse.text,
    utterances,
    speakers,
    raw_words_count: words.length,
    processing_time_ms: processingTimeMs,
  };
}
