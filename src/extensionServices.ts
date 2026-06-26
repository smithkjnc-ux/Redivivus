// [SCOPE] Redivivus service initialization — extracted from extension.ts (Rule 9 split).

import * as vscode from 'vscode';
import { RedivivusService } from './features/vscode/logic/redivivusService.js';
import { BlueprintService } from './features/blueprint/logic/blueprintService.js';
import { SessionService } from './features/project/logic/sessionService.js';
import { RulesService } from './features/vscode/logic/rules/rulesService.js';
import { ChangeTracker } from './features/build/services/changeTracker.js';
import { MeasureTwiceService } from './features/build/services/measureTwiceService.js';
import { RoutingService } from './features/ai/data/routingService.js';
import { GuideService } from './features/vscode/logic/guideService.js';
import { AnalyzerService } from './features/workspace/logic/analyzerService.js';
import { AnnotationService } from './features/workspace/logic/annotationService.js';
import { VaultService } from './features/vault/data/vaultService.js';
import { VaultContextService } from './features/vault/data/vaultContextService.js';
import { BuildFromVaultService } from './features/vault/data/buildFromVaultService.js';
import { StatusBar } from './features/vscode/ui/statusBar.js';
import { UsageTracker } from './features/telemetry/data/usageTracker.js';
import { GuardianService } from './features/ai/data/guardianService.js';
import { RetrofitService } from './features/project/logic/retrofit/retrofitService.js';
import { WizardService } from './features/project/ui/wizard/wizardService.js';
import { seedVault } from './features/vault/data/vaultSeeder.js';
import { GitHubBackupService } from './features/workspace/data/githubBackupService.js';

export interface ExtensionServices {
  redivivusService: RedivivusService;
  blueprintService: BlueprintService;
  sessionService: SessionService;
  annotationService: AnnotationService;
  analyzerService: AnalyzerService;
  guideService: GuideService;
  routingService: RoutingService;
  measureTwice: MeasureTwiceService;
  changeTracker: ChangeTracker;
  rulesService: RulesService;
  vaultService: VaultService;
  vaultContextService: VaultContextService;
  buildFromVaultService: BuildFromVaultService;
  retrofitService: RetrofitService;
  wizardService: WizardService;
  usageTracker: UsageTracker;
  guardianService: GuardianService;
  statusBar: StatusBar;
  githubBackupService: GitHubBackupService;
}

export function initExtensionServices(context: vscode.ExtensionContext): ExtensionServices {
  const redivivusService = new RedivivusService();
  const blueprintService = new BlueprintService(redivivusService);
  const sessionService = new SessionService(redivivusService);
  const annotationService = new AnnotationService();
  const analyzerService = new AnalyzerService(redivivusService);
  const guideService = new GuideService(redivivusService, sessionService);
  const routingService = new RoutingService();
  const measureTwice = new MeasureTwiceService();
  const changeTracker = new ChangeTracker(redivivusService);
  const rulesService = new RulesService(redivivusService);
  const vaultService = new VaultService(context);
  const vaultContextService = new VaultContextService(vaultService);
  routingService.setVaultContextService(vaultContextService);
  const buildFromVaultService = new BuildFromVaultService(vaultService, routingService);
  const retrofitService = new RetrofitService(redivivusService, routingService, measureTwice, changeTracker, analyzerService);
  const wizardService = new WizardService(redivivusService, sessionService);
  const usageTracker = new UsageTracker(context);
  usageTracker.runOneTimeNonePurge().catch(() => {});
  const guardianService = new GuardianService(redivivusService);
  const statusBar = new StatusBar(redivivusService, sessionService, usageTracker);
  const githubBackupService = new GitHubBackupService(context);

  const seededKey = 'redivivus.vaultSeeded.v1';
  if (!context.globalState.get(seededKey)) {
    setTimeout(async () => {
      try {
        const result = await seedVault(vaultService, { useGitHub: false });
        if (result.added > 0) {
          vscode.window.showInformationMessage(`Redivivus: Loaded ${result.added} starter patterns into your vault.`);
        }
        context.globalState.update(seededKey, true);
      } catch {}
    }, 3000);
  }

  return { redivivusService, blueprintService, sessionService, annotationService, analyzerService, guideService, routingService, measureTwice, changeTracker, rulesService, vaultService, vaultContextService, buildFromVaultService, retrofitService, wizardService, usageTracker, guardianService, statusBar, githubBackupService };
}
