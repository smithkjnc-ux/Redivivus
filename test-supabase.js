require('dotenv').config({ path: '/home/papajoe/projects/redivivus-web/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data, error } = await supabase.from('waitlist').insert({
    email: 'test@example.com',
    name: 'Test',
    notes: null,
    status: 'pending',
  });
  console.log("Error:", error);
}
test();
