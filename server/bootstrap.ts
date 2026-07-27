import { sdk } from "./observability/instrumentation";
import { config } from "./config";
// IMPORTANT: do NOT statically import from "./observability" here. It transitively
// imports `pino`, and @opentelemetry/instrumentation-pino can only patch `pino` the
// *next* time it's require()'d after sdk.start() installs its hook — not retroactively.
// A static top-level import resolves before sdk.start() ever runs (before this file's
// own body executes at all), so pino would load unpatched and logs would never reach
// SigNoz even though pino itself works fine locally. Import it dynamically instead,
// same as we already do for "./index" below, so it loads strictly after sdk.start().

async function bootstrap() {
  let server: any = null;
  // Defaults to `console` so error handling before the real logger loads (or if sdk.start()
  // itself throws) still has somewhere to write to.
  let logger: Pick<Console, 'info' | 'warn' | 'error'> = console;

  try {
    await sdk.start();
    ({ logger } = await import("./observability"));
    logger.info("[OpenTelemetry] SDK started successfully");

    const serverModule = await import("./index");
    server = await serverModule.default;
  } catch (error) {
    logger.error("[OpenTelemetry] Failed to start SDK or server", error);
    process.exit(1);
  }

  const gracefulShutdown = async (signal: string) => {
    logger.info(`\n🛑 Received ${signal}, initiating graceful shutdown...`);

    // 1. Set a forced timeout to exit if things take too long
    const forceExitTimeout = setTimeout(async () => {
      logger.warn("⚠️ Graceful shutdown timed out, force exiting OpenTelemetry and process...");
      try {
        await sdk.shutdown();
        logger.info("[OpenTelemetry] SDK shut down after timeout");
      } catch (err) {
        logger.error("❌ Error shutting down OpenTelemetry SDK:", err);
      }
      process.exit(1);
    }, config.shutdownTimeoutMs);
    forceExitTimeout.unref();

    // 2. Close the HTTP server first to drain active requests
    if (server) {
      logger.info("⏳ Closing HTTP server to drain in-flight requests...");
      const closeServer = () => {
        return new Promise<void>((resolve) => {
          server.close((err: any) => {
            if (err) {
              logger.error("❌ Error during HTTP server close:", err);
            } else {
              logger.info("✅ HTTP server closed cleanly.");
            }
            resolve();
          });
        });
      };
      await closeServer();
    }

    // 3. Shut down the OpenTelemetry SDK
    try {
      logger.info("⏳ Shutting down OpenTelemetry SDK...");
      await sdk.shutdown();
      logger.info("✅ OpenTelemetry SDK shut down gracefully.");
    } catch (err) {
      logger.error("❌ Error shutting down OpenTelemetry SDK:", err);
    }

    // 4. Clear the timeout and exit cleanly
    clearTimeout(forceExitTimeout);
    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

bootstrap();
