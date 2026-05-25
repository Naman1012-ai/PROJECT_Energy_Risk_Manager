// ============================================================================
// RegionNormalizer.js — Normalize country names/codes to canonical region_id
// ============================================================================
// Handles aliases, ISO codes, common alternate names, etc.
// All inputs are resolved to a single lowercase, Firebase-safe region_id.
// ============================================================================

/**
 * Alias map — maps various country names, abbreviations, ISO codes,
 * and common alternate names to a single canonical region_id.
 */
const REGION_ALIASES = {
    // --- China ---
    'china':                        'china',
    'cn':                           'china',
    'chn':                          'china',
    'peoples republic of china':    'china',
    "people's republic of china":   'china',
    'prc':                          'china',
    'zhongguo':                     'china',

    // --- United States ---
    'united states':                'united_states',
    'united states of america':     'united_states',
    'usa':                          'united_states',
    'us':                           'united_states',
    'america':                      'united_states',

    // --- Russia ---
    'russia':                       'russia',
    'russian federation':           'russia',
    'rus':                          'russia',
    'ru':                           'russia',

    // --- Saudi Arabia ---
    'saudi arabia':                 'saudi_arabia',
    'saudi':                        'saudi_arabia',
    'sau':                          'saudi_arabia',
    'sa':                           'saudi_arabia',
    'kingdom of saudi arabia':      'saudi_arabia',
    'ksa':                          'saudi_arabia',

    // --- India ---
    'india':                        'india',
    'ind':                          'india',
    'in':                           'india',
    'republic of india':            'india',
    'bharat':                       'india',

    // --- Germany ---
    'germany':                      'germany',
    'deu':                          'germany',
    'de':                           'germany',
    'deutschland':                  'germany',
    'federal republic of germany':  'germany',

    // --- Japan ---
    'japan':                        'japan',
    'jpn':                          'japan',
    'jp':                           'japan',
    'nippon':                       'japan',

    // --- United Kingdom ---
    'united kingdom':               'united_kingdom',
    'uk':                           'united_kingdom',
    'gbr':                          'united_kingdom',
    'gb':                           'united_kingdom',
    'great britain':                'united_kingdom',
    'britain':                      'united_kingdom',
    'england':                      'united_kingdom',

    // --- France ---
    'france':                       'france',
    'fra':                          'france',
    'fr':                           'france',
    'french republic':              'france',

    // --- Australia ---
    'australia':                    'australia',
    'aus':                          'australia',
    'au':                           'australia',

    // --- Canada ---
    'canada':                       'canada',
    'can':                          'canada',
    'ca':                           'canada',

    // --- Brazil ---
    'brazil':                       'brazil',
    'brasil':                       'brazil',
    'bra':                          'brazil',
    'br':                           'brazil',

    // --- South Korea ---
    'south korea':                  'south_korea',
    'korea':                        'south_korea',
    'kor':                          'south_korea',
    'kr':                           'south_korea',
    'republic of korea':            'south_korea',

    // --- Middle East (region) ---
    'middle east':                  'middle_east',
    'mideast':                      'middle_east',

    // --- Iran ---
    'iran':                         'iran',
    'irn':                          'iran',
    'ir':                           'iran',
    'islamic republic of iran':     'iran',
    'persia':                       'iran',

    // --- Iraq ---
    'iraq':                         'iraq',
    'irq':                          'iraq',
    'iq':                           'iraq',

    // --- Ukraine ---
    'ukraine':                      'ukraine',
    'ukr':                          'ukraine',
    'ua':                           'ukraine',

    // --- Turkey ---
    'turkey':                       'turkey',
    'tur':                          'turkey',
    'tr':                           'turkey',
    'turkiye':                      'turkey',
    'türkiye':                      'turkey',

    // --- UAE ---
    'united arab emirates':         'uae',
    'uae':                          'uae',
    'are':                          'uae',
    'emirates':                     'uae',

    // --- Nigeria ---
    'nigeria':                      'nigeria',
    'nga':                          'nigeria',
    'ng':                           'nigeria',

    // --- South Africa ---
    'south africa':                 'south_africa',
    'zaf':                          'south_africa',
    'za':                           'south_africa',

    // --- Egypt ---
    'egypt':                        'egypt',
    'egy':                          'egypt',
    'eg':                           'egypt',

    // --- Mexico ---
    'mexico':                       'mexico',
    'mex':                          'mexico',
    'mx':                           'mexico',

    // --- Indonesia ---
    'indonesia':                    'indonesia',
    'idn':                          'indonesia',
    'id':                           'indonesia',

    // --- Venezuela ---
    'venezuela':                    'venezuela',
    'ven':                          'venezuela',
    've':                           'venezuela',

    // --- Colombia ---
    'colombia':                     'colombia',
    'col':                          'colombia',
    'co':                           'colombia',

    // --- Argentina ---
    'argentina':                    'argentina',
    'arg':                          'argentina',
    'ar':                           'argentina',

    // --- Kazakhstan ---
    'kazakhstan':                   'kazakhstan',
    'kaz':                          'kazakhstan',
    'kz':                           'kazakhstan',

    // --- EU / Europe ---
    'eu':                           'european_union',
    'european union':               'european_union',
    'europe':                       'european_union',

    // --- Italy ---
    'italy':                        'italy',
    'ita':                          'italy',
    'it':                           'italy',
    'italia':                       'italy',

    // --- Spain ---
    'spain':                        'spain',
    'esp':                          'spain',
    'es':                           'spain',

    // --- Poland ---
    'poland':                       'poland',
    'pol':                          'poland',
    'pl':                           'poland',

    // --- Norway ---
    'norway':                       'norway',
    'nor':                          'norway',
    'no':                           'norway',

    // --- Sweden ---
    'sweden':                       'sweden',
    'swe':                          'sweden',
    'se':                           'sweden',

    // --- Netherlands ---
    'netherlands':                  'netherlands',
    'nld':                          'netherlands',
    'nl':                           'netherlands',
    'holland':                      'netherlands',

    // --- Malaysia ---
    'malaysia':                     'malaysia',
    'mys':                          'malaysia',
    'my':                           'malaysia',

    // --- Thailand ---
    'thailand':                     'thailand',
    'tha':                          'thailand',
    'th':                           'thailand',

    // --- Vietnam ---
    'vietnam':                      'vietnam',
    'vnm':                          'vietnam',
    'vn':                           'vietnam',
    'viet nam':                     'vietnam',

    // --- Pakistan ---
    'pakistan':                      'pakistan',
    'pak':                          'pakistan',
    'pk':                           'pakistan',

    // --- Kuwait ---
    'kuwait':                       'kuwait',
    'kwt':                          'kuwait',
    'kw':                           'kuwait',

    // --- Qatar ---
    'qatar':                        'qatar',
    'qat':                          'qatar',
    'qa':                           'qatar',

    // --- Libya ---
    'libya':                        'libya',
    'lby':                          'libya',
    'ly':                           'libya',

    // --- Algeria ---
    'algeria':                      'algeria',
    'dza':                          'algeria',
    'dz':                           'algeria',

    // --- Angola ---
    'angola':                       'angola',
    'ago':                          'angola',
    'ao':                           'angola',

    // --- Chile ---
    'chile':                        'chile',
    'chl':                          'chile',
    'cl':                           'chile',

    // --- Peru ---
    'peru':                         'peru',
    'per':                          'peru',
    'pe':                           'peru',

    // --- Finland ---
    'finland':                      'finland',
    'fin':                          'finland',
    'fi':                           'finland',

    // --- Belgium ---
    'belgium':                      'belgium',
    'bel':                          'belgium',
    'be':                           'belgium',
};

