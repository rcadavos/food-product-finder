/**
 * Open Food Facts identifies countries with English slugs (`en:france`), not ISO
 * codes, and its localized `countries_tags_<lang>` arrays carry display names only.
 * The UI needs a stable identifier to hang a flag on, so the slug is resolved here
 * once, on the server, rather than by pattern-matching translated names in the
 * browser.
 *
 * The list covers the countries that actually show up in the database with any
 * frequency; anything unlisted simply resolves to `null` and the UI falls back to
 * the name alone.
 */
const COUNTRY_CODE_BY_SLUG: Readonly<Record<string, string>> = {
  argentina: 'AR',
  australia: 'AU',
  austria: 'AT',
  belgium: 'BE',
  brazil: 'BR',
  bulgaria: 'BG',
  canada: 'CA',
  chile: 'CL',
  china: 'CN',
  colombia: 'CO',
  croatia: 'HR',
  cyprus: 'CY',
  czechia: 'CZ',
  'czech-republic': 'CZ',
  denmark: 'DK',
  estonia: 'EE',
  finland: 'FI',
  france: 'FR',
  germany: 'DE',
  greece: 'GR',
  hungary: 'HU',
  iceland: 'IS',
  india: 'IN',
  ireland: 'IE',
  israel: 'IL',
  italy: 'IT',
  japan: 'JP',
  latvia: 'LV',
  lithuania: 'LT',
  luxembourg: 'LU',
  malta: 'MT',
  mexico: 'MX',
  morocco: 'MA',
  netherlands: 'NL',
  'new-zealand': 'NZ',
  norway: 'NO',
  poland: 'PL',
  portugal: 'PT',
  romania: 'RO',
  russia: 'RU',
  serbia: 'RS',
  slovakia: 'SK',
  slovenia: 'SI',
  'south-africa': 'ZA',
  spain: 'ES',
  sweden: 'SE',
  switzerland: 'CH',
  thailand: 'TH',
  tunisia: 'TN',
  turkey: 'TR',
  ukraine: 'UA',
  'united-kingdom': 'GB',
  'united-states': 'US',
  'united-states-of-america': 'US',
  vietnam: 'VN',
};

/** `en:united-kingdom` -> `GB`. Returns null for anything not in the table. */
export function countryCodeFromTag(tag: string): string | null {
  const slug = tag
    .trim()
    .toLowerCase()
    .replace(/^[a-z]{2,3}:/, '');
  return COUNTRY_CODE_BY_SLUG[slug] ?? null;
}
