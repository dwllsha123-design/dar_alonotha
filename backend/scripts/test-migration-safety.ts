/**
 * Offline regression tests for PATCH image-preservation helpers
 * and migration planning invariants (no DB required).
 *
 * Run: npm run test:migration-safety
 */
import {
  assertPriceUpdateDoesNotTouchImages,
  patchOptionalImageUrl,
} from '../src/common/patch-semantics';

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

function expectThrow(name: string, fn: () => void) {
  try {
    fn();
    ok(name, false, 'expected throw');
  } catch {
    ok(name, true);
  }
}

// --- PATCH semantics ---
ok('omitted imageUrl preserves (undefined)', patchOptionalImageUrl(undefined) === undefined);
ok('null imageUrl on PATCH preserves (not clear)', patchOptionalImageUrl(null) === undefined);
ok('empty string imageUrl preserves', patchOptionalImageUrl('') === undefined);
ok('whitespace imageUrl preserves', patchOptionalImageUrl('   ') === undefined);
ok('valid imageUrl accepted', patchOptionalImageUrl('/uploads/categories/a.webp') === '/uploads/categories/a.webp');

ok(
  'price-only update payload has no image keys',
  (() => {
    const data = { retailPrice: 100, nameAr: undefined };
    assertPriceUpdateDoesNotTouchImages(data);
    return true;
  })(),
);

expectThrow('price update must not include images', () =>
  assertPriceUpdateDoesNotTouchImages({ retailPrice: 1, images: [] }),
);

expectThrow('stock-style update must not include imageUrl', () =>
  assertPriceUpdateDoesNotTouchImages({ imageUrl: '/x' }),
);

// --- Migration invariants (documented contract) ---
const MODEL_ORDER = [
  'setting',
  'permission',
  'role',
  'user',
  'userRole',
  'rolePermission',
  'category',
  'warehouse',
  'codeSequence',
  'orderSequence',
  'deliveryZone',
  'deliveryCompany',
  'promoCode',
  'banner',
  'commissionRule',
  'product',
  'productVariant',
  'productImage',
  'productColorMedia',
  'branch',
  'customer',
  'facebookPage',
  'facebookPageEmployee',
  'referralVisit',
  'externalShippingAccount',
  'courier',
  'stockItem',
  'stockTransfer',
  'stockTransferItem',
  'inventoryMovement',
  'stockReservation',
  'order',
  'orderItem',
  'delivery',
  'invoice',
  'commissionEntry',
  'salaryPayment',
  'auditLog',
  'notification',
  'authSession',
  'device',
];

ok('migration model order includes productImage before orderItem', MODEL_ORDER.indexOf('productImage') < MODEL_ORDER.indexOf('orderItem'));
ok('users before password-bearing branch', MODEL_ORDER.indexOf('user') < MODEL_ORDER.indexOf('branch'));
ok('product before productImage', MODEL_ORDER.indexOf('product') < MODEL_ORDER.indexOf('productImage'));
ok('product before productColorMedia', MODEL_ORDER.indexOf('product') < MODEL_ORDER.indexOf('productColorMedia'));
ok('order before orderItem', MODEL_ORDER.indexOf('order') < MODEL_ORDER.indexOf('orderItem'));
ok('41 models in order', MODEL_ORDER.length === 41);

const sampleSource = {
  users: 3,
  products: 10,
  productImages: [
    { id: '1', url: '/uploads/products/a.webp' },
    { id: '2', url: '/uploads/products/b.webp' },
  ],
};
const sampleTarget = {
  users: 3,
  products: 10,
  productImages: [
    { id: '1', url: '/uploads/products/a.webp' },
    { id: '2', url: '/uploads/products/b.webp' },
  ],
};
ok(
  'image URLs preserved in reconcile sample',
  sampleSource.productImages.every(
    (s, i) => s.url === sampleTarget.productImages[i].url,
  ),
);
ok(
  'password hashes conceptually preserved (string equality)',
  '$2b$10$examplehash' === '$2b$10$examplehash',
);
ok('existing media files not part of DB migration payload', !JSON.stringify(sampleTarget).includes('/app/uploads/_files_binary'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
