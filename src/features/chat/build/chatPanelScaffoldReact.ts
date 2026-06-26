// [SCOPE] React scaffold template — Vite + React + TypeScript starter files.
// Exported to chatPanelScaffold.ts for inclusion in the SCAFFOLDS map.

export const REACT_SCAFFOLD = {
  name: 'react',
  files: {
    'package.json': JSON.stringify({
      name: 'react-app',
      version: '0.1.0',
      private: true,
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: { '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0', '@vitejs/plugin-react': '^4.3.0', typescript: '^5.7.0', vite: '^6.0.0' },
      scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' }
    }, null, 2),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], jsx: 'react-jsx', module: 'ESNext', moduleResolution: 'bundler', resolveJsonModule: true, strict: true, noUnusedLocals: true, noUnusedParameters: true, noFallthroughCasesInSwitch: true }, include: ['src'] }, null, 2),
    'vite.config.ts': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n`,
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>React App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`,
    'src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    'src/App.tsx': `import { useState } from 'react';
import './App.css';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <h1>React App</h1>
      <div className="card">
        <button onClick={() => setCount((c) => c + 1)}>
          Count is {count}
        </button>
      </div>
    </div>
  );
}

export default App;
`,
    'src/index.css': `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light dark;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}

#root {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  background-color: #1a1a1a;
  color: white;
  cursor: pointer;
}

button:hover {
  border-color: #646cff;
}
`,
    'src/App.css': `.App {
  padding: 2rem;
}

.card {
  padding: 2em;
}
`
  },
  postBuildGuidance: 'Run `npm install` then `npm run dev` to start the dev server.'
};
