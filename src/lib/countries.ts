/**
 * Country → IOC code ("Canada" → CAN), as AIDA start lists and results show
 * nationality, or back to one full name. Registrations keep what was typed;
 * starts (list, sheets, exports) get the code or the name, per the
 * `countryFormat` setting. A value the table doesn't know is kept as typed
 * and flagged on Athletes, where the organizer can type the code.
 *
 * Each entry: IOC code → names and common spellings. Matching ignores case,
 * accents, punctuation and a leading "the".
 */

// Europe
const EUROPE: Record<string, string[]> = {
  ALB: ["Albania"],
  AND: ["Andorra"],
  ARM: ["Armenia"],
  AUT: ["Austria", "Austrian"],
  AZE: ["Azerbaijan"],
  BEL: ["Belgium", "Belgian"],
  BIH: ["Bosnia and Herzegovina", "Bosnia"],
  BLR: ["Belarus"],
  BUL: ["Bulgaria", "Bulgarian", "BGR"],
  CRO: ["Croatia", "Croatian", "Hrvatska", "HRV"],
  CYP: ["Cyprus"],
  CZE: ["Czech Republic", "Czechia", "Czech"],
  DEN: ["Denmark", "Danish", "DNK"],
  ESP: ["Spain", "Spanish", "España"],
  EST: ["Estonia", "Estonian"],
  FIN: ["Finland", "Finnish"],
  FRA: ["France", "French"],
  GBR: ["Great Britain", "United Kingdom", "UK", "GB", "Britain", "British", "England", "English", "Scotland", "Scottish", "Wales", "Welsh", "Northern Ireland"],
  GEO: ["Georgia"],
  GER: ["Germany", "German", "Deutschland", "DEU"],
  GRE: ["Greece", "Greek", "GRC"],
  HUN: ["Hungary", "Hungarian"],
  IRL: ["Ireland", "Irish"],
  ISL: ["Iceland"],
  ITA: ["Italy", "Italian", "Italia"],
  KOS: ["Kosovo"],
  LAT: ["Latvia", "Latvian", "LVA"],
  LIE: ["Liechtenstein"],
  LTU: ["Lithuania", "Lithuanian"],
  LUX: ["Luxembourg"],
  MDA: ["Moldova", "Republic of Moldova"],
  MKD: ["North Macedonia", "Macedonia"],
  MLT: ["Malta"],
  MNE: ["Montenegro"],
  MON: ["Monaco"],
  NED: ["Netherlands", "Holland", "Dutch", "Nederland", "NLD"],
  NOR: ["Norway", "Norwegian"],
  POL: ["Poland", "Polish", "Polska"],
  POR: ["Portugal", "Portuguese", "PRT"],
  ROU: ["Romania", "Romanian"],
  RUS: ["Russia", "Russian Federation", "Russian"],
  SLO: ["Slovenia", "Slovenian", "SVN"],
  SMR: ["San Marino"],
  SRB: ["Serbia", "Serbian"],
  SUI: ["Switzerland", "Swiss", "Schweiz", "Suisse", "CHE"],
  SVK: ["Slovakia", "Slovak"],
  SWE: ["Sweden", "Swedish"],
  TUR: ["Türkiye", "Turkey", "Turkish"],
  UKR: ["Ukraine", "Ukrainian"],
};

