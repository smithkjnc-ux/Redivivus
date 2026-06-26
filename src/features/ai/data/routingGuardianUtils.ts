// [SCOPE] Guardian routing utilities — project type detection and folder structure templates.
// Extracted from routingGuardian.ts (Rule 9 split at 233 lines).

export type ProjectType = 'web' | 'api' | 'game' | 'single';

export function detectProjectType(task: string, blueprint: string): ProjectType | null {
  const text = (task + ' ' + blueprint).toLowerCase();
  if (/\b(single file|one file|just one|only one|standalone|html file|single page)\b/.test(text)) { return 'single'; }
  if (/\b(game|unity|phaser|three\.js|canvas|sprite|level|engine|physics|entity|scene)\b/.test(text)) { return 'game'; }
  if (/\b(api|backend|server|node|express|rest|graphql|database|endpoint|middleware|controller|model)\b/.test(text)) { return 'api'; }
  if (/\b(web|app|react|vue|angular|frontend|website|platform|spa|nextjs|svelte|component|page|hook|style)\b/.test(text)) { return 'web'; }
  return null;
}

export function getFolderStructureTemplate(type: ProjectType): string {
  if (type === 'web') {
    return `FOLDER STRUCTURE (Web App):
Place files in the correct subdirectories. Do NOT dump everything in src/.
  src/
    components/    -- reusable UI components
    pages/         -- route-level page components
    hooks/         -- custom React/Vue hooks
    utils/         -- helper functions and utilities
    styles/        -- CSS, SCSS, or styled-component files
    assets/        -- images, fonts, static files`;
  }
  if (type === 'api') {
    return `FOLDER STRUCTURE (Node/API):
Place files in the correct subdirectories. Do NOT dump everything in src/.
  src/
    routes/        -- API endpoint definitions
    controllers/   -- request handlers and business logic
    models/        -- data models and schemas
    middleware/    -- auth, validation, logging middleware
    utils/         -- helper functions
    config/        -- environment and configuration files`;
  }
  if (type === 'game') {
    return `FOLDER STRUCTURE (Game):
Place files in the correct subdirectories. Do NOT dump everything in src/.
  src/
    engine/        -- game loop, physics, rendering core
    entities/      -- player, enemies, items, NPCs
    scenes/        -- menu, gameplay, gameover, level screens
    assets/        -- sprites, sounds, tilemaps
    utils/         -- helper functions and math utilities`;
  }
  return '';
}
