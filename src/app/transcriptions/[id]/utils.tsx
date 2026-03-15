export interface Utterance {
  speaker_id: string | null;
  start: number;
  end: number;
  text: string;
  type?: string;
}

export interface CorrectedUtterance {
  index: number;
  original_text: string;
  corrected_text: string;
  changes: { original: string; corrected: string; reason: string }[];
}

export interface TranscriptionData {
  id: string;
  title: string;
  category: string | null;
  status: string;
  originalFilename: string;
  fileSize: number;
  durationSeconds: number | null;
  speakerCount: number | null;
  utteranceCount: number | null;
  languageCode: string | null;
  utterances: Utterance[] | null;
  speakers: string[] | null;
  speakerMapping: Record<string, string> | null;
  correctedUtterances: CorrectedUtterance[] | null;
  correctionSummary: string | null;
  speakerSuggestions: {
    nameSuggestions: Record<string, { name: string; reason: string }>;
    mergeGroups: { speakerIds: string[]; reason: string }[];
  } | null;
  errorMessage: string | null;
  processingTimeMs: number | null;
  createdAt: string;
}

export interface MinutesData {
  id: string;
  content: string;
  isEdited: boolean;
}

export const SPEAKER_COLORS = [
  { bg: "#EEF2FF", border: "#818CF8", text: "#4338CA" },
  { bg: "#ECFDF5", border: "#6EE7B7", text: "#065F46" },
  { bg: "#FFF7ED", border: "#FDBA74", text: "#9A3412" },
  { bg: "#FDF2F8", border: "#F9A8D4", text: "#9D174D" },
  { bg: "#F0F9FF", border: "#7DD3FC", text: "#075985" },
  { bg: "#FFFBEB", border: "#FCD34D", text: "#92400E" },
  { bg: "#F5F3FF", border: "#C4B5FD", text: "#5B21B6" },
  { bg: "#F0FDFA", border: "#5EEAD4", text: "#115E59" },
];

export function getSpeakerColor(speakerId: string, speakers: string[]) {
  const index = speakers.indexOf(speakerId);
  if (index < 0) return SPEAKER_COLORS[0];
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function getSpeakerLabel(speakerId: string, mapping: Record<string, string> | null): string {
  if (mapping && mapping[speakerId]) return mapping[speakerId];
  return speakerId;
}

export function splitBySentence(text: string): string[] {
  return text.split(/(?<=。)(?!$)/);
}

export function TextWithLineBreaks({ children }: { children: string }) {
  const sentences = splitBySentence(children);
  if (sentences.length <= 1) return <>{children}</>;
  return (
    <>
      {sentences.map((s, i) => (
        <span key={i} className={i < sentences.length - 1 ? "block mb-1.5" : ""}>
          {s}
        </span>
      ))}
    </>
  );
}