/**
 * Reverse lookup: canonical region_id → display name
 */
const REGION_DISPLAY_NAMES = {
    'china':            'China',
    'united_states':    'United States',
    'russia':           'Russia',
    'saudi_arabia':     'Saudi Arabia',
    'india':            'India',
    'germany':          'Germany',
    'japan':            'Japan',
    'united_kingdom':   'United Kingdom',
    'france':           'France',
    'australia':        'Australia',
    'canada':           'Canada',
    'brazil':           'Brazil',
    'south_korea':      'South Korea',
    'middle_east':      'Middle East',
    'iran':             'Iran',
    'iraq':             'Iraq',
    'ukraine':          'Ukraine',
    'turkey':           'Turkey',
    'uae':              'United Arab Emirates',
    'nigeria':          'Nigeria',
    'south_africa':     'South Africa',
    'egypt':            'Egypt',
    'mexico':           'Mexico',
    'indonesia':        'Indonesia',
    'venezuela':        'Venezuela',
    'colombia':         'Colombia',
    'argentina':        'Argentina',
    'kazakhstan':       'Kazakhstan',
    'european_union':   'European Union',
    'italy':            'Italy',
    'spain':            'Spain',
    'poland':           'Poland',
    'norway':           'Norway',
    'sweden':           'Sweden',
    'netherlands':      'Netherlands',
    'malaysia':         'Malaysia',
    'thailand':         'Thailand',
    'vietnam':          'Vietnam',
    'pakistan':          'Pakistan',
    'kuwait':           'Kuwait',
    'qatar':            'Qatar',
    'libya':            'Libya',
    'algeria':          'Algeria',
    'angola':           'Angola',
    'chile':            'Chile',
    'peru':             'Peru',
    'finland':          'Finland',
    'belgium':          'Belgium',
};

/**
 * Normalize a raw country/region input to a canonical, Firebase-safe region_id.
 *
 * @param {string} rawInput - Raw country name, ISO code, or alias
 * @returns {{ region_id: string, region_name: string, was_alias: boolean }}
 */
function normalizeRegion(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
        console.error('[REGION_NORMALIZER] Received empty/null region input');
        return { region_id: null, region_name: null, was_alias: false };
    }

    const cleaned = rawInput
        .trim()
        .toLowerCase()
        .replace(/['']/g, "'");    // Normalize smart quotes

    console.log(`[REGION_NORMALIZER] Raw input: "${rawInput}" → cleaned: "${cleaned}"`);

    // 1. Direct alias lookup
    if (REGION_ALIASES[cleaned]) {
        const regionId = REGION_ALIASES[cleaned];
        const regionName = REGION_DISPLAY_NAMES[regionId] || rawInput.trim();
        console.log(`[REGION_NORMALIZER] Alias match: "${cleaned}" → region_id="${regionId}", display="${regionName}"`);
        return { region_id: regionId, region_name: regionName, was_alias: true };
    }

    // 2. Fallback: generate a Firebase-safe region_id from the input
    const fallbackId = cleaned
        .replace(/[.#$\[\]\/]/g, '')    // Remove Firebase-unsafe chars
        .replace(/\s+/g, '_')           // Spaces → underscores
        .replace(/_+/g, '_')            // Collapse multiple underscores
        .replace(/^_|_$/g, '');          // Trim leading/trailing underscores

    console.log(`[REGION_NORMALIZER] No alias found — fallback region_id="${fallbackId}"`);
    return {
        region_id: fallbackId,
        region_name: rawInput.trim(),
        was_alias: false
    };
}

module.exports = { normalizeRegion, REGION_ALIASES, REGION_DISPLAY_NAMES };
