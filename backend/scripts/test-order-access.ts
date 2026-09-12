/**
 * Authorization / page-employee isolation tests (offline + policy).
 *
 * Run: npm run test:order-access
 */
import {
  buildPageAgentOrderWhere,
  isOrderAdmin,
  isPageScopedAgent,
  orderMatchesPageAgentScope,
} from '../src/common/order-access';
import { sanitizePrices } from '../src/common/pricing/price-policy';
import type { AuthUser } from '../src/common/decorators/current-user.decorator';

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

const agentA: AuthUser = {
  id: 'agent-a',
  name: 'Agent A',
  roles: ['sales_agent'],
  permissions: ['orders.view', 'orders.create', 'products.view'],
};

const agentAdmin: AuthUser = {
  id: 'admin-1',
  name: 'Admin',
  roles: ['admin'],
  permissions: [],
};

const superAdmin: AuthUser = {
  id: 'sa-1',
  name: 'SA',
  roles: ['super_admin'],
  permissions: [],
};

const delivery: AuthUser = {
  id: 'drv-1',
  name: 'Driver',
  roles: ['delivery_agent'],
  permissions: ['orders.view'],
};

const warehouse: AuthUser = {
  id: 'wh-1',
  name: 'WH',
  roles: ['warehouse_employee'],
  permissions: ['orders.view'],
};

const branchCashier: AuthUser = {
  id: 'br-1',
  name: 'Branch',
  roles: ['branch_cashier'],
  permissions: ['orders.view'],
  branch: {
    id: 'b1',
    name: 'Main',
    username: 'main',
    type: 'RETAIL',
    isMain: true,
    warehouseId: 'w1',
  },
};

ok('page agent is scoped', isPageScopedAgent(agentA));
ok('admin is not page-scoped', !isPageScopedAgent(agentAdmin));
ok('super_admin is not page-scoped', !isPageScopedAgent(superAdmin));
ok('delivery agent is not page-scoped', !isPageScopedAgent(delivery));
ok('warehouse is not page-scoped', !isPageScopedAgent(warehouse));
ok('branch cashier is not page-scoped', !isPageScopedAgent(branchCashier));
ok('admin is order admin', isOrderAdmin(agentAdmin) && isOrderAdmin(superAdmin));

const pageA = 'page-a';
const pageB = 'page-b';
const pageC = 'page-c';
const assignedAB = [pageA, pageB];

ok(
  'agent can access order on assigned page A',
  orderMatchesPageAgentScope(
    { facebookPageId: pageA, salesAgentId: null, createdById: null },
    agentA.id,
    assignedAB,
  ),
);

ok(
  'POLICY: self salesAgentId does NOT bypass page membership',
  !orderMatchesPageAgentScope(
    { facebookPageId: pageC, salesAgentId: agentA.id, createdById: null },
    agentA.id,
    assignedAB,
  ),
);

ok(
  'POLICY: self createdById does NOT bypass page membership',
  !orderMatchesPageAgentScope(
    { facebookPageId: pageC, salesAgentId: null, createdById: agentA.id },
    agentA.id,
    assignedAB,
  ),
);

ok(
  'orphan order (no page) allows createdBy self',
  orderMatchesPageAgentScope(
    { facebookPageId: null, salesAgentId: null, createdById: agentA.id },
    agentA.id,
    assignedAB,
  ),
);

ok(
  'agent cannot access page C order',
  !orderMatchesPageAgentScope(
    { facebookPageId: pageC, salesAgentId: 'other', createdById: 'other' },
    agentA.id,
    assignedAB,
  ),
);

ok(
  'multi-page agent can access A and B',
  orderMatchesPageAgentScope(
    { facebookPageId: pageB, salesAgentId: null, createdById: null },
    agentA.id,
    assignedAB,
  ) &&
    orderMatchesPageAgentScope(
      { facebookPageId: pageA, salesAgentId: null, createdById: null },
      agentA.id,
      assignedAB,
    ),
);

ok(
  'removed from page A loses access even if formerly salesAgent',
  !orderMatchesPageAgentScope(
    { facebookPageId: pageA, salesAgentId: agentA.id, createdById: agentA.id },
    agentA.id,
    [pageB], // only B remaining
  ),
);

const where = buildPageAgentOrderWhere(agentA.id, assignedAB);
ok(
  'scope where has OR branches',
  Array.isArray((where as { OR?: unknown[] }).OR) &&
    ((where as { OR: unknown[] }).OR.length === 2),
);

const productPayload = {
  id: 'p1',
  nameAr: 'فستان',
  retailPrice: 120,
  costPrice: 40,
  wholesalePrice: 80,
  margin: 80,
  variants: [
    {
      id: 'v1',
      retailPrice: 120,
      costPrice: 40,
      wholesalePrice: 80,
      price: 120,
    },
  ],
};

const sanitized = sanitizePrices(productPayload, agentA) as typeof productPayload;
ok('employee keeps retailPrice', sanitized.retailPrice === 120);
ok(
  'employee does not see costPrice',
  !('costPrice' in sanitized) && !('costPrice' in (sanitized.variants[0] || {})),
);
ok(
  'employee does not see wholesalePrice',
  !('wholesalePrice' in sanitized) &&
    !('wholesalePrice' in (sanitized.variants[0] || {})),
);

const forAdmin = sanitizePrices(productPayload, superAdmin) as typeof productPayload;
ok('super_admin retains wholesale', forAdmin.wholesalePrice === 80);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
