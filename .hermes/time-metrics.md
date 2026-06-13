# Time Metrics

This project tracks time taken as the main execution metric.

## Source of truth

Use `.hermes/time-log.csv` as the append-only ledger.

Required columns:

| Column | Meaning |
| --- | --- |
| `date` | Local or UTC work date, formatted `YYYY-MM-DD`. |
| `start_utc` | Start timestamp in UTC ISO-8601 format. |
| `end_utc` | End timestamp in UTC ISO-8601 format. Leave blank while the block is open. |
| `duration_minutes` | Rounded elapsed minutes. Fill when the block closes. |
| `phase` | One of the phase labels below. |
| `task` | Short human-readable task name. |
| `notes` | Useful context, blockers, or measurement caveats. |
| `source` | `manual`, `timer`, `git`, `ci`, or another evidence source. |

## Phase labels

Use these stable labels so totals stay easy to aggregate:

- `planning`
- `implementation`
- `testing`
- `debugging`
- `documentation`
- `review-deploy`
- `admin`

## Logging workflow

1. At the start of a work block, add a row with `start_utc`, `phase`, and `task`.
2. At the end of the block, fill `end_utc` and `duration_minutes`.
3. If a block changes phase, close the current row and open a new one.
4. If work is interrupted, close the row at the interruption time and note the interruption.
5. For major failures or decisions, add a journal entry to `.hermes/engineering-journal.md` and reference relevant files/commands.

## Useful summaries

Total minutes by phase:

```bash
python3 - <<'PY'
import csv
from collections import defaultdict

totals = defaultdict(float)
with open('.hermes/time-log.csv', newline='') as f:
    for row in csv.DictReader(f):
        if row['duration_minutes']:
            totals[row['phase']] += float(row['duration_minutes'])

for phase, minutes in sorted(totals.items()):
    print(f'{phase}: {minutes:.1f} min')
PY
```
