// [SCOPE] CHASSIS Test Utility - HTTP Interceptor Setup using Nock
import * as fs from 'fs';
import * as path from 'path';
import nock from 'nock';

const mocksDir = path.join(process.cwd(), 'src', 'tests', '__mocks__');

// ENFORCE STRICT OFFLINE TESTING
// Prevents any un-mocked HTTP request from leaving the test suite
nock.disableNetConnect();
// Allow localhost connections for VS Code Extension Host IPC
nock.enableNetConnect(/(127\.0\.0\.1|localhost)/);

export function setupNockMock(domain: string, endpoint: string, responseFixtureName: string): void {
  const fixturePath = path.join(mocksDir, `${domain}_${responseFixtureName}.json`);
  
  if (!fs.existsSync(mocksDir)) {
    fs.mkdirSync(mocksDir, { recursive: true });
  }

  if (!fs.existsSync(fixturePath)) {
    // Create a dummy fixture if it doesn't exist so developers know the structure
    fs.writeFileSync(fixturePath, JSON.stringify({ mocked: true, message: "Add real mock here" }, null, 2), 'utf-8');
  }

  const responseData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  // Assuming Google Gemini endpoint format since CHASSIS uses Gemini
  nock('https://generativelanguage.googleapis.com')
    .post(endpoint)
    .reply(200, responseData);
}

export function cleanNockMocks(): void {
  nock.cleanAll();
}
