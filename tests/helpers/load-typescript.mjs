// Dependency-free test loader. Loads actual source bytes; it never rewrites application behavior.
// Run callers with: node --experimental-vm-modules --test <test.mjs>
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

export async function loadTypeScript(filename, { root, aliasRoot = path.join(root, 'src'), stubs = {}, globals = {} }) {
  root = path.resolve(root);
  const context = vm.createContext({ console, Buffer, URL, URLSearchParams, setTimeout, clearTimeout, ...globals });
  const cache = new Map();
  const allowedBuiltins = new Set(['node:crypto', 'node:util', 'node:buffer']);

  function synthetic(key, exports) {
    if (!cache.has(key)) {
      cache.set(key, new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      }, { context, identifier: key }));
    }
    return cache.get(key);
  }

  async function findFile(requested) {
    const candidates = [requested, requested + '.ts', requested + '.js', path.join(requested, 'index.ts')];
    if (requested.endsWith('.js')) candidates.push(requested.slice(0, -3) + '.ts');
    for (const candidate of candidates) {
      try { await access(candidate); return path.resolve(candidate); } catch { /* next extension */ }
    }
    throw new Error(`Cannot resolve test source: ${requested}`);
  }

  async function source(requested) {
    const file = await findFile(requested);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Source outside test root: ${file}`);
    if (cache.has(file)) return cache.get(file);
    const original = await readFile(file, 'utf8');
    const code = file.endsWith('.ts') ? stripTypeScriptTypes(original, { mode: 'transform', sourceUrl: file }) : original;
    const module = new vm.SourceTextModule(code, { context, identifier: file });
    cache.set(file, module);
    return module;
  }

  async function linker(specifier, referencing) {
    if (Object.hasOwn(stubs, specifier)) return synthetic(`stub:${specifier}`, stubs[specifier]);
    if (allowedBuiltins.has(specifier)) return synthetic(specifier, await import(specifier));
    if (specifier.startsWith('@/')) return source(path.join(aliasRoot, specifier.slice(2)));
    if (specifier.startsWith('.')) return source(path.resolve(path.dirname(referencing.identifier), specifier));
    throw new Error(`Unstubbed external dependency: ${specifier}. Supply an explicit test contract.`);
  }

  const entry = await source(path.resolve(root, filename));
  await entry.link(linker);
  await entry.evaluate();
  return entry.namespace;
}
