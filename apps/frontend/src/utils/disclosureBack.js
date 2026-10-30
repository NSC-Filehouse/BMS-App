export function createDisclosureRegistry() {
  const entries = new Map();
  return {
    register(id, entry) {
      entries.set(id, entry);
      return () => { if (entries.get(id) === entry) entries.delete(id); };
    },
    collapseOpen() {
      const open = [...entries.values()].filter(entry => entry.isOpen());
      if (!open.some(entry => entry.isActive())) return false;
      // Collect first: closing a parent must not prevent closing its children.
      open.forEach(entry => entry.close());
      return true;
    },
  };
}

export function collapseSavedDisclosureState(state) {
  if (!state) return state;
  let result = state;
  for (const key of ['supplierOptionsState', 'supplierArticleState']) {
    const saved = state[key];
    if (!saved || !(saved.expanded === true || typeof saved.expanded === 'object' && Object.values(saved.expanded || {}).some(Boolean)
      || saved.expandedVl?.length)) continue;
    result = { ...result, [key]: { ...saved, expanded: false, ...(saved.expandedVl ? { expandedVl: [] } : {}) } };
  }
  return result;
}
