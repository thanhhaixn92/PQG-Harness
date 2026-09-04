# Upstream provenance

## Local canonical repository
- Repository: `https://github.com/thanhhaixn92/PQG-Harness`
- Initial local commit: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Initial local tree: `489ec3e0c02a95acd99b554de9e6769c0523afd6`

## EdgeOne adapter upstream
- Repository: `https://github.com/TencentEdgeOne/deepseek-harness`
- Imported baseline commit: `2110cc1bb5f6d5436593927fa6a4fa46e6f16407`
- Imported baseline tree: `489ec3e0c02a95acd99b554de9e6769c0523afd6`

The local repository was created as an unrelated root snapshot. Standard Git ahead/behind and merge ancestry are not meaningful against the Tencent repository.

## Sync policy
1. Never routine-merge with `--allow-unrelated-histories`.
2. Record the last imported Tencent commit/tree.
3. Compute upstream changes from the recorded Tencent baseline to the new Tencent target.
4. Apply/review that delta on a dedicated `sync/upstream-*` branch.
5. Run the quality gate, Preview deployment and smoke tests before changing `main`.
6. Do not mix a DSH package-wave upgrade with unrelated product changes.
