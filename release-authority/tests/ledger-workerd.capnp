using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [(
    name = "test",
    worker = (
      compatibilityDate = "2026-11-23",
      modules = [
        (name = "ledger-workerd.mjs", esModule = embed "ledger-workerd.mjs"),
        (name = "ledger.mjs", esModule = embed "ledger.mjs"),
        (name = "manifest.mjs", esModule = embed "manifest.mjs")
      ],
      bindings = [(name = "LEDGER", durableObjectNamespace = "FixtureLedger")],
      durableObjectNamespaces = [(className = "FixtureLedger", uniqueKey = "disnana-local-ledger-fixture", enableSql = true)],
      durableObjectStorage = (localDisk = "store"),
    ),
  ), (name = "store", disk = (path = "db", writable = true))],
  sockets = [(name = "test", address = "127.0.0.1:45918", http = (), service = "test")],
);
