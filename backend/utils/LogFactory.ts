import LokiTransport from "winston-loki";
import winston from "winston";

export class LogFactory {
  private devEnv = process.env.NODE_ENV !== "production";
  private log: winston.Logger;

  constructor(scope: string) {
    this.log = winston.createLogger({
      defaultMeta: { service: "pcsx2-api", scope: scope },
    });
    this.log.add(
      new winston.transports.Console({
        format: winston.format.simple(),
      })
    );
    if (!this.devEnv) {
      console.log("Piping logs to Grafana as well");
      const lokiTransport = new LokiTransport({
        host: `https://logs-prod-us-central1.grafana.net`,
        batching: true,
        basicAuth: `${process.env.GRAFANA_LOKI_USER}:${process.env.GRAFANA_LOKI_PASS}`,
        labels: { app: "pcsx2-backend", env: this.devEnv ? "dev" : "prod" },
        // remove color from log level label - loki really doesn't like it
        format: winston.format.uncolorize({
          message: false,
          raw: false,
        }),
      });
      this.log.add(lokiTransport);
    }
  }

  public getLogger(): winston.Logger {
    return this.log;
  }
}
