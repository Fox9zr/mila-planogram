import { mockStorage, rawRecords } from './fixtures/indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localStore, storageErrorMessage, LIBRARY_CHANGE_KEY, PROJECTS_STORAGE_KEY } from '$lib/services/datastore';
import { DATABASE_NAME } from '$lib/services/localDatabase';
import { createDefaultProject } from '$lib/stores/project';

let data: Map<string, string>;

beforeEach(() => {
  data = mockStorage();
});

describe('local-only project persistence', () => {
  it('round trips a project through the DataStore interface without network access', async () => {
    const fetchSpy = vi.fn(() => { throw new Error('persistence must never touch the network'); });
    vi.stubGlobal('fetch', fetchSpy);

    const project = createDefaultProject('Mila 1200 shelf');
    await localStore.save(project);

    const loaded = await localStore.load(project.id);
    expect(loaded?.name).toBe('Mila 1200 shelf');
    expect(await localStore.has(project.id)).toBe(true);
    expect(await localStore.list()).toEqual([{ id: project.id, name: project.name, updatedAt: project.updatedAt.toISOString() }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stores project bytes in IndexedDB and never in localStorage', async () => {
    const project = createDefaultProject('Secret plan name');
    await localStore.save(project);

    const stored = await rawRecords('projects');
    expect(JSON.parse(stored[project.id]).name).toBe('Secret plan name');

    // localStorage keeps only the change-notification nonce and never project data.
    expect(data.has(PROJECTS_STORAGE_KEY)).toBe(false);
    for (const [key, value] of data) {
      expect(key).toBe(LIBRARY_CHANGE_KEY);
      expect(value).not.toContain('Secret plan name');
      expect(JSON.parse(value)).toMatchObject({ id: project.id });
    }
    expect(DATABASE_NAME).toBe('openplan3d-local');
  });

  it('reports storage failures with a JSON-backup hint rather than a sync error', () => {
    expect(storageErrorMessage(new DOMException('Full', 'QuotaExceededError'))).toContain('Download your project as JSON');
    expect(storageErrorMessage(new DOMException('Denied', 'SecurityError'))).toContain('Allow site storage');
    expect(storageErrorMessage(new Error('boom'))).toBe('boom');
  });
});
