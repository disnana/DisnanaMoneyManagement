using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [(
    name = "test",
    worker = (
      compatibilityDate = "2026-11-23",
      modules = [(name = "fixture-worker.mjs", esModule = embed "fixture-worker.mjs")],
      bindings = [
        (name = "TEST_KEY", data = embed "test-only.pk8"),
        (name = "APPROVED_INPUT", data = embed "approved.input")
      ],
    ),
  )],
  sockets = [(name = "test", address = "127.0.0.1:45917", http = (), service = "test")],
);
