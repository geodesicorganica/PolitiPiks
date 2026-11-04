# G8.4BR7BR1 — Structured-audit unit-gate recovery

Status: **all fresh-certification prerequisites green; v2 attempt not yet invoked**.
No production, credential, external-network, selector, delete, activation,
deployment, capture, or rollback operation is authorized by this recovery.

## Immutable starting evidence

- Required branch: `codex/politipiks-canonical-shadow-release`.
- Required HEAD: `84125e0646dd0130c901c718d3dca19bdd8ef1e0`.
- The index was empty and the worktree contained only the eleven expected BR7B
  paths before diagnosis.
- The immutable failed final receipt
  `g8-4br7b-final-certification-v1-receipt.json` is 10,126 bytes with SHA-256
  `c0d0c17238b92a6ce216f1f522a15c5a48ae15d1d293eb99cb0a29d0e9d49f2f`.
- The completed replay receipt `g8-4br7b-offline-replay-v1-receipt.json` is
  2,396 bytes with SHA-256
  `1e79773034cf7c379469ba5d44debfe5851fd4ed52956b57426eaafa936fb790`.
- All six certified BR6/BR7 inputs matched the byte counts and SHA-256 values
  pinned by the BR7B final runner before diagnosis.

The v1 final receipt records eighteen successful gates through the BR7B
emulator before the first failure at `g8-4br3a-structured-audit-unit`, exit 1.
Its safety accounting remains zero for credentials, external network,
production operations, selectors, deletes, deployments, and activations.

## Exact reproduction and first assertion

Only `npm run test-g8-4br3a-structured-audit` was reproduced under the v1
runner's exact non-emulator child policy: credential variables point to a
definitely missing file, npm is offline, all external proxies target
`127.0.0.1:9`, and `NO_PROXY` is empty. The ignored no-clobber diagnostic
receipt is `g8-4br7br1-structured-audit-diagnostic-v1-receipt.json`, 1,942
bytes, SHA-256
`896e30d2e65148dfb1022ea8cd562974b96818b71eab0405a92d0ee2437cd31a`.

The reproduction was byte-identical to the v1 gate:

| Stream | Bytes | SHA-256 |
| --- | ---: | --- |
| stdout | 195 | `787b91fad5204921e5d2c0a143daa67b52bd485458fcc31cf6dce2f7961f1c28` |
| stderr | 937 | `08d05bd477e7baad06af5aa6db6a2e5bcff4e3f4812e561d3fcb6a385f150c26` |

The first failing assertion was the non-empty focused-status guard in
`assertG8V2ActivationIdentity`, which raised
`dirty g8.4a activation implementation`. It occurred while the BR3A unit
fixture built structured-audit arguments, before environment validation,
Firestore bootstrap, selectors, or exact-path reads.

## Ranked hypotheses and causal probes

1. **Confirmed:** the five BR7B-only npm scripts made `package.json` dirty,
   while that shared file belongs to both legacy activation and state-audit
   committed-identity sets. Focused porcelain status named only
   `package.json`.
2. **Falsified:** the missing-credential and proxy-sink child policy caused the
   failure. A credential-free, proxy-free control produced the same exit and
   byte-identical stdout/stderr.
3. **Falsified:** another activation or audit implementation file was dirty or
   line-ending-normalized. Neither focused status named another path.
4. **Falsified:** the observed implementation commit was stale. Both focused
   histories resolved to `cfff2011ed72f560f531983ce4291237479fa642`, and the
   stale-identity assertion precedes the dirty assertion.
5. **Falsified after repair:** a later BR3A behavior assertion was independently
   broken. The complete unchanged BR3A unit command passed after only the BR7B
   package/harness boundary was corrected.

## RED, repair, and GREEN

The real-seam regression launches the unchanged BR3A npm command under the
exact final-certification child policy from the BR7B unit suite. Before the
repair it failed with exit 1 and assertion
`BR7BR1 regression: BR3A structured audit must pass under the exact final-certification child policy`.
RED stdout was 106 bytes with SHA-256
`3adcaed5685c2b24064a82e82f4076428a3adf7fccf8a1c5a0480c0a1ad61614`;
stderr was 456 bytes with SHA-256
`7ae21af1e7884a73cd6c5bf21d099b97f2c0882a9ca1fc4c7ee040821ec2a102`.

The narrow repair removes the five BR7B convenience scripts from
`package.json` and invokes the BR7B unit and replay TypeScript entrypoints
directly from the final runner. No BR3A source, production audit semantics,
implementation identity, argument contract, credential/privacy guard,
launcher, selector behavior, exact-read behavior, or fail-closed behavior is
changed. After repair, the exact-environment BR3A command and the BR7B unit
suite including the regression both exited 0.

## v2 no-clobber contract

The recovery versions fresh offline replay outputs and their receipt to `v2`
and versions the complete final-certification receipt to
`g8-4br7b-final-certification-receipt/v2`. The v2 runners require the immutable
v1 replay and failed-final receipt identities before work and verify them after
every gate. All v2 outputs use exclusive creation. The one authorized complete
v2 final-certification attempt remains unconsumed until every prerequisite is
green.

## Fresh-certification prerequisites

All required focused checks completed before the v2 attempt:

| Check | Exit | stdout bytes / SHA-256 | stderr bytes / SHA-256 |
| --- | ---: | --- | --- |
| BR3A, sanitized ordinary environment | 0 | 241 / `1839488007d7ebec317520376f73d8b2d981e9fc533afde97ceb12dd588f6b4b` | 0 / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| BR3A, exact certification child policy | 0 | 241 / `1839488007d7ebec317520376f73d8b2d981e9fc533afde97ceb12dd588f6b4b` | 0 / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| BR7B unit plus real-seam regression | 0 | 85 / `92ccbab32107f6cfbd64f36f340f79e566af6e1bbda6d00b20231ccceaa9e2ca` | 0 / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| lint | 0 | 44 / `a6b21efd55cdba93c857a8b986c6aa67f41a33d644c5aa05f06a0a0ec4bcb73d` | 0 / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| build | 0 | 500 / `0e619f3f033b53fc760038dd69ee290d0760a093ef2d15de9df2ff570511d575` | 408 / `3e26bb51e1c893108ff4fb10b868c2808a2354fb4515f679073d615482df4b82` |
| Git diff check | 0 | 0 / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 127 / `0b1577accd7bb28a4505bf8c253741cb45bae0cd8bf18e25bbd69857be9c66bd` |

The focused Firestore emulator completed against `demo-no-project`, exit 0,
with all clients terminated. Its stdout was 1,386 bytes with SHA-256
`331ee9645477a5dbe483984d5282d850bfec4d71c5ec3cc07cefdc9dd2cea940`;
stderr was empty. Credential, inherited emulator-host, and external proxy
variables were zero; production, external-network, selector, and delete counts
were zero.

A separate ignored, no-clobber two-process prerequisite replay receipt,
`g8-4br7br1-prerequisite-offline-replay-v1-receipt.json`, is 1,614 bytes with
SHA-256
`f93a34fd41c198485c19b3b70dba772b31c300559268576e73e0040a04284c05`.
Both result files are byte-identical to the v1 certified result: 3,420 bytes,
SHA-256
`16f7dd7fd41c92c8f906b1e7c91b425c470dc5339431701dbe8271251576e954`.
Both manifests are byte-identical to the v1 certified manifest: 2,241 bytes,
SHA-256
`4ad7a8d9365a40a8e3eb8b18942fc093943c5017cb7ccbc823b73c75daf093bd`.
All replay safety counts are zero and the v1 replay receipt remained
byte-identical.
