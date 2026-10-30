import type { JsonObject, Permission, ToolMetadata } from './types';

const INTERNAL_DOMAIN = 'acme.example';
const METHOD_ACTIONS: Record<string, string> = { GET: 'read', POST: 'write', PUT: 'write', PATCH: 'write', DELETE: 'delete' };

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalisePath(path: string): string {
  const cleaned = path.trim().replace(/^file:\/\//, '');
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

/**
 * Best-effort client-side preview of how a tool call maps onto
 * (capability, resource, action), mirroring ai_agent/tools/definitions.py.
 * The engine performs the authoritative resolution on /execute; this is
 * only used to pre-fill "Authorize only" requests, and stays editable.
 */
export function resolvePermission(tool: ToolMetadata, args: JsonObject): Permission {
  let resource = tool.resource;
  let action = tool.action;
  if (resource === 'dynamic' || action === 'dynamic') {
    switch (tool.name) {
      case 'file_reader':
      case 'file_writer':
        resource = `file://${normalisePath(str(args.path))}`;
        break;
      case 'crm_query':
      case 'crm_update':
      case 'crm_delete':
        resource = `db://crm/${str(args.table, 'customers') || 'customers'}`;
        break;
      case 'send_email': {
        const to = Array.isArray(args.to) ? args.to.map(String) : typeof args.to === 'string' ? [args.to] : [];
        const internal = to.length > 0 && to.every((address) => address.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`));
        resource = internal ? 'email://internal' : 'email://external';
        break;
      }
      case 'payment_transfer':
        resource = `payments://${str(args.account, 'unknown') || 'unknown'}`;
        break;
      case 'deploy_service':
        resource = `infra://${str(args.environment, 'unknown') || 'unknown'}`;
        break;
      case 'rest_api': {
        let host = 'invalid';
        try {
          host = new URL(str(args.url)).hostname || 'invalid';
        } catch {
          host = 'invalid';
        }
        resource = `api://${host}`;
        action = METHOD_ACTIONS[str(args.method, 'GET').toUpperCase()] ?? 'admin';
        break;
      }
      default:
        break;
    }
  }
  return { capability: tool.capability, resource: resource === 'dynamic' ? '' : resource, action: action === 'dynamic' ? '' : action };
}
