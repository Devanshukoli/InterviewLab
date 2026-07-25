import { localTelemetryStore, localLogStore } from '../../observability';

export class TelemetryService {
  static getTelemetry() {
    return {
      traces: localTelemetryStore,
      logs: localLogStore
    };
  }
}

