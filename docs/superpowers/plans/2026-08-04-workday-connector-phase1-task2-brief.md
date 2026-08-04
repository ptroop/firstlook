### Task 2: Integrate Workday into the Registry

**Files:**
- Modify: `backend/supabase/functions/first-look-api/connectors/registry.ts`
- Modify: `backend/supabase/functions/first-look-api/connectors/registry.test.ts`

**Interfaces:**
- Consumes: Configs and `createWorkdayConnector` from `workday.ts`

- [ ] **Step 1: Write the failing test for registry integration**

```typescript
// Append to backend/supabase/functions/first-look-api/connectors/registry.test.ts
test('registers Workday connectors for 11 companies', () => {
  const connectors = createOfficialConnectorRegistry();
  const workdayPrefixes = ['accenture', 'pwc', 'wells-fargo', 'deutsche-bank', 'bank-of-america', 'natwest', 'fidelity', 'ge-healthcare', 'diageo', 'sp-global', 'morningstar'];
  for (const prefix of workdayPrefixes) {
    const subset = connectors.filter((c) => c.connectorId === `${prefix}-official-india`);
    assert.deepEqual(subset.map(c => c.scanGroup), [`${prefix}-watch`, `${prefix}-reconcile`]);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

1. In `registry.ts`, remove the 11 companies from `UNSUPPORTED_COMPANIES`.
2. Import `createWorkdayConnector` and the 11 configs from `./workday.ts`.
3. Add the 22 new connector instances (1 watch, 1 reconcile each) to `createOfficialConnectorRegistry`.

```typescript
// In backend/supabase/functions/first-look-api/connectors/registry.ts
// Add imports:
import { 
  ACCENTURE_CONFIG, PWC_CONFIG, WELLS_FARGO_CONFIG, DEUTSCHE_BANK_CONFIG, 
  BANK_OF_AMERICA_CONFIG, NATWEST_CONFIG, FIDELITY_CONFIG, GE_HEALTHCARE_CONFIG, 
  DIAGEO_CONFIG, SP_GLOBAL_CONFIG, MORNINGSTAR_CONFIG, createWorkdayConnector 
} from './workday.ts';

// Remove these from UNSUPPORTED_COMPANIES:
// 'Accenture', 'PwC', 'Wells Fargo', 'Deutsche Bank', 'Bank of America', 'NatWest', 'Fidelity', 'GE HealthCare', 'Diageo', 'S&P Global', 'Morningstar'

// Add to createOfficialConnectorRegistry array:
createWorkdayConnector(ACCENTURE_CONFIG, fetch, 'watch'),
createWorkdayConnector(ACCENTURE_CONFIG, fetch, 'reconcile'),
createWorkdayConnector(PWC_CONFIG, fetch, 'watch'),
createWorkdayConnector(PWC_CONFIG, fetch, 'reconcile'),
createWorkdayConnector(WELLS_FARGO_CONFIG, fetch, 'watch'),
createWorkdayConnector(WELLS_FARGO_CONFIG, fetch, 'reconcile'),
createWorkdayConnector(DEUTSCHE_BANK_CONFIG, fetch, 'watch'),
createWorkdayConnector(DEUTSCHE_BANK_CONFIG, fetch, 'reconcile'),
createWorkdayConnector(BANK_OF_AMERICA_CONFIG, fetch, 'watch'),
createWorkdayConnector(BANK_OF_AMERICA_CONFIG, fetch, 'reconcile'),
createWorkdayConnector(NATWEST_CONFIG, fetch, 'watch'),
createWorkdayConnector(NATWEST_CONFIG, fetch, 'reconcile'),
createWorkdayConnector(FIDELITY_CONFIG, fetch, 'watch'),
createWorkdayConnector(FIDELITY_CONFIG, fetch, 'reconcile'),
createWorkdayConnector(GE_HEALTHCARE_CONFIG, fetch, 'watch'),
createWorkdayConnector(GE_HEALTHCARE_CONFIG, fetch, 'reconcile'),
createWorkdayConnector(DIAGEO_CONFIG, fetch, 'watch'),
createWorkdayConnector(DIAGEO_CONFIG, fetch, 'reconcile'),
createWorkdayConnector(SP_GLOBAL_CONFIG, fetch, 'watch'),
createWorkdayConnector(SP_GLOBAL_CONFIG, fetch, 'reconcile'),
createWorkdayConnector(MORNINGSTAR_CONFIG, fetch, 'watch'),
createWorkdayConnector(MORNINGSTAR_CONFIG, fetch, 'reconcile'),
```
Update the `reports coverage only for implemented official connectors` array in `registry.test.ts` to include the 11 new `[prefix]-official-india` strings.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/supabase/functions/first-look-api/connectors/registry.ts backend/supabase/functions/first-look-api/connectors/registry.test.ts
git commit -m "feat: register 11 Workday companies"
```


