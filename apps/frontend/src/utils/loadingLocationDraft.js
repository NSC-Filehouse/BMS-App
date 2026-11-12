const text=value=>String(value || '').trim();

export function buildLoadingLocationText(draft,countries) {
  const country=countries.find(row=>String(row.id)===String(draft.countryId));
  return [text(draft.name),text(draft.street),[text(draft.postalCode),text(draft.city)].filter(Boolean).join(' '),
    country?[country.isoAlpha2,country.name || country.nameEnglish].filter(Boolean).join(' — '):'',
    text(draft.pickupTimes)?`Ladezeiten: ${text(draft.pickupTimes)}`:'',
    text(draft.contact)?`Kontakt: ${text(draft.contact)}`:'',text(draft.notes)].filter(Boolean).join('\n');
}

export function loadingLocationDraftErrors(draft,countries) {
  return {name:!text(draft.name),street:!text(draft.street),postalCode:!text(draft.postalCode),city:!text(draft.city),
    countryId:!countries.some(row=>String(row.id)===String(draft.countryId)),tooLong:buildLoadingLocationText(draft,countries).length>1000};
}
