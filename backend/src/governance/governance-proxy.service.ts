import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../common/decorators/auth.decorators';
import { HttpMethod, JsonValue, TrustGraphClient } from './trustgraph.client';

/** Builds a Python path from literal segments and (URL-encoded) parameters. */
export function pyPath(strings: TemplateStringsArray, ...params: string[]): string {
  return strings.reduce((path, part, i) => path + part + (i < params.length ? encodeURIComponent(params[i]) : ''), '');
}

/**
 * Forwards an authenticated dashboard request to the Python engine, attributing
 * it to the signed-in operator and preserving the engine's status code and body.
 */
@Injectable()
export class GovernanceProxy {
  constructor(private readonly client: TrustGraphClient) {}

  async forward(
    req: AuthenticatedRequest,
    res: Response,
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<JsonValue | undefined> {
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex + 1) : undefined;
    const result = await this.client.request({
      method,
      path,
      query,
      body: body ?? (method === 'GET' || method === 'DELETE' ? undefined : {}),
      operatorId: req.user?.email,
    });
    res.status(result.status);
    return result.data;
  }
}
