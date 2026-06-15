// [SCOPE] Client-side <script> for the API Setup webview panel. Split from apiSetupHtml.ts to keep
// that file under the 200-line limit (Rule 9). Injected as a string into the panel HTML.
// [WARN] Rule 13: keep new code ASCII-only inside this script. Pre-existing bullet/emoji literals
// are preserved verbatim because they already inject and render correctly.

export const API_SETUP_SCRIPT = `
    const vscode = acquireVsCodeApi();

    function toggleProvider(id) {
      vscode.postMessage({ type: 'toggle-provider', providerId: id });
    }

    document.getElementById('test-all-btn').addEventListener('click', () => {
      const btn = document.getElementById('test-all-btn');
      btn.innerHTML = '&#8987; Testing...';
      btn.style.opacity = '0.7';
      btn.style.pointerEvents = 'none';

      const testFeedback = document.getElementById('test-feedback');
      const testResults = document.getElementById('test-results');
      testFeedback.style.display = 'block';
      testResults.innerHTML = '';

      const providers = [
        { id: 'gemini', name: 'Gemini' },
        { id: 'claude', name: 'Claude' },
        { id: 'openai', name: 'OpenAI' },
        { id: 'groq', name: 'Groq' },
        { id: 'xai', name: 'xAI' },
        { id: 'kimi', name: 'Kimi' },
        { id: 'deepseek', name: 'DeepSeek' }
      ];

      providers.forEach(provider => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'test-result';
        resultDiv.id = 'test-' + provider.id;
        resultDiv.innerHTML = 
          '<div class="test-status testing">⏳</div>' +
          '<div class="test-provider">' + provider.name + '</div>' +
          '<div class="test-message">Testing...</div>';
        testResults.appendChild(resultDiv);
      });

      vscode.postMessage({ type: 'test-all-keys' });
    });

    document.getElementById('apply-btn').addEventListener('click', () => {
      const btn = document.getElementById('apply-btn');
      btn.innerHTML = '&#8987; Verifying Keys...';
      btn.style.opacity = '0.7';
      btn.style.pointerEvents = 'none';

      const ids = ['gemini','claude','openai','groq','xai','kimi','deepseek'];
      const payload = { type: 'save-keys' };
      ids.forEach(id => {
        document.getElementById(id + '-err').style.display = 'none'; // reset errors
        const el = document.getElementById(id + '-key');
        if (!el) return;
        const v = el.value;
        payload[id + 'Key'] = (v.includes('•') && el.dataset.original === 'set') ? undefined : v;
      });
      vscode.postMessage(payload);
    });

    document.getElementById('vscode-settings-btn').addEventListener('click', () => { vscode.postMessage({ type: 'open-vscode-settings' }); });

    document.getElementById('export-all-btn').addEventListener('click', () => {
      const btn = document.getElementById('export-all-btn');
      btn.innerHTML = '&#x8987; Exporting...';
      btn.style.opacity = '0.7';
      vscode.postMessage({ type: 'export-all-keys' });
      setTimeout(() => {
        btn.innerHTML = '&#x1F510; Export Keys (encrypted)';
        btn.style.opacity = '1';
      }, 1500);
    });

    document.getElementById('import-keys-btn').addEventListener('click', () => {
      const btn = document.getElementById('import-keys-btn');
      btn.innerHTML = '&#x8987; Importing...';
      btn.style.opacity = '0.7';
      vscode.postMessage({ type: 'import-keys' });
      setTimeout(() => {
        btn.innerHTML = '&#x1F4E5; Import Keys';
        btn.style.opacity = '1';
      }, 1500);
    });

    window.addEventListener('message', e => {
      if (e.data.type === 'highlight-provider') {
        const el = document.getElementById(e.data.provider + '-key');
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); el.style.outline = '2px solid #4a9eff'; setTimeout(() => { el.style.outline = ''; }, 3000); }
      } else if (e.data.type === 'test-result') {
        const result = e.data.result;
        const resultDiv = document.getElementById('test-' + result.provider);
        if (resultDiv) {
          const statusDiv = resultDiv.querySelector('.test-status');
          const messageDiv = resultDiv.querySelector('.test-message');
          
          if (result.success) {
            statusDiv.className = 'test-status success';
            statusDiv.innerHTML = '✓';
            messageDiv.textContent = result.message || 'Connected successfully';
          } else {
            statusDiv.className = 'test-status error';
            statusDiv.innerHTML = '✗';
            messageDiv.textContent = result.error || 'Connection failed';
          }
        }
        
        // Check if all tests are complete
        const allResults = document.querySelectorAll('.test-result');
        let allComplete = true;
        allResults.forEach(r => {
          const status = r.querySelector('.test-status');
          if (status.classList.contains('testing')) {
            allComplete = false;
          }
        });
        
        if (allComplete) {
          const btn = document.getElementById('test-all-btn');
          btn.innerHTML = '&#x1F50D; Test All Keys';
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
        }
      } else if (e.data.type === 'saved') {
        const btn = document.getElementById('apply-btn');
        btn.innerHTML = '&#x2705; Apply Changes';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';

        if (e.data.errors && e.data.errors.length > 0) {
            e.data.errors.forEach(err => {
                const errDiv = document.getElementById(err.id + '-err');
                if (errDiv) {
                    errDiv.textContent = '❌ ' + err.msg;
                    errDiv.style.display = 'block';
                }
                const statusDiv = document.getElementById(err.id + '-status');
                if (statusDiv) {
                    statusDiv.className = 'provider-status status-missing';
                    statusDiv.innerHTML = '❌ Invalid Key';
                }
            });
            const fb = document.getElementById('apply-feedback');
            fb.innerHTML = '&#x26A0;&#xFE0F; <strong>Saved with errors.</strong> Some keys failed validation.<br><span id="apply-time" style="font-size:11px;opacity:0.7;">' + 'Applied at ' + e.data.timestamp + '</span>';
            fb.style.borderLeft = '4px solid #b85c00';
            fb.classList.add('show');
            setTimeout(() => { fb.classList.remove('show'); fb.style.borderLeft = '4px solid #4ec959'; }, 8000);
        } else {
            const fb = document.getElementById('apply-feedback');
            fb.innerHTML = '&#x2705; <strong>Keys verified and applied!</strong> Redivivus is ready to build.<br><span id="apply-time" style="font-size:11px;opacity:0.7;">' + 'Applied at ' + e.data.timestamp + '</span>';
            fb.classList.add('show');
            setTimeout(() => fb.classList.remove('show'), 5000);
        }
      }
    });
`;
