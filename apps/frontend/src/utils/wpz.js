export const WPZ_MODE_NEUTRALIZE = 'neutralize';
export const WPZ_MODE_BLACKEN = 'blacken';
export const WPZ_MODE_INDIVIDUAL = 'individual';

const NEUTRALIZE_COMMENT = 'Neutralisieren';
const BLACKEN_COMMENT = 'Schw\u00e4rzen';

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('de-DE');
}

export function getWpzMode({ wpzOriginal, wpzComment } = {}) {
  const comment = normalize(wpzComment);
  if (comment === normalize(NEUTRALIZE_COMMENT) || comment === 'neutralize') {
    return WPZ_MODE_NEUTRALIZE;
  }
  if (comment === normalize(BLACKEN_COMMENT) || comment === 'blacken' || comment === 'black out') {
    return WPZ_MODE_BLACKEN;
  }
  // Existing entries using the former checkbox are treated as the safe default.
  if (comment === 'original verwenden' || comment === 'use original wpz' || (!comment && wpzOriginal !== false)) {
    return WPZ_MODE_NEUTRALIZE;
  }
  return WPZ_MODE_INDIVIDUAL;
}

export function getWpzCommentForMode(mode) {
  if (mode === WPZ_MODE_NEUTRALIZE) return NEUTRALIZE_COMMENT;
  if (mode === WPZ_MODE_BLACKEN) return BLACKEN_COMMENT;
  return '';
}

export function normalizeWpzFields(fields = {}) {
  const mode = getWpzMode(fields);
  return {
    wpzOriginal: false,
    wpzComment: mode === WPZ_MODE_INDIVIDUAL
      ? String(fields.wpzComment || '')
      : getWpzCommentForMode(mode),
  };
}
