// [SCOPE] Blueprint Interview Layer Data — FOUNDATION + type-specific layer constants
// Extracted from blueprintInterview.ts to keep it under 200 lines.

import type { BlueprintLayer, ProjectType } from './blueprintInterview.js';

export const FOUNDATION_LAYER: BlueprintLayer = {
  id: 'foundation', name: 'Foundation', emoji: '&#x1F3D7;',
  questions: [
    { id: 'who', text: 'WHO is going to use this?', hint: 'Describe the actual person -- skill level, age, context. "Everyone" is not an answer.', required: true, type: 'text' },
    { id: 'what', text: 'WHAT does it need to do?', hint: 'One sentence. The minimum thing that makes this useful. Not the dream list.', required: true, type: 'text' },
    { id: 'where', text: 'WHERE does it run?', hint: 'Web browser? Phone? Desktop app? Command line? Server only?', required: true, type: 'text' },
    { id: 'why', text: 'WHY does this need to exist?', hint: 'What problem is not already solved? If you can name 3 existing solutions, reconsider.', required: true, type: 'text' },
    { id: 'simplicity', text: 'Simple or full-featured?', hint: 'Be honest. Simple programs that work beat complex ones that almost work.', required: true, type: 'choice', choices: ['As simple as possible -- just make it work', 'Moderate -- core features only', 'Full-featured -- I know the complexity cost'] },
  ],
};

const GAME_LAYERS: BlueprintLayer[] = [
  {
    id: 'game_core', name: 'Game Core', emoji: '&#x1F3AE;',
    questions: [
      { id: 'genre', text: 'What genre?', hint: 'Puzzle, platformer, RPG, shooter, strategy, idle, simulation, other?', required: true, type: 'text' },
      { id: 'players', text: 'Single player or multiplayer?', hint: 'Local multiplayer? Online? Co-op vs competitive?', required: true, type: 'choice', choices: ['Single player only', 'Local multiplayer', 'Online multiplayer', 'Both single and multiplayer'] },
      { id: 'platform', text: 'What platform?', hint: 'Browser, mobile, PC, console?', required: true, type: 'choice', choices: ['Web browser', 'Mobile (iOS/Android)', 'PC/Mac desktop', 'Multiple platforms'] },
      { id: 'loop', text: 'What is the core game loop?', hint: 'The thing the player does over and over.', required: true, type: 'text' },
    ],
  },
  {
    id: 'game_systems', name: 'Game Systems', emoji: '&#x2699;',
    questions: [
      { id: 'saves', text: 'Does progress save?', hint: 'Save files? Cloud saves? Session only?', required: true, type: 'choice', choices: ['No saving -- each session fresh', 'Local save only', 'Cloud saves', 'Not sure yet'] },
      { id: 'physics', text: 'Does it need physics?', hint: 'Gravity, collisions, projectiles?', required: false, type: 'choice', choices: ['Yes -- real physics engine', 'Simple collision detection only', 'No physics needed'] },
      { id: 'ai', text: 'Are there AI-controlled characters?', hint: 'Enemies, NPCs, bosses?', required: false, type: 'choice', choices: ['Yes -- smart AI needed', 'Simple scripted behavior', 'No AI characters'] },
      { id: 'monetize', text: 'Is there any monetization?', hint: 'This affects architecture significantly.', required: true, type: 'choice', choices: ['Free, no monetization', 'One-time purchase', 'In-app purchases', 'Ads', 'Subscription'] },
    ],
  },
  {
    id: 'game_safety', name: 'Safety & Risk', emoji: '&#x1F6E1;',
    questions: [
      { id: 'cheat', text: 'Does cheating matter?', hint: 'Single player: probably not. Leaderboards/online: absolutely yes.', required: false, type: 'choice', choices: ['No cheating concerns', 'Basic anti-cheat needed', 'Server-side validation required'] },
      { id: 'age', text: 'Is there user-generated content or chat?', hint: 'If yes, you need moderation. This is a safety issue, not a feature.', required: true, type: 'choice', choices: ['No user content or chat', 'Yes -- moderation plan needed', 'Yes -- adults only, no moderation'] },
    ],
  },
];

