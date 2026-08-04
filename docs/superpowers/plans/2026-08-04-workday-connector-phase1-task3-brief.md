### Task 3: Add Database Migration for Workday Schedules

**Files:**
- Create: `backend/supabase/migrations/20260804000001_add_workday_schedules.sql`
- Modify: `task.md` (to track migration completion)

- [ ] **Step 1: Write SQL migration**

Create a new file `20260804000001_add_workday_schedules.sql` that:
1. Replaces `public.invoke_first_look_scan` to add all 22 new scan groups to the allowed list (e.g., `'accenture-watch'`, `'accenture-reconcile'`, etc.).
2. Replaces `public.recover_stale_first_look_scans` to add all 22 new configurations to the `values` table with proper intervals.
3. Removes any existing `cron.job`s for these keys via `cron.unschedule`.
4. Schedules them using `cron.schedule` at staggered minutes to avoid overlapping spikes.

*(The file will be large, copy the pattern from `20260804000000_add_orc_schedules.sql` but for the 11 Workday prefixes).*

- [ ] **Step 2: Commit**

```bash
git add backend/supabase/migrations/20260804000001_add_workday_schedules.sql
git commit -m "chore: add db migration for workday schedules"
```

