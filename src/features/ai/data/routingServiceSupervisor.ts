// [SCOPE] Supervisor plan with automatic failover — extracted from routingService.ts (Rule 9 split).
// When supervisorPlanImpl returns null, records the failure, promotes next model, and retries once.
// Caller sets svc.supervisorFailoverCallback to receive plain-English role-change notifications.

import { supervisorPlanImpl } from './routingGuardian.js';
import type { RoutingService } from './routingService.js';

export async function supervisorPlanWithFailover(
  svc: RoutingService,
  userTask: string,
  targetFile: string,
  blueprintContext: string,
  neverDoContext?: string,
): Promise<string | null> {
  const result = await supervisorPlanImpl(svc, userTask, targetFile, blueprintContext, neverDoContext);
  if (!result) {
    const { supervisor: failedProvider } = svc.selectSupervisorAndWorker();
    const { recordProviderFailure, setFailoverNotify } = await import('../logic/roleAssignmentFailover.js');
    if ((svc as any).supervisorFailoverCallback) { setFailoverNotify((svc as any).supervisorFailoverCallback); }
    const { changed, assignment } = recordProviderFailure(failedProvider, 'supervisorPlan returned null');
    if (changed && assignment.supervisor.providerId !== failedProvider) {
      // Retry once with the newly promoted supervisor
      const proxy = Object.create(svc) as RoutingService;
      proxy.selectSupervisorAndWorker = () => ({
        supervisor: assignment.supervisor.providerId,
        worker: assignment.workers[0]?.providerId ?? null,
      });
      return supervisorPlanImpl(proxy, userTask, targetFile, blueprintContext, neverDoContext);
    }
  }
  return result;
}
