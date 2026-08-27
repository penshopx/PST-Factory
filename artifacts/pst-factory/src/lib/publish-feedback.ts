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
        message: 'This release was already published by another admin. Refresh the project data before trying again.',
      }
    : {
        kind: 'error',
        message: 'Publishing could not be completed. Refresh this project and try again.',
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