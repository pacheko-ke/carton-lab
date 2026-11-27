export type CompanySelectOption = {
  value: string;
  label: string;
};

export type CompanyTimeZoneGroup = {
  label: string;
  options: CompanySelectOption[];
};

const EXCLUDED_REGION_CODES = new Set([
  "AN",
  "BU",
  "CS",
  "DD",
  "EU",
  "EZ",
  "FQ",
  "FX",
  "JT",
  "MI",
  "NT",
  "NQ",
  "PC",
  "PU",
  "PZ",
  "QO",
  "RH",
  "SU",
  "TP",
  "UN",
  "UK",
  "VD",
  "WK",
  "XA",
  "XB",
  "XU",
  "XV",
  "YD",
  "YU",
  "ZR",
  "ZZ",
]);

function buildCountryOptions(): CompanySelectOption[] {
  const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  const names = new Set<string>();

  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      if (EXCLUDED_REGION_CODES.has(code)) continue;
      const name = regionNames.of(code);
      if (name && name !== code) names.add(name);
    }
  }

  return [...names]
    .map((name) => ({ value: name, label: name }))
    .sort((left, right) => left.label.localeCompare(right.label, "en"));
}

function includeCurrentOption(
  options: CompanySelectOption[],
  currentValue?: string,
): CompanySelectOption[] {
  if (!currentValue || options.some((option) => option.value === currentValue)) {
    return options;
  }
  return [{ value: currentValue, label: currentValue }, ...options];
}

export const COMPANY_COUNTRY_OPTIONS = buildCountryOptions();

export function getCompanyCountryOptions(currentCountry?: string) {
  return includeCurrentOption(COMPANY_COUNTRY_OPTIONS, currentCountry);
}

const COMPANY_TIME_ZONE_VALUES = [
  "UTC",
  ...Intl.supportedValuesOf("timeZone"),
];

export function getCompanyTimeZoneGroups(currentTimeZone?: string): CompanyTimeZoneGroup[] {
  const timeZones = currentTimeZone &&
    !COMPANY_TIME_ZONE_VALUES.includes(currentTimeZone)
    ? [currentTimeZone, ...COMPANY_TIME_ZONE_VALUES]
    : COMPANY_TIME_ZONE_VALUES;
  const grouped = new Map<string, CompanySelectOption[]>();

  for (const timeZone of timeZones) {
    const region = timeZone.split("/")[0];
    const group = timeZone.includes("/") ? region : "Other";
    const options = grouped.get(group) ?? [];
    options.push({
      value: timeZone,
      label: timeZone.replace(/_/g, " "),
    });
    grouped.set(group, options);
  }

  return [...grouped]
    .map(([label, options]) => ({ label, options }))
    .sort((left, right) => left.label.localeCompare(right.label, "en"));
}

const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });
export const COMPANY_CURRENCY_OPTIONS = Intl.supportedValuesOf("currency").map(
  (currency) => ({
    value: currency,
    label: `${currency} — ${currencyNames.of(currency) ?? currency}`,
  }),
);

export function getCompanyCurrencyOptions(currentCurrency?: string) {
  return includeCurrentOption(COMPANY_CURRENCY_OPTIONS, currentCurrency);
}
