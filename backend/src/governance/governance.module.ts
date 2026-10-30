import { Module } from '@nestjs/common';
import { DelegationsController } from './controllers/delegations.controller';
import { AdminController, ObservabilityController } from './controllers/observability.controller';
import {
  CatalogueController,
  GrantsController,
  PoliciesController,
  PrincipalsController,
} from './controllers/registry.controller';
import { ApprovalsController, RuntimeController } from './controllers/runtime.controller';
import { GovernanceProxy } from './governance-proxy.service';
import { TrustGraphClient } from './trustgraph.client';

/** Typed, role-guarded proxy to the authoritative Python governance engine. */
@Module({
  controllers: [
    ObservabilityController,
    PrincipalsController,
    CatalogueController,
    GrantsController,
    PoliciesController,
    DelegationsController,
    RuntimeController,
    ApprovalsController,
    AdminController,
  ],
  providers: [TrustGraphClient, GovernanceProxy],
  exports: [TrustGraphClient],
})
export class GovernanceModule {}
