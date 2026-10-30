'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Alert, MutationError } from '@/components/ui/States';
import { Table, TableWrap, Td, Th, THead } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import type { ResetResult } from '@/lib/types';

const CONFIRM_WORD = 'RESET';

export function ResetPanel() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<ResetResult | null>(null);
  const reset = useMutation(api.reset);

  async function confirm() {
    const response = await reset.run();
    if (response) {
      setResult(response);
      setOpen(false);
      setTyped('');
    }
  }

  return (
    <Card>
      <CardHeader title="Environment reset" description="Rebuild the seeded demonstration world." icon={<RotateCcw className="size-4" />} />
      <CardBody className="flex flex-col gap-3">
        <Alert tone="warning" title="Destructive">
          Drops all governance data — principals, grants, delegations, policies, approvals and the audit log — and re-seeds the demo environment.
        </Alert>
        <Button variant="danger" className="self-start" onClick={() => setOpen(true)} icon={<TriangleAlert className="size-4" />}>
          Reset environment…
        </Button>
        {result ? (
          <div className="flex flex-col gap-2">
            <Alert tone="success" title={`Environment reset by ${result.reset_by}`}>
              New agent API keys are shown below <strong>once</strong>. Copy any you need now.
            </Alert>
            <TableWrap>
              <Table>
                <caption className="sr-only">Issued agent API keys</caption>
                <THead>
                  <tr>
                    <Th>Agent</Th>
                    <Th>API key</Th>
                  </tr>
                </THead>
                <tbody>
                  {Object.entries(result.agent_api_keys).map(([agent, key]) => (
                    <tr key={agent}>
                      <Td className="font-mono text-xs">{agent}</Td>
                      <Td className="font-mono text-xs break-all select-all">{key}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Button size="sm" className="self-start" onClick={() => setResult(null)}>Hide keys</Button>
          </div>
        ) : null}
      </CardBody>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Reset the environment?"
        description="This cannot be undone."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={typed !== CONFIRM_WORD} loading={reset.pending} onClick={confirm}>
              Reset everything
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={`Type ${CONFIRM_WORD} to confirm`}>
            {(id) => <Input id={id} autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} />}
          </Field>
          <MutationError error={reset.error} />
        </div>
      </Dialog>
    </Card>
  );
}
