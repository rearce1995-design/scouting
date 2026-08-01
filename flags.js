/* =========================================================================
   flags.js — asignación de banderas por país (código FIFA -> PNG en GitHub)
   Módulo aislado a propósito: si mañana cambia el repo, el nombre de los
   archivos, o se agregan países, se toca solo este archivo.
   ========================================================================= */

/* ⚠️ CONFIGURAR ACÁ: URL raw de tu repo de GitHub con las banderas.
   Formato esperado: https://raw.githubusercontent.com/<usuario>/<repo>/<rama>/<carpeta>
   (sin la barra final — el código le agrega "/<CODIGO_FIFA>.png"). */
export const FLAG_BASE_URL = 'https://raw.githubusercontent.com/rearce1995-design/scouting/main/flags';

/* Mapeo país (nombre, como suele venir en el export de Wyscout, en inglés,
   más variantes en español por si el usuario editó la columna a mano) ->
   código FIFA de 3 letras (selección nacional). Se usa para armar la URL
   de la bandera contra tu propio repo de GitHub: <FLAG_BASE_URL>/<COD>.png */
export const COUNTRY_FIFA = {
  argentina:'ARG', bolivia:'BOL', brazil:'BRA', brasil:'BRA', chile:'CHI', colombia:'COL',
  ecuador:'ECU', paraguay:'PAR', peru:'PER', 'perú':'PER', uruguay:'URU', venezuela:'VEN',
  mexico:'MEX', 'méxico':'MEX', usa:'USA', 'united states':'USA', 'estados unidos':'USA',
  canada:'CAN', 'canadá':'CAN', 'costa rica':'CRC', panama:'PAN', 'panamá':'PAN',
  honduras:'HON', guatemala:'GUA', 'el salvador':'SLV', nicaragua:'NCA', cuba:'CUB',
  'dominican republic':'DOM', 'república dominicana':'DOM', jamaica:'JAM', haiti:'HAI', 'haití':'HAI',
  spain:'ESP', 'españa':'ESP', portugal:'POR', france:'FRA', francia:'FRA',
  germany:'GER', alemania:'GER', italy:'ITA', italia:'ITA', england:'ENG', inglaterra:'ENG',
  scotland:'SCO', escocia:'SCO', wales:'WAL', gales:'WAL', 'northern ireland':'NIR', 'irlanda del norte':'NIR',
  ireland:'IRL', irlanda:'IRL', 'republic of ireland':'IRL', netherlands:'NED', 'países bajos':'NED',
  holanda:'NED', belgium:'BEL', 'bélgica':'BEL', switzerland:'SUI', suiza:'SUI',
  austria:'AUT', denmark:'DEN', dinamarca:'DEN', sweden:'SWE', suecia:'SWE',
  norway:'NOR', noruega:'NOR', finland:'FIN', finlandia:'FIN', iceland:'ISL', islandia:'ISL',
  poland:'POL', polonia:'POL', 'czech republic':'CZE', czechia:'CZE', 'república checa':'CZE',
  slovakia:'SVK', eslovaquia:'SVK', hungary:'HUN', hungría:'HUN', romania:'ROU', rumania:'ROU',
  bulgaria:'BUL', greece:'GRE', grecia:'GRE', turkey:'TUR', turkiye:'TUR', 'türkiye':'TUR', 'turquía':'TUR',
  ukraine:'UKR', ucrania:'UKR', russia:'RUS', rusia:'RUS', belarus:'BLR', bielorrusia:'BLR',
  croatia:'CRO', croacia:'CRO', serbia:'SRB', slovenia:'SVN', eslovenia:'SVN',
  'bosnia and herzegovina':'BIH', 'bosnia y herzegovina':'BIH', montenegro:'MNE',
  'north macedonia':'MKD', 'macedonia del norte':'MKD', albania:'ALB', kosovo:'KVX',
  moldova:'MDA', moldavia:'MDA', lithuania:'LTU', lituania:'LTU', latvia:'LVA', letonia:'LVA',
  estonia:'EST', georgia:'GEO', armenia:'ARM', azerbaijan:'AZE', azerbaiyán:'AZE',
  cyprus:'CYP', chipre:'CYP', malta:'MLT', luxembourg:'LUX', luxemburgo:'LUX',
  japan:'JPN', 'japón':'JPN', 'south korea':'KOR', 'korea republic':'KOR', 'corea del sur':'KOR',
  china:'CHN', 'china pr':'CHN', australia:'AUS', 'new zealand':'NZL', 'nueva zelanda':'NZL',
  india:'IND', 'saudi arabia':'KSA', 'arabia saudita':'KSA', qatar:'QAT', uae:'UAE',
  'united arab emirates':'UAE', 'emiratos árabes unidos':'UAE', iran:'IRN', irán:'IRN', iraq:'IRQ', irak:'IRQ',
  israel:'ISR', jordan:'JOR', jordania:'JOR', lebanon:'LIB', líbano:'LIB',
  syria:'SYR', siria:'SYR', kuwait:'KUW', bahrain:'BHR', baréin:'BHR', oman:'OMA', omán:'OMA',
  thailand:'THA', tailandia:'THA', vietnam:'VIE', indonesia:'IDN', malaysia:'MAS', malasia:'MAS',
  philippines:'PHI', filipinas:'PHI', 'hong kong':'HKG', taiwan:'TPE', 'taiwán':'TPE',
  uzbekistan:'UZB', kazakhstan:'KAZ', kazajistán:'KAZ',
  nigeria:'NGA', ghana:'GHA', 'ivory coast':'CIV', "côte d'ivoire":'CIV', 'costa de marfil':'CIV',
  senegal:'SEN', mali:'MLI', malí:'MLI', 'burkina faso':'BFA',
  cameroon:'CMR', 'camerún':'CMR', 'dr congo':'COD', congo:'CGO', 'congo dr':'COD',
  'south africa':'RSA', 'sudáfrica':'RSA', egypt:'EGY', egipto:'EGY', morocco:'MAR', marruecos:'MAR',
  algeria:'ALG', argelia:'ALG', tunisia:'TUN', 'túnez':'TUN', libya:'LBY', libia:'LBY',
  kenya:'KEN', kenia:'KEN', ethiopia:'ETH', etiopía:'ETH', tanzania:'TAN', uganda:'UGA',
  zambia:'ZAM', zimbabwe:'ZIM', angola:'ANG', mozambique:'MOZ', guinea:'GUI',
  'guinea-bissau':'GNB', gambia:'GAM', benin:'BEN', togo:'TOG', niger:'NIG', 'níger':'NIG',
  chad:'CHA', sudan:'SUD', sudán:'SUD', gabon:'GAB', 'gabón':'GAB',
  namibia:'NAM', botswana:'BOT', 'cabo verde':'CPV', 'cape verde':'CPV',
  'equatorial guinea':'EQG', 'guinea ecuatorial':'EQG', 'sierra leone':'SLE', 'sierra leona':'SLE',
  liberia:'LBR', rwanda:'RWA', ruanda:'RWA', burundi:'BDI', comoros:'COM', comoras:'COM',
  madagascar:'MAD', mauritania:'MTN', mauritius:'MRI', mauricio:'MRI',

  /* --- Resto del repo: territorios, islas y selecciones menos frecuentes.
     Agregados para cubrir los 238 archivos que subiste (antes solo estaban
     los ~142 países más comunes en scouting). --- */
  afghanistan:'AFG', afganistán:'AFG', anguilla:'AIA', anguila:'AIA',
  andorra:'AND', aruba:'ARU', 'american samoa':'ASA', 'samoa americana':'ASA',
  'antigua and barbuda':'ATG', 'antigua y barbuda':'ATG', bahamas:'BAH',
  bangladesh:'BAN', bermuda:'BER', bermudas:'BER',
  'saint barthelemy':'BLM', 'saint barthélemy':'BLM', 'san bartolomé':'BLM',
  'bonaire, sint eustatius and saba':'BES', 'caribe neerlandés':'BES',
  bhutan:'BHU', bután:'BHU', belize:'BLZ', barbados:'BRB', brunei:'BRU',
  cambodia:'CAM', camboya:'CAM', 'cayman islands':'CAY', 'islas caimán':'CAY',
  'cook islands':'COK', 'islas cook':'COK',
  'central african republic':'CTA', 'república centroafricana':'CTA',
  curacao:'CUW', curazao:'CUW', djibouti:'DJI', yibuti:'DJI',
  dominica:'DMA', eritrea:'ERI', fiji:'FIJ', fiyi:'FIJ',
  'faroe islands':'FRO', 'islas feroe':'FRO', micronesia:'FSM',
  gibraltar:'GIB', guadeloupe:'GPE', guadalupe:'GPE',
  grenada:'GRN', granada:'GRN', guam:'GUM', guyana:'GUY',
  'french guiana':'GYF', 'guayana francesa':'GYF',
  kyrgyzstan:'KGZ', kirguistán:'KGZ', kiribati:'KIR', laos:'LAO',
  'saint lucia':'LCA', 'santa lucía':'LCA', lesotho:'LES',
  liechtenstein:'LIE', macau:'MAC', macao:'MAC', mayotte:'MAY',
  maldives:'MDV', maldivas:'MDV', mongolia:'MGL', monaco:'MON', 'mónaco':'MON',
  montserrat:'MSR', martinique:'MTQ', martinica:'MTQ',
  malawi:'MWI', myanmar:'MYA', burma:'BUR',
  'new caledonia':'NCL', 'nueva caledonia':'NCL', nepal:'NEP',
  'northern mariana islands':'NMI', 'islas marianas del norte':'NMI',
  pakistan:'PAK', pakistán:'PAK', palestine:'PAL', palestina:'PAL',
  'papua new guinea':'PNG', 'papúa nueva guinea':'PNG',
  'north korea':'PRK', 'corea del norte':'PRK', 'puerto rico':'PUR',
  reunion:'REU', 'reunión':'REU', samoa:'SAM',
  seychelles:'SEY', singapore:'SIN', singapur:'SIN',
  'saint kitts and nevis':'SKN', 'san cristóbal y nieves':'SKN',
  'san marino':'SMR', 'sint maarten':'SXM', 'saint martin':'SMT', 'san martín':'SMT',
  'solomon islands':'SOL', 'islas salomón':'SOL', somalia:'SOM',
  'saint pierre and miquelon':'SPM', 'san pedro y miquelón':'SPM',
  'sri lanka':'SRI', 'south sudan':'SSD', 'sudán del sur':'SSD',
  'sao tome and principe':'STP', 'santo tomé y príncipe':'STP',
  suriname:'SUR', surinam:'SUR', eswatini:'SWZ', swaziland:'SWZ', esuatini:'SWZ',
  tahiti:'TAH', 'turks and caicos islands':'TCA', 'islas turcas y caicos':'TCA',
  tonga:'TGA', tajikistan:'TJK', tayikistán:'TJK',
  turkmenistan:'TKM', turkmenistán:'TKM', 'timor-leste':'TLS', 'timor oriental':'TLS',
  'trinidad and tobago':'TRI', 'trinidad y tobago':'TRI', tuvalu:'TUV',
  vanuatu:'VAN', 'british virgin islands':'VGB', 'islas vírgenes británicas':'VGB',
  'saint vincent and the grenadines':'VIN', 'san vicente y las granadinas':'VIN',
  'us virgin islands':'VIR', 'islas vírgenes de estados unidos':'VIR',
  'wallis and futuna':'WFI', 'wallis y futuna':'WFI', yemen:'YEM',

  /* Equipos/entidades históricas (ya no compiten, pero pueden aparecer en
     datos viejos). Muy improbable que se necesiten hoy. */
  'west germany':'BRD', 'alemania occidental':'BRD',
  'east germany':'GDR', 'alemania oriental':'GDR', rda:'GDR',
  'soviet union':'URS', 'unión soviética':'URS', urss:'URS',
  yugoslavia:'YUG', zaire:'ZAI', zanzibar:'ZAN',
  'great britain':'GBR', 'gran bretaña':'GBR',
  'basque country':'BAS', 'país vasco':'BAS', euskadi:'BAS',
  crimea:'CRM',
  czechoslovakia:'CSV', checoslovaquia:'CSV',
};

export function normalizeCountryName(raw){
  return String(raw || '')
    .trim().toLowerCase()
    .replace(/[‘’‛`´]/g, "'")
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // saca acentos para matchear
}

export function countryToFifaCode(raw){
  const n = normalizeCountryName(raw);
  if(!n) return null;
  if(COUNTRY_FIFA[n]) return COUNTRY_FIFA[n];
  // fallback: probamos también contra las claves sin acentos (por si el
  // export trae la versión con tilde y el diccionario la versión sin ella)
  for(const key in COUNTRY_FIFA){
    if(normalizeCountryName(key) === n) return COUNTRY_FIFA[key];
  }
  return null;
}

export function flagCdnUrl(fifaCode){
  // Los archivos en el repo están en minúsculas (arg.png, esp.png...) aunque
  // acá guardemos los códigos en mayúsculas por legibilidad — GitHub es
  // sensible a mayúsculas/minúsculas, así que hay que bajarlos antes de armar la URL.
  return `${FLAG_BASE_URL}/${fifaCode.toLowerCase()}.png`;
}
