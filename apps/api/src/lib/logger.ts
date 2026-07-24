import { createLogger, type Logger } from "@embr/shared";

export const logger: Logger = createLogger({ serviceName: "api" });
