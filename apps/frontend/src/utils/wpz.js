export const WPZ_MODE_ORIGINAL = 'original';
export const WPZ_MODE_MASK_OR_NEUTRALIZE = 'mask-or-neutralize';
export const WPZ_MODE_OTHER = 'other';

const ORIGINAL_COMMENT = 'Original verwenden';
const MASK_OR_NEUTRALIZE_COMMENT = 'Schw\u00e4rzen/Neutralisieren';

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('de-DE');
}

export function getWpzMode({ wpzOriginal, wpzComment } = {}) {
  const comment = normalize(wpzComment);
  if (
    comment === normalize(MASK_OR_NEUTRALIZE_COMMENT)
    || comment === 'neutralisieren'
    || comment === 'neutralize'
    || comment === 'schw\u00e4rzen'
    || comment === 'blacken'
    || comment === 'black out'
    || comment === 'mask or neutralize'
  ) return WPZ_MODE_MASK_OR_NEUTRALIZE;
  if (comment === normalize(ORIGINAL_COMMENT) || comment === 'use original wpz' || wpzOriginal === true) {
    return WPZ_MODE_ORIGINAL;
  }
  if (!comment && wpzOriginal !== false) return WPZ_MODE_ORIGINAL;
  return WPZ_MODE_OTHER;
}

export function getWpzCommentForMode(mode) {
  if (mode === WPZ_MODE_ORIGINAL) return ORIGINAL_COMMENT;
  if (mode === WPZ_MODE_MASK_OR_NEUTRALIZE) return MASK_OR_NEUTRALIZE_COMMENT;
  return '';
}

export function normalizeWpzFields(fields = {}) {
  const mode = getWpzMode(fields);
  return {
    wpzOriginal: mode === WPZ_MODE_ORIGINAL,
    wpzComment: mode === WPZ_MODE_OTHER
      ? String(fields.wpzComment || '')
      : getWpzCommentForMode(mode),
  };
}
