// [SCOPE] WebView panel state types — WizardPanelState interface used across dashboard
// Shared by messageRouter, wizardPanel, and any other WebView state management.

export interface WizardPanelState {
  wizardStep: 'welcome' | 'blueprint' | 'nameLocation' | 'creating';
  wizardData: { blueprint?: any, projectName?: string, folder?: string, parentFolder?: string };
  welcomeDismissed: boolean;
  vaultView: 'categories' | 'subcategories' | 'items' | 'detail';
  vaultCategory: string | null;
  vaultSubcategory: string | null;
  vaultItems: any[];
  vaultGlobal: boolean;
  activeTab: string;
  vaultScanMode: boolean;
  vaultScanItems: any[];
  vaultScanDuplicates: any[];
  vaultScanFileCount: number;
  vaultScanFilteredCount: number;
  vaultScanTotalFound: number;
  mapData?: any;
  // [CHASSIS] Set when user chose "Browse Anyway" — shows yellow warning banner. Dismissed per session.
  browseAnywayBanner: boolean;
}
