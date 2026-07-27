import { sdk } from "./observability/instrumentation";
import { config } from "./config";
import { logger } from "./observability";

async function bootstrap() {
  let server: any = null;

  try {
    await sdk.start();
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
