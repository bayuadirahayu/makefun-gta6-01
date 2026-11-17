// NEON BAY's hand-in program (Node 22, standard library only). The game itself is plain
// static files under game/ — a three.js open world a desktop browser loads offline — and
// this program's whole job is to hand those files in: copy game/ and screenshots/ from
// beside this file into /output, then write /output/dossier.json with the kit's vendored
// library, using the scorer's own caps so the entry the judge reads is exactly the game
// that was built. Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output: MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (see the kit's reference/gate.json): the dossier text is
// capped at 160 KiB; at most 4 screenshots of 256 KiB each; game/ holds at most 993
// files and 48 MiB in all, with no path over 1000 bytes. The program writes the whole
// of /output under the platform's 1000-entry, 64 MiB cap, which game/, screenshots/ and
// dossier.json share — so the game is kept well inside its own limits. The copy is
// unconditional: a missing screenshots/ folder is not an error, it just means no shots
// were taken yet, and the dossier still describes the game that is there.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
