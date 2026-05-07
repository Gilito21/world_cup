// Códigos ISO 2-letras para flagcdn.com, indexados por nombre exacto de la BD
export const TEAM_CODES = {
  Algeria: 'dz', Argentina: 'ar', Australia: 'au', Austria: 'at',
  Belgium: 'be', Bolivia: 'bo',
  'Bosnia-Herzegovina': 'ba', 'Bosnia and Herzegovina': 'ba',
  Brazil: 'br', Cameroon: 'cm', Canada: 'ca', Chile: 'cl', Colombia: 'co',
  'Costa Rica': 'cr', Croatia: 'hr', 'Curaçao': 'cw', Czechia: 'cz',
  Denmark: 'dk',
  'Congo DR': 'cd', 'DR Congo': 'cd',
  Ecuador: 'ec', Egypt: 'eg',
  England: 'gb-eng', Spain: 'es', France: 'fr', Georgia: 'ge',
  Germany: 'de', Ghana: 'gh', Haiti: 'ht', Honduras: 'hn',
  Hungary: 'hu',
  Iran: 'ir', 'IR Iran': 'ir',
  Iraq: 'iq', Italy: 'it',
  'Ivory Coast': 'ci', "Côte d'Ivoire": 'ci',
  Jamaica: 'jm', Japan: 'jp', Jordan: 'jo', 'South Korea': 'kr',
  'Saudi Arabia': 'sa', Mali: 'ml', Morocco: 'ma', Mexico: 'mx',
  Montenegro: 'me', Netherlands: 'nl', 'New Zealand': 'nz', Nigeria: 'ng',
  Norway: 'no', Panama: 'pa', Paraguay: 'py', Peru: 'pe',
  Poland: 'pl', Portugal: 'pt', Qatar: 'qa', Romania: 'ro',
  Senegal: 'sn', Serbia: 'rs', 'Sierra Leone': 'sl', Slovakia: 'sk',
  Slovenia: 'si', 'South Africa': 'za', Sweden: 'se', Switzerland: 'ch',
  Tanzania: 'tz', Tunisia: 'tn', 'Türkiye': 'tr', Turkey: 'tr',
  Ukraine: 'ua', Uruguay: 'uy',
  USA: 'us', 'United States': 'us',
  Uzbekistan: 'uz', Venezuela: 've',
  Wales: 'gb-wls', Scotland: 'gb-sct',
  'Cape Verde Islands': 'cv', 'Cabo Verde': 'cv', 'Cape Verde': 'cv',
}

// Traducciones al español
export const TEAM_NAMES = {
  Algeria: 'Argelia',
  Argentina: 'Argentina',
  Australia: 'Australia',
  Austria: 'Austria',
  Belgium: 'Bélgica',
  'Bosnia-Herzegovina': 'Bosnia-Herzegovina',
  Brazil: 'Brasil',
  Canada: 'Canadá',
  'Cape Verde Islands': 'Cabo Verde',
  Colombia: 'Colombia',
  'Congo DR': 'Congo RD',
  Croatia: 'Croacia',
  'Curaçao': 'Curazao',
  Czechia: 'Rep. Checa',
  Ecuador: 'Ecuador',
  Egypt: 'Egipto',
  England: 'Inglaterra',
  France: 'Francia',
  Germany: 'Alemania',
  Ghana: 'Ghana',
  Haiti: 'Haití',
  Iran: 'Irán',
  Iraq: 'Irak',
  'Ivory Coast': 'Costa de Marfil',
  Japan: 'Japón',
  Jordan: 'Jordania',
  Mexico: 'México',
  Morocco: 'Marruecos',
  Netherlands: 'Países Bajos',
  'New Zealand': 'Nueva Zelanda',
  Norway: 'Noruega',
  Panama: 'Panamá',
  Paraguay: 'Paraguay',
  Portugal: 'Portugal',
  Qatar: 'Catar',
  'Saudi Arabia': 'Arabia Saudí',
  Scotland: 'Escocia',
  Senegal: 'Senegal',
  'South Africa': 'Sudáfrica',
  'South Korea': 'Corea del Sur',
  Spain: 'España',
  Sweden: 'Suecia',
  Switzerland: 'Suiza',
  TBD: 'Por determinar',
  Tunisia: 'Túnez',
  Turkey: 'Turquía',
  'United States': 'EE.UU.',
  Uruguay: 'Uruguay',
  Uzbekistan: 'Uzbekistán',
}

export function teamName(name) {
  return TEAM_NAMES[name] ?? name
}

export function Flag({ team }) {
  const code = TEAM_CODES[team]
  if (!code) return <span className="text-xl leading-none flex-shrink-0">🏳️</span>
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt={teamName(team)}
      className="w-7 h-5 object-cover rounded-sm shadow-sm flex-shrink-0"
    />
  )
}
