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
  bulgaria:'BUL', greece:'GRE', grecia:'GRE', turkey:'TUR', 'turquía':'TUR',
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
  israel:'ISR', jordan:'JOR', jordania:'JOR', lebanon:'LBN', líbano:'LBN',
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
  chad:'CHA', sudan:'SDN', sudán:'SDN', gabon:'GAB', 'gabón':'GAB',
  namibia:'NAM', botswana:'BOT', 'cabo verde':'CPV', 'cape verde':'CPV',
  'equatorial guinea':'EQG', 'guinea ecuatorial':'EQG', 'sierra leone':'SLE', 'sierra leona':'SLE',
  liberia:'LBR', rwanda:'RWA', ruanda:'RWA', burundi:'BDI', comoros:'COM', comoras:'COM',
  madagascar:'MAD', mauritania:'MTN', mauritius:'MRI', mauricio:'MRI',
};

export function normalizeCountryName(raw){
  return String(raw || '')
    .trim().toLowerCase()
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
  return `${FLAG_BASE_URL}/${fifaCode}.png`;
}
