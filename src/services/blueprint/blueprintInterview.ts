// [SCOPE] Adaptive Blueprint Interview Engine — detects project type, runs layered questions
// Replaces the flat 5-question interview. Questions branch by project type.
// Called by blueprintService or chat panel. Returns a rich BlueprintSpec.

// [WARN] This is the engine only — it returns structured data, does NOT write files or call VS Code UI.
// The caller handles saving and display.

export type ProjectType =
  | 'game' | 'webapp' | 'mobile' | 'api' | 'cli' | 'desktop' | 'script' | 'library' | 'unknown';

export interface BlueprintLayer {
  id: string;
  name: string;
  emoji: string;
  questions: BlueprintQuestion[];
}

export interface BlueprintQuestion {
  id: string;
  text: string;
  hint: string;
  required: boolean;
  type: 'text' | 'choice' | 'multi';
  choices?: string[];
}

export interface BlueprintSpec {
  projectType: ProjectType;
  layers: Record<string, Record<string, string>>;  // layerId -> questionId -> answer
  summary?: string;
  completionScore: number;  // 0-100
}

// --- Project type detection ---

export function detectProjectType(what: string, where: string): ProjectType {
  const combined = (what + ' ' + where).toLowerCase();
  if (/game|rpg|puzzle|shooter|platformer|multiplayer|unity|godot|phaser|pygame/i.test(combined)) return 'game';
  if (/mobile|android|ios|react native|flutter|swift|kotlin/i.test(combined)) return 'mobile';
  if (/cli|command.?line|terminal|shell|script|bash|python script|node script/i.test(combined)) return 'cli';
  if (/api|rest|graphql|backend|server|microservice|endpoint/i.test(combined)) return 'api';
  if (/desktop|electron|tauri|winforms|wpf|native app/i.test(combined)) return 'desktop';
  if (/library|package|sdk|npm|module|framework/i.test(combined)) return 'library';
  if (/website|web app|webapp|react|vue|angular|nextjs|dashboard|saas/i.test(combined)) return 'webapp';
  if (/script|automation|batch|cron|scraper/i.test(combined)) return 'script';
  if (/app|program|software|tool|application|platform/i.test(combined)) return 'webapp';
  return 'webapp';
}

// --- Foundation layer (always asked, all project types) ---

const FOUNDATION_LAYER: BlueprintLayer = {
  id: 'foundation',
  name: 'Foundation',
  emoji: '🏗️',
  questions: [
    {
      id: 'who',
      text: 'WHO is going to use this?',
      hint: 'Describe the actual person — skill level, age, context. "Everyone" is not an answer.',
      required: true,
      type: 'text',
    },
    {
      id: 'what',
      text: 'WHAT does it need to do?',
      hint: 'One sentence. The minimum thing that makes this useful. Not the dream list.',
      required: true,
      type: 'text',
    },
    {
      id: 'where',
      text: 'WHERE does it run?',
      hint: 'Web browser? Phone? Desktop app? Command line? Server only?',
      required: true,
      type: 'text',
    },
    {
      id: 'why',
      text: 'WHY does this need to exist?',
      hint: 'What problem is not already solved? If you can name 3 existing solutions, reconsider.',
      required: true,
      type: 'text',
    },
    {
      id: 'simplicity',
      text: 'Simple or full-featured?',
      hint: 'Be honest. Simple programs that work beat complex ones that almost work.',
      required: true,
      type: 'choice',
      choices: ['As simple as possible — just make it work', 'Moderate — core features only', 'Full-featured — I know the complexity cost'],
    },
  ],
};

// --- Type-specific deep layers ---

