import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  getPublishNoticeForError,
  refreshProjectData,
} from './publish-feedback';
import { PublishNoticePanel } from './publish-feedback-panel';

test('retryable publish conflicts show release-published guidance', () => {
  const notice = getPublishNoticeForError({
    status: 409,
    data: { error: 'A newer release already exists.', retryable: true },
  });

  assert.deepEqual(
    notice,
    {
      kind: 'conflict',
      message: 'Versi ini sudah diterbitkan oleh admin lain. Muat ulang data proyek sebelum mencoba lagi.',
    },
  );

  const markup = renderToStaticMarkup(
    <PublishNoticePanel notice={notice} onRefresh={() => undefined} />,
  );
  assert.match(markup, /Rilis sudah diterbitkan/);
  assert.match(markup, /Muat ulang data proyek/);
  assert.match(markup, /status-publish-conflict/);
});

test('ordinary publish errors keep the general failure guidance', () => {
  const notice = getPublishNoticeForError({
    status: 409,
    data: { error: 'Only an approved PST can be published.' },
  });

  assert.deepEqual(
    notice,
    {
      kind: 'error',
      message: 'Proyek belum bisa diterbitkan. Muat ulang proyek ini lalu coba lagi.',
    },
  );
  const markup = renderToStaticMarkup(
    <PublishNoticePanel notice={notice} onRefresh={() => undefined} />,
  );
  assert.match(markup, /Penerbitan gagal/);
  assert.match(markup, /Muat ulang proyek/);
  assert.doesNotMatch(markup, /Rilis sudah diterbitkan/);
  assert.equal(
    getPublishNoticeForError(new Error('network failure')).kind,
    'error',
  );
});

test('candidate mismatches direct operators to rerun QA and approval', () => {
  const notice = getPublishNoticeForError({
    status: 409,
    data: { error: 'Only an approved PST without blocking QA errors can be published.' },
  });

  assert.equal(notice.kind, 'requirements');
  assert.match(notice.message, /Jalankan QA lagi, setujui ulang/);
  assert.match(
    renderToStaticMarkup(<PublishNoticePanel notice={notice} onRefresh={() => undefined} />),
    /QA dan persetujuan perlu diulang/,
  );
});

test('publish error state resets after all project data reloads successfully', async () => {
  let resetCount = 0;
  const refetched: string[] = [];

  await refreshProjectData(
    [
      async () => {
        refetched.push('project');
        return { isSuccess: true };
      },
      async () => {
        refetched.push('blueprint');
        return { isSuccess: true };
      },
      async () => {
        refetched.push('releases');
        return { isSuccess: true };
      },
    ],
    () => {
      resetCount += 1;
    },
  );

  assert.deepEqual(refetched, ['project', 'blueprint', 'releases']);
  assert.equal(resetCount, 1);
});

test('publish error state remains when project data refresh fails', async () => {
  let resetCount = 0;

  await refreshProjectData(
    [
      async () => ({ isSuccess: true }),
      async () => ({ isSuccess: false }),
      async () => ({ isSuccess: true }),
    ],
    () => {
      resetCount += 1;
    },
  );

  assert.equal(resetCount, 0);
});

test('publish error state remains when project data refresh rejects', async () => {
  let resetCount = 0;

  await refreshProjectData(
    [
      async () => ({ isSuccess: true }),
      async () => {
        throw new Error('refresh failed');
      },
      async () => ({ isSuccess: true }),
    ],
    () => {
      resetCount += 1;
    },
  );

  assert.equal(resetCount, 0);
});