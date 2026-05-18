# Master tip

**SHA:** <not-yet-pushed>
**Pushed at:** <not-yet-pushed>
**Pushed by:** <not-yet-pushed>
**Touched:** <not-yet-pushed>

## Update protocol

After every successful push to origin, OVERWRITE this file with:

```markdown
# Master tip

**SHA:** <new-sha>
**Pushed at:** <iso-utc>
**Pushed by:** <your-agent-id>
**Touched:** <comma-separated file paths or brief summary>
```

Before pushing, READ this file. If the SHA differs from your local
master:
```bash
git fetch origin && git rebase origin/<default-branch>
```
…then re-run your tests + build before pushing.

**Narrow-lane caveat.** For single-commit narrow lanes when origin
has diverged with disjoint shared-file activity, prefer:
```bash
git fetch origin
git reset --hard origin/<default-branch>
git cherry-pick <local-sha>
```
over `git rebase origin/<default-branch>`. Multi-commit lanes still
rebase.

Recent history (top entry is current tip):

- _(no entries yet — first push lands here)_
