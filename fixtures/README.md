# WAHIS fixtures

Real responses from the WAHIS public API (`https://wahis.woah.org/api/v1/pi`), saved for local development and tests.
Fetched on 2026-11-09 with `language=en`. Pretty-printed with 2-space indent; otherwise unchanged.

Endpoints are documented in `wahis-openapi` (`wahis-openapi.yaml`, `workflows.md` Workflow 4).

| File                                           | Endpoint                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `event-filtered-list.json`                     | `POST /event/filtered-list`                                           |
| `report-{reportId}.json`                       | `GET /review/report/{reportId}/all-information`                       |
| `report-{reportId}-outbreak-{outbreakId}.json` | `GET /review/report/{reportId}/outbreak/{outbreakId}/all-information` |

## Files

- `event-filtered-list.json` — HPAI events (diseases 668, 671) submitted in the last month; 11 events. The source list for everything below.
- `report-186838.json` — Netherlands poultry H5N1, FUR 1 of event 7939. Multi-report event (`previousReportId` 186826); mixes outbreaks created by this report and carried over from the IN.
- `report-186838-outbreak-198855.json` — Laying hen farm, Grootegast. Created by this report, so `newQuantities` is populated.
- `report-186838-outbreak-198832.json` — Backyard flock, Middelie. Carried over from report 186826, so `newQuantities` is null.
- `report-186838-outbreak-198831.json` — Farm, Lutjegast. Carried over from report 186826; second farm for summing outbreak totals to event totals.
- `report-186781.json` — Germany poultry H5N1, IN (reportNumber 0, no previous report). Baseline initial notification.
- `report-186781-outbreak-198732.json` — Farm, Wanderup. Typical commercial farm outbreak.
- `report-186781-outbreak-198731.json` — Farm, Bark. `killed` is 0 while cases and deaths are 50; edge case for zero vs null.
- `report-186905.json` — Latvia wild birds, subtype "H5 (N untyped)". The no-subtype case (no N typing).
- `report-186905-outbreak-198656.json` — Body of water, three wild species rows in one outbreak (shoveler, teal, wigeon). Multi-species case; exact location (`isLocationApprox` false).
- `report-186905-outbreak-198655.json` — Body of water, single wild species row (Eurasian wigeon).
- `report-186906.json` — Germany wild birds H5N5, IN. Wild-bird event with a non-H5N1 subtype.
- `report-186906-outbreak-198971.json` — Helgoland, gulls (Laridae unidentified), epi unit "Not applicable". Wild-bird outbreak with no farm-type unit.
- `report-186685.json` — Puerto Rico H5N1, non-poultry disease category. Non-EU, created in WAHIS (not ADIS).
- `report-186685-outbreak-198596.json` — Backyard, Cabo Rojo. `cases` is null while deaths and killed are set.
- `report-186685-outbreak-198597.json` — Backyard, Lajas. All counts null; tests handling of empty quantities.
- `report-186444.json` — Peru poultry H5N1, IN. Non-European; source of infection "Contact with wild species" (others are "Unknown").
- `report-186444-outbreak-198072.json` — Farm, El Tallan. Large commercial outbreak.
- `report-186877.json` — UK poultry H5N1, FUR 2. `isLastReportUnchanged` true and `report.noEvolutionReport` set ("No new information available").
- `report-186877-outbreak-198552.json` — Farm near Belford. Created by 186649, last updated by 186720, neither of which is this report.
- `report-186715.json` — Romania wild birds H5N1, IN. Second wild-bird event, epi unit "Forest".
- `report-186715-outbreak-198684.json` — Forest, Chiscani, lesser white-fronted goose. `killed` null for wild birds.
- `report-186715-outbreak-198683.json` — Forest, Chiscani, mallard. Same site as 198684 a day earlier; two outbreaks at one location.

## Gaps

None of the 11 events had these, so they are not covered yet:

- Mammal species (e.g. foxes, seals). Look at older H5N5 events or widen the date range.
- Cluster outbreaks (`isCluster` true).
- Bovines (disease 922). Out of scope for this pull.

## Refreshing

Re-fetch with the commands below. Re-fetching gives the current state of each report, so outbreak counts can change for on-going events.

```bash
BASE='https://wahis.woah.org/api/v1/pi'
curl -s "$BASE/review/report/186838/all-information?language=en" | jq . > fixtures/report-186838.json
curl -s "$BASE/review/report/186838/outbreak/198855/all-information?language=en" | jq . > fixtures/report-186838-outbreak-198855.json
```
