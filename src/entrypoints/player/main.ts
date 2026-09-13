import '../../ui/page.css';
import { select } from '../../ui/dom';
import { Watch } from '../../ui/watch';
import { request, message } from '../../core/client';
import { cleanTemporaryVideos } from '../../core/temporary-files';

const video = select<HTMLVideoElement>(document, '#video');
const stage = select<HTMLElement>(document, '#stage');
const fileInput = select<HTMLInputElement>(document, '#video-file');
const progress = select<HTMLElement>(document, '#progress');
const watch = new Watch();
void cleanTemporaryVideos().catch(() => {});
let activeUrl = '', generation = 0, controller: AbortController | undefined;
let cleanFile: (() => Promise<void>) | undefined;

function notice(text: string, error = false) {
  const node = select<HTMLElement>(document, '#notice'); node.hidden = !text; node.classList.toggle('error', error);
  select(node, 'p').textContent = text;
}
const initialNotice = new URLSearchParams(location.search).get('notice');
if (initialNotice === 'file-access') {
  notice('To use Glosswatch in a file tab, enable “Allow access to file URLs” in the extension settings, then reload that tab. Or open your video here.');
  select<HTMLElement>(document, '#notice-action').hidden = false;
} else if (initialNotice) notice('Glosswatch cannot run on this browser page. Open a normal web video, or choose a local video below.');
select(document, '#notice-action').addEventListener('click', () => { void request('extension.settings').catch(error => notice(message(error), true)); });
select(document, '#dismiss-notice').addEventListener('click', () => notice(''));
for (const id of ['#choose-video', '#change-video']) select(document, id).addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) void openVideo(fileInput.files[0]); fileInput.value = ''; });

async function release() {
  video.pause(); video.removeAttribute('src'); video.load();
  if (activeUrl) { URL.revokeObjectURL(activeUrl); activeUrl = ''; }
  const cleanup = cleanFile; cleanFile = undefined; await cleanup?.();
}
async function openVideo(file: File) {
  const id = ++generation; controller?.abort(); controller = new AbortController();
  const signal = controller.signal;
  await release(); notice('');
  if (generation !== id) return;
  select<HTMLElement>(document, '#empty-player').hidden = true;
  select<HTMLElement>(document, '#change-video').hidden = false;
  select(document, '#file-label').textContent = file.name;
  select(document, '#file-status').textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · Local file`;
  video.hidden = true;
  try {
    if (!file.size) throw new Error('This video file is empty. Choose another file.');
    let playable: File = file;
    if (/\.avi$/i.test(file.name)) throw new Error('AVI is not supported. Choose an MP4, WebM, MOV, or MKV file.');
    if (/\.mkv$/i.test(file.name)) {
      progress.hidden = false;
      const { remux } = await import('../../core/media');
      const result = await remux(file, signal, value => {
        if (generation !== id) return;
        select<HTMLProgressElement>(document, 'progress').value = value;
        select(document, '#progress-label').textContent = `${Math.round(value * 100)}% · Copying video and audio without re-encoding`;
      });
      if (generation !== id) { await result.dispose(); return; }
      playable = result.file; cleanFile = result.dispose;
    }
    if (generation !== id) return;
    activeUrl = URL.createObjectURL(playable); video.src = activeUrl;
    video.dataset.glosswatchFile = `${file.name}|${file.size}|${file.lastModified}`;
    video.hidden = false; progress.hidden = true; video.load();
  } catch (error) {
    if (generation !== id) return;
    progress.hidden = true; select<HTMLElement>(document, '#empty-player').hidden = false;
    if (!signal.aborted) notice(message(error), true);
  }
}
select(document, '#cancel').addEventListener('click', () => {
  generation++; controller?.abort(); progress.hidden = true; select<HTMLElement>(document, '#empty-player').hidden = false;
  notice('Video preparation cancelled. You can choose another file.');
});
video.addEventListener('error', () => {
  if (!video.getAttribute('src')) return;
  notice('This browser could not play the video or audio codec. Try an H.264/AAC MP4 or VP9/Opus WebM version.', true);
});
stage.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); stage.classList.add('dragging'); } });
stage.addEventListener('dragleave', () => stage.classList.remove('dragging'));
stage.addEventListener('drop', event => {
  stage.classList.remove('dragging');
  const files = Array.from(event.dataTransfer?.files ?? []);
  const movie = files.find(file => !/\.(srt|vtt|ass|ssa|sub|idx)$/i.test(file.name));
  if (!movie) return;
  event.preventDefault(); event.stopPropagation();
  void openVideo(movie).then(async () => {
    const subtitles = files.filter(file => /\.(srt|vtt|ass|ssa)$/i.test(file.name));
    if (subtitles[0]) await watch.load(subtitles[0]);
    if (subtitles[1]) await watch.load(subtitles[1], true);
  });
});
window.addEventListener('pagehide', () => { controller?.abort(); watch.dispose(); void release(); });
