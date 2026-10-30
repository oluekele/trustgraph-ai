import { HttpException } from '@nestjs/common';
import { TrustGraphConfig } from '../src/config/configuration';
import { TrustGraphClient, UNAVAILABLE_MESSAGE } from '../src/governance/trustgraph.client';

const config: TrustGraphConfig = {
  baseUrl: 'http://python.test',
  serviceToken: 'svc-token',
  timeoutMs: 10_000,
  longTimeoutMs: 120_000,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function captureError(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) return error;
    throw error;
  }
  throw new Error('Expected the request to fail.');
}

describe('TrustGraphClient', () => {
  let fetchMock: jest.Mock;
  let client: TrustGraphClient;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new TrustGraphClient(config);
  });

  it('sends service token, operator id, JSON body and query string', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { accepted: true }));

    const result = await client.request({
      method: 'POST',
      path: '/delegations',
      query: 'dry=1',
      body: { delegator_id: 'user-alice' },
      operatorId: 'approver@trustgraph.local',
    });

    expect(result).toEqual({ status: 201, data: { accepted: true } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://python.test/delegations?dry=1');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'X-Service-Token': 'svc-token',
      'X-Operator-Id': 'approver@trustgraph.local',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe(JSON.stringify({ delegator_id: 'user-alice' }));
  });

  it('omits the service token header when none is configured', async () => {
    client = new TrustGraphClient({ ...config, serviceToken: '' });
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    await client.request({ method: 'GET', path: '/tools' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty('X-Service-Token');
    expect(init.body).toBeUndefined();
  });

  it('preserves non-error status codes such as a rejected delegation (200)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { accepted: false, reason: 'no authority', violations: ['x'] }));
    const result = await client.request({ method: 'POST', path: '/delegations', body: {} });
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ accepted: false });
  });

  it('returns undefined data for 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(client.request({ method: 'DELETE', path: '/policies/p1' })).resolves.toEqual({ status: 204, data: undefined });
  });

  it.each([404, 409, 422])('relays %i with the engine detail as message', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { detail: `Engine said ${status}` }));
    const error = await captureError(client.request({ method: 'GET', path: '/principals/nope' }));
    expect(error.getStatus()).toBe(status);
    expect(error.getResponse()).toMatchObject({ statusCode: status, message: `Engine said ${status}` });
  });

  it('flattens FastAPI schema validation details into a readable 422 message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { detail: [{ loc: ['body', 'grants'], msg: 'List should have at least 1 item', type: 'too_short' }] }),
    );
    const error = await captureError(client.request({ method: 'POST', path: '/delegations', body: {} }));
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({ message: 'grants: List should have at least 1 item' });
  });

  it('maps a refused service token to 502 instead of logging the operator out', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Invalid or missing service token.' }));
    const error = await captureError(client.request({ method: 'GET', path: '/overview' }));
    expect(error.getStatus()).toBe(502);
  });

  it('maps engine 5xx errors to 502', async () => {
    fetchMock.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    const error = await captureError(client.request({ method: 'GET', path: '/overview' }));
    expect(error.getStatus()).toBe(502);
    expect(error.message).toBe(UNAVAILABLE_MESSAGE);
  });

  it('maps network failures and timeouts to 502 governance service unavailable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const network = await captureError(client.request({ method: 'GET', path: '/overview' }));
    expect(network.getStatus()).toBe(502);
    expect(network.message).toBe(UNAVAILABLE_MESSAGE);

    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    const timeout = await captureError(client.request({ method: 'GET', path: '/overview' }));
    expect(timeout.getStatus()).toBe(502);
  });

  it('uses the long timeout for evaluation runs and agent runs', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));
    await client.request({ method: 'POST', path: '/evaluation/run', body: {} });
    await client.request({ method: 'POST', path: '/agents/agent-finance/run', body: { task: 'x' } });
    await client.request({ method: 'GET', path: '/overview' });
    expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([120_000, 120_000, 10_000]);
    timeoutSpy.mockRestore();
  });
});
