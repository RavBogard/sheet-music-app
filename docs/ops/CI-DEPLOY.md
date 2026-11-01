# CI deploy identity (rules, indexes, tenant drift check)

Two GitHub Actions workflows reach the `crcmusiccharts` GCP project **without any stored key**.
GitHub issues each run a short-lived OIDC token; GCP Workload Identity Federation (WIF) exchanges
it for a one-hour access token of a dedicated service account. Nothing secret lives in GitHub.

| Workflow | Runs when | Does |
|---|---|---|
| `.github/workflows/deploy-rules.yml` | push to `master` touching `firestore.rules`, `storage.rules`, `firestore.indexes.json` (or the workflow); `workflow_dispatch` | `firebase deploy --only firestore:rules,storage,firestore:indexes --project crcmusiccharts` |
| `.github/workflows/tenant-config-drift.yml` | push to `master` touching `src/lib/org/config-code.ts` (or the schema, seed script, workflow); daily 09:17 UTC; `workflow_dispatch` | Seed script `--check` (a dry run). On drift: fails, and opens or updates the issue **"Tenant config drift"** listing differing field names. Never writes `orgs/*`. |

## What exists in GCP (created 2026-10-31)

- **APIs enabled:** `iam.googleapis.com`, `iamcredentials.googleapis.com`, `sts.googleapis.com`.
- **Workload identity pool:** `projects/749316879158/locations/global/workloadIdentityPools/github-actions`.
- **OIDC provider:** `.../workloadIdentityPools/github-actions/providers/github`
  - issuer `https://token.actions.githubusercontent.com`
  - attribute condition (tokens failing it are rejected outright):
    `assertion.repository_id == '1142029864' && assertion.repository == 'RavBogard/sheet-music-app' && assertion.ref == 'refs/heads/master'`
    (repository id pins the identity to this repo even if a same-named repo is ever re-created;
    the ref check means pull requests and other branches cannot get a token.)
  - mapped attributes: `google.subject`, `repository`, `repository_id`, `ref`, `event_name`, `workflow`.
- **Service account:** `gh-rules-deployer@crcmusiccharts.iam.gserviceaccount.com` (no keys).
  - On the service account: `roles/iam.workloadIdentityUser` for
    `principalSet://iam.googleapis.com/projects/749316879158/locations/global/workloadIdentityPools/github-actions/attribute.repository_id/1142029864`.
  - Project roles (and why each is needed):
    - `roles/firebaserules.admin`: create rulesets and update the Firestore and Storage releases.
    - `roles/datastore.indexAdmin`: create composite indexes and field overrides.
    - `roles/firebasestorage.viewer`: read the default bucket name (`firebasestorage.defaultBucket.get`); metadata only, no object access.
    - `roles/serviceusage.serviceUsageConsumer`: firebase-tools checks the required APIs are enabled.
    - `roles/datastore.viewer`: read-only Firestore reads for the drift check (`orgs/*`). Cannot write.
  - On the bucket `crcmusiccharts.firebasestorage.app` only: custom role
    `projects/crcmusiccharts/roles/bucketMetadataReader` (exactly `storage.buckets.get`). The
    Firebase Storage API checks the caller can see the bucket before it returns the default bucket;
    without it the deploy fails with "Firebase Storage has not been set up". No object access.

  It holds no write access to Firestore data or Storage objects and cannot deploy Functions, Hosting
  or anything else.

## Revoking

Fastest (stops both workflows immediately): disable the provider or the service account.

1. Console, IAM > Workload Identity Federation > `github-actions` > provider `github` > **Disable**
   (or delete the pool). Or IAM > Service accounts > `gh-rules-deployer` > **Disable**.
2. To remove it entirely: delete the service account `gh-rules-deployer` (its project and bucket
   role bindings become dangling and are cleaned up by IAM), then delete the pool `github-actions`
   and the custom role `bucketMetadataReader`. The IAM, IAM Credentials and STS APIs can stay on.
3. With gcloud, if installed:
   ```
   gcloud iam workload-identity-pools providers disable github --location=global --workload-identity-pool=github-actions --project=crcmusiccharts
   gcloud iam service-accounts disable gh-rules-deployer@crcmusiccharts.iam.gserviceaccount.com
   ```

Then delete or disable the two workflow files so they stop failing.

## Notes

- Verified 2026-10-31 by running the exact deploy and the `--check` dry run locally while
  impersonating `gh-rules-deployer` (a temporary Token Creator grant to Daniel on that one account,
  removed straight after). Both succeeded with only the roles above.

- Deploying unchanged rules is a no-op: firebase-tools compares with the live ruleset and skips the
  release.
- The index deploy never deletes indexes that exist only in the console (non-interactive mode
  without `--force` keeps them).
- To fix drift: run the seed dry run locally (`npx vite-node -c vitest.config.ts scripts/ops/multitenant/seed-org-configs.ts`)
  to see values, then change the code or run it with `-- --apply`. Then close the issue.