const WEBAPP_LAYERS: BlueprintLayer[] = [
  {
    id: 'webapp_core', name: 'App Structure', emoji: '&#x1F5A5;',
    questions: [
      { id: 'auth', text: 'Do users need accounts?', hint: 'Login/signup? Or anonymous? This is the single biggest architecture decision.', required: true, type: 'choice', choices: ['No accounts -- fully anonymous', 'Optional accounts', 'Accounts required', 'Third-party login (Google, GitHub)'] },
      { id: 'data', text: 'Does it store data?', hint: 'If yes: who owns it, where does it live, what happens if it\'s lost?', required: true, type: 'choice', choices: ['No data storage', 'Local browser storage only', 'Server database', 'File-based storage'] },
      { id: 'realtime', text: 'Does anything need to update in real time?', hint: 'Live feeds, chat, collaborative editing, notifications?', required: true, type: 'choice', choices: ['No -- static or refresh-based', 'Some real-time (notifications)', 'Yes -- live updates core to the app'] },
      { id: 'scale', text: 'How many users, roughly?', hint: 'This shapes database choice, hosting, and caching.', required: true, type: 'choice', choices: ['Just me / small team (<10)', 'Small audience (<1000)', 'Public launch (1000+)', 'Unknown yet'] },
    ],
  },
  {
    id: 'webapp_security', name: 'Security Layer', emoji: '&#x1F512;',
    questions: [
      { id: 'sensitive', text: 'Does it handle sensitive data?', hint: 'Passwords, payments, health, personal info, messages?', required: true, type: 'choice', choices: ['No sensitive data', 'Basic personal info', 'Payments or financial data', 'Health or highly sensitive data'] },
      { id: 'permissions', text: 'Do different users have different access?', hint: 'Admin vs regular user? Owner vs viewer?', required: true, type: 'choice', choices: ['Everyone sees everything', 'Basic roles (admin/user)', 'Complex permissions needed'] },
      { id: 'input', text: 'Do users submit any text or files?', hint: 'Forms, uploads, comments -- all require input validation and sanitization.', required: true, type: 'choice', choices: ['No user input', 'Forms only', 'File uploads', 'Both forms and files'] },
    ],
  },
  {
    id: 'webapp_ux', name: 'User Experience', emoji: '&#x1F3A8;',
    questions: [
      { id: 'mobile_friendly', text: 'Does it need to work on phones?', hint: 'Responsive design adds significant work. Worth knowing upfront.', required: true, type: 'choice', choices: ['Desktop only', 'Mobile-friendly preferred', 'Mobile-first (primary device is phone)'] },
      { id: 'first_screen', text: 'What is the first thing a user sees?', hint: 'Landing page? Dashboard? Login? This sets the UX foundation.', required: false, type: 'text' },
    ],
  },
];

const API_LAYERS: BlueprintLayer[] = [
  {
    id: 'api_core', name: 'API Structure', emoji: '&#x1F50C;',
    questions: [
      { id: 'consumers', text: 'Who calls this API?', hint: 'Internal services only? External developers? Mobile apps? Public?', required: true, type: 'choice', choices: ['Internal use only', 'Our own frontend', 'External developers (public API)', 'Both internal and external'] },
      { id: 'auth_method', text: 'How is it authenticated?', hint: 'API keys, JWT tokens, OAuth, or none?', required: true, type: 'choice', choices: ['No auth (open)', 'API keys', 'JWT tokens', 'OAuth 2.0', 'Not sure yet'] },
      { id: 'data_format', text: 'REST, GraphQL, or something else?', hint: 'REST is simpler. GraphQL is flexible but complex. Choose simple unless you have a strong reason.', required: true, type: 'choice', choices: ['REST', 'GraphQL', 'gRPC', 'WebSocket', 'Not sure'] },
    ],
  },
  {
    id: 'api_safety', name: 'Safety & Limits', emoji: '&#x1F6E1;',
    questions: [
      { id: 'rate_limit', text: 'Does it need rate limiting?', hint: 'Without this, one user can take down your API. Required for any public endpoint.', required: true, type: 'choice', choices: ['No rate limiting needed', 'Basic rate limiting', 'Per-user quotas and billing'] },
      { id: 'validation', text: 'What happens with bad input?', hint: 'Every API endpoint that accepts data must validate it. This prevents 80% of security issues.', required: true, type: 'choice', choices: ['Basic null checks only', 'Full schema validation', 'Not planned yet -- good to know'] },
    ],
  },
];

const CLI_LAYERS: BlueprintLayer[] = [
  {
    id: 'cli_core', name: 'CLI Design', emoji: '&#x2328;',
    questions: [
      { id: 'invocation', text: 'How is it invoked?', hint: 'Single command? Multiple subcommands? Interactive mode?', required: true, type: 'choice', choices: ['Single command with flags', 'Multiple subcommands (like git)', 'Interactive/wizard mode', 'Runs as a daemon/background process'] },
      { id: 'io', text: 'What does it read and write?', hint: 'Files? stdin/stdout? Network? Database?', required: true, type: 'text' },
      { id: 'errors', text: 'What should happen when something goes wrong?', hint: 'Exit codes? Retry? Log file?', required: true, type: 'choice', choices: ['Print error and exit', 'Retry automatically', 'Write to log file', 'Interactive error recovery'] },
    ],
  },
];

export const TYPE_LAYERS: Record<ProjectType, BlueprintLayer[]> = {
  game: GAME_LAYERS, webapp: WEBAPP_LAYERS, api: API_LAYERS, cli: CLI_LAYERS,
  mobile: WEBAPP_LAYERS, desktop: WEBAPP_LAYERS, script: CLI_LAYERS,
  library: WEBAPP_LAYERS, unknown: WEBAPP_LAYERS,
};
