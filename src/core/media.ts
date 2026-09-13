import { Input, BlobSource, MATROSKA, Output, Mp4OutputFormat, StreamTarget, Conversion } from 'mediabunny';
import { temporaryVideo } from './temporary-files';

class MediaError extends Error {}

export async function remux(file: File, signal: AbortSignal, onProgress: (progress: number) => void): Promise<{ file: File; dispose: () => Promise<void> }> {
  const input = new Input({ source: new BlobSource(file), formats: [MATROSKA] });
  let temporary: Awaited<ReturnType<typeof temporaryVideo>> | undefined;
  let stream: FileSystemWritableFileStream | undefined;
  let conversion: Conversion | undefined;
  const cancel = () => { void conversion?.cancel().catch(() => {}); };
  const dispose = async () => { await temporary?.dispose(); };
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video) throw new MediaError('This file has no readable video track. Choose another video.');
    const codecs = [await video.getCodecParameterString(), audio ? await audio.getCodecParameterString() : null].filter(Boolean).join(',');
    const probe = document.createElement('video');
    if (!probe.canPlayType(`video/mp4; codecs="${codecs}"`)) {
      throw new MediaError(`This browser cannot play ${video.codec ?? 'this video codec'}${audio ? ` / ${audio.codec}` : ''}. Try an H.264/AAC or VP9/Opus version. Glosswatch changes containers; it does not re-encode video.`);
    }
    if (!navigator.storage?.getDirectory) throw new MediaError('This browser cannot create the temporary local file needed for MKV playback. Try a current Chrome or Firefox version.');
    const estimate = await navigator.storage.estimate();
    if (estimate.quota && estimate.quota - (estimate.usage ?? 0) < file.size * 1.1) throw new MediaError('There is not enough browser storage to prepare this video. Free some disk space or choose a smaller file.');
    temporary = await temporaryVideo();
    const handle = await temporary.directory.getFileHandle(temporary.name, { create: true });
    stream = await handle.createWritable();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'fragmented' }), target: new StreamTarget(stream) });
    conversion = await Conversion.init({ input, output, tracks: 'primary', copy: { mode: 'forced' } });
    if (!conversion.isValid || conversion.discardedTracks.some(track => track.reason !== 'max_track_count_of_type_reached' && track.reason !== 'max_track_count_reached')) {
      throw new MediaError('The video or audio track could not be copied into MP4. Choose an H.264/AAC version of this file.');
    }
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    conversion.onProgress = progress => onProgress(progress);
    await conversion.execute();
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    // StreamTarget closes its writer when the conversion finalizes.
    stream = undefined;
    return { file: await handle.getFile(), dispose };
  } catch (error) {
    await conversion?.cancel().catch(() => {});
    if (stream && !stream.locked) await stream.abort().catch(() => {});
    await dispose();
    if (error instanceof DOMException && error.name === 'QuotaExceededError') throw new Error('Browser storage is full. Free some disk space and open the video again.');
    if (error instanceof MediaError || signal.aborted) throw error;
    throw new MediaError('This MKV file could not be prepared. It may be damaged or use an unsupported format. Try another file.');
  } finally { signal.removeEventListener('abort', cancel); input.dispose(); }
}
