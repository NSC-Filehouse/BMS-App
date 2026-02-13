import React from 'react';

const STORAGE_KEY = 'bms.lang';

export function getStoredLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'de';
  } catch {
    return 'de';
  }
}

const translations = {
  de: {
    app_title: 'BMS-App',
    start_title: 'Mandant auswählen',
    start_prompt: 'Bitte wähle den Mandanten, mit dem du arbeiten möchtest.',
    start_user: 'Benutzer',
    start_email: 'E-Mail',
    start_no_permission_title: 'Keine Berechtigung',
    start_no_permission_text: 'Sie sind nicht berechtigt diese Funktionen zu nutzen.',
    start_continue: 'Weiter',
    start_reload: 'Neu laden',
    mandant_label: 'Mandant',
    mandant_none: 'Kein Mandant gewählt',
    switch_mandant: 'Mandant wechseln',
    customers_title: 'Kunden',
    customers_search: 'Kunden durchsuchen',
    customers_empty: 'Keine Kunden',
    products_title: 'Produkte',
    products_search: 'Produkte durchsuchen',
    products_empty: 'Es gibt keine Produkte',
    products_loading_items: 'Lädt...',
    orders_title: 'Reservierungen',
    orders_search: 'Reservierungen durchsuchen',
    orders_empty: 'Keine aktiven Reservierungen',
    page_label: 'Seite',
    desc_label: 'Beschreibung',
    address_label: 'Adresse',
    contact_label: 'Ansprechpartner',
    phone_label: 'Telefon',
    email_label: 'E-Mail',
    back_label: 'Zurück',
    loading_error: 'Fehler beim Laden.',
    loading_mandants_error: 'Fehler beim Laden der Mandanten.',
    loading_categories_error: 'Fehler beim Laden der Kategorien.',
    loading_products_error: 'Fehler beim Laden.',
    loading_orders_error: 'Fehler beim Laden.',
    order_customer: 'Kunde',
    order_distributor: 'Mandant',
    order_article: 'Produkte',
    order_price: 'Gesamtpreis',
    order_closing: 'Bestellschluss',
    order_reserved_until: 'Reserviert bis',
    order_created: 'Datum der Reservierungserstellung',
    order_owner: 'Verantwortlicher Aussendienstmitarbeiter',
    order_passed_to: 'Weitergereicht an',
    product_price: 'Einkaufspreis',
    product_add_to_order: 'Zu Reservierung hinzufügen',
    product_be_number: 'BE Nummer',
    product_reserved: 'Bereits reserviert',
    product_category: 'Kunststoff Kategorie',
    product_amount: 'Menge',
    product_unit: 'Einheit',
    product_article: 'Produkte',
    product_warehouse: 'Lager',
    product_extra: 'Zusatztext',
    product_supplier: 'Lieferant',
    product_description: 'Beschreibung',
    product_mfi: 'MFI',
  },
  en: {
    app_title: 'BMS App',
    start_title: 'Select Mandant',
    start_prompt: 'Please choose the mandant you want to work with.',
    start_user: 'User',
    start_email: 'Email',
    start_no_permission_title: 'No Permission',
    start_no_permission_text: 'You are not authorized to use these features.',
    start_continue: 'Continue',
    start_reload: 'Reload',
    mandant_label: 'Mandant',
    mandant_none: 'No mandant selected',
    switch_mandant: 'Switch mandant',
    customers_title: 'Customers',
    customers_search: 'Search customers',
    customers_empty: 'No customers',
    products_title: 'Products',
    products_search: 'Search products',
    products_empty: 'No products',
    products_loading_items: 'Loading...',
    orders_title: 'Orders',
    orders_search: 'Search orders',
    orders_empty: 'No active orders',
    page_label: 'Page',
    desc_label: 'Description',
    address_label: 'Address',
    contact_label: 'Contact',
    phone_label: 'Phone',
    email_label: 'Email',
    back_label: 'Back',
    loading_error: 'Failed to load.',
    loading_mandants_error: 'Failed to load mandants.',
    loading_categories_error: 'Failed to load categories.',
    loading_products_error: 'Failed to load.',
    loading_orders_error: 'Failed to load.',
    order_customer: 'Customer',
    order_distributor: 'Mandant',
    order_article: 'Article',
    order_price: 'Total price',
    order_closing: 'Order closing',
    order_reserved_until: 'Reserved until',
    order_created: 'Order created',
    order_owner: 'Responsible sales rep',
    order_passed_to: 'Passed to',
    product_price: 'Purchase price',
    product_add_to_order: 'Add to order',
    product_be_number: 'BE number',
    product_reserved: 'Reserved',
    product_category: 'Plastic category',
    product_amount: 'Amount',
    product_unit: 'Unit',
    product_article: 'Article',
    product_warehouse: 'Warehouse',
    product_extra: 'Extra text',
    product_supplier: 'Supplier',
    product_description: 'Description',
    product_mfi: 'MFI',
  },
};

function getInitialLang() {
  return getStoredLanguage();
}

const I18nContext = React.createContext({
  lang: 'de',
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = React.useState(getInitialLang());

  const setLang = React.useCallback((value) => {
    const next = value === 'en' ? 'en' : 'de';
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const t = React.useCallback((key) => {
    const dict = translations[lang] || translations.de;
    return dict[key] || translations.de[key] || key;
  }, [lang]);

  const value = React.useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return React.useContext(I18nContext);
}
