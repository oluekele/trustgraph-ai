import type { JsonObject } from './types';

/** Example arguments for the seeded tools (placeholders / quick-fill in forms). */
export const TOOL_EXAMPLES: Record<string, JsonObject> = {
  calculator: { expression: '1250 * 1.2' },
  current_time: {},
  web_search: { query: 'AI agent governance', max_results: 3 },
  file_reader: { path: '/research/report.pdf' },
  file_writer: { path: '/reports/weekly.md', content: 'Weekly summary…' },
  crm_query: { table: 'customers', limit: 5 },
  crm_update: { table: 'customers', record_ids: ['c-001'], changes: { tier: 'gold' } },
  crm_delete: { table: 'customers', record_ids: ['c-001'] },
  send_email: { to: ['team@acme.example'], subject: 'Status update', body: 'All systems nominal.' },
  payment_transfer: { account: 'vendor-payouts', recipient: 'northwind', amount: 1200, reference: 'INV-1042' },
  deploy_service: { service: 'billing-api', version: '1.4.2', environment: 'staging' },
  rest_api: { method: 'GET', url: 'https://status.acme.example/v1/status' },
};

export const PURPOSE_EXAMPLES = ['Vendor payment run', 'Weekly reporting', 'Customer support', 'Market research'];