const GAME_LAYERS: BlueprintLayer[] = [
  {
    id: 'game_core',
    name: 'Game Core',
    emoji: '🎮',
    questions: [
      { id: 'genre', text: 'What genre?', hint: 'Puzzle, platformer, RPG, shooter, strategy, idle, simulation, other?', required: true, type: 'text' },
      { id: 'players', text: 'Single player or multiplayer?', hint: 'Local multiplayer? Online? Co-op vs competitive?', required: true, type: 'choice', choices: ['Single player only', 'Local multiplayer', 'Online multiplayer', 'Both single and multiplayer'] },
      { id: 'platform', text: 'What platform?', hint: 'Browser, mobile, PC, console?', required: true, type: 'choice', choices: ['Web browser', 'Mobile (iOS/Android)', 'PC/Mac desktop', 'Multiple platforms'] },
      { id: 'loop', text: 'What is the core game loop?', hint: 'The thing the player does over and over. e.g. "shoot enemies, collect coins, level up"', required: true, type: 'text' },
    ],
  },
  {
    id: 'game_systems',
    name: 'Game Systems',
    emoji: '⚙️',
    questions: [
      { id: 'saves', text: 'Does progress save?', hint: 'Save files? Cloud saves? Session only?', required: true, type: 'choice', choices: ['No saving — each session fresh', 'Local save only', 'Cloud saves', 'Not sure yet'] },
      { id: 'physics', text: 'Does it need physics?', hint: 'Gravity, collisions, projectiles?', required: false, type: 'choice', choices: ['Yes — real physics engine', 'Simple collision detection only', 'No physics needed'] },
      { id: 'ai', text: 'Are there AI-controlled characters?', hint: 'Enemies, NPCs, bosses?', required: false, type: 'choice', choices: ['Yes — smart AI needed', 'Simple scripted behavior', 'No AI characters'] },
      { id: 'monetize', text: 'Is there any monetization?', hint: 'Free, paid, ads, in-app purchases? This affects architecture significantly.', required: true, type: 'choice', choices: ['Free, no monetization', 'One-time purchase', 'In-app purchases', 'Ads', 'Subscription'] },
    ],
  },
  {
    id: 'game_safety',
    name: 'Safety & Risk',
    emoji: '🛡️',
    questions: [
      { id: 'cheat', text: 'Does cheating matter?', hint: 'Single player: probably not. Leaderboards/online: absolutely yes.', required: false, type: 'choice', choices: ['No cheating concerns', 'Basic anti-cheat needed', 'Server-side validation required'] },
      { id: 'age', text: 'Is there user-generated content or chat?', hint: 'If yes, you need moderation. This is a safety issue, not a feature.', required: true, type: 'choice', choices: ['No user content or chat', 'Yes — moderation plan needed', 'Yes — adults only, no moderation'] },
    ],
  },
];

const WEBAPP_LAYERS: BlueprintLayer[] = [
  {
    id: 'webapp_core',
    name: 'App Structure',
    emoji: '🖥️',
    questions: [
      { id: 'auth', text: 'Do users need accounts?', hint: 'Login/signup? Or anonymous? This is the single biggest architecture decision.', required: true, type: 'choice', choices: ['No accounts — fully anonymous', 'Optional accounts', 'Accounts required', 'Third-party login (Google, GitHub)'] },
      { id: 'data', text: 'Does it store data?', hint: 'If yes: who owns it, where does it live, what happens if it\'s lost?', required: true, type: 'choice', choices: ['No data storage', 'Local browser storage only', 'Server database', 'File-based storage'] },
      { id: 'realtime', text: 'Does anything need to update in real time?', hint: 'Live feeds, chat, collaborative editing, notifications?', required: true, type: 'choice', choices: ['No — static or refresh-based', 'Some real-time (notifications)', 'Yes — live updates core to the app'] },
      { id: 'scale', text: 'How many users, roughly?', hint: 'This shapes database choice, hosting, and caching.', required: true, type: 'choice', choices: ['Just me / small team (<10)', 'Small audience (<1000)', 'Public launch (1000+)', 'Unknown yet'] },
    ],
  },
  {
    id: 'webapp_security',
    name: 'Security Layer',
    emoji: '🔒',
    questions: [
      { id: 'sensitive', text: 'Does it handle sensitive data?', hint: 'Passwords, payments, health, personal info, messages?', required: true, type: 'choice', choices: ['No sensitive data', 'Basic personal info', 'Payments or financial data', 'Health or highly sensitive data'] },
      { id: 'permissions', text: 'Do different users have different access?', hint: 'Admin vs regular user? Owner vs viewer?', required: true, type: 'choice', choices: ['Everyone sees everything', 'Basic roles (admin/user)', 'Complex permissions needed'] },
      { id: 'input', text: 'Do users submit any text or files?', hint: 'Forms, uploads, comments — all require input validation and sanitization.', required: true, type: 'choice', choices: ['No user input', 'Forms only', 'File uploads', 'Both forms and files'] },
    ],
  },
  {
    id: 'webapp_ux',
    name: 'User Experience',
    emoji: '🎨',
    questions: [
      { id: 'mobile_friendly', text: 'Does it need to work on phones?', hint: 'Responsive design adds significant work. Worth knowing upfront.', required: true, type: 'choice', choices: ['Desktop only', 'Mobile-friendly preferred', 'Mobile-first (primary device is phone)'] },
      { id: 'first_screen', text: 'What is the first thing a user sees?', hint: 'Landing page? Dashboard? Login? This sets the UX foundation.', required: false, type: 'text' },
    ],
  },
];

