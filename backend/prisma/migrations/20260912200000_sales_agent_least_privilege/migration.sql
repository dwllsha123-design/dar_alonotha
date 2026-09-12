-- Phase 1.5: least privilege for Facebook page employees (sales_agent).
-- Removes inventory.view (warehouse stock/movements/alerts) and commissions.view
-- (company per-piece rate + commission entry list API). Self payroll remains via
-- GET /users/payroll/me. Product availability remains via products.view.
DELETE FROM "role_permissions"
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "code" = 'sales_agent')
  AND "permissionId" IN (
    SELECT "id" FROM "permissions"
    WHERE "code" IN ('inventory.view', 'commissions.view')
  );