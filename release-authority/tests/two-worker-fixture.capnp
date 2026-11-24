using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "edge", worker = (
      compatibilityDate = "2026-11-23",
      modules = [(name = "edge.mjs", esModule = embed "two-worker-fixture.mjs")],
      bindings = [
        (name = "GATEWAY", service = "gateway"),
        (name = "SIGNER_DEFAULT", service = "signer"),
        (name = "JWKS", text = embed "jwks.json")
      ],
    )),
    (name = "gateway", worker = (
      compatibilityDate = "2026-11-23",
      modules = [(name = "gateway.mjs", esModule = embed "gateway.mjs")],
      bindings = [
        (name = "APPROVAL_ORIGIN", text = "https://approval.fixture.invalid"),
        (name = "VERIFIER_ORIGIN", text = "https://verifier.fixture.invalid"),
        (name = "APPROVAL_INTAKE", service = (name = "signer", entrypoint = "ApprovalIntake")),
        (name = "VERIFIER_INTAKE", service = (name = "signer", entrypoint = "VerifierIntake"))
      ],
    )),
    (name = "signer", worker = (
      compatibilityDate = "2026-11-23",
      modules = [(name = "signer.mjs", esModule = embed "signer.mjs")],
      globalOutbound = (name = "edge", entrypoint = "FixtureJwks"),
      bindings = [
        (name = "APPROVAL_ORIGIN", text = "https://approval.fixture.invalid"),
        (name = "VERIFIER_ORIGIN", text = "https://verifier.fixture.invalid"),
        (name = "RELEASE_POLICY", text = embed "release-policy.json"),
        (name = "ACCESS_POLICY", text = embed "access-policy.json"),
        (name = "VERIFIER_POLICY", text = embed "verifier-policy.json"),
        (name = "RELEASE_INTAKE_ENABLED", text = "true"),
        (name = "RELEASE_LEDGER", durableObjectNamespace = "SignerLedger")
      ],
      durableObjectNamespaces = [(className = "SignerLedger", uniqueKey = "release-two-worker-test-only", enableSql = true)],
      durableObjectStorage = (localDisk = "store"),
    )),
    (name = "store", disk = (path = "db", writable = true)),
  ],
  sockets = [(name = "test", address = "127.0.0.1:45919", http = (), service = "edge")],
);
