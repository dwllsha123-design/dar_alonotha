/**
 * Central upload root — production media must live on the Railway volume.
 *
 * Prefer RAILWAY_VOLUME_MOUNT_PATH (e.g. /app/uploads) when present.
 * Public URL prefix remains /uploads/... for static serving.
 */
import { mkdirSync } from 'fs';
import { join } from 'path';

export function uploadRoot(): string {
  const fromEnv =
    process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() ||
    process.env.UPLOAD_ROOT?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  // Local/dev: project uploads/ (never /tmp, never source-tree assets)
  return join(process.cwd(), 'uploads');
}

/** Absolute disk path under upload root, e.g. products/color-media */
export function uploadDir(...parts: string[]): string {
  const dir = join(uploadRoot(), ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Public URL prefix for a subdirectory under uploads */
export function uploadPublicPrefix(...parts: string[]): string {
  const rel = parts.filter(Boolean).join('/');
  return rel ? `/uploads/${rel}` : '/uploads';
}

export function assertSafeUploadRoot() {
  const root = uploadRoot().replace(/\\/g, '/').toLowerCase();
  const forbidden = ['/tmp', '\\tmp', '/app/public/uploads', '/data/uploads'];
  for (const bad of forbidden) {
    if (root === bad || root.startsWith(bad + '/')) {
      throw new Error(`Unsafe UPLOAD_ROOT: ${uploadRoot()}`);
    }
  }
}
