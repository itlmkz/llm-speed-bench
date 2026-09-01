const AF = new Set([
  'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CM', 'CV', 'CF', 'TD', 'KM', 'CG', 'CD',
  'CI', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE',
  'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG',
  'RW', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'TZ', 'TG', 'TN', 'UG',
  'EH', 'ZM', 'ZW',
])
const AS = new Set([
  'AF', 'AM', 'AZ', 'BH', 'BD', 'BT', 'BN', 'KH', 'CN', 'CY', 'GE', 'HK', 'IN',
  'ID', 'IR', 'IQ', 'IL', 'JP', 'JO', 'KZ', 'KW', 'KG', 'LA', 'LB', 'MO', 'MY',
  'MV', 'MN', 'MM', 'NP', 'KP', 'KR', 'OM', 'PK', 'PS', 'PH', 'QA', 'SA', 'SG',
  'LK', 'SY', 'TW', 'TJ', 'TH', 'TL', 'TR', 'TM', 'AE', 'UZ', 'VN', 'YE',
])
const EU = new Set([
  'AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MK', 'MT',
  'MD', 'MC', 'ME', 'NL', 'NO', 'PL', 'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI',
  'ES', 'SE', 'CH', 'UA', 'GB', 'VA', 'GG', 'IM', 'JE', 'AX', 'FO', 'GI', 'SJ',
])
const NA = new Set([
  'AG', 'BS', 'BB', 'BZ', 'CA', 'CR', 'CU', 'DM', 'DO', 'SV', 'GD', 'GT', 'HT',
  'HN', 'JM', 'MX', 'NI', 'PA', 'KN', 'LC', 'VC', 'TT', 'US', 'PR', 'VI', 'KY',
  'BM', 'GL', 'GP', 'MQ', 'AW', 'CW', 'SX', 'TC', 'VG',
])
const SA = new Set([
  'AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'GY', 'PY', 'PE', 'SR', 'UY', 'VE', 'FK',
  'GF',
])
const OC = new Set([
  'AU', 'FJ', 'KI', 'MH', 'FM', 'NR', 'NZ', 'PW', 'PG', 'WS', 'SB', 'TO', 'TV',
  'VU', 'NC', 'PF', 'GU', 'MP', 'AS', 'CK', 'NU', 'TK', 'WF',
])

export function continentOf(country: string | null): string | null {
  if (!country || country.length !== 2) return null
  const code = country.toUpperCase()
  if (AF.has(code)) return 'AF'
  if (AS.has(code)) return 'AS'
  if (EU.has(code)) return 'EU'
  if (NA.has(code)) return 'NA'
  if (SA.has(code)) return 'SA'
  if (OC.has(code)) return 'OC'
  if (code === 'AQ') return 'AN'
  return null
}

export function countryFromHeaders(
  headers: Record<string, string | undefined>,
): string | null {
  const pick = (...names: string[]) => {
    for (const name of names) {
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === name && value) {
          const code = value.trim().toUpperCase()
          if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') {
            return code
          }
        }
      }
    }
    return null
  }
  return pick('x-country', 'x-nf-country-code', 'cf-ipcountry', 'cloudfront-viewer-country')
}

export function clientIpFromHeaders(
  headers: Record<string, string | undefined>,
): string | null {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'x-nf-client-connection-ip' && value) {
      return value.trim()
    }
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'x-forwarded-for' && value) {
      return value.split(',')[0]?.trim() ?? null
    }
  }
  return null
}
