import fs from "node:fs";
import path from "node:path";
import pino from "pino";

export function buatLogger(logDir: string) {
  fs.mkdirSync(path.dirname(logDir), { recursive: true });
  return pino(
    { level: process.env.LOG_LEVEL ?? "info" },
    pino.multistream([
      { stream: pino.destination(logDir) },
      { stream: pino.transport({ target: "pino-pretty", options: { colorize: true } }) },
    ]),
  );
}
