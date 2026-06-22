// [SCOPE] Redivivus service initialization — extracted from extension.ts (Rule 9 split).

import * as vscode from 'vscode';
import { RedivivusService } from './services/redivivusService.js';
import { BlueprintService } from './services/blueprint/blueprintService.js';
import { SessionService } from './services/sessionService.js';
import { RulesService } from './services/rulesService.js';
import { ChangeTracker } from './services/build/changeTracker.js';
import { MeasureTwiceService } from './services/build/measureTwiceService.js';
import { RoutingService } from './services/ai/routingService.js';
import { GuideService } from './services/guideService.js';
import { AnalyzerService } from './ui/panels/analyzer/analyzerService';
import { AnnotationService } from './services/annotationService.js';
import { VaultService } from './services/vault/vaultService.js';
import { VaultContextService } from './services/vault/vaultContextService.js';
import { BuildFromVaultService } from './services/vault/buildFromVaultService.js';
import { StatusBar } from './ui/views/statusBar.js';
import { UsageTracker } from './services/usageTracker.js';
import { GuardianService } from './services/ai/guardianService.js';
import { RetrofitService } from './core/retrofit/retrofitService';
import { WizardService } from './ui/panels/wizard/wizardService';
import { seedVault } from './services/vault/vaultSeeder.js';
import { GitHubBackupService } from './services/githubBackupService.js';

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
