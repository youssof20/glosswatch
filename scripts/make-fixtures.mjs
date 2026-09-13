import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('.cache/fixtures', { recursive: true });
for (const ext of ['mp4','mkv']) {
  const result = spawnSync('ffmpeg', ['-y','-f','lavfi','-i','testsrc2=size=960x540:rate=24','-f','lavfi','-i','sine=frequency=220:sample_rate=44100','-t','10','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',`.cache/fixtures/sample.${ext}`], { stdio: 'ignore', windowsHide: true });
  if (result.status !== 0) throw new Error('Install ffmpeg to generate the browser test videos.');
}
console.log('Created original MP4 and MKV test videos.');
