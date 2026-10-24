import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { OcrRow } from "./labels";

// Haiku 5.5: الأرخص (صاحب المشروع طلب موديل خفيف للتجربة). ما إله server-side fallback،
// فما بنبعت betas/fallbacks، والرفض (stop_reason "refusal") بيرجع للإدخال اليدوي.
export const OCR_MODEL = "claude-haiku-5-5";

const resultSchema = z.object({
  form_code: z
    .string()
    .describe('The code printed under the QR code, e.g. "SWF-COUNT-v1". Empty if unreadable.'),
  rows: z.array(
    z.object({
      row: z.number().int().describe("The row number printed at the start of the row (1-based)."),
      whole_cakes: z
        .number()
        .int()
        .nullable()
        .describe("Handwritten number in the cakes box; null if empty."),
      loose_pieces: z
        .number()
        .int()
        .nullable()
        .describe("Handwritten number in the pieces box; null if empty."),
      whole_confidence: z
        .number()
        .describe("0 to 1: how sure you are about the cakes box (1 for a clearly empty box)."),
      pieces_confidence: z
        .number()
        .describe("0 to 1: how sure you are about the pieces box (1 for a clearly empty box)."),
    }),
  ),
  is_count_form: z.boolean().describe("False if the photo is not a Mekasa count form."),
});

export type OcrResult = { formCode: string; rows: OcrRow[]; isCountForm: boolean };
export type OcrUsage = { model: string; inputTokens: number; outputTokens: number; raw: unknown };

const SYSTEM = `You read photos of Mekasa's printed A4 stock-count form. The form has a numbered table of products.
Each row has two boxes on the left: "كيكات" (whole cakes) and "قطع" (loose pieces). Staff write numbers by hand.
Rows whose cakes box is grey with a dash are pieces-only products: return null for whole_cakes there.
Read every row of the table, in order. An empty box means null, not zero.
Digits may be Western (0-9) or Arabic-Indic (٠-٩); return them as integers.
Give an honest confidence for every box: lower it for smudged, overwritten, cut-off or ambiguous digits (e.g. 1 vs 7, 4 vs 9).
Never guess a number to fill a row you cannot see; give it low confidence instead.`;

/** بيقرأ صورة الفورم. بيرمي خطأ إذا ما في مفتاح أو فشل الطلب (المنادي بيرجع للإدخال اليدوي). */
export async function readCountFormImage(
  image: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" },
  expectedRows: number,
): Promise<{ result: OcrResult; usage: OcrUsage }> {
  if (process.env.MEKASA_FAKE_OCR === "1" && process.env.NODE_ENV !== "production") {
    return fakeRead(expectedRows);
  }

  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: OCR_MODEL,
    max_tokens: 16000,
    output_config: { effort: "high", format: betaZodOutputFormat(resultSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
          { type: "text", text: `The printed table has ${expectedRows} rows. Read the form.` },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`OCR returned no result (stop_reason: ${response.stop_reason})`);
  }
  const parsed = response.parsed_output;
  return {
    result: { formCode: parsed.form_code, rows: parsed.rows, isCountForm: parsed.is_count_form },
    usage: {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      raw: parsed,
    },
  };
}

// للتطوير والاختبارات بس (MEKASA_FAKE_OCR=1): أرقام ثابتة، والسطر الثاني مش أكيد
function fakeRead(expectedRows: number): { result: OcrResult; usage: OcrUsage } {
  const rows = Array.from({ length: expectedRows }, (_, i) => ({
    row: i + 1,
    whole_cakes: i % 3,
    loose_pieces: i % 4,
    whole_confidence: i === 1 ? 0.4 : 0.98,
    pieces_confidence: 0.97,
  }));
  return {
    result: { formCode: "", rows, isCountForm: true },
    usage: { model: "fake", inputTokens: 0, outputTokens: 0, raw: { fake: true } },
  };
}
