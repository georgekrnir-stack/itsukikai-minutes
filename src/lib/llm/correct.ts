import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CORRECTION_PROMPT } from "@/lib/prompt-defaults";

interface DictEntry {
  correctTerm: string;
  incorrectTerm: string;
  category: string;
}

interface Utterance {
  speaker_id: string | null;
  start: number;
  end: number;
  text: string;
  type?: string;
}

interface CorrectedUtterance {
  index: number;
  original_text: string;
  corrected_text: string;
  changes: { original: string; corrected: string; reason: string }[];
}

interface DiffOnlyResult {
  corrections: {
    index: number;
    corrected_text: string;
    changes: { original: string; corrected: string; reason: string }[];
  }[];
  total_changes: number;
  summary: string;
}

const BATCH_SIZE = 20;
const MAX_RETRIES = 5;

async function callWithRetry(
  anthropic: Anthropic,
  prompt: string,
  transcriptionId: string,
  batchLabel: string,
): Promise<Anthropic.Message> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384,
        messages: [{ role: "user", content: prompt }],
      }, { timeout: 300000 });
      return message;
    } catch (error: unknown) {
      const isRateLimit =
        error instanceof Anthropic.RateLimitError ||
        (error instanceof Error && "status" in error && (error as { status: number }).status === 429);

      if (isRateLimit && attempt < MAX_RETRIES) {
        // retry-afterヘッダーから待機時間を取得、なければ指数バックオフ
        const waitMs = Math.min(2 ** attempt * 5000, 60000);
        console.log(`[correct] ${transcriptionId}: ${batchLabel} rate limited (attempt ${attempt}/${MAX_RETRIES}), waiting ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

export async function correctTranscription(transcriptionId: string, finalStatus: string = "completed"): Promise<void> {
  console.log(`[correct] ${transcriptionId}: Starting LLM correction`);

  const transcription = await prisma.transcription.findUnique({
    where: { id: transcriptionId },
  });

  if (!transcription || !transcription.utterances) {
    console.error(`[correct] ${transcriptionId}: No utterances found`);
    return;
  }

  await prisma.transcription.update({
    where: { id: transcriptionId },
    data: { status: "correcting" },
  });

  try {
    const utterances = transcription.utterances as unknown as Utterance[];
    const dictEntries = await prisma.customDictionary.findMany();
    console.log(`[correct] ${transcriptionId}: Dictionary entries: ${dictEntries.length}, utterances: ${utterances.length}`);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // バッチ分割
    const batches: { utterances: Utterance[]; startIndex: number }[] = [];
    for (let i = 0; i < utterances.length; i += BATCH_SIZE) {
      batches.push({
        utterances: utterances.slice(i, i + BATCH_SIZE),
        startIndex: i,
      });
    }
    console.log(`[correct] ${transcriptionId}: Split into ${batches.length} batches, processing in parallel`);

    // DBからテンプレートを1回だけ取得
    const template = await getPromptTemplate();

    const startTime = Date.now();

    // 全バッチを並列実行
    const batchResults = await Promise.all(
      batches.map(async (batch, batchIdx) => {
        const batchLabel = `Batch ${batchIdx + 1}/${batches.length}`;
        const prompt = buildCorrectionPrompt(template, batch.utterances, dictEntries, batch.startIndex);

        console.log(`[correct] ${transcriptionId}: ${batchLabel} sending (index ${batch.startIndex}-${batch.startIndex + batch.utterances.length - 1})`);

        const message = await callWithRetry(anthropic, prompt, transcriptionId, batchLabel);

        console.log(`[correct] ${transcriptionId}: ${batchLabel} done, stop_reason=${message.stop_reason}, output_tokens=${message.usage.output_tokens}`);

        const content = message.content[0];
        if (content.type !== "text") {
          throw new Error(`${batchLabel}: Unexpected response type`);
        }

        if (message.stop_reason === "max_tokens") {
          console.error(`[correct] ${transcriptionId}: ${batchLabel} truncated (max_tokens)`);
          throw new Error(`${batchLabel}: Response truncated`);
        }

        let jsonText = content.text.trim();
        if (jsonText.startsWith("```")) {
          jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }

        let result: DiffOnlyResult;
        try {
          result = JSON.parse(jsonText);
        } catch (parseErr) {
          console.error(`[correct] ${transcriptionId}: ${batchLabel} JSON parse failed, length=${content.text.length}`);
          console.error(`[correct] ${transcriptionId}: Last 200 chars: ${content.text.slice(-200)}`);
          throw parseErr;
        }

        console.log(`[correct] ${transcriptionId}: ${batchLabel} parsed, ${result.total_changes} changes`);
        return result;
      })
    );

    const elapsed = Date.now() - startTime;

    // 全バッチの結果をマージ
    const correctionMap = new Map<number, DiffOnlyResult["corrections"][0]>();
    let totalChanges = 0;

    for (const result of batchResults) {
      totalChanges += result.total_changes;
      for (const c of result.corrections) {
        correctionMap.set(c.index, c);
      }
    }

    console.log(`[correct] ${transcriptionId}: All ${batches.length} batches completed in ${elapsed}ms, total ${totalChanges} changes`);

    // 全utterances分の配列を構築
    const allCorrected: CorrectedUtterance[] = utterances.map((u, i) => {
      const correction = correctionMap.get(i);
      if (correction) {
        return {
          index: i,
          original_text: u.text,
          corrected_text: correction.corrected_text,
          changes: correction.changes,
        };
      }
      return {
        index: i,
        original_text: u.text,
        corrected_text: u.text,
        changes: [],
      };
    });

    const summary = `${totalChanges}件の補正を行いました（${batches.length}バッチ並列処理, ${Math.round(elapsed / 1000)}秒）`;

    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        correctedUtterances: JSON.parse(JSON.stringify(allCorrected)),
        correctionSummary: summary,
        status: finalStatus,
      },
    });
  } catch (error) {
    console.error(`[correct] ${transcriptionId}: Error -`, error);
    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        status: finalStatus,
        correctionSummary: "清書処理でエラーが発生しました",
      },
    });
  }
}

async function getPromptTemplate(): Promise<string> {
  try {
    const record = await prisma.promptTemplate.findUnique({
      where: { name: "correction" },
    });
    if (record) return record.content;
  } catch (e) {
    console.warn("[correct] Failed to load prompt template from DB, using default", e);
  }
  return DEFAULT_CORRECTION_PROMPT;
}

function buildCorrectionPrompt(template: string, utterances: Utterance[], dictEntries: DictEntry[], startIndex: number): string {
  let dictSection = "";
  if (dictEntries.length > 0) {
    dictSection = "## 修正辞書\n以下の誤表記→正しい表記の対応に従って修正してください:\n";
    for (const entry of dictEntries) {
      if (entry.incorrectTerm !== entry.correctTerm) {
        dictSection += `- 「${entry.incorrectTerm}」→「${entry.correctTerm}」（${entry.category}）\n`;
      } else {
        dictSection += `- 「${entry.correctTerm}」（${entry.category}）: 正しい表記として認識してください\n`;
      }
    }
  }

  const utteranceText = utterances
    .map((u, i) => `index ${startIndex + i} [${u.speaker_id || "unknown"}]: ${u.text}`)
    .join("\n");

  return template
    .replace("{{辞書セクション}}", dictSection)
    .replace("{{utterancesテキスト}}", utteranceText);
}
