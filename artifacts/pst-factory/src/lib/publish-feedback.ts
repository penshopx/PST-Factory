export type PublishNoticeKind = 'conflict' | 'requirements' | 'error';

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

function isCandidateRequirementsError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; data?: unknown };
  if (candidate.status !== 409 || !candidate.data || typeof candidate.data !== 'object') return false;
  return (candidate.data as { error?: unknown }).error
    === 'Only an approved PST without blocking QA errors can be published.';
}

export function getPublishNoticeForError(error: unknown): PublishNotice {
  if (isRetryablePublishConflict(error)) {
    return {
        kind: 'conflict',
        message: 'Versi ini sudah diterbitkan oleh admin lain. Muat ulang data proyek sebelum mencoba lagi.',
    };
  }
  if (isCandidateRequirementsError(error)) {
    return {
      kind: 'requirements',
      message: 'Kandidat PST telah berubah sejak QA atau persetujuan. Jalankan QA lagi, setujui ulang, lalu terbitkan.',
    };
  }
  return {
    kind: 'error',
    message: 'Proyek belum bisa diterbitkan. Muat ulang proyek ini lalu coba lagi.',
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