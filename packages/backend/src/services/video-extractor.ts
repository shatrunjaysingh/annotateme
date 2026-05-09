import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface ExtractionResult {
  frames: string[];   // absolute paths to extracted JPEG files
  durationSec: number;
}

/** Probe video duration in seconds using ffprobe. */
export function probeDuration(videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      videoPath,
    ]);
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', () => {
      try {
        const json = JSON.parse(out);
        resolve(parseFloat(json?.format?.duration ?? '0'));
      } catch {
        resolve(0);
      }
    });
    proc.on('error', () => resolve(0));
  });
}

/** Extract frames from a video at the given FPS into outputDir as frame_%06d.jpg */
export function extractFrames(
  videoPath: string,
  outputDir: string,
  fps: number,
): Promise<ExtractionResult> {
  return new Promise(async (resolve, reject) => {
    fs.mkdirSync(outputDir, { recursive: true });

    const durationSec = await probeDuration(videoPath);
    const pattern = path.join(outputDir, 'frame_%06d.jpg');

    const args = [
      '-i', videoPath,
      '-vf', `fps=${fps}`,
      '-q:v', '2',      // JPEG quality 2 = high quality, small size
      '-f', 'image2',
      pattern,
    ];

    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed (exit ${code}): ${stderr.slice(-500)}`));
        return;
      }
      const frames = fs.readdirSync(outputDir)
        .filter(f => f.endsWith('.jpg'))
        .sort()
        .map(f => path.join(outputDir, f));
      resolve({ frames, durationSec });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}. Is ffmpeg installed?`));
    });
  });
}
