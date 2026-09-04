# WP2 Preview Recycle Verification

## Status

**BLOCKED — controlled EdgeOne Preview is not available from the current execution environment.**

This record does not convert an external verification gap into PASS. WP2 source-side implementation and GitHub quality checks are green, but the recycle/recovery release gate remains open until it is exercised against a controlled EdgeOne Preview deployment.

## Build under verification

- Repository: `thanhhaixn92/PQG-Harness`
- Branch: `impl/wp2-workspace-durability`
- Source-side GREEN SHA before this evidence-only commit: `5266900dce08aea4bd0ac01f34a49e967179f75b`
- Final quality run for that SHA: `33876431708` — **SUCCESS**
- Production Git Auto Deploy: owner-confirmed **disconnected** during Foundation Core implementation

## Source-side evidence

| WP2 task | RED evidence | GREEN evidence | Result |
|---|---|---|---|
| Serialized native checkpoints | `b9ca9e09c7ee06f7ed27d733b15e2f92be56fb5e`, run `33869709993` | `7ae3fc4e4b57ad1605ece920f4fc959598601194`, run `33869864273` | PASS |
| Native restore + legacy migration | `4662921d7edec0492912d1c64100b3c6a96b95a2`, run `33874824386` | `60f6c12aca9e4a513cba469a0697d783f9a2a285`, run `33875041049` | PASS |
| Persist every mutation | `63141f7e155527731a97c4c0f9d01bb16dc21c28` + `ed416a8e2eea943b1959cfd27282b59ddbce8027`, run `33875333089` | `f81cc74eadcf13b6c7b68e7c86348dfb8ad03f5c` + `3936b07b5396cdf8d21288b534290044ecee40f6`, run `33875722222` | PASS |
| Preview health + listing completeness | `472f879dfdfa51471c8429df043f0302d50ae97d`, run `33875977606` | `c00fa794f83539d224e57539a891555ba8501431` + `9243727a7ea67cebc757d7356c2224504ba04009`; fixture compatibility `5266900dce08aea4bd0ac01f34a49e967179f75b`, final run `33876431708` | PASS |

The first Task 4 implementation run `33876296250` reached the test stage and failed only because an older browser-preview fixture did not model the new port-3000 health check. The fixture was updated to model a healthy preview; no production rollback was needed.

## Controlled Preview test still required

Use a disposable Preview conversation and verify this exact sequence:

1. Create `auto-a.txt` with an automatic file tool.
2. Create `nested/auto-b.txt` with an automatic file tool.
3. Create `shell-a.txt` and `shell-delete.txt` with an approved workspace shell command.
4. Modify `shell-a.txt` with a shell command.
5. Delete `shell-delete.txt` with a shell command.
6. Record the current sandbox instance identifier if the platform exposes one.
7. Force or wait for a supported Preview sandbox recycle/new instance.
8. Reopen the **same conversation ID**.
9. Verify exact state:
   - `auto-a.txt` exists with exact content;
   - `nested/auto-b.txt` exists with exact content;
   - `shell-a.txt` contains the modified content;
   - `shell-delete.txt` remains absent;
   - preview is reported unpublished until the process is restarted.
10. In a separate synthetic non-secret conversation, verify legacy `workspaceSnapshot` migration occurs only after native restore reports `not_found`, and legacy metadata is cleared only after a successful native persist.

## Pass criteria

WP2 live verification becomes **PASS** only when all of the following are recorded without secrets or tokenized preview URLs:

- Preview deployment identifier/domain;
- deployed commit SHA parity;
- old/new sandbox instance identifiers when available;
- PASS for direct-write recovery;
- PASS for shell-created/modified/deleted recovery;
- PASS for stale-preview rejection after recycle;
- PASS for one-time legacy migration.

Until then, status remains **BLOCKED (live verification)**. This does not prevent repository-only WP3 implementation, but it remains a Foundation Freeze gate.