import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const HEADER = "x-request-id";

/**
 * Attaches a request ID to every inbound request — reusing an upstream
 * value (e.g. from a load balancer or gateway) when present so traces
 * stay correlated end-to-end, and echoes it back on the response.
 */
export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header(HEADER);
    req.requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader(HEADER, req.requestId);
    next();
  };
}
