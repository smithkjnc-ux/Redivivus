// [SCOPE] External service templates A — Firebase and Supabase configuration starters.
// Exported to chatPanelServiceTemplates.ts for inclusion in the SERVICE_TEMPLATES map.

export interface ServiceTemplate {
  name: string;
  files: Record<string, string>;
  postSetupNotes: string;
}

export const FIREBASE_TEMPLATE: ServiceTemplate = {
  name: 'firebase',
  files: {
    'firebase.json': JSON.stringify({ hosting: { public: 'public', ignore: ['firebase.json', '**/.*', '**/node_modules/**'] }, firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' } }, null, 2),
    'firestore.rules': `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
`,
    'firestore.indexes.json': '{ "indexes": [], "fieldOverrides": [] }',
    '.env.example': `# Firebase Configuration
FIREBASE_API_KEY=your_api_key_here
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abcdef123456
`,
    'src/firebase.ts': `// [SCOPE] Firebase initialization
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
`,
  },
  postSetupNotes: `1. Install Firebase SDK: npm install firebase
2. Copy .env.example to .env and fill in your Firebase project credentials
3. Run 'firebase login' and 'firebase init' to deploy hosting/firestore`
};

export const SUPABASE_TEMPLATE: ServiceTemplate = {
  name: 'supabase',
  files: {
    '.env.example': `# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
`,
    'src/supabase.ts': `// [SCOPE] Supabase client initialization
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Type-safe database helper
export type Database = {
  public: {
    Tables: {
      // Define your tables here for TypeScript intellisense
    };
  };
};
`,
    'supabase/migrations/001_initial.sql': `-- [SCOPE] Initial Supabase schema
-- Create your tables here
-- Example:
-- CREATE TABLE IF NOT EXISTS public.profiles (
--   id uuid references auth.users primary key,
--   username text unique,
--   created_at timestamp with time zone default timezone('utc'::text, now())
-- );
`,
  },
  postSetupNotes: `1. Install Supabase SDK: npm install @supabase/supabase-js
2. Create project at supabase.com and copy URL + anon key to .env
3. Use 'supabase db push' to deploy migrations`
};
