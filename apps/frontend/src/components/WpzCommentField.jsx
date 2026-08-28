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
  WPZ_MODE_BLACKEN,
  WPZ_MODE_INDIVIDUAL,
  WPZ_MODE_NEUTRALIZE,
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

  if (!wpzId) {
    return (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {t('wpz_label')}: {t('wpz_not_available')}
      </Typography>
    );
  }

  const mode = getWpzMode({ wpzOriginal, wpzComment });
  const handleModeChange = (event) => {
    const nextMode = event.target.value;
    onChange({
      wpzOriginal: false,
      wpzComment: getWpzCommentForMode(nextMode),
    });
  };

  return (
    <FormControl component="fieldset" error={error} fullWidth sx={{ mt: 0.5 }}>
      <FormLabel component="legend">{t('wpz_comment_label')}</FormLabel>
      <RadioGroup value={mode} onChange={handleModeChange}>
        <FormControlLabel
          value={WPZ_MODE_NEUTRALIZE}
          control={<Radio size="small" />}
          label={t('wpz_option_neutralize')}
        />
        <FormControlLabel
          value={WPZ_MODE_BLACKEN}
          control={<Radio size="small" />}
          label={t('wpz_option_blacken')}
        />
        <FormControlLabel
          value={WPZ_MODE_INDIVIDUAL}
          control={<Radio size="small" />}
          label={t('wpz_option_individual')}
        />
      </RadioGroup>
      {mode === WPZ_MODE_INDIVIDUAL && (
        <TextField
          margin="dense"
          label={t('wpz_individual_comment_label')}
          value={wpzComment || ''}
          onChange={(event) => onChange({ wpzOriginal: false, wpzComment: event.target.value })}
          multiline
          minRows={2}
          fullWidth
          error={error}
          helperText={error ? helperText : ''}
        />
      )}
      {error && mode !== WPZ_MODE_INDIVIDUAL && helperText && (
        <FormHelperText>{helperText}</FormHelperText>
      )}
    </FormControl>
  );
}
