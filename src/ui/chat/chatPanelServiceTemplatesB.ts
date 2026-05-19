// [SCOPE] External service templates B — Stripe and OpenAI configuration starters.
// Exported to chatPanelServiceTemplates.ts for inclusion in the SERVICE_TEMPLATES map.

import { ServiceTemplate } from './chatPanelServiceTemplatesA.js';

export const STRIPE_TEMPLATE: ServiceTemplate = {
  name: 'stripe',
  files: {
    '.env.example': `# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
`,
    'src/stripe.ts': `// [SCOPE] Stripe client initialization
import { loadStripe } from '@stripe/stripe-js';

export const stripePromise = loadStripe(process.env.STRIPE_PUBLISHABLE_KEY || '');
`,
    'src/stripe-server.ts': `// [SCOPE] Stripe server-side helper
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export async function createPaymentIntent(amount: number, currency: string = 'usd') {
  return stripe.paymentIntents.create({
    amount: amount * 100, // Convert to cents
    currency,
    automatic_payment_methods: { enabled: true },
  });
}

export { stripe };
`,
    'stripe-webhook.ts': `// [SCOPE] Stripe webhook handler
// Deploy this to /api/stripe-webhook
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export async function handleStripeWebhook(payload: string, signature: string) {
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    switch (event.type) {
      case 'payment_intent.succeeded':
        console.log('Payment succeeded:', event.data.object.id);
        break;
      default:
        console.log('Unhandled event:', event.type);
    }
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
`,
  },
  postSetupNotes: `1. Install Stripe SDKs: npm install @stripe/stripe-js stripe
2. Get API keys from dashboard.stripe.com and add to .env
3. Use Stripe CLI to test webhooks locally: stripe listen --forward-to localhost:3000/api/stripe-webhook`
};

export const OPENAI_TEMPLATE: ServiceTemplate = {
  name: 'openai',
  files: {
    '.env.example': `# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=org-...
`,
    'src/openai.ts': `// [SCOPE] OpenAI client initialization
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID,
});

export async function chatCompletion(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7,
    max_tokens: 1000,
  });
  return response.choices[0]?.message?.content;
}

export async function generateImage(prompt: string) {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
  });
  return response.data[0]?.url;
}

export { openai };
`,
    'src/openai-stream.ts': `// [SCOPE] OpenAI streaming helper for real-time responses
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function* streamCompletion(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}
`,
  },
  postSetupNotes: `1. Install OpenAI SDK: npm install openai
2. Get API key from platform.openai.com/api-keys and add to .env
3. Set usage limits at platform.openai.com/settings/organization/limits`
};
