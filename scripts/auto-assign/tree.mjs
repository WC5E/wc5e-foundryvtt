/**
 * The compendium pack picker's tree, built to mirror the sidebar: nested
 * compendium folders holding packs. Kept pure and Foundry-free so it can be
 * tested; app.mjs is what reads game.packs / game.folders.
 */

/**
 * @param {{folders: {id, name, parentId}[], packs: {id, name, folderId}[]}} input
 * @returns {Array} folder and pack nodes, folders first, each alphabetical
 */
export function buildPackTree({ folders = [], packs = [] } = {}) {
  const byId = new Map();
  for ( const f of folders ) {
    byId.set(f.id, { type: "folder", id: f.id, name: f.name, parentId: f.parentId, children: [] });
  }

  // A parent that isn't in the set (or a cycle) would strand or loop the node,
  // so treat either as root-level.
  const parentOf = node => {
    if ( !node.parentId ) return null;
    const seen = new Set([node.id]);
    let p = byId.get(node.parentId);
    while ( p ) {
      if ( seen.has(p.id) ) return null;
      seen.add(p.id);
      if ( !p.parentId ) break;
      p = byId.get(p.parentId) ?? null;
      if ( !p ) return null;
    }
    return byId.get(node.parentId) ?? null;
  };

  const roots = [];
  for ( const node of byId.values() ) {
    const parent = parentOf(node);
    if ( parent ) parent.children.push(node);
    else roots.push(node);
  }

  for ( const p of packs ) {
    const node = { type: "pack", id: p.id, name: p.name };
    const parent = p.folderId ? byId.get(p.folderId) : null;
    if ( parent ) parent.children.push(node);
    else roots.push(node);
  }

  const byName = (a, b) => {
    if ( a.type !== b.type ) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
  const prune = nodes => nodes
    .map(n => n.type === "folder" ? { ...n, children: prune(n.children) } : n)
    .filter(n => n.type === "pack" || n.children.length > 0)
    .sort(byName);

  return prune(roots);
}

/** Every pack id in this node's subtree. */
export function packIdsUnder(node) {
  if ( node.type === "pack" ) return [node.id];
  return node.children.flatMap(packIdsUnder);
}

/** Ticked pack ids, in tree order — which is the match-priority order. */
export function selectedPackIds(nodes, checkedIds) {
  const out = [];
  const walk = ns => {
    for ( const n of ns ) {
      if ( n.type === "pack" ) {
        if ( checkedIds.has(n.id) ) out.push(n.id);
      }
      else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** @returns {"checked"|"unchecked"|"indeterminate"} */
export function nodeState(node, checkedIds) {
  const ids = packIdsUnder(node);
  if ( !ids.length ) return "unchecked";
  const n = ids.filter(id => checkedIds.has(id)).length;
  if ( n === 0 ) return "unchecked";
  if ( n === ids.length ) return "checked";
  return "indeterminate";
}
