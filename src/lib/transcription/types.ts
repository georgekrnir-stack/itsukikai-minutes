// ElevenLabs APIから返ってくる生のword要素
export interface RawWord {
  text: string;
  start: number;
  end: number;
  type: "word" | "spacing" | "audio_event";
  speakerId?: string;
  speaker_id?: string;
  logprob?: number;
}

// ElevenLabs APIのレスポンス全体
export interface ElevenLabsResponse {
  language_code: string;
  language_probability: number;
  text: string;
  words: RawWord[];
}

// 整形後の発言ブロック
export interface Utterance {
  speaker_id: string | null;
  start: number;
  end: number;
  text: string;
  type?: "audio_event";
}

// 整形後の文字起こし結果
export interface FormattedTranscription {
  language_code: string;
  language_probability: number;
  text: string;
  utterances: Utterance[];
  speakers: string[];
  raw_words_count: number;
  processing_time_ms: number;
}

// API呼び出しオプション
export interface TranscribeOptions {
  apiKey: string;
  languageCode?: string; // デフォルト: "jpn"
  tagAudioEvents?: boolean; // デフォルト: true
  diarize?: boolean; // デフォルト: true
  keyterms?: string[]; // Keyterm Prompting用語句リスト
}
