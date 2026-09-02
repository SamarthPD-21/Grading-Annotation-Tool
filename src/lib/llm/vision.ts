import fs from 'fs';
import { LLMError, classifyLLMError, condenseProviderMessage } from './errors';

const GEMINI_REST = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Inline request bodies are capped around 20MB, and base64 inflates by ~33%. */
const MAX_INLINE_BYTES = 14 * 1024 * 1024;

const TRANSCRIPTION_PROMPT = `
Transcribe this student's answer sheet exactly as written.

- Reproduce the student's own words, including their spelling and grammar mistakes.
- Do NOT correct, improve, complete or summarise anything.
- Keep the question numbering and paragraph breaks the student used.
- Where the handwriting is genuinely unreadable, write [illegible] rather than guessing.
- Describe diagrams only briefly, in square brackets, e.g. [diagram: circuit with battery
  and bulb]. Do not infer content the student did not draw.

Output only the transcription.
`.trim();

export interface Transcription {
  text: string;
  provider: string;
  model: string;
}

/**
 * Candidate vision models, most capable first. Gemma is deliberately absent — it is
 * text-only, so the ordinary provider chain cannot serve this.
 */
function visionModels(): string[] {
  const configured = process.env.GEMINI_VISION_MODEL;
  const defaults = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
  return configured ? [configured, ...defaults.filter((m) => m !== configured)] : defaults;
}

async function callGemini(model: string, apiKey: string, pdfBase64: string): Promise<string> {
  const response = await fetch(`${GEMINI_REST}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: TRANSCRIPTION_PROMPT },
            // The PDF goes over whole: Gemini rasterises it itself, which avoids pulling a
            // native canvas dependency in just to turn pages into images.
            { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw Object.assign(new Error(condenseProviderMessage(body)), { status: response.status });
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new LLMError('LLM_NO_RESPONSE', 'The model returned no transcription', {
      provider: 'gemini',
      model,
    });
  }

  return text;
}

/**
 * Reads a scanned or handwritten answer sheet that carries no selectable text.
 *
 * This produces words only — no coordinates — so evidence cannot be located on the page and
 * a transcribed run has no annotation boxes. Callers must say so rather than presenting an
 * un-annotated run as though evidence simply was not found.
 */
export async function transcribeAnswerPdf(pdfPath: string): Promise<Transcription> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new LLMError(
      'LLM_NOT_CONFIGURED',
      'Reading a scanned answer needs GEMINI_API_KEY — the text-only providers cannot see images.',
      { failover: false }
    );
  }

  const pdfBuffer = await fs.promises.readFile(pdfPath);

  if (pdfBuffer.byteLength > MAX_INLINE_BYTES) {
    throw new LLMError(
      'LLM_BAD_REQUEST',
      `This scan is ${(pdfBuffer.byteLength / 1024 / 1024).toFixed(1)}MB, over the ` +
        `${MAX_INLINE_BYTES / 1024 / 1024}MB limit for reading in one request. Split it or reduce the scan quality.`,
      { failover: false }
    );
  }

  const pdfBase64 = pdfBuffer.toString('base64');
  const models = visionModels();
  let lastError: LLMError | undefined;

  for (const model of models) {
    try {
      const text = await callGemini(model, apiKey, pdfBase64);
      console.log(`[vision] transcribed scan with gemini/${model}`);
      return { text, provider: 'gemini', model };
    } catch (error) {
      const classified = classifyLLMError(error, { id: 'gemini', model });
      // Flash models return 503 under load often enough that a single failure should not
      // sink the run when a sibling model can serve it.
      if (!classified.failover) throw classified;
      console.warn(`[vision] ${model} failed (${classified.code}), trying the next model`);
      lastError = classified;
    }
  }

  throw lastError ?? new LLMError('LLM_UNKNOWN', 'No vision model could read the scan');
}
