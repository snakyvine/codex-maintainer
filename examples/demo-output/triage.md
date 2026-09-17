> OFFLINE DEMO - hand-authored synthetic fixture responses, not a live AI assessment.

# Issue #123: Triage

**Type:** bug | **Confidence:** high

The pagination helper validates pageNumber but has no guard for a zero, negative or non-integer pageSize. A zero size produces an empty slice instead of rejecting invalid input.

## Recommended labels
- bug

## Related files
- **src/paginate.js** - Contains the page-size arithmetic without a corresponding validation guard.
- **tests/paginate.test.js** - Covers positive pages only; invalid page-size cases are missing.

## Investigation / reproduction suggestions
- Confirm the intended contract for pageSize before changing error behavior.
- Add cases for pageSize values 0, -1, 1.5 and NaN, then verify that valid paging is unchanged.

## Questions for the reporter
- Should invalid page sizes throw RangeError or use a documented default?

## Scope and limitations
- Framework detection is heuristic. Test commands were detected, not executed.
- This is a synthetic fixture assessment. The CLI did not execute repository tests.

---
Codex Maintainer | synthetic-fixture-not-live-ai | repository: demo/pagination | context: 1111111111111111111111111111111111111111