// The Americas and the Caribbean
const AMERICAS: Record<string, string[]> = {
  ANT: ["Antigua and Barbuda", "Antigua"],
  ARG: ["Argentina", "Argentinian", "Argentine"],
  ARU: ["Aruba"],
  BAH: ["Bahamas"],
  BAR: ["Barbados"],
  BER: ["Bermuda"],
  BIZ: ["Belize"],
  BOL: ["Bolivia"],
  BRA: ["Brazil", "Brazilian", "Brasil"],
  CAN: ["Canada", "Canadian"],
  CAY: ["Cayman Islands", "Cayman"],
  CHI: ["Chile", "Chilean", "CHL"],
  COL: ["Colombia", "Colombian"],
  CRC: ["Costa Rica", "Costa Rican"],
  CUB: ["Cuba"],
  DMA: ["Dominica"],
  DOM: ["Dominican Republic"],
  ECU: ["Ecuador"],
  ESA: ["El Salvador"],
  GRN: ["Grenada"],
  GUA: ["Guatemala"],
  GUY: ["Guyana"],
  HAI: ["Haiti"],
  HON: ["Honduras"],
  ISV: ["US Virgin Islands", "United States Virgin Islands"],
  IVB: ["British Virgin Islands"],
  JAM: ["Jamaica"],
  LCA: ["Saint Lucia", "St Lucia"],
  MEX: ["Mexico", "Mexican", "México"],
  NCA: ["Nicaragua"],
  PAN: ["Panama"],
  PAR: ["Paraguay", "PRY"],
  PER: ["Peru"],
  PUR: ["Puerto Rico"],
  SKN: ["Saint Kitts and Nevis", "St Kitts and Nevis"],
  SUR: ["Suriname"],
  TTO: ["Trinidad and Tobago", "Trinidad"],
  URU: ["Uruguay", "URY"],
  // Alaska and Hawaii: seen in a real ECAC export.
  USA: ["United States", "United States of America", "US", "America", "American", "Alaska", "Hawaii"],
  VEN: ["Venezuela"],
  VIN: ["Saint Vincent and the Grenadines", "St Vincent and the Grenadines"],
};

// Asia and the Middle East
const ASIA: Record<string, string[]> = {
  AFG: ["Afghanistan"],
  BAN: ["Bangladesh"],
  BHU: ["Bhutan"],
  BRN: ["Bahrain"],
  BRU: ["Brunei"],
  CAM: ["Cambodia"],
  CHN: ["China", "Chinese", "PRC", "People's Republic of China"],
  HKG: ["Hong Kong", "Hong Kong China"],
  INA: ["Indonesia", "Indonesian", "IDN"],
  IND: ["India", "Indian"],
  IRI: ["Iran", "IRN"],
  IRQ: ["Iraq"],
  ISR: ["Israel", "Israeli"],
  JOR: ["Jordan"],
  JPN: ["Japan", "Japanese"],
  KAZ: ["Kazakhstan"],
  KGZ: ["Kyrgyzstan"],
  KOR: ["South Korea", "Korea", "Republic of Korea", "Korean"],
  KSA: ["Saudi Arabia", "SAU"],
  KUW: ["Kuwait"],
  LAO: ["Laos"],
  LBN: ["Lebanon"],
  MAS: ["Malaysia", "Malaysian", "MYS"],
  MDV: ["Maldives"],
  MGL: ["Mongolia"],
  MYA: ["Myanmar", "Burma"],
  NEP: ["Nepal"],
  OMA: ["Oman"],
  PAK: ["Pakistan"],
  PHI: ["Philippines", "Filipino", "Filipina", "PHL"],
  PLE: ["Palestine"],
  PRK: ["North Korea", "DPRK"],
  QAT: ["Qatar"],
  SGP: ["Singapore", "Singaporean"],
  SRI: ["Sri Lanka"],
  SYR: ["Syria"],
  THA: ["Thailand", "Thai"],
  TJK: ["Tajikistan"],
  TKM: ["Turkmenistan"],
  TLS: ["Timor-Leste", "East Timor"],
  TPE: ["Chinese Taipei", "Taiwan", "Taiwanese", "TWN"],
  UAE: ["United Arab Emirates", "Emirates", "ARE"],
  UZB: ["Uzbekistan"],
  VIE: ["Vietnam", "Viet Nam", "Vietnamese", "VNM"],
  YEM: ["Yemen"],
};

