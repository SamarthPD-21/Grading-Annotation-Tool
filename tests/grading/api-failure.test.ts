import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// vi.mock is hoisted above module scope, so the spy has to be hoisted with it.
const { submissionUpdate } = vi.hoisted(() => ({ submissionUpdate: vi.fn() }));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    submission: {
      findUnique: vi.fn(),
      update: submissionUpdate,
    },
  },
}));
vi.mock('@/lib/grading/grade', () => ({ processGradingPipeline: vi.fn() }));

import { executeGrading } from '@/services/grading.service';
import { prisma } from '@/lib/db/prisma';
import { processGradingPipeline } from '@/lib/grading/grade';
import { LLMError } from '@/lib/llm/errors';

const SUBMISSION = {
  id: 'sub-1',
  studentFile: '/tmp/answer.pdf',
  gradingRuns: [],
  paper: { questions: [] },
};

/** The last `status: 'FAILED'` write, which is what the UI renders. */
function failureWrite() {
  const call = submissionUpdate.mock.calls.find((c) => c[0]?.data?.status === 'FAILED');
  return call?.[0]?.data;
}

beforeEach(() => {
  submissionUpdate.mockReset().mockResolvedValue({});
  (prisma.submission.findUnique as unknown as Mock).mockResolvedValue(SUBMISSION);
});

describe('Test Category 7: API Failure Handling', () => {
  it('records an exhausted provider chain as a quota error naming every model tried', async () => {
    vi.mocked(processGradingPipeline).mockRejectedValue(
      new LLMError('LLM_QUOTA_EXCEEDED', '429 You have no credits remaining.', {
        provider: 'gemini',
        model: 'gemini-3.7-flash',
        attempts: [
          {
            provider: 'gemini',
            model: 'gemini-3.7-flash',
            code: 'LLM_QUOTA_EXCEEDED',
            message: '429 You have no credits remaining.',
          },
          {
            provider: 'gemma',
            model: 'gemma-4-31b-it',
            code: 'LLM_QUOTA_EXCEEDED',
            message: '429 RESOURCE_EXHAUSTED',
          },
        ],
      })
    );

    await expect(executeGrading('sub-1')).rejects.toThrow(LLMError);

    const data = failureWrite();
    expect(data.errorCode).toBe('LLM_QUOTA_EXCEEDED');
    // The per-provider breakdown is persisted structurally so the UI can render it as a
    // list rather than one unreadable red string.
    const detail = JSON.parse(data.errorDetail);
    expect(detail.attempts.map((a: { model: string }) => a.model)).toEqual([
      'gemini-3.7-flash',
      'gemma-4-31b-it',
    ]);
  });

  it('records a model refusal under its own code rather than the generic bucket', async () => {
    vi.mocked(processGradingPipeline).mockRejectedValue(
      new LLMError('LLM_REFUSAL', 'Model refused to grade: Safety policy triggered', {
        provider: 'gemini',
        model: 'gemini-3.7-flash',
        failover: false,
      })
    );

    await expect(executeGrading('sub-1')).rejects.toThrow('Safety policy triggered');

    expect(failureWrite().errorCode).toBe('LLM_REFUSAL');
  });

  it('still buckets a genuine non-LLM failure as GRADING_PIPELINE_ERROR', async () => {
    vi.mocked(processGradingPipeline).mockRejectedValue(new Error('Could not read PDF'));

    await expect(executeGrading('sub-1')).rejects.toThrow('Could not read PDF');

    expect(failureWrite()).toMatchObject({
      errorCode: 'GRADING_PIPELINE_ERROR',
      errorMessage: 'Could not read PDF',
    });
  });
});
