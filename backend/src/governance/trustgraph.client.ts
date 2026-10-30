import { BadGatewayException, HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { trustGraphConfig, TrustGraphConfig } from '../config/configuration';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface TrustGraphRequest {
  method: HttpMethod;
  /** Path on the Python service, e.g. `/principals/agent-finance`. */
  path: string;
  /** Raw query string (without `?`) to pass through unchanged. */
  query?: string;
  body?: unknown;
  /** Email of the authenticated dashboard operator (audit actor / approver). */
  operatorId?: string;
  timeoutMs?: number;
}

export interface TrustGraphResponse<T = JsonValue> {
  status: number;
  data: T | undefined;
}

export const UNAVAILABLE_MESSAGE = 'TrustGraph governance service unavailable';

/** Python statuses that are meaningful to the dashboard and are relayed with the same code. */
const RELAYED_STATUSES = new Set<number>([400, 404, 409, 422, 503]);

const LONG_RUNNING = [/^\/evaluation\/run$/, /^\/agents\/[^/]+\/run$/];

/**
 * Typed HTTP client for the authoritative Python governance engine. This
 * gateway never makes authorisation or risk decisions itself; it forwards
 * operator intent and relays the engine's verdict unchanged.
 */
@Injectable()
export class TrustGraphClient {
  private readonly logger = new Logger(TrustGraphClient.name);

  constructor(@Inject(trustGraphConfig.KEY) private readonly config: TrustGraphConfig) {}

  async request<T = JsonValue>(req: TrustGraphRequest): Promise<TrustGraphResponse<T>> {
    const url = `${this.config.baseUrl}${req.path}${req.query ? `?${req.query}` : ''}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.config.serviceToken) headers['X-Service-Token'] = this.config.serviceToken;
    if (req.operatorId) headers['X-Operator-Id'] = req.operatorId;
    const hasBody = req.body !== undefined && req.method !== 'GET';
    if (hasBody) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetch(url, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(req.timeoutMs ?? this.timeoutFor(req.path)),
      });
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      this.logger.warn(`${req.method} ${req.path} failed: ${reason}`);
      throw new BadGatewayException(UNAVAILABLE_MESSAGE);
    }

    const data = await this.readBody(response);
    if (response.ok) {
      return { status: response.status, data: data as T | undefined };
    }
    throw this.mapError(req, response.status, data);
  }

  /** Lightweight liveness probe used by the gateway health endpoint. */
  async health(): Promise<{ status: string; [key: string]: JsonValue }> {
    const { data } = await this.request<{ status: string; [key: string]: JsonValue }>({
      method: 'GET',
      path: '/health',
      timeoutMs: 3000,
    });
    return data ?? { status: 'unknown' };
  }

  private timeoutFor(path: string): number {
    return LONG_RUNNING.some((pattern) => pattern.test(path)) ? this.config.longTimeoutMs : this.config.timeoutMs;
  }

  private async readBody(response: Response): Promise<JsonValue | undefined> {
    if (response.status === 204) return undefined;
    let text: string;
    try {
      text = await response.text();
    } catch {
      return undefined;
    }
    if (!text) return undefined;
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      return text;
    }
  }

  private mapError(req: TrustGraphRequest, status: number, data: JsonValue | undefined): HttpException {
    const detail = data && typeof data === 'object' && !Array.isArray(data) ? data.detail : undefined;

    if (RELAYED_STATUSES.has(status)) {
      const message = this.describe(detail) ?? HttpStatusText[status] ?? 'Request rejected by governance service';
      return new HttpException(
        { statusCode: status, error: HttpStatusText[status] ?? 'Error', message, ...(detail !== undefined ? { detail } : {}) },
        status,
      );
    }

    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      // The gateway's own credentials were refused: a deployment problem, not the operator's.
      this.logger.error(`${req.method} ${req.path}: governance service rejected the gateway service token (${status}).`);
      return new BadGatewayException('TrustGraph governance service rejected the gateway credentials');
    }

    this.logger.warn(`${req.method} ${req.path}: governance service returned ${status}.`);
    return new BadGatewayException(UNAVAILABLE_MESSAGE);
  }

  /** FastAPI `detail` is a string for domain errors and a list of issues for schema validation. */
  private describe(detail: JsonValue | undefined): string | undefined {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const parts = detail.map((issue) => {
        if (issue && typeof issue === 'object' && !Array.isArray(issue)) {
          const loc = Array.isArray(issue.loc) ? issue.loc.filter((p) => p !== 'body').join('.') : '';
          const msg = typeof issue.msg === 'string' ? issue.msg : JSON.stringify(issue);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(issue);
      });
      return parts.join('; ') || undefined;
    }
    return undefined;
  }
}

const HttpStatusText: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  503: 'Service Unavailable',
};
