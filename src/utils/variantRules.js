export const DEFAULT_VARIANT_RULES = Object.freeze({
  touchPiece: false,
  knightJacking: false,
});

export function normalizeVariantRules(rules) {
  return {
    touchPiece: Boolean(rules?.touchPiece),
    knightJacking: Boolean(rules?.knightJacking),
  };
}

export function variantRulesKey(rules) {
  const normalized = normalizeVariantRules(rules);
  const enabled = [];
  if (normalized.touchPiece) enabled.push('touch');
  if (normalized.knightJacking) enabled.push('jack');
  return enabled.join('+') || 'base';
}
