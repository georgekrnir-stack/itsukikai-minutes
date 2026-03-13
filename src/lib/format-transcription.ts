export interface Utterance {
  speaker_id: string | null;
  start: number;
  end: number;
  text: string;
  type?: "audio_event";
}

export interface FormattedTranscription {
  language_code: string;
  language_probability: number;
  text: string;
  utterances: Utterance[];
  speakers: string[];
  raw_words_count: number;
  processing_time_ms: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatTranscription(apiResponse: any, processingTimeMs: number): FormattedTranscription {
  const words = apiResponse.words || [];
  const utterances: Utterance[] = [];
  let currentUtterance: Utterance | null = null;

  for (const word of words) {
    if (word.type === "spacing") continue;

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

    const speakerId = word.speakerId || word.speaker_id || null;

    if (!currentUtterance || currentUtterance.speaker_id !== speakerId) {
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
      currentUtterance.text += word.text;
      currentUtterance.end = word.end;
    }
  }

  if (currentUtterance) {
    utterances.push(currentUtterance);
  }

  const speakers = [
    ...new Set(
      utterances
        .map((u) => u.speaker_id)
        .filter((id): id is string => id !== null)
    ),
  ];

  return {
    language_code: apiResponse.language_code || apiResponse.languageCode,
    language_probability: apiResponse.language_probability || apiResponse.languageProbability,
    text: apiResponse.text,
    utterances,
    speakers,
    raw_words_count: words.length,
    processing_time_ms: processingTimeMs,
  };
}
