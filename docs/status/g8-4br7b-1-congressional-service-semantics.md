# G8.4BR7B.1 — Congressional service record semantics

Status: **locally certified as a narrow prerequisite on 2026-08-13**. This
prerequisite does not authorize or execute BR7B,
Firebase/Firestore access, an emulator gate, a production operation, a network
request, credential initialization, deployment, activation, capture, rollback,
deletion, branch switching, or push.

## Semantic contract

`CandidateResearchCard.hasCongressionalServiceRecord` is `true` if and only if
`candidate.externalIds.bioguideId` is a string whose trimmed value is non-empty.
It is `false` when the ID is absent, null-like, empty, or whitespace-only.

The flag records that an official Bioguide-linked congressional service identity
exists. It does not promise data in every Congress.gov, bill, legislative, or
roll-call section. Incumbency, office, party, FEC identity, research content,
legislative bullets, and returned vote coverage cannot establish the flag.

## Implementation boundary

- `src/lib/congressionalServiceRecord.ts` is a small pure helper with no
  Firebase, Firestore, credential, filesystem, environment, or network import.
- `src/lib/researchBundle.ts` calls the helper while constructing each candidate
  research card.
- `src/types.ts` remains unchanged; its required boolean contract is preserved.
- No parked ResearchDrawer, data-platform, finance, source, or UI work is
  restored.

## Focused semantic cases

| Candidate input | Expected flag |
| --- | ---: |
| Non-empty Bioguide ID, including surrounding whitespace | `true` |
| Missing Bioguide ID | `false` |
| Null-like Bioguide ID | `false` |
| Empty Bioguide ID | `false` |
| Whitespace-only Bioguide ID | `false` |
| Incumbency alone | `false` |
| FEC candidate ID alone | `false` |

## Local verification

| Gate | Exit |
| --- | ---: |
| `npx --offline tsx src/lib/congressionalServiceRecord.test.ts` | `0` |
| `npm run lint` | `0` |
| `npm run build` | `0` |
| `git diff --check` | `0` |

The build completed with only the existing Vite chunk-size warning. All npm
resolution was forced offline. The focused test imports only Node's strict
assertion module and the pure helper; it does not import the Firebase-backed
research bundle. No Firebase/Firestore command, emulator, credential operation,
external network operation, or production operation was invoked.

## Preserved BR7B custody

The index was empty before the prerequisite edit. After the code, test,
documentation, and local gates, all seven preserved BR7B paths remained
unstaged and byte-identical to their initial SHA-256 inventory:

| Preserved path | SHA-256 |
| --- | --- |
| `package.json` | `7331d638fe6681258128519853fcabf9586b28114f5353c49cd08701e1c15e18` |
| `scripts/firebase.g8-4br7b-emulator.json` | `eba9a424071800ded0f3c110e7da5bec37152c1fbb69a64fb56108107ca2e6ee` |
| `scripts/lib/g8V2ConflictReconciliation.emulator.test.ts` | `d7d3e10cc0365c6f2a4012c1b7aabae891846ddb816cdb3ce7984d712934be91` |
| `scripts/lib/g8V2ConflictReconciliation.test.ts` | `980519f3052552615842675a2aa3d80cc5ca18277b31e6e170e3dad639b8951d` |
| `scripts/lib/g8V2ConflictReconciliation.ts` | `8678a42010744233e7583ab7db5e0fa518092ff149cbaac6b23ee7d5fff1b26a` |
| `scripts/report-g8-4br7b-reconciliation.ts` | `fb10db6f4dde2f3342b5ef6b372dc8bcb28291fa029edb3b0001420cb2247f93` |
| `scripts/run-g8-4br7b-offline-replays.ts` | `1c84e24ccb167198afd14663d0185caedfd8055ee2b41e2e23659644db70e0c8` |

Static inspection found zero forbidden operation surface in the pure helper and
focused test. The only `researchBundle.ts` additions are the pure-helper import
and the candidate-card boolean assignment. The local command ledger contains
no Firebase CLI, emulator, service-account, credential, network, production,
deploy, activation, capture, rollback, delete, branch, or push command.

The prerequisite commit identity is reported in the final handoff rather than
embedded in its own content.
