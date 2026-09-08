import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { extname, join } from 'path';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const VIDEO_MIME = /^video\/(mp4|webm|quicktime|x-m4v)$/i;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_COLOR_VIDEO_MS = 10_000;
export const MAX_COLOR_MEDIA_IMAGES = 4;

export type UploadedVideoFile = {
  filename?: string;
  path?: string;
  destination?: string;
  originalname: string;
  mimetype: string;
  size?: number;
  buffer?: Buffer;
};

export function videoUploadOptions(dest: string): MulterOptions {
  mkdirSync(dest, { recursive: true });
  return {
    dest,
    limits: { fileSize: MAX_VIDEO_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!VIDEO_MIME.test(file.mimetype)) {
        cb(
          new BadRequestException('يُسمح بفيديو MP4 أو WebM فقط') as unknown as Error,
          false,
        );
        return;
      }
      cb(null, true);
    },
  };
}

function extForMime(mimetype: string, originalname: string): string {
  const fromName = extname(originalname || '').toLowerCase();
  if (fromName === '.mp4' || fromName === '.webm' || fromName === '.mov' || fromName === '.m4v') {
    return fromName;
  }
  if (/webm/i.test(mimetype)) return '.webm';
  if (/quicktime|mov/i.test(mimetype)) return '.mov';
  return '.mp4';
}

async function readDurationMs(buf: Buffer, mimetype: string): Promise<number> {
  try {
    const { parseBuffer } = await import('music-metadata');
    const meta = await parseBuffer(buf, { mimeType: mimetype });
    if (meta.format.duration && Number.isFinite(meta.format.duration)) {
      return Math.round(meta.format.duration * 1000);
    }
  } catch {
    /* fall through */
  }
  return 0;
}

/** Saves video with unique name; validates duration ≤ 10s via metadata. */
export async function saveColorVideoUpload(
  file: UploadedVideoFile,
  destDir: string,
  publicPrefix: string,
  claimedDurationMs?: number,
): Promise<{ filename: string; url: string; durationMs: number }> {
  mkdirSync(destDir, { recursive: true });

  const buf =
    file.buffer ||
    (file.path && existsSync(file.path)
      ? readFileSync(file.path)
      : file.filename && file.destination
        ? readFileSync(join(file.destination, file.filename))
        : null);
  if (!buf?.length) {
    throw new BadRequestException('ملف الفيديو غير صالح');
  }

  let durationMs = await readDurationMs(buf, file.mimetype);

  if (!durationMs && claimedDurationMs && claimedDurationMs > 0) {
    durationMs = Math.round(claimedDurationMs);
  }

  if (!durationMs || durationMs <= 0) {
    cleanupTemp(file);
    throw new BadRequestException(
      'تعذر قراءة مدة الفيديو. جرّبي ملفاً بصيغة MP4 أو WebM.',
    );
  }

  if (durationMs > MAX_COLOR_VIDEO_MS) {
    cleanupTemp(file);
    throw new BadRequestException('مدة الفيديو يجب ألا تتجاوز 10 ثوانٍ.');
  }

  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}${extForMime(file.mimetype, file.originalname)}`;
  const outPath = join(destDir, filename);

  if (file.path && existsSync(file.path)) {
    try {
      renameSync(file.path, outPath);
    } catch {
      copyFileSync(file.path, outPath);
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }
  } else {
    writeFileSync(outPath, buf);
  }

  const prefix = publicPrefix.replace(/\/$/, '');
  return {
    filename,
    url: `${prefix}/${filename}`,
    durationMs,
  };
}

function cleanupTemp(file: UploadedVideoFile) {
  try {
    if (file.path && existsSync(file.path)) unlinkSync(file.path);
  } catch {
    /* ignore */
  }
}

/** Pure helpers for regression tests (no I/O). */
export function assertColorImageSlotAvailable(currentCount: number) {
  if (currentCount >= MAX_COLOR_MEDIA_IMAGES) {
    throw new BadRequestException('يمكن إضافة 4 صور كحد أقصى لكل لون.');
  }
}

export function assertColorVideoDurationMs(durationMs: number) {
  if (!durationMs || durationMs <= 0) {
    throw new BadRequestException(
      'تعذر قراءة مدة الفيديو. جرّبي ملفاً بصيغة MP4 أو WebM.',
    );
  }
  if (durationMs > MAX_COLOR_VIDEO_MS) {
    throw new BadRequestException('مدة الفيديو يجب ألا تتجاوز 10 ثوانٍ.');
  }
}

export function assertVideoMime(mimetype: string) {
  if (!VIDEO_MIME.test(mimetype)) {
    throw new BadRequestException('يُسمح بفيديو MP4 أو WebM فقط');
  }
}
