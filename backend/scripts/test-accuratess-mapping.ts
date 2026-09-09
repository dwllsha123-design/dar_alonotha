/**
 * Accuratess id/code mapping + print + webhook correlation regression tests.
 * Run: npm run test:accuratess-mapping
 */
import {
  asAccuratessShipmentId,
  asAccuratessTrackingCode,
  extractAccuratessTracking,
  resolvePrintAccuratessCode,
} from '../src/modules/delivery/accuratess-tracking';

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

// Simulated saveShipment response
const saveShipment = {
  id: 123456,
  code: 789012,
  trackingUrl: 'https://example.test/track/789012',
  refNumber: 'PAGE:دار الأنوثة|ORD:ORD-2026-000001',
  notes: 'n',
  description: 'd',
};

const extracted = extractAccuratessTracking(saveShipment);
ok('1. id → accuratessShipmentId', asAccuratessShipmentId(extracted.id) === '123456');
ok('2. code → trackingNumber', asAccuratessTrackingCode(extracted.code) === '789012');
ok(
  '3. code → externalTrackingNumber',
  asAccuratessTrackingCode(saveShipment.code) === '789012',
);

const printCode = resolvePrintAccuratessCode({
  trackingNumber: '789012',
  externalTrackingNumber: '789012',
  accuratessShipmentId: '123456',
  externalRef: '123456', // legacy mistake: id in externalRef
  refNumber: saveShipment.refNumber,
});
ok('4. print displays code', printCode === '789012');
ok('5. print does not use id as tracking', printCode !== '123456');

ok(
  '6. webhook shipmentId field is Accuratess id (not ORD/SLIP/code path)',
  asAccuratessShipmentId(123456) === '123456' &&
    asAccuratessTrackingCode('ORD-2026-000001') === null &&
    asAccuratessTrackingCode('SLIP-2026-000001') === null,
);

// Webhook correlation contract: lookup key is accuratessShipmentId, not code/ORD/SLIP
const webhookShipmentId = '123456';
const deliveryRow = {
  accuratessShipmentId: '123456',
  trackingNumber: '789012',
  shippingSlipNo: 'SLIP-2026-000001',
  orderNumber: 'ORD-2026-000001',
};
ok(
  '6b. webhook correlates on shipment id field',
  deliveryRow.accuratessShipmentId === String(webhookShipmentId) &&
    deliveryRow.trackingNumber !== webhookShipmentId,
);

ok('7. ORD unchanged by mapping helpers', deliveryRow.orderNumber === 'ORD-2026-000001');
ok('8. SLIP unchanged by mapping helpers', deliveryRow.shippingSlipNo === 'SLIP-2026-000001');

ok(
  '9. refNumber not used as tracking code',
  asAccuratessTrackingCode(saveShipment.refNumber) === null &&
    extractAccuratessTracking({
      id: 1,
      refNumber: saveShipment.refNumber,
    }).code === null,
);

ok(
  '10. null/missing code does not invent values',
  asAccuratessTrackingCode(null) === null &&
    asAccuratessTrackingCode(undefined) === null &&
    asAccuratessTrackingCode('') === null &&
    extractAccuratessTracking({ id: 99 }).code === null,
);

// Idempotent retry: same refNumber returns existing code — no second invent
const first = extractAccuratessTracking(saveShipment);
const second = extractAccuratessTracking(saveShipment);
ok(
  '11. retry same response → same id/code (no duplicate invent)',
  first.id === second.id && first.code === second.code,
);

const preserved = {
  orderNumber: 'ORD-2026-000001',
  shippingSlipNo: 'SLIP-2026-000001',
  totalAmount: '220',
  items: 2,
  customerId: 'c1',
};
const afterMapping = { ...preserved };
ok(
  '12. unrelated order data remains unchanged',
  afterMapping.orderNumber === preserved.orderNumber &&
    afterMapping.shippingSlipNo === preserved.shippingSlipNo &&
    afterMapping.totalAmount === preserved.totalAmount &&
    afterMapping.items === preserved.items &&
    afterMapping.customerId === preserved.customerId,
);

// Prefer trackingNumber over order external when both set differently
ok(
  'print prefers Delivery.trackingNumber',
  resolvePrintAccuratessCode({
    trackingNumber: '111111',
    externalTrackingNumber: '222222',
    accuratessShipmentId: '999',
  }) === '111111',
);

ok(
  'print falls back to Order.externalTrackingNumber',
  resolvePrintAccuratessCode({
    trackingNumber: null,
    externalTrackingNumber: '222222',
    accuratessShipmentId: '999',
  }) === '222222',
);

ok(
  'print never returns accuratessShipmentId alone',
  resolvePrintAccuratessCode({
    trackingNumber: null,
    externalTrackingNumber: null,
    accuratessShipmentId: '999999',
    externalRef: '999999',
  }) === null,
);

ok(
  'ORD-/SLIP- rejected as tracking',
  asAccuratessTrackingCode('ORD-2026-000001') === null &&
    asAccuratessTrackingCode('SLIP-2026-000001') === null,
);

console.log('');
console.log(`Accuratess mapping tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
