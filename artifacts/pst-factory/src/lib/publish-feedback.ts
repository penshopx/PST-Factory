export type PublishNoticeKind = 'conflict' | 'error';

export type PublishNotice = {
  kind: PublishNoticeKind;
  message: string;
};

export function isRetryablePublishConflict(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; data?: unknown };
  if (candidate.status !== 409 || !candidate.data || typeof candidate.data !== 'object') return false;
  return (candidate.data as { retryable?: unknown }).retryable === true;
}

export function getPublishNoticeForError(error: unknown): PublishNotice {
  return isRetryablePublishConflict(error)
    ? {
        kind: 'conflict',
        message: 'Rilis ini sudah diterbitkan oleh admin lain. Segarkan data project sebelum mencoba lagi.',
      }
    : {
        kind: 'error',
        message: 'Penerbitan tidak dapat diselesaikan. Segarkan project ini lalu coba lagi.',
      };
}

type RefreshResult = { isSuccess: boolean };

export async function refreshProjectData(
  refetches: readonly (() => Promise<RefreshResult>)[],
  onSuccess: () => void,
) {
  const results = await Promise.allSettled(refetches.map((refetch) => refetch()));
  if (results.every((result) => result.status === 'fulfilled' && result.value.isSuccess)) onSuccess();
}