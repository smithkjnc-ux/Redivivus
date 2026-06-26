// [SCOPE] Personality picker command — shows a QuickPick with previews so users can
// choose how Redivivus talks. Changes tone only; technical accuracy is never affected.

import * as vscode from 'vscode';

const PERSONALITIES = [
  { key: 'plain',    label: '◻ Plain',    desc: 'Neutral, professional. No personality modifier.' },
  { key: 'friendly', label: '😊 Friendly', desc: 'Warm, encouraging, upbeat. Makes coding feel supportive.' },
  { key: 'scifi',    label: '🚀 Sci-Fi',   desc: '"Processing your request, Commander." Starship computer vibes.' },
  { key: 'horror',   label: '🕯️ Horror',   desc: 'Gothic, atmospheric. Bugs are omens. Fixes are rituals.' },
  { key: 'hillbilly',label: '🤠 Hillbilly',desc: 'Folksy country wisdom. Sharp as a tack but y\'all-certified.' },
  { key: 'pirate',   label: '🏴‍☠️ Pirate',   desc: 'Arrr matey, the code be needin\' a fix. Swashbuckling accuracy.' },
  { key: 'snarky',   label: '🙄 Snarky',   desc: 'Dry wit, mild exasperation, secretly very helpful. Senior dev energy.' },
  { key: 'butler',   label: '🎩 Butler',   desc: '"Might I suggest, sir, a rather different approach." Impeccably formal.' },
  { key: 'trashy',   label: '💅 Trashy',   desc: 'Oh HONEY. The AUDACITY of this bug. Reality TV drama, accurate answers.' },
  { key: 'surfer',   label: '🏄 Surfer',   desc: 'Gnarly, stoked, zero stress. Very chill, very accurate, bro.' },
  { key: 'hacker',   label: '💻 Hacker',   desc: 'Terse, underground, slightly conspiratorial. Secret mission vibes.' },
  { key: 'roast',    label: '🔥 Roast',    desc: 'Busts your chops first, then gives you the right answer. A friend with opinions.' },
];

export async function pickPersonality(): Promise<void> {
  const current = vscode.workspace.getConfiguration('redivivus').get<string>('personality', 'plain');

  const items: vscode.QuickPickItem[] = PERSONALITIES.map(p => ({
    label: p.label,
    description: p.key === current ? '← current' : '',
    detail: p.desc,
    picked: p.key === current,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Redivivus: Choose a personality',
    placeHolder: 'Select how Redivivus talks — tone only, accuracy never changes',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!picked) return;

  const selected = PERSONALITIES.find(p => picked.label.startsWith(p.key[0]) && picked.label.includes(p.label.split(' ').slice(1).join(' ')));
  const key = PERSONALITIES.find(p => picked.label === p.label)?.key ?? 'plain';

  await vscode.workspace.getConfiguration('redivivus').update('personality', key, vscode.ConfigurationTarget.Global);
  void key; void selected;

  const name = PERSONALITIES.find(p => p.key === key)?.label ?? key;
  vscode.window.showInformationMessage(`Redivivus personality set to ${name}`);
}
