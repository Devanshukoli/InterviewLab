import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from "@opentelemetry/semantic-conventions";

const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  "http://localhost:4318/v1/traces";

const exporterUrl = otlpEndpoint.endsWith("/v1/traces")
  ? otlpEndpoint
  : `${otlpEndpoint.replace(/\/$/, "")}/v1/traces`;

const traceExporter = new OTLPTraceExporter({
  url: exporterUrl,
});

export const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "interviewops-api",
    [ATTR_SERVICE_VERSION]: "1.0.0",
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || "development",
  }),
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

