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
      message: 'This release was already published by another admin. Refresh the project data before trying again.',
    },
  );

  const markup = renderToStaticMarkup(
    <PublishNoticePanel notice={notice} onRefresh={() => undefined} />,
  );
  assert.match(markup, /Release already published/);
  assert.match(markup, /Refresh project data/);
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
      message: 'Publishing could not be completed. Refresh this project and try again.',
    },
  );
  const markup = renderToStaticMarkup(
    <PublishNoticePanel notice={notice} onRefresh={() => undefined} />,
  );
  assert.match(markup, /Publishing failed/);
  assert.match(markup, /Refresh project(?! data)/);
  assert.doesNotMatch(markup, /Release already published/);
  assert.equal(
    getPublishNoticeForError(new Error('network failure')).kind,
    'error',
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