const prefix = 'glosswatch-';
/** A cross-tab lease keeps a player's temporary file safe from startup cleanup. */
export async function temporaryVideo() {
  const directory = await navigator.storage.getDirectory();
  const name = `${prefix}${crypto.randomUUID()}.mp4`;
  let release!: () => void;
  let acquired!: () => void;
  const ready = new Promise<void>(resolve => acquired = resolve);
  const hold = new Promise<void>(resolve => release = resolve);
  const lease = navigator.locks.request(name, async () => { acquired(); await hold; });
  await Promise.race([ready, lease]);
  return {
    directory, name,
    async dispose() {
      try { await directory.removeEntry(name); }
      catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
      finally { release(); await lease; }
    },
  };
}

export async function cleanTemporaryVideos() {
  if (!navigator.storage?.getDirectory || !navigator.locks) return;
  const directory = await navigator.storage.getDirectory();
  const entries = directory as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> };
  for await (const [name, handle] of entries.entries()) {
    if (handle.kind !== 'file' || !/^glosswatch-[0-9a-f-]+\.mp4$/.test(name)) continue;
    await navigator.locks.request(name, { ifAvailable: true }, async lock => {
      if (lock) await directory.removeEntry(name).catch(() => {});
    });
  }
}
