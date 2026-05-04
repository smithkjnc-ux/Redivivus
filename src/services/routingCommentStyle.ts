// [SCOPE] Routing comment style detection — returns comment style for file extension
// Called by routingGemini. No API key or provider logic here.

export function getCommentStyle(filePath: string): { single: string; block?: [string, string]; example: string } {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const styles: Record<string, { single: string; block?: [string, string]; example: string }> = {
    // Python, Shell, YAML, Ruby
    'py':   { single: '#', example: '# [SCOPE] description' },
    'sh':   { single: '#', example: '# [SCOPE] description' },
    'bash': { single: '#', example: '# [SCOPE] description' },
    'yaml': { single: '#', example: '# [SCOPE] description' },
    'yml':  { single: '#', example: '# [SCOPE] description' },
    'rb':   { single: '#', example: '# [SCOPE] description' },
    'r':    { single: '#', example: '# [SCOPE] description' },
    // JavaScript, TypeScript, Java, C, C++, C#, Rust, Go, Swift, Kotlin, PHP
    'js':   { single: '//', example: '// [SCOPE] description' },
    'jsx':  { single: '//', example: '// [SCOPE] description' },
    'ts':   { single: '//', example: '// [SCOPE] description' },
    'tsx':  { single: '//', example: '// [SCOPE] description' },
    'java': { single: '//', example: '// [SCOPE] description' },
    'c':    { single: '//', example: '// [SCOPE] description' },
    'cpp':  { single: '//', example: '// [SCOPE] description' },
    'h':    { single: '//', example: '// [SCOPE] description' },
    'cs':   { single: '//', example: '// [SCOPE] description' },
    'rs':   { single: '//', example: '// [SCOPE] description' },
    'go':   { single: '//', example: '// [SCOPE] description' },
    'swift':{ single: '//', example: '// [SCOPE] description' },
    'kt':   { single: '//', example: '// [SCOPE] description' },
    'php':  { single: '//', example: '// [SCOPE] description' },
    // HTML, XML
    'html': { single: '<!--', block: ['<!--', '-->'], example: '<!-- [SCOPE] description -->' },
    'xml':  { single: '<!--', block: ['<!--', '-->'], example: '<!-- [SCOPE] description -->' },
    'vue':  { single: '<!--', block: ['<!--', '-->'], example: '<!-- [SCOPE] description -->' },
    'svelte':{ single: '<!--', block: ['<!--', '-->'], example: '<!-- [SCOPE] description -->' },
    // CSS
    'css':  { single: '/*', block: ['/*', '*/'], example: '/* [SCOPE] description */' },
    'scss': { single: '//', example: '// [SCOPE] description' },
    'less': { single: '//', example: '// [SCOPE] description' },
    // SQL, Lua
    'sql':  { single: '--', example: '-- [SCOPE] description' },
    'lua':  { single: '--', example: '-- [SCOPE] description' },
    // BASIC, VB
    'bas':  { single: "'", example: "' [SCOPE] description" },
    'vb':   { single: "'", example: "' [SCOPE] description" },
    'vbs':  { single: "'", example: "' [SCOPE] description" },
  };
  return styles[ext] || { single: '//', example: '// [SCOPE] description' };
}
