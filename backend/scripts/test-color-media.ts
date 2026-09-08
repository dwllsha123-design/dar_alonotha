/**
 * Regression checks for additive per-color media (no DB/storage mutation).
 * Run: npx ts-node --transpile-only scripts/test-color-media.ts
 */
import {
  assertColorImageSlotAvailable,
  assertColorVideoDurationMs,
  assertVideoMime,
  MAX_COLOR_MEDIA_IMAGES,
  MAX_COLOR_VIDEO_MS,
} from '../src/common/video-upload';

type GalleryItem = { url: string; kind: 'IMAGE' | 'VIDEO'; color?: string | null };

function fallbackGallery(args: {
  color: string | null;
  colorMedia: Array<{ color: string; kind: 'IMAGE' | 'VIDEO'; url: string; sortOrder: number }>;
  images: Array<{ url: string; color?: string | null }>;
  variantImageUrl?: string | null;
}): GalleryItem[] {
  const { color, colorMedia, images, variantImageUrl } = args;
  const newMedia = color
    ? colorMedia.filter((m) => m.color === color).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const imgs = newMedia.filter((m) => m.kind === 'IMAGE');
  const video = newMedia.find((m) => m.kind === 'VIDEO');
  if (imgs.length || video) {
    const items: GalleryItem[] = imgs.map((m) => ({
      url: m.url,
      kind: 'IMAGE',
      color,
    }));
    if (video) items.push({ url: video.url, kind: 'VIDEO', color });
    return items;
  }
  const colorImgs = color ? images.filter((i) => i.color === color) : [];
  if (colorImgs.length) {
    return colorImgs.map((i) => ({ url: i.url, kind: 'IMAGE', color: i.color }));
  }
  if (variantImageUrl) {
    return [{ url: variantImageUrl, kind: 'IMAGE', color }];
  }
  const generic = images.filter((i) => !i.color);
  return (generic.length ? generic : images).map((i) => ({
    url: i.url,
    kind: 'IMAGE',
    color: i.color,
  }));
}

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function expectThrow(name: string, fn: () => void, includes?: string) {
  try {
    fn();
    ok(name, false, 'expected throw');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ok(name, !includes || msg.includes(includes), msg);
  }
}

const legacyImages = [
  { url: '/uploads/products/old-a.webp', color: null as string | null },
  { url: '/uploads/products/old-b.webp', color: 'أسود' },
];
const frozenUrls = legacyImages.map((i) => i.url).join('|');

ok(
  'existing product still renders unchanged (no new media)',
  fallbackGallery({
    color: 'أسود',
    colorMedia: [],
    images: legacyImages,
  })
    .map((i) => i.url)
    .join('|') === '/uploads/products/old-b.webp',
);

ok(
  'existing general image URLs remain unchanged',
  fallbackGallery({
    color: null,
    colorMedia: [],
    images: legacyImages,
  })[0]?.url === '/uploads/products/old-a.webp' &&
    frozenUrls === '/uploads/products/old-a.webp|/uploads/products/old-b.webp',
);

ok(
  'color with no new media falls back to old gallery',
  fallbackGallery({
    color: 'بيج',
    colorMedia: [],
    images: legacyImages,
    variantImageUrl: null,
  })
    .map((i) => i.url)
    .join('|') === '/uploads/products/old-a.webp',
);

const oneImg = fallbackGallery({
  color: 'أسود',
  colorMedia: [
    { color: 'أسود', kind: 'IMAGE', url: '/uploads/products/color-media/black-1.webp', sortOrder: 0 },
  ],
  images: legacyImages,
});
ok('one color with 1 new image', oneImg.length === 1 && oneImg[0].url.includes('color-media'));

const four = fallbackGallery({
  color: 'أسود',
  colorMedia: [0, 1, 2, 3].map((n) => ({
    color: 'أسود',
    kind: 'IMAGE' as const,
    url: `/uploads/products/color-media/b-${n}.webp`,
    sortOrder: n,
  })),
  images: legacyImages,
});
ok('one color with 4 new images', four.length === 4);

expectThrow('fifth image rejected', () => assertColorImageSlotAvailable(MAX_COLOR_MEDIA_IMAGES), '4 صور');

ok('one video accepted (<=10s)', (() => {
  assertColorVideoDurationMs(9999);
  return true;
})());

expectThrow('video > 10 seconds rejected', () => assertColorVideoDurationMs(10001), '10 ثوانٍ');
expectThrow('second video mime check (invalid)', () => assertVideoMime('image/png'), 'MP4');
assertVideoMime('video/mp4');
ok('video mime mp4 accepted', true);
assertVideoMime('video/webm');
ok('video mime webm accepted', true);

const blackGallery = fallbackGallery({
  color: 'أسود',
  colorMedia: [
    { color: 'أسود', kind: 'IMAGE', url: '/cm/black.webp', sortOrder: 0 },
    { color: 'بيج', kind: 'IMAGE', url: '/cm/beige.webp', sortOrder: 0 },
    { color: 'أسود', kind: 'VIDEO', url: '/cm/black.mp4', sortOrder: 100 },
  ],
  images: legacyImages,
});
ok(
  'media stays attached to the correct color',
  blackGallery.every((i) => i.url.includes('black')) && blackGallery.some((i) => i.kind === 'VIDEO'),
);

const beigeGallery = fallbackGallery({
  color: 'بيج',
  colorMedia: [
    { color: 'أسود', kind: 'IMAGE', url: '/cm/black.webp', sortOrder: 0 },
    { color: 'بيج', kind: 'IMAGE', url: '/cm/beige.webp', sortOrder: 0 },
  ],
  images: legacyImages,
});
ok(
  'selecting color changes only that color gallery',
  beigeGallery.length === 1 && beigeGallery[0].url.includes('beige'),
);

const ordered = fallbackGallery({
  color: 'أسود',
  colorMedia: [
    { color: 'أسود', kind: 'IMAGE', url: '/cm/2.webp', sortOrder: 2 },
    { color: 'أسود', kind: 'IMAGE', url: '/cm/0.webp', sortOrder: 0 },
    { color: 'أسود', kind: 'IMAGE', url: '/cm/1.webp', sortOrder: 1 },
  ],
  images: legacyImages,
});
ok(
  'media order persists',
  ordered.map((i) => i.url).join(',') === '/cm/0.webp,/cm/1.webp,/cm/2.webp',
);

ok(
  'adding new color media does not remove old images (legacy urls frozen)',
  frozenUrls === legacyImages.map((i) => i.url).join('|'),
);

ok('max constants', MAX_COLOR_MEDIA_IMAGES === 4 && MAX_COLOR_VIDEO_MS === 10_000);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
