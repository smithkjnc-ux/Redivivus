# CHASSIS Template Registry

> This document describes the structure and contribution guidelines for the CHASSIS remote template registry.
> The registry lives at: `https://github.com/smithkjnc-ux/chassis-templates`

---

## What This Is

The CHASSIS extension is lean by design — templates and vault patterns are NOT bundled with the extension.
Instead they live in this separate repo and are pulled on demand when a user chooses a template.

This means:
- Extension stays small and fast to install
- Templates can be updated without releasing a new extension version
- Community can contribute templates via pull requests
- Users can fork the registry and point CHASSIS at their own version

---

## Registry Structure

```
chassis-templates/
├── README.md                    <- This file (registry root)
├── registry.json                <- Machine-readable index of all templates
│
├── web/
│   ├── portfolio/
│   │   ├── index.html           <- Base template file
│   │   └── meta.json            <- Template metadata
│   ├── business/
│   │   ├── index.html
│   │   └── meta.json
│   ├── blog/
│   │   ├── index.html
│   │   └── meta.json
│   └── dashboard/
│       ├── index.html
│       └── meta.json
│
├── games/
│   ├── arcade/
│   │   ├── index.html
│   │   └── meta.json
│   └── puzzle/
│       ├── index.html
│       └── meta.json
│
├── apps/
│   ├── crud/
│   │   ├── index.html
│   │   └── meta.json
│   └── cli/
│       ├── index.js
│       └── meta.json
│
├── api/
│   ├── express/
│   │   ├── server.js
│   │   └── meta.json
│   └── fastapi/
│       ├── main.py
│       └── meta.json
│
└── vault-patterns/
    ├── utility/
    ├── api/
    ├── auth/
    └── algorithm/
```

---

## meta.json Format

Each template folder contains a `meta.json`:

```json
{
  "id": "web-portfolio",
  "label": "Portfolio / Personal Site",
  "description": "Clean single-page portfolio with hero, about, projects, contact sections",
  "category": "web",
  "tags": ["html", "css", "js", "portfolio"],
  "license": "MIT",
  "author": "CHASSIS Core Team",
  "version": "1.0.0",
  "wizardQuestions": [
    { "id": "name", "prompt": "Your name or brand", "placeholder": "Jane Smith", "required": true },
    { "id": "tagline", "prompt": "One-line tagline", "placeholder": "Developer & Designer", "required": true },
    { "id": "primaryColor", "prompt": "Primary color (hex)", "placeholder": "#6366f1", "required": false }
  ]
}
```

---

## Template Quality Standards

All templates in this registry must:

1. **Work without any build step** — open in browser / run with `node` / `python` directly
2. **Have no external CDN dependencies** unless widely available (no obscure packages)
3. **Be under 300 lines** — templates are starting points, not finished apps
4. **Use placeholder values** that the AI can easily replace (e.g. `<!-- YOUR_NAME -->`, `BRAND_NAME`, `PRIMARY_COLOR`)
5. **Include a comment header** with template name, category, and what the AI should customize
6. **Be MIT licensed** — all templates in this repo are MIT

---

## How CHASSIS Uses Templates

1. User types: "Build me a portfolio website"
2. CHASSIS detects template intent
3. Shows Quick Pick: Website > Portfolio / Business / Blog / Dashboard
4. User selects "Portfolio / Personal Site"
5. Wizard asks: name, tagline, color
6. CHASSIS fetches `web/portfolio/index.html` from this repo
7. AI customizes it with user's answers
8. Complete personalized file written to project

If the registry is unavailable (offline), CHASSIS falls back to AI generation from scratch.

---

## Contributing Templates

1. Fork `https://github.com/smithkjnc-ux/chassis-templates`
2. Add your template folder under the appropriate category
3. Include `meta.json` with all required fields
4. Ensure template works standalone (test before submitting)
5. Open a pull request — description should include a screenshot or demo

---

## Setting Up the Registry Repo

Run these commands to initialize the registry:

```bash
git clone https://github.com/smithkjnc-ux/chassis-templates
cd chassis-templates
# Create the folder structure
mkdir -p web/portfolio web/business web/blog web/dashboard
mkdir -p games/arcade games/puzzle
mkdir -p apps/crud apps/cli
mkdir -p api/express api/fastapi
mkdir -p vault-patterns/utility vault-patterns/api vault-patterns/auth vault-patterns/algorithm
```

---

## Custom Registry

Power users can point CHASSIS at their own registry by setting in VSCodium settings:

```json
{
  "chassis.templateRegistryUrl": "https://raw.githubusercontent.com/YOUR_ORG/your-templates/main"
}
```

---

*Last updated: May 11, 2026 — Initial registry design*
