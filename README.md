# TM Code Editor

Write assembly or machine code in the browser and assemble it with an ISA you define in JSON. The goal is to turn the result into a Trailmakers ROM blueprint.

Live site: https://nsbeast.github.io/AssemblyEditor/

## Develop

```
npm install
npm run dev      # development server
npm test         # unit tests (vitest)
npm run check    # type check
npm run build    # production build in dist/
```

## ISA files

An ISA is a JSON file, see the examples in `isa/`. The editor on the site can create and download them. The optional `wordLayout` setting controls how instructions become numbers (variable or fixed length, opcode position, what one address holds). Operand types are `register`, `immediate`, `label` (absolute jump) and `relativeLabel` (offset from the jump instruction).

## Deployment

Every push to `main` is checked, tested and published to GitHub Pages by `.github/workflows/deploy.yml`. In the repository settings, under Pages, the source has to be set to "GitHub Actions" once.
