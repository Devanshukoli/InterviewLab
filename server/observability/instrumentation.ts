import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from "@opentelemetry/semantic-conventions";

// Base OTLP endpoint (e.g. http://localhost:4318 for a local/self-hosted SigNoz collector,
// or https://ingest.<region>.signoz.cloud:443 for SigNoz Cloud).
const otlpBase = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318").replace(/\/$/, "");

// Traces, logs, and metrics each hit their own OTLP signal path off the same base endpoint.
// Explicit per-signal env vars (if set) win; otherwise we derive them from the base.
const tracesEndpoint =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || `${otlpBase}/v1/traces`;
const logsEndpoint =
  process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || `${otlpBase}/v1/logs`;
const metricsEndpoint =
  process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || `${otlpBase}/v1/metrics`;

// SigNoz Cloud requires an ingestion key header; self-hosted collectors typically don't.
const otlpHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS
  ? Object.fromEntries(
      process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",").map((pair) => {
        const [key, ...rest] = pair.split("=");
        return [key.trim(), rest.join("=").trim()];
      })
    )
  : undefined;

const traceExporter = new OTLPTraceExporter({
  url: tracesEndpoint,
  headers: otlpHeaders,
});

const logExporter = new OTLPLogExporter({
  url: logsEndpoint,
  headers: otlpHeaders,
});

const metricExporter = new OTLPMetricExporter({
  url: metricsEndpoint,
  headers: otlpHeaders,
});

const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 5000,
});

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "interviewops-api",
  [ATTR_SERVICE_VERSION]: "1.0.0",
  [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || "development",
});

const batchLogProcessor = new BatchLogRecordProcessor({ exporter: logExporter });

export const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader,
  logRecordProcessors: [batchLogProcessor],
  // getNodeAutoInstrumentations() already bundles @opentelemetry/instrumentation-pino,
  // which patches pino so every log call automatically: (a) gets trace_id/span_id/trace_flags
  // stamped on it for correlation, and (b) is forwarded into the LoggerProvider above,
  // which is what actually gets it to SigNoz. This only works for logs that go through pino —
  // see server/observability.ts, which routes all app logging (and intercepted console.*) through it.
  instrumentations: [getNodeAutoInstrumentations()],
});
