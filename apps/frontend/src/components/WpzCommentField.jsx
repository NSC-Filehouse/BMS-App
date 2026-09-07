import React from 'react';
import {
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import { useI18n } from '../utils/i18n.jsx';
import {
  getWpzCommentForMode,
  getWpzMode,
  WPZ_MODE_MASK_OR_NEUTRALIZE,
  WPZ_MODE_ORIGINAL,
  WPZ_MODE_OTHER,
} from '../utils/wpz.js';

export default function WpzCommentField({
  wpzId,
  wpzOriginal,
  wpzComment,
  onChange,
  error = false,
  helperText = '',
}) {
  const { t } = useI18n();

  const mode = getWpzMode({ wpzOriginal, wpzComment });
  const handleModeChange = (event) => {
    const nextMode = event.target.value;
    onChange({
      wpzOriginal: nextMode === WPZ_MODE_ORIGINAL,
      wpzComment: getWpzCommentForMode(nextMode),
    });
  };

  return (
    <FormControl component="fieldset" error={error} fullWidth sx={{ mt: 0.5 }}>
      {!wpzId && (
        <Typography variant="caption" component="div" sx={{ color: 'text.secondary', mb: 0.5 }}>
          {t('wpz_label')}: {t('wpz_not_available')}
        </Typography>
      )}
      <FormLabel component="legend">{t('wpz_option_label')}</FormLabel>
      <RadioGroup value={mode} onChange={handleModeChange}>
        <FormControlLabel
          value={WPZ_MODE_ORIGINAL}
          control={<Radio size="small" />}
          label={t('wpz_option_original')}
        />
        <FormControlLabel
          value={WPZ_MODE_MASK_OR_NEUTRALIZE}
          control={<Radio size="small" />}
          label={t('wpz_option_mask_or_neutralize')}
        />
        <FormControlLabel
          value={WPZ_MODE_OTHER}
          control={<Radio size="small" />}
          label={t('wpz_option_other')}
        />
      </RadioGroup>
      {mode === WPZ_MODE_OTHER && (
        <TextField
          margin="dense"
          label={t('wpz_other_info_label')}
          value={wpzComment || ''}
          onChange={(event) => onChange({ wpzOriginal: false, wpzComment: event.target.value })}
          multiline
          minRows={2}
          fullWidth
          error={error}
          helperText={error ? helperText : ''}
        />
      )}
      {error && mode !== WPZ_MODE_OTHER && helperText && (
        <FormHelperText>{helperText}</FormHelperText>
      )}
    </FormControl>
  );
}