const API_LAYERS: BlueprintLayer[] = [
  {
    id: 'api_core',
    name: 'API Structure',
    emoji: '🔌',
    questions: [
      { id: 'consumers', text: 'Who calls this API?', hint: 'Internal services only? External developers? Mobile apps? Public?', required: true, type: 'choice', choices: ['Internal use only', 'Our own frontend', 'External developers (public API)', 'Both internal and external'] },
      { id: 'auth_method', text: 'How is it authenticated?', hint: 'API keys, JWT tokens, OAuth, or none?', required: true, type: 'choice', choices: ['No auth (open)', 'API keys', 'JWT tokens', 'OAuth 2.0', 'Not sure yet'] },
      { id: 'data_format', text: 'REST, GraphQL, or something else?', hint: 'REST is simpler. GraphQL is flexible but complex. Choose simple unless you have a strong reason.', required: true, type: 'choice', choices: ['REST', 'GraphQL', 'gRPC', 'WebSocket', 'Not sure'] },
    ],
  },
  {
    id: 'api_safety',
    name: 'Safety & Limits',
    emoji: '🛡️',
    questions: [
      { id: 'rate_limit', text: 'Does it need rate limiting?', hint: 'Without this, one user can take down your API. Required for any public endpoint.', required: true, type: 'choice', choices: ['No rate limiting needed', 'Basic rate limiting', 'Per-user quotas and billing'] },
      { id: 'validation', text: 'What happens with bad input?', hint: 'Every API endpoint that accepts data must validate it. This prevents 80% of security issues.', required: true, type: 'choice', choices: ['Basic null checks only', 'Full schema validation', 'Not planned yet — good to know'] },
    ],
  },
];

const CLI_LAYERS: BlueprintLayer[] = [
  {
    id: 'cli_core',
    name: 'CLI Design',
    emoji: '⌨️',
    questions: [
      { id: 'invocation', text: 'How is it invoked?', hint: 'Single command? Multiple subcommands? Interactive mode?', required: true, type: 'choice', choices: ['Single command with flags', 'Multiple subcommands (like git)', 'Interactive/wizard mode', 'Runs as a daemon/background process'] },
      { id: 'io', text: 'What does it read and write?', hint: 'Files? stdin/stdout? Network? Database?', required: true, type: 'text' },
      { id: 'errors', text: 'What should happen when something goes wrong?', hint: 'Exit codes? Retry? Log file? This matters more than most people plan for.', required: true, type: 'choice', choices: ['Print error and exit', 'Retry automatically', 'Write to log file', 'Interactive error recovery'] },
    ],
  },
];

// --- Layer map by project type ---

const TYPE_LAYERS: Record<ProjectType, BlueprintLayer[]> = {
  game: GAME_LAYERS,
  webapp: WEBAPP_LAYERS,
  api: API_LAYERS,
  cli: CLI_LAYERS,
  mobile: WEBAPP_LAYERS,  // mobile shares webapp concerns + more
  desktop: WEBAPP_LAYERS,
  script: CLI_LAYERS,
  library: WEBAPP_LAYERS,
  unknown: WEBAPP_LAYERS,
};

// --- Score calculator ---

export function scoreBlueprint(spec: BlueprintSpec): number {
  let total = 0, answered = 0;
  const allLayers = [FOUNDATION_LAYER, ...(TYPE_LAYERS[spec.projectType] || [])];
  allLayers.forEach(layer => {
    layer.questions.forEach(q => {
      if (q.required) {
        total++;
        const ans = spec.layers[layer.id]?.[q.id];
        if (ans && ans.trim().length > 2) answered++;
      }
    });
  });
  return total === 0 ? 0 : Math.round((answered / total) * 100);
}

// --- Summary generator (for AI context) ---

export function buildBlueprintSummary(spec: BlueprintSpec, projectName: string): string {
  const typeName = spec.projectType.toUpperCase();
  const allLayers = [FOUNDATION_LAYER, ...(TYPE_LAYERS[spec.projectType] || [])];
  let out = `# Blueprint: ${projectName}\n**Project Type:** ${typeName}\n**Completeness:** ${spec.completionScore}%\n\n`;
  allLayers.forEach(layer => {
    const answers = spec.layers[layer.id];
    if (!answers) return;
    out += `## ${layer.emoji} ${layer.name}\n`;
    layer.questions.forEach(q => {
      const ans = answers[q.id];
      if (ans) out += `- **${q.text}** ${ans}\n`;
    });
    out += '\n';
  });
  return out;
}

// --- Get layers for a given project type (used by UI) ---

export function getLayersForType(type: ProjectType): BlueprintLayer[] {
  return [FOUNDATION_LAYER, ...(TYPE_LAYERS[type] || [])];
}

export { FOUNDATION_LAYER, TYPE_LAYERS };
