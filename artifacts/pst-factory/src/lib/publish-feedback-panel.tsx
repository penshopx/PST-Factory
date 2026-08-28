import React from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import type { PublishNotice } from './publish-feedback';

export function PublishNoticePanel({
  notice,
  onRefresh,
}: {
  notice: PublishNotice;
  onRefresh: () => void;
}) {
  const isConflict = notice.kind === 'conflict';

  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-lg p-4 ${
        isConflict
          ? 'border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100'
          : 'border border-destructive/30 bg-destructive/5 text-destructive'
      }`}
      role="alert"
      data-testid={isConflict ? 'status-publish-conflict' : 'status-publish-error'}
    >
      <TriangleAlert className="mt-0.5 shrink-0" size={18} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{isConflict ? 'Rilis sudah diterbitkan' : 'Penerbitan gagal'}</p>
        <p className="mt-1 text-xs leading-relaxed">{notice.message}</p>
        <button
          type="button"
          className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={onRefresh}
          data-testid={isConflict ? 'button-refresh-after-publish-conflict' : 'button-refresh-after-publish-error'}
        >
          <RefreshCw size={14} /> {isConflict ? 'Segarkan data project' : 'Segarkan project'}
        </button>
      </div>
    </div>
  );
}