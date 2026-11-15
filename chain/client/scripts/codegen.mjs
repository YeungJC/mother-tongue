// Regenerates src/generated from the Anchor IDL. Run after `anchor build` / `anchor idl build`.
import { readFileSync } from 'node:fs';
import { createFromRoot } from 'codama';
import { rootNodeFromAnchor } from '@codama/nodes-from-anchor';
import { renderVisitor } from '@codama/renderers-js';

const idl = JSON.parse(readFileSync(new URL('../../target/idl/village.json', import.meta.url)));
const codama = createFromRoot(rootNodeFromAnchor(idl));
codama.accept(renderVisitor(new URL('..', import.meta.url).pathname, { syncPackageJson: false }));
console.log('generated client for', idl.metadata.name);
