import React from 'react';
import { Accordion as MuiAccordion, IconButton } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { createDisclosureRegistry, collapseSavedDisclosureState } from '../utils/disclosureBack.js';
import { useI18n } from '../utils/i18n.jsx';

const RegistryContext = React.createContext(null);
const VisibilityContext = React.createContext(true);

export function DisclosureBackScope({ children }) {
  const [registry] = React.useState(createDisclosureRegistry);
  const location = useLocation();
  const navigate = useNavigate();
  const collapseOpen = React.useCallback(() => {
    if (!registry.collapseOpen()) return false;
    const state = collapseSavedDisclosureState(location.state);
    if (state !== location.state) navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state });
    return true;
  }, [registry, location, navigate]);
  const value = React.useMemo(() => ({ registry, collapseOpen }), [registry, collapseOpen]);
  return <RegistryContext.Provider value={value}><VisibilityContext.Provider value={true}>{children}</VisibilityContext.Provider></RegistryContext.Provider>;
}

export function useBackDisclosure(open, onClose, { active = true } = {}) {
  const context = React.useContext(RegistryContext);
  const visible = React.useContext(VisibilityContext);
  const latest = React.useRef(null);
  const id = React.useId();
  latest.current = { open: Boolean(open), active: visible && active, onClose };
  React.useLayoutEffect(() => context?.registry.register(id, {
    isOpen: () => latest.current.open,
    isActive: () => latest.current.active,
    close: () => {
      // Consume the open state immediately, including a second tap before React renders.
      latest.current.open = false;
      latest.current.onClose();
    },
  }), [context?.registry, id]);
}

export const BackAwareAccordion = React.forwardRef(function BackAwareAccordion({ expanded: expandedProp, defaultExpanded = false, onChange, children, ...props }, ref) {
  const [localExpanded, setLocalExpanded] = React.useState(defaultExpanded);
  const expanded = expandedProp === undefined ? localExpanded : expandedProp;
  const visible = React.useContext(VisibilityContext);
  function change(event, value) {
    if (expandedProp === undefined) setLocalExpanded(value);
    onChange?.(event, value);
  }
  useBackDisclosure(expanded, () => change(null, false));
  const [summary, ...details] = React.Children.toArray(children);
  return <MuiAccordion {...props} ref={ref} expanded={expanded} onChange={change}>
    {summary}
    <VisibilityContext.Provider value={visible && Boolean(expanded)}>{details}</VisibilityContext.Provider>
  </MuiAccordion>;
});

export const DisclosureBackButton = React.forwardRef(function DisclosureBackButton({ onClick, ...props }, ref) {
  const context = React.useContext(RegistryContext);
  const { t } = useI18n();
  return <IconButton {...props} ref={ref} title={props.title || t('back_disclosures_hint')} onClick={event => {
    if (context?.collapseOpen()) { event.preventDefault(); event.stopPropagation(); return; }
    onClick?.(event);
  }} />;
});
