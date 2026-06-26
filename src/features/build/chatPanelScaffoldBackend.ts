// [SCOPE] Backend scaffold templates — Python Flask, Go API, Node Express starter files.
// Exported to chatPanelScaffold.ts for inclusion in the SCAFFOLDS map.

export const PYTHON_FLASK_SCAFFOLD = {
  name: 'python-flask',
  files: {
    'app.py': `# [SCOPE] Flask API starter
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route('/')
def home():
    return jsonify({"message": "Hello from Flask!"})

@app.route('/api/health')
def health():
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
`,
    'requirements.txt': `flask>=3.1.0
flask-cors>=5.0.0
`,
    '.env.example': `FLASK_ENV=development
FLASK_DEBUG=1
PORT=5000
`
  },
  postBuildGuidance: 'Run `pip install -r requirements.txt` then `python app.py` to start the server.'
};

export const GO_API_SCAFFOLD = {
  name: 'go-api',
  files: {
    'main.go': `// [SCOPE] Go API starter
package main

import (
\t"encoding/json"
\t"log"
\t"net/http"
)

type Response struct {
\tMessage string \`json:"message"\`
\tStatus  string \`json:"status"\`
}

func homeHandler(w http.ResponseWriter, r *http.Request) {
\tw.Header().Set("Content-Type", "application/json")
\tjson.NewEncoder(w).Encode(Response{
\t\tMessage: "Hello from Go!",
\t\tStatus:  "ok",
\t})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
\tw.Header().Set("Content-Type", "application/json")
\tjson.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

func main() {
\thttp.HandleFunc("/", homeHandler)
\thttp.HandleFunc("/api/health", healthHandler)

\tlog.Println("Server starting on :8080")
\tlog.Fatal(http.ListenAndServe(":8080", nil))
}
`,
    'go.mod': `module goapi

go 1.21
`,
    '.env.example': `PORT=8080
`
  },
  postBuildGuidance: 'Run `go mod tidy` then `go run main.go` to start the server.'
};

export const NODE_EXPRESS_SCAFFOLD = {
  name: 'node-express',
  files: {
    'package.json': JSON.stringify({
      name: 'node-express-api',
      version: '1.0.0',
      main: 'server.js',
      scripts: { start: 'node server.js', dev: 'nodemon server.js' },
      dependencies: { express: '^4.21.0', cors: '^2.8.5', dotenv: '^16.4.0' },
      devDependencies: { nodemon: '^3.1.0' }
    }, null, 2),
    'server.js': `// [SCOPE] Express API starter
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express!', status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`,
    '.env.example': `PORT=3000
NODE_ENV=development
`
  },
  postBuildGuidance: 'Run `npm install` then `npm run dev` to start the server with nodemon.'
};
