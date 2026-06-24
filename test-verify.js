const { verifyPreviewRuns } = require('./out/ui/panels/chat/chatPanelPreviewVerify.js');
const { getRuntimeReports } = require('./out/ui/panels/chat/chatPanelPreview.js');

async function run() {
  console.log("Running verifyPreviewRuns...");
  const root = '/home/papajoe/projects/apps/user-auth-system';
  
  // Mock vscode so we can run this headlessly
  const mockVscode = {
    workspace: { getConfiguration: () => ({ get: () => {} }) },
    window: { 
      createWebviewPanel: () => {
        console.log("Webview Panel Created!");
        return { 
          webview: { html: '' }, 
          dispose: () => console.log("Webview Panel Disposed!") 
        };
      }
    },
    ViewColumn: { Beside: 2 },
    env: { asExternalUri: async (uri) => uri }
  };
  require('module').prototype.require = new Proxy(require('module').prototype.require, {
    apply(target, thisArg, argumentsList) {
      if (argumentsList[0] === 'vscode') return mockVscode;
      return Reflect.apply(target, thisArg, argumentsList);
    }
  });

  const res = await verifyPreviewRuns(root, 2800);
  console.log("Result:", res);
  console.log("Runtime Reports:", getRuntimeReports());
}
run();