// Oceania
const OCEANIA: Record<string, string[]> = {
  ASA: ["American Samoa"],
  AUS: ["Australia", "Australian"],
  COK: ["Cook Islands"],
  FIJ: ["Fiji"],
  FSM: ["Micronesia", "Federated States of Micronesia"],
  GUM: ["Guam"],
  KIR: ["Kiribati"],
  MHL: ["Marshall Islands"],
  NRU: ["Nauru"],
  NZL: ["New Zealand", "NZ", "Aotearoa", "New Zealander", "Kiwi"],
  PLW: ["Palau"],
  PNG: ["Papua New Guinea"],
  SAM: ["Samoa"],
  SOL: ["Solomon Islands"],
  TGA: ["Tonga"],
  TUV: ["Tuvalu"],
  VAN: ["Vanuatu"],
};

// Africa
const AFRICA: Record<string, string[]> = {
  ALG: ["Algeria"],
  ANG: ["Angola"],
  BDI: ["Burundi"],
  BEN: ["Benin"],
  BOT: ["Botswana"],
  BUR: ["Burkina Faso"],
  CAF: ["Central African Republic"],
  CGO: ["Congo", "Republic of the Congo"],
  CHA: ["Chad"],
  CIV: ["Côte d'Ivoire", "Ivory Coast"],
  CMR: ["Cameroon"],
  COD: ["DR Congo", "Democratic Republic of the Congo", "DRC"],
  COM: ["Comoros"],
  CPV: ["Cape Verde", "Cabo Verde"],
  DJI: ["Djibouti"],
  EGY: ["Egypt", "Egyptian"],
  ERI: ["Eritrea"],
  ETH: ["Ethiopia"],
  GAB: ["Gabon"],
  GAM: ["Gambia"],
  GBS: ["Guinea-Bissau"],
  GEQ: ["Equatorial Guinea"],
  GHA: ["Ghana"],
  GUI: ["Guinea"],
  KEN: ["Kenya"],
  LBA: ["Libya"],
  LBR: ["Liberia"],
  LES: ["Lesotho"],
  MAD: ["Madagascar"],
  MAR: ["Morocco"],
  MAW: ["Malawi"],
  MLI: ["Mali"],
  MOZ: ["Mozambique"],
  MRI: ["Mauritius"],
  MTN: ["Mauritania"],
  NAM: ["Namibia"],
  NGR: ["Nigeria"],
  NIG: ["Niger"],
  RSA: ["South Africa", "South African", "ZAF"],
  RWA: ["Rwanda"],
  SEN: ["Senegal"],
  SEY: ["Seychelles"],
  SLE: ["Sierra Leone"],
  SOM: ["Somalia"],
  SSD: ["South Sudan"],
  STP: ["São Tomé and Príncipe"],
  SUD: ["Sudan"],
  SWZ: ["Eswatini", "Swaziland"],
  TAN: ["Tanzania"],
  TOG: ["Togo"],
  TUN: ["Tunisia"],
  UGA: ["Uganda"],
  ZAM: ["Zambia"],
  ZIM: ["Zimbabwe"],
};

const ALIASES = new Map<string, string>();
/** Code → the name shown in "Full name" mode: each entry's first name. */
const NAMES = new Map<string, string>();
for (const table of [EUROPE, AMERICAS, ASIA, OCEANIA, AFRICA]) {
  for (const [code, names] of Object.entries(table)) {
    NAMES.set(code, names[0]);
    ALIASES.set(normalize(code), code);
    for (const name of names) ALIASES.set(normalize(name), code);
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/** The IOC code for a typed country, or null when it isn't one the table knows. */
export function countryCode(value: string): string | null {
  return ALIASES.get(normalize(value)) ?? null;
}

/** How the list, sheets and exports show a country: CAN or Canada. */
export type CountryFormat = "CODE" | "NAME";

/**
 * What the list, sheets and exports show. Forms can mix "CAN" and "Canada",
 * so both formats convert from either; an unknown value is shown as typed.
 */
export function formatCountry(value: string, format: CountryFormat): string {
  const code = countryCode(value);
  if (!code) return value.trim();
  return format === "CODE" ? code : NAMES.get(code)!;
}
