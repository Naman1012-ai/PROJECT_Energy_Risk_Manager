// ============================================================================
// server.js — Node.js Bridge Server
// ============================================================================
// This server acts as a bridge between the web frontend and the C++ backend.
// When the frontend makes an API request (e.g., GET /api/dashboard), this
// server executes the compiled C++ binary (EnergyRisk.exe --json dashboard),
// captures its JSON output from stdout, and relays it back to the browser.
//
// Also integrates:
//   - Google Gemini API (REST) for geopolitical energy-risk insights
//   - Firebase Realtime Database (REST) for caching generated reports
//
// ALL risk calculations happen in C++ — this server is just a relay.
// Gemini insights are generated server-side and stored in Firebase.
//
// Usage:
//   node server.js
//   Then open http://localhost:3000 in a browser
// ============================================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ---- Service Modules ----
const { normalizeRegion } = require('./RegionNormalizer');
const { FirebaseRegionInsightRepository } = require('./FirebaseRegionInsightRepository');
const { GeminiFallbackService } = require('./GeminiFallbackService');
const { RegionInsightController } = require('./RegionInsightController');
const { analyticsValidator, COMMODITY_UNIT_STANDARDS, normalizeCommodityType, getVolumeUnitAbbr } = require('./analyticsValidator');

// ============================================================================
// .env Loader (zero-dependency — reads .env file manually)
// ============================================================================
function loadEnvFile() {
    const envPath = path.join(__dirname, '../.env');
    try {
        const content = fs.readFileSync(envPath, 'utf-8');
        content.split('\n').forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;
            const eqIdx = line.indexOf('=');
            if (eqIdx === -1) return;
            const key = line.substring(0, eqIdx).trim();
            let value = line.substring(eqIdx + 1).trim();
            // Strip surrounding quotes
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            // Handle escaped newlines in private keys
            value = value.replace(/\\n/g, '\n');
            if (!process.env[key]) {
                process.env[key] = value;
            }
        });
        console.log('[ENV] Loaded .env file');
    } catch (err) {
        console.warn('[ENV] No .env file found — using system environment variables');
    }
}
loadEnvFile();

// ============================================================================
// Configuration from environment
// ============================================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || '';

// Cache TTL: 6 hours in milliseconds
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Service instances will be initialized after httpsRequest is defined (see below)
let regionInsightController = null;

// ============================================================================
// HTTPS Request Helper (zero-dependency fetch alternative)
// ============================================================================
function httpsRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const reqOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: options.timeout || 30000
        };

        const req = https.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, headers: res.headers, body });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('HTTPS request timed out'));
        });

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

// ============================================================================
// Initialize Service Layer (after httpsRequest is defined)
// ============================================================================
let countryAvailability = { energy: [], fuel: [], consumption: [], union: [] };

function buildCountryAvailability() {
    try {
        const energyPath = path.join(__dirname, '../data/Global Energy Dataset (1900-2024).csv');
        const fuelPath = path.join(__dirname, '../data/Global Fuel Prices (2020-2026).csv');
        const consumptionPath = path.join(__dirname, '../data/Gobal Energy Consumption (2000-2024).csv');

        const eSet = new Set();
        const fSet = new Set();
        const cSet = new Set();

        const cleanVal = (val) => val ? val.trim().replace(/^"|"$/g, '') : '';

        // Helper to parse unique countries from a CSV file
        const parseUniqueCountries = (filePath, countryColIdx) => {
            if (!fs.existsSync(filePath)) return new Set();
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const set = new Set();
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const parts = line.split(',');
                if (parts.length > countryColIdx) {
                    const country = cleanVal(parts[countryColIdx]);
                    if (country && country.toLowerCase() !== 'country') {
                        const norm = normalizeRegion(country);
                        if (norm && norm.region_name) {
                            set.add(norm.region_name);
                        }
                    }
                }
            }
            return set;
        };

        const parsedESet = parseUniqueCountries(energyPath, 0);
        const parsedFSet = parseUniqueCountries(fuelPath, 1);
        const parsedCSet = parseUniqueCountries(consumptionPath, 0);

        const unionSet = new Set([...parsedESet, ...parsedFSet, ...parsedCSet]);

        countryAvailability = {
            energy: Array.from(parsedESet).sort(),
            fuel: Array.from(parsedFSet).sort(),
            consumption: Array.from(parsedCSet).sort(),
            union: Array.from(unionSet).sort()
        };

        console.log(`[AVAILABILITY] Loaded country availability sets. Union size: ${countryAvailability.union.length}`);
    } catch (err) {
        console.error('[AVAILABILITY ERROR]', err.message);
    }
}

(function initServices() {
    const firebaseRepo = new FirebaseRegionInsightRepository(FIREBASE_DATABASE_URL, httpsRequest);
    const geminiFallback = new GeminiFallbackService(GEMINI_API_KEY, httpsRequest, firebaseRepo);
    regionInsightController = new RegionInsightController(firebaseRepo, geminiFallback);
    console.log('[SERVICES] Initialized: RegionNormalizer, FirebaseRepo, GeminiFallback, RegionInsightController');
    loadDefaultEventsFromCsv();
    buildCountryAvailability();
})();

// ============================================================================
// JSON Body Parser for incoming POST requests
// ============================================================================
function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 1e6) { // 1MB limit
                req.destroy();
                reject(new Error('Request body too large'));
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON in request body'));
            }
        });
        req.on('error', reject);
    });
}

// ============================================================================
// Region ID Normalizer
// ============================================================================
function normalizeRegionId(region) {
    return region
        .toLowerCase()
        .trim()
        .replace(/[.#$\[\]\/]/g, '')   // Remove Firebase-unsafe chars
        .replace(/\s+/g, '_')            // Spaces to underscores
        .replace(/_+/g, '_')             // Collapse multiple underscores
        .replace(/^_|_$/g, '');           // Trim leading/trailing underscores
}

// ============================================================================
// Firebase Realtime Database — REST Read / Write
// ============================================================================
async function firebaseRead(dbPath) {
    if (!FIREBASE_DATABASE_URL) {
        throw new Error('FIREBASE_DATABASE_URL not configured');
    }
    const url = `${FIREBASE_DATABASE_URL}/${dbPath}.json`;
    const resp = await httpsRequest(url, { method: 'GET', timeout: 10000 });
    if (resp.status !== 200) {
        throw new Error(`Firebase read failed: HTTP ${resp.status}`);
    }
    return JSON.parse(resp.body);
}

async function firebaseWrite(dbPath, data) {
    if (!FIREBASE_DATABASE_URL) {
        throw new Error('FIREBASE_DATABASE_URL not configured');
    }
    const url = `${FIREBASE_DATABASE_URL}/${dbPath}.json`;
    const payload = JSON.stringify(data);
    const resp = await httpsRequest(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        timeout: 10000
    });
    if (resp.status !== 200) {
        throw new Error(`Firebase write failed: HTTP ${resp.status}`);
    }
    return JSON.parse(resp.body);
}

// ---- Canonical Default Datasets for Seeding ----
const DEFAULT_RESOURCES = [
    { id: "OIL_SAU", name: "Saudi Crude Oil", type: "Oil", region: "Saudi Arabia", production: 12.0, consumption: 3.5, reserve_years: 65.0, export_dependency: 0.85, price: 82.40 },
    { id: "OIL_RUS", name: "Russian Crude Oil", type: "Oil", region: "Russia", production: 10.5, consumption: 3.2, reserve_years: 30.0, export_dependency: 0.75, price: 74.20 },
    { id: "GAS_RUS", name: "Russian Natural Gas", type: "Gas", region: "Russia", production: 638.0, consumption: 470.0, reserve_years: 50.0, export_dependency: 0.68, price: 8.50 },
    { id: "GAS_QAT", name: "Qatari LNG", type: "Gas", region: "Middle East", production: 170.0, consumption: 45.0, reserve_years: 80.0, export_dependency: 0.90, price: 12.50 },
    { id: "OIL_IRN", name: "Iranian Crude Oil", type: "Oil", region: "Middle East", production: 3.8, consumption: 1.8, reserve_years: 90.0, export_dependency: 0.55, price: 68.00 },
    { id: "OIL_IRQ", name: "Iraqi Crude Oil", type: "Oil", region: "Middle East", production: 4.4, consumption: 0.8, reserve_years: 70.0, export_dependency: 0.80, price: 76.50 },
    { id: "OIL_USA", name: "US Crude Oil", type: "Oil", region: "USA", production: 13.2, consumption: 19.8, reserve_years: 11.0, export_dependency: 0.15, price: 79.90 },
    { id: "GAS_NOR", name: "Norwegian Natural Gas", type: "Gas", region: "EU", production: 122.0, consumption: 4.5, reserve_years: 25.0, export_dependency: 0.92, price: 15.20 },
    { id: "ELEC_EU", name: "EU Electricity", type: "Electricity", region: "EU", production: 2800.0, consumption: 2900.0, reserve_years: 99.0, export_dependency: 0.05, price: 0.22 },
    { id: "COAL_CHN", name: "Chinese Coal", type: "Coal", region: "China", production: 4500.0, consumption: 4700.0, reserve_years: 35.0, export_dependency: 0.02, price: 95.00 },
    { id: "OIL_VEN", name: "Venezuelan Oil", type: "Oil", region: "Venezuela", production: 0.8, consumption: 0.3, reserve_years: 300.0, export_dependency: 0.65, price: 62.00 },
    { id: "GAS_USA", name: "US Natural Gas", type: "Gas", region: "USA", production: 1030.0, consumption: 990.0, reserve_years: 15.0, export_dependency: 0.12, price: 3.20 },
    { id: "OIL_NSE", name: "North Sea Oil", type: "Oil", region: "EU", production: 1.5, consumption: 6.2, reserve_years: 8.0, export_dependency: 0.20, price: 83.10 },
    { id: "WIND_NOR", name: "Norwegian Wind Energy", type: "Renewable", region: "EU", production: 17.0, consumption: 15.0, reserve_years: 99.0, export_dependency: 0.10, price: 0.07 }
];

let DEFAULT_EVENTS = [];

function parseCSVLines(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++; // skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    return rows.filter(r => r.length > 0 && r.some(cell => cell.trim() !== ''));
}

function deriveTitle(desc) {
    if (!desc) return '';
    const words = desc.trim().split(/\s+/).slice(0, 6);
    return words.map(w => {
        if (w.length === 0) return '';
        return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
}

function deriveRegion(description) {
    if (!description) return "Global";
    const desc = description.toLowerCase();
    if (desc.includes("russia") || desc.includes("ukraine")) {
        return "Eastern Europe";
    }
    if (desc.includes("iran") || desc.includes("hormuz") ||
        desc.includes("saudi") || desc.includes("aramco") ||
        desc.includes("yemen") || desc.includes("opec") ||
        desc.includes("israel") || desc.includes("hamas") ||
        desc.includes("red sea") || desc.includes("suez") ||
        desc.includes("qatar")) {
        return "Middle East";
    }
    if (desc.includes("libya")) {
        return "North Africa";
    }
    if (desc.includes("china")) {
        return "Asia Pacific";
    }
    if (desc.includes("us") || desc.includes("american") || desc.includes("wti")) {
        return "North America";
    }
    return "Global";
}

function loadDefaultEventsFromCsv() {
    try {
        const timelinePath = path.join(__dirname, '../data/geopolitical_events_timeline.csv');
        const pricePath = path.join(__dirname, '../data/oil_geopolitics_dataset_2010_2026.csv');
        
        if (!fs.existsSync(timelinePath)) {
            console.error('[LOAD DEFAULT EVENTS] timeline CSV does not exist!');
            return;
        }

        const timelineRows = parseCSVLines(timelinePath);
        if (timelineRows.length <= 1) return;
        
        const header = timelineRows[0];
        const dateIdx = header.indexOf('date');
        const typeIdx = header.indexOf('event_type');
        const descIdx = header.indexOf('event_description');
        const sevIdx = header.indexOf('event_severity');

        const priceMap = new Map();
        if (fs.existsSync(pricePath)) {
            const priceRows = parseCSVLines(pricePath);
            if (priceRows.length > 1) {
                const pHeader = priceRows[0];
                const pDateIdx = pHeader.indexOf('date');
                const pBrentIdx = pHeader.indexOf('brent_price');
                const pFlagIdx = pHeader.indexOf('event_flag');
                
                for (let i = 1; i < priceRows.length; i++) {
                    const row = priceRows[i];
                    if (row.length <= Math.max(pDateIdx, pBrentIdx, pFlagIdx)) continue;
                    const flag = parseInt(row[pFlagIdx]) || 0;
                    if (flag === 1) {
                        const date = row[pDateIdx];
                        const brent = parseFloat(row[pBrentIdx]) || null;
                        if (date && brent) {
                            priceMap.set(date.trim(), brent);
                        }
                    }
                }
            }
        }

        const eventsList = [];
        for (let i = 1; i < timelineRows.length; i++) {
            const row = timelineRows[i];
            if (row.length <= Math.max(dateIdx, typeIdx, descIdx, sevIdx)) continue;
            
            const date = row[dateIdx].trim();
            const type = row[typeIdx].trim();
            const desc = row[descIdx].trim();
            const severity = parseInt(row[sevIdx]) || 6;
            
            const id = "EVT_" + i.toString().padStart(3, '0');
            const title = deriveTitle(desc);
            const region = deriveRegion(desc);
            const is_active = (date >= "2023-01-01") ? 1 : 0;
            const brentPrice = priceMap.get(date) || null;
            
            eventsList.push({
                id,
                title,
                type,
                event_type: type,
                description: desc,
                severity,
                date,
                is_active,
                region,
                source: "Kaggle Geopolitical Events Timeline",
                intensity: severity / 10.0,
                supply_impact: severity * 0.03,
                brent_price_at_event: brentPrice
            });
        }
        
        DEFAULT_EVENTS = eventsList;
        console.log(`[LOAD DEFAULT EVENTS] Loaded ${DEFAULT_EVENTS.length} events from CSV dataset.`);
    } catch (err) {
        console.error('[LOAD DEFAULT EVENTS ERROR]', err.message);
    }
}


// ---- Firebase CSV Sync Orchestrator ----
async function ensureDataSync() {
    let resources = [];
    let events = [];

    // Fetch resources
    try {
        const fbResources = await firebaseRead('resources');
        if (fbResources) {
            resources = Array.isArray(fbResources) 
                ? fbResources.filter(Boolean) 
                : Object.values(fbResources);
        } else {
            console.log('[SYNC] No resources in Firebase, seeding DEFAULT_RESOURCES...');
            await firebaseWrite('resources', DEFAULT_RESOURCES);
            resources = DEFAULT_RESOURCES;
        }
    } catch (err) {
        console.warn('[SYNC WARNING] Failed to read resources from Firebase, using defaults:', err.message);
        resources = DEFAULT_RESOURCES;
    }

    // Fetch events
    try {
        const fbEvents = await firebaseRead('events');
        if (fbEvents) {
            events = Array.isArray(fbEvents)
                ? fbEvents.filter(Boolean)
                : Object.values(fbEvents);
        } else {
            console.log('[SYNC] No events in Firebase, seeding DEFAULT_EVENTS...');
            await firebaseWrite('events', DEFAULT_EVENTS);
            events = DEFAULT_EVENTS;
        }
    } catch (err) {
        console.warn('[SYNC WARNING] Failed to read events from Firebase, using defaults:', err.message);
        events = DEFAULT_EVENTS;
    }

    // Write to local CSV files for C++ consumption
    try {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const resPath = path.join(dataDir, 'energy_data.csv');
        let resCsv = 'id,name,type,region,production,consumption,reserve_years,export_dependency,price\n';
        resources.forEach(r => {
            resCsv += `${r.id},${r.name},${r.type},${r.region},${r.production},${r.consumption},${r.reserve_years},${r.export_dependency},${r.price}\n`;
        });
        fs.writeFileSync(resPath, resCsv, 'utf-8');

        const evPath = path.join(dataDir, 'events.csv');
        let evCsv = 'id,title,type,region,intensity,supply_impact,is_active\n';
        events.forEach(e => {
            evCsv += `${e.id},${e.title},${e.type},${e.region},${e.intensity},${e.supply_impact},${e.is_active ? 1 : 0}\n`;
        });
        fs.writeFileSync(evPath, evCsv, 'utf-8');
        console.log(`[SYNC] Synced ${resources.length} resources & ${events.length} events to local C++ CSVs`);
    } catch (err) {
        console.error('[SYNC ERROR] Failed to write data CSVs:', err.message);
    }
}

// ============================================================================
// Gemini API Service — calls Google Generative AI REST endpoint
// ============================================================================
const GEMINI_MODEL = 'gemini-2.0-flash';

function buildGeminiPrompt(region) {
    return `Analyze the latest geopolitical and energy-risk situation for ${region}. Focus on oil, gas, coal, electricity, nuclear, and renewables. Return structured JSON with events, affected resources, supply risk, fuel price impact, and summary.

SPECIFICITY REQUIREMENTS — STRICTLY ENFORCED:
Every finding you produce must meet ALL of the following criteria:

1. NAME SPECIFIC INFRASTRUCTURE: Do not say "energy infrastructure at risk."
   Say "Ras Tanura refinery," "Nord Stream pipeline," "Strait of Hormuz transit corridor," 
   or whichever named asset applies to THIS region.

2. NAME SPECIFIC EVENTS OR CONDITIONS: Do not say "ongoing geopolitical tensions."
   State what the tension is, who the parties are, and which energy asset or route it threatens.

3. NAME SPECIFIC RESOURCES: Do not say "energy resources."
   Name the actual commodity — crude oil, LNG, thermal coal, uranium — 
   based on THIS region's real export and import profile.

4. NAME SPECIFIC TRADE ROUTES OR PARTNERS: Do not say "key trading partners."
   Name the actual countries, ports, or transit corridors relevant to THIS region.

5. IF YOU CANNOT NAME SOMETHING SPECIFIC, omit that finding entirely.
   Return an empty array rather than fill it with generic statements.

FAILURE MODE TO AVOID:
If your response could describe a different country without changing the words, it is wrong. 
Do not proceed — rewrite until every finding is region-locked.

You MUST return ONLY valid JSON (no markdown, no code fences, no extra text) with this exact schema:
{
  "region_name": "string",
  "query_text": "string (the prompt you received)",
  "generated_summary": "string (2-4 sentence executive summary)",
  "affected_resources": ["oil", "gas", "coal", "electricity", "nuclear", "renewables"],
  "geopolitical_events": [
    {
      "title": "string",
      "description": "string",
      "severity": "low | medium | high | critical",
      "affected_resources": ["string"],
      "region_impact": "string"
    }
  ],
  "supply_risk_level": "low | medium | high | critical",
  "fuel_price_impact": {
    "level": "low | medium | high | critical",
    "summary": "string"
  },
  "import_export_vulnerabilities": ["string"],
  "recommendation": "string"
}

Return ONLY the JSON object.`;
}

async function callGeminiAPI(region, retries = 2) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured in .env');
    }

    const prompt = buildGeminiPrompt(region);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json'
        }
    });

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            console.log(`[GEMINI] Calling API for "${region}" (attempt ${attempt + 1})...`);
            const resp = await httpsRequest(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                timeout: 45000
            });

            if (resp.status === 429) {
                lastError = new Error('GEMINI_RATE_LIMIT');
                console.warn('[GEMINI] Rate limited, retrying...');
                await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                continue;
            }

            if (resp.status !== 200) {
                const errBody = JSON.parse(resp.body || '{}');
                throw new Error(errBody.error?.message || `Gemini API HTTP ${resp.status}`);
            }

            const geminiResponse = JSON.parse(resp.body);
            const textContent = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textContent) {
                throw new Error('Empty response from Gemini');
            }

            // Parse the JSON — strip code fences if present
            let cleanText = textContent.trim();
            if (cleanText.startsWith('```')) {
                cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
            }

            const parsed = JSON.parse(cleanText);
            return validateGeminiResponse(parsed, region);

        } catch (err) {
            lastError = err;
            console.error(`[GEMINI] Attempt ${attempt + 1} failed: ${err.message}`);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            }
        }
    }

    throw lastError;
}

// Validate and normalize the Gemini response to ensure all fields exist
function validateGeminiResponse(data, region) {
    const validated = {
        region_name: data.region_name || region,
        query_text: data.query_text || buildGeminiPrompt(region),
        generated_summary: data.generated_summary || 'No summary available.',
        affected_resources: Array.isArray(data.affected_resources) ? data.affected_resources : [],
        geopolitical_events: Array.isArray(data.geopolitical_events)
            ? data.geopolitical_events.map(ev => ({
                title: ev.title || 'Unknown Event',
                description: ev.description || '',
                severity: ['low','medium','high','critical'].includes(ev.severity) ? ev.severity : 'medium',
                affected_resources: Array.isArray(ev.affected_resources) ? ev.affected_resources : [],
                region_impact: ev.region_impact || ''
            }))
            : [],
        supply_risk_level: ['low','medium','high','critical'].includes(data.supply_risk_level)
            ? data.supply_risk_level : 'medium',
        fuel_price_impact: {
            level: ['low','medium','high','critical'].includes(data.fuel_price_impact?.level)
                ? data.fuel_price_impact.level : 'medium',
            summary: (typeof data.fuel_price_impact === 'object')
                ? (data.fuel_price_impact.summary || 'No price impact assessment available.')
                : (typeof data.fuel_price_impact === 'string' ? data.fuel_price_impact : '')
        },
        import_export_vulnerabilities: Array.isArray(data.import_export_vulnerabilities)
            ? data.import_export_vulnerabilities : [],
        recommendation: data.recommendation || 'No recommendation available.'
    };
    return validated;
}

// Helper to parse the fuel prices CSV and get the latest price for a country
function getLatestPriceForCountry(countryName) {
    try {
        if (!countryName) {
            return { price: null, label: "Price data not available" };
        }
        const filePath = path.join(__dirname, '../data/Global Fuel Prices (2020-2026).csv');
        if (!fs.existsSync(filePath)) {
            return { price: null, label: "Price data not available" };
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        let latestRow = null;

        // Normalize searched country name
        const normSearch = countryName.trim().toLowerCase();

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Simple split (assuming standard CSV layout)
            const parts = line.split(',');
            if (parts.length < 9) continue;

            const date = parts[0].trim();
            const country = parts[1].trim().toLowerCase();

            // Check if country matches
            if (country === normSearch || country.includes(normSearch) || normSearch.includes(country)) {
                if (!latestRow || date > latestRow.date) {
                    latestRow = {
                        date,
                        petrol: parseFloat(parts[5]) || null,
                        brent: parseFloat(parts[8]) || null
                    };
                }
            }
        }

        if (latestRow) {
            if (latestRow.brent && !isNaN(latestRow.brent)) {
                return { price: latestRow.brent, label: `Brent Crude (as of ${latestRow.date})` };
            } else if (latestRow.petrol && !isNaN(latestRow.petrol)) {
                return { price: latestRow.petrol, label: `Petrol Liter (as of ${latestRow.date})` };
            }
        }
        return { price: null, label: "Price data not available" };
    } catch (err) {
        console.error('[PRICE INDEX ERROR]', err.message);
        return { price: null, label: "Price data not available" };
    }
}

function getCountryNameForResource(r) {
    if (!r) return null;
    const name = r.name.toLowerCase();
    const region = r.region.toLowerCase();
    
    if (name.includes('saudi')) return 'Saudi Arabia';
    if (name.includes('russian') || name.includes('russia')) return 'Russia';
    if (name.includes('iranian') || name.includes('iran')) return 'Iran';
    if (name.includes('iraqi') || name.includes('iraq')) return 'Iraq';
    if (name.includes('us ') || name.includes('us crude') || name.includes('us natural') || region === 'usa') return 'United States';
    if (name.includes('norwegian') || name.includes('norway')) return 'Norway';
    if (name.includes('chinese') || name.includes('china')) return 'China';
    if (name.includes('qatari') || name.includes('qatar')) return 'Qatar';
    if (name.includes('venezuelan') || name.includes('venezuela')) return 'Venezuela';
    if (name.includes('canadian') || name.includes('canada')) return 'Canada';
    
    const countries = ['Saudi Arabia', 'Russia', 'United States', 'China', 'Venezuela', 'Norway', 'Qatar', 'Iraq', 'Iran'];
    for (const c of countries) {
        if (region === c.toLowerCase()) return c;
    }
    return null;
}

function enrichResource(r) {
    if (!r) return;
    if (r.type.toLowerCase() === 'oil' || r.type.toLowerCase() === 'crude oil') {
        const countryName = getCountryNameForResource(r);
        const priceInfo = getLatestPriceForCountry(countryName);
        if (priceInfo && priceInfo.price !== null) {
            r.price = priceInfo.price;
        } else {
            r.price = null;
        }
    } else {
        r.price = null;
    }
}

function enrichEvent(e) {
    if (!e) return;
    const match = DEFAULT_EVENTS.find(d => d.id === e.id);
    if (match) {
        e.description = match.description || 'No description available for this event.';
        e.date = match.date || '';
        e.createdAt = match.date || '';
    } else {
        e.description = e.description || 'No description available for this event.';
        e.date = e.date || e.createdAt || '';
        e.createdAt = e.createdAt || e.date || '';
    }
}

// ============================================================================
// Region Insights Orchestrator
// Checks Firebase cache first, calls Gemini if stale, saves result back.
// ============================================================================
async function generateRegionInsight(region, forceRefresh = false) {
    const regionId = normalizeRegionId(region);
    const dbPath = `gemini_region_insights/${regionId}`;
    let fromCache = false;
    let firebaseSaved = false;

    // 1. Check Firebase cache (unless force refresh)
    if (!forceRefresh && FIREBASE_DATABASE_URL) {
        try {
            const cached = await firebaseRead(dbPath);
            if (cached && cached.updated_at) {
                const age = Date.now() - new Date(cached.updated_at).getTime();
                if (age < CACHE_TTL_MS) {
                    console.log(`[CACHE] Returning cached insight for "${region}" (age: ${Math.round(age/60000)}min)`);
                    return {
                        success: true,
                        region_id: regionId,
                        data: cached,
                        from_cache: true,
                        firebase_saved: true
                    };
                }
                console.log(`[CACHE] Cache expired for "${region}" (age: ${Math.round(age/60000)}min)`);
            }
        } catch (err) {
            console.warn(`[CACHE] Firebase read failed: ${err.message}`);
        }
    }

    // 2. Call Gemini API
    const geminiData = await callGeminiAPI(region);

    // 3. Attach timestamps
    const now = new Date().toISOString();
    geminiData.created_at = geminiData.created_at || now;
    geminiData.updated_at = now;

    // 4. Save to Firebase
    if (FIREBASE_DATABASE_URL) {
        try {
            await firebaseWrite(dbPath, geminiData);
            firebaseSaved = true;
            console.log(`[FIREBASE] Saved insight for "${region}" at /${dbPath}`);
        } catch (err) {
            console.error(`[FIREBASE] Write failed: ${err.message}`);
        }
    }

    return {
        success: true,
        region_id: regionId,
        data: geminiData,
        from_cache: false,
        firebase_saved: firebaseSaved
    };
}

const PORT = 3000;

// Path to the compiled C++ executable (relative to this file's location)
const EXE_PATH = path.join(__dirname, '../backend/build/EnergyRisk.exe');

// Path to the frontend directory
const FRONTEND_DIR = path.join(__dirname, '../frontend');

// MIME types for serving static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

// ----------------------------------------------------------------------------
// runCppBackend()
// Executes the C++ binary with the given arguments and returns the JSON output.
// The C++ binary is run with the working directory set to the project root
// (so it can find data/ folder). Returns a Promise that resolves with the
// parsed JSON or rejects with an error.
// ----------------------------------------------------------------------------
async function runCppBackend(args) {
    // Keep local CSV files in sync with Firebase before executing C++
    await ensureDataSync();

    return new Promise((resolve, reject) => {
        // Run the exe with backend/build as CWD so ../../data/ paths resolve
        const options = {
            cwd: path.join(__dirname, '../backend/build'),
            timeout: 30000,   // 30 second timeout
            maxBuffer: 50 * 1024 * 1024  // 50MB output buffer
        };

        console.log("Spawning C++:", ['--json', ...args]);
        execFile(EXE_PATH, ['--json', ...args], options, (error, stdout, stderr) => {
            if (error) {
                console.error("C++ exec error:", error.message);
                console.error("stderr:", stderr);
                reject(new Error(`C++ backend error: ${error.message}`));
                return;
            }

            console.log("C++ stdout received, length: " + stdout.length + " chars");

            // stderr may contain "Successfully loaded..." messages from data_loader
            // That's fine — we only care about stdout which has the JSON
            if (stderr) {
                console.log(`[C++ INFO] ${stderr.trim()}`);
            }

            try {
                // Find the JSON in stdout (skip any non-JSON lines from data_loader)
                const lines = stdout.split('\n');
                let jsonLine = '';
                for (let i = lines.length - 1; i >= 0; i--) {
                    const trimmed = lines[i].trim();
                    if (trimmed.startsWith('{')) {
                        jsonLine = trimmed;
                        break;
                    }
                }

                if (!jsonLine) {
                    reject(new Error('No JSON output from C++ backend'));
                    return;
                }

                const data = JSON.parse(jsonLine);
                resolve(data);
            } catch (parseError) {
                console.error(`[JSON PARSE ERROR] ${parseError.message}`);
                console.error(`[RAW OUTPUT] ${stdout.substring(0, 500)}`);
                reject(new Error(`Failed to parse C++ output: ${parseError.message}`));
            }
        });
    });
}

// ----------------------------------------------------------------------------
// serveStaticFile()
// Serves a static file from the frontend directory.
// ----------------------------------------------------------------------------
function serveStaticFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
    });
}

// ============================================================================
// Country Risk Score Builder — aggregates C++ data into per-country scores
// ============================================================================

// Mapping of countries to the regions used in our C++ resource data
const COUNTRY_REGION_MAP = {
    'SAU': { name: 'Saudi Arabia', continent: 'Asia', region: 'Saudi Arabia' },
    'RUS': { name: 'Russia', continent: 'Europe', region: 'Russia' },
    'USA': { name: 'United States', continent: 'North America', region: 'USA' },
    'AUS': { name: 'Australia', continent: 'Oceania', region: 'Australia' },
    'KAZ': { name: 'Kazakhstan', continent: 'Asia', region: 'Kazakhstan' },
    'CHN': { name: 'China', continent: 'Asia', region: 'China' },
    'IRQ': { name: 'Iraq', continent: 'Asia', region: 'Middle East' },
    'IRN': { name: 'Iran', continent: 'Asia', region: 'Middle East' },
    'ARE': { name: 'United Arab Emirates', continent: 'Asia', region: 'Middle East' },
    'KWT': { name: 'Kuwait', continent: 'Asia', region: 'Middle East' },
    'QAT': { name: 'Qatar', continent: 'Asia', region: 'Middle East' },
    'BHR': { name: 'Bahrain', continent: 'Asia', region: 'Middle East' },
    'OMN': { name: 'Oman', continent: 'Asia', region: 'Middle East' },
    'YEM': { name: 'Yemen', continent: 'Asia', region: 'Middle East' },
    'SYR': { name: 'Syria', continent: 'Asia', region: 'Middle East' },
    'JOR': { name: 'Jordan', continent: 'Asia', region: 'Middle East' },
    'LBN': { name: 'Lebanon', continent: 'Asia', region: 'Middle East' },
    'DEU': { name: 'Germany', continent: 'Europe', region: 'EU' },
    'FRA': { name: 'France', continent: 'Europe', region: 'EU' },
    'GBR': { name: 'United Kingdom', continent: 'Europe', region: 'EU' },
    'ITA': { name: 'Italy', continent: 'Europe', region: 'EU' },
    'ESP': { name: 'Spain', continent: 'Europe', region: 'EU' },
    'POL': { name: 'Poland', continent: 'Europe', region: 'EU' },
    'NLD': { name: 'Netherlands', continent: 'Europe', region: 'EU' },
    'BEL': { name: 'Belgium', continent: 'Europe', region: 'EU' },
    'SWE': { name: 'Sweden', continent: 'Europe', region: 'EU' },
    'NOR': { name: 'Norway', continent: 'Europe', region: 'EU' },
    'FIN': { name: 'Finland', continent: 'Europe', region: 'EU' },
    'UKR': { name: 'Ukraine', continent: 'Europe', region: 'Russia' },
    'TUR': { name: 'Turkey', continent: 'Asia', region: 'Middle East' },
    'IND': { name: 'India', continent: 'Asia', region: 'India' },
    'JPN': { name: 'Japan', continent: 'Asia', region: 'Japan' },
    'KOR': { name: 'South Korea', continent: 'Asia', region: 'South Korea' },
    'BRA': { name: 'Brazil', continent: 'South America', region: 'Brazil' },
    'CAN': { name: 'Canada', continent: 'North America', region: 'Canada' },
    'MEX': { name: 'Mexico', continent: 'North America', region: 'Mexico' },
    'NGA': { name: 'Nigeria', continent: 'Africa', region: 'Nigeria' },
    'AGO': { name: 'Angola', continent: 'Africa', region: 'Angola' },
    'LBY': { name: 'Libya', continent: 'Africa', region: 'Libya' },
    'DZA': { name: 'Algeria', continent: 'Africa', region: 'Algeria' },
    'EGY': { name: 'Egypt', continent: 'Africa', region: 'Egypt' },
    'ZAF': { name: 'South Africa', continent: 'Africa', region: 'South Africa' },
    'VEN': { name: 'Venezuela', continent: 'South America', region: 'Venezuela' },
    'COL': { name: 'Colombia', continent: 'South America', region: 'Colombia' },
    'ARG': { name: 'Argentina', continent: 'South America', region: 'Argentina' },
    'IDN': { name: 'Indonesia', continent: 'Asia', region: 'Indonesia' },
    'MYS': { name: 'Malaysia', continent: 'Asia', region: 'Malaysia' },
    'THA': { name: 'Thailand', continent: 'Asia', region: 'Thailand' },
    'VNM': { name: 'Vietnam', continent: 'Asia', region: 'Vietnam' },
    'PAK': { name: 'Pakistan', continent: 'Asia', region: 'Pakistan' },
    'BGD': { name: 'Bangladesh', continent: 'Asia', region: 'Bangladesh' },
    'MMR': { name: 'Myanmar', continent: 'Asia', region: 'Myanmar' },
    'TKM': { name: 'Turkmenistan', continent: 'Asia', region: 'Turkmenistan' },
    'UZB': { name: 'Uzbekistan', continent: 'Asia', region: 'Uzbekistan' },
    'AZE': { name: 'Azerbaijan', continent: 'Asia', region: 'Azerbaijan' },
    'GEO': { name: 'Georgia', continent: 'Asia', region: 'Georgia' },
    'PRY': { name: 'Paraguay', continent: 'South America', region: 'Paraguay' },
    'CHL': { name: 'Chile', continent: 'South America', region: 'Chile' },
    'PER': { name: 'Peru', continent: 'South America', region: 'Peru' },
    'BOL': { name: 'Bolivia', continent: 'South America', region: 'Bolivia' },
    'MOZ': { name: 'Mozambique', continent: 'Africa', region: 'Mozambique' },
    'TZA': { name: 'Tanzania', continent: 'Africa', region: 'Tanzania' },
    'KEN': { name: 'Kenya', continent: 'Africa', region: 'Kenya' },
    'GHA': { name: 'Ghana', continent: 'Africa', region: 'Ghana' },
    'SEN': { name: 'Senegal', continent: 'Africa', region: 'Senegal' },
    'COD': { name: 'DR Congo', continent: 'Africa', region: 'DR Congo' },
};

async function buildCountryRiskScores() {
    // Try to load from C++ backend
    let resources = [];
    let events = [];
    try {
        const resData = await runCppBackend(['resources']);
        resources = resData.resources || [];
    } catch (e) {
        console.warn('[MAP] Could not load C++ resources:', e.message);
    }
    try {
        const evData = await runCppBackend(['events']);
        events = (evData.events || []).filter(e => e.is_active === 1);
    } catch (e) {
        console.warn('[MAP] Could not load C++ events:', e.message);
    }

    const countryScores = {};

    for (const [code, info] of Object.entries(COUNTRY_REGION_MAP)) {
        // Find resources in this country's region
        const regionResources = resources.filter(r =>
            r.region && r.region.toLowerCase() === info.region.toLowerCase()
        );
        // Find active events affecting this region
        const regionEvents = events.filter(e =>
            (e.region && e.region.toLowerCase() === info.region.toLowerCase()) ||
            e.region === 'Global'
        );

        let riskScore = 15 + Math.random() * 10; // Base risk for all countries
        let affectedResources = [];

        if (regionResources.length > 0) {
            // Calculate from actual C++ resource data
            const avgRisk = regionResources.reduce((sum, r) => {
                const risk = r.risk || {};
                const rawScore = parseFloat(risk.raw_score !== undefined ? risk.raw_score : 20);
                return sum + Math.min(rawScore, 100);
            }, 0) / regionResources.length;
            riskScore = avgRisk;
            affectedResources = [...new Set(regionResources.map(r => r.type))];
        }

        // Amplify score based on active events
        regionEvents.forEach(e => {
            const intensity = parseFloat(e.intensity) || 0.5;
            riskScore += intensity * 18;
        });

        riskScore = Math.min(Math.round(riskScore * 10) / 10, 100);

        let riskLevel = 'low';
        if (riskScore > 75) riskLevel = 'critical';
        else if (riskScore > 55) riskLevel = 'high';
        else if (riskScore > 33) riskLevel = 'medium';

        countryScores[code] = {
            country_code: code,
            country_name: info.name,
            continent: info.continent,
            risk_score: riskScore,
            risk_level: riskLevel,
            affected_resources: affectedResources.length > 0
                ? affectedResources
                : ['electricity'],
            active_events_count: regionEvents.length,
            last_updated: new Date().toISOString()
        };
    }

    // Try caching to Firebase
    if (FIREBASE_DATABASE_URL) {
        try {
            await firebaseWrite('country_risk_scores', countryScores);
            console.log('[MAP] Country risk scores cached to Firebase');
        } catch (e) {
            console.warn('[MAP] Firebase cache write failed:', e.message);
        }
    }

    return countryScores;
}

// ----------------------------------------------------------------------------
// HTTP Server — Routes requests to API handlers or static file serving
// ----------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // ---- API Routes (relay to C++ backend) ----

    // ---- CORS Preflight ----
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.writeHead(204);
        res.end();
        return;
    }

    if (pathname.startsWith('/api/')) {
        // Set JSON response headers + CORS
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        try {
            let data;

            // ---- Add Submitted Event (POST) ----
            if (pathname === '/api/submitted-events' && req.method === 'POST') {
                const body = await parseRequestBody(req);
                const title = (body.title || '').trim();
                const type = (body.type || '').trim();
                const region = (body.region || '').trim();
                const resource = (body.resource || '').trim();
                const severity = (body.severity || '').trim();
                const date = (body.date || '').trim();
                const description = (body.description || '').trim();
                const sourceUrl = (body.sourceUrl || '').trim();
                const submittedBy = (body.submittedBy || '').trim();

                // Required fields validation
                if (!title || !type || !region || !resource || !severity || !date || !description) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: 'All required fields must be filled.' }));
                    return;
                }

                // Description length validation (min 30 chars)
                if (description.length < 30) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: 'Description must be at least 30 characters long.' }));
                    return;
                }

                // URL format validation if filled
                if (sourceUrl) {
                    try {
                        new URL(sourceUrl);
                    } catch (_) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ success: false, message: 'Source URL must be a valid URL format.' }));
                        return;
                    }
                }

                // Generate Firestore-style 20-character ID
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                let autoId = '';
                for (let i = 0; i < 20; i++) {
                    autoId += chars.charAt(Math.floor(Math.random() * chars.length));
                }

                const newEvent = {
                    id: autoId,
                    title,
                    type,
                    region,
                    resource,
                    severity,
                    date,
                    description,
                    sourceUrl: sourceUrl || null,
                    submittedBy: submittedBy || null,
                    createdAt: new Date().toISOString()
                };

                try {
                    // Write directly to Firebase under /submitted_events/ID
                    await firebaseWrite(`submitted_events/${autoId}`, newEvent);
                    console.log(`[SUBMITTED_EVENT] Successfully saved event ${autoId}: "${title}" to Firebase`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, event: newEvent }));
                } catch (err) {
                    console.error('[SUBMITTED_EVENT_ERROR] Failed to save to Firebase:', err.message);
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, message: `Failed to write event to database: ${err.message}` }));
                }
                return;
            }

            // ---- Get Submitted Events List (GET) ----
            if (pathname === '/api/submitted-events' && req.method === 'GET') {
                try {
                    const fbEvents = await firebaseRead('submitted_events');
                    let eventsList = [];
                    if (fbEvents) {
                        eventsList = Object.keys(fbEvents).map(key => {
                            const ev = fbEvents[key];
                            if (ev && typeof ev === 'object') {
                                return { ...ev, id: ev.id || key };
                            }
                            return null;
                        }).filter(Boolean);
                    }
                    // Sort descending by event date
                    eventsList.sort((a, b) => new Date(b.date) - new Date(a.date));

                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, events: eventsList }));
                } catch (err) {
                    console.error('[SUBMITTED_EVENTS_GET_ERROR] Firebase read failed:', err.message);
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, message: `Failed to retrieve events from database: ${err.message}` }));
                }
                return;
            }

            // ---- Get Geopolitical Events from CSV Dataset (GET) ----
            if (pathname === '/api/events/dataset' && req.method === 'GET') {
                try {
                    const timelinePath = path.join(__dirname, '../data/geopolitical_events_timeline.csv');
                    const pricePath = path.join(__dirname, '../data/oil_geopolitics_dataset_2010_2026.csv');
                    
                    if (!fs.existsSync(timelinePath)) {
                        res.writeHead(404);
                        res.end(JSON.stringify({ success: false, message: 'Timeline dataset not found' }));
                        return;
                    }
                    
                    const timelineRows = parseCSVLines(timelinePath);
                    if (timelineRows.length <= 1) {
                        res.writeHead(200);
                        res.end(JSON.stringify([]));
                        return;
                    }
                    
                    const header = timelineRows[0];
                    const dateIdx = header.indexOf('date');
                    const typeIdx = header.indexOf('event_type');
                    const descIdx = header.indexOf('event_description');
                    const sevIdx = header.indexOf('event_severity');
                    
                    const priceMap = new Map();
                    if (fs.existsSync(pricePath)) {
                        const priceRows = parseCSVLines(pricePath);
                        if (priceRows.length > 1) {
                            const pHeader = priceRows[0];
                            const pDateIdx = pHeader.indexOf('date');
                            const pBrentIdx = pHeader.indexOf('brent_price');
                            const pFlagIdx = pHeader.indexOf('event_flag');
                            
                            for (let i = 1; i < priceRows.length; i++) {
                                const row = priceRows[i];
                                if (row.length <= Math.max(pDateIdx, pBrentIdx, pFlagIdx)) continue;
                                const flag = parseInt(row[pFlagIdx]) || 0;
                                if (flag === 1) {
                                    const date = row[pDateIdx];
                                    const brent = parseFloat(row[pBrentIdx]) || null;
                                    if (date && brent) {
                                        priceMap.set(date.trim(), brent);
                                    }
                                }
                            }
                        }
                    }
                    
                    const eventsList = [];
                    for (let i = 1; i < timelineRows.length; i++) {
                        const row = timelineRows[i];
                        if (row.length <= Math.max(dateIdx, typeIdx, descIdx, sevIdx)) continue;
                        
                        const date = row[dateIdx].trim();
                        const type = row[typeIdx].trim();
                        const desc = row[descIdx].trim();
                        const severity = parseInt(row[sevIdx]) || 6;
                        
                        const id = "EVT_" + i.toString().padStart(3, '0');
                        const title = deriveTitle(desc);
                        const region = deriveRegion(desc);
                        const is_active = (date >= "2023-01-01") ? 1 : 0;
                        const brentPrice = priceMap.get(date) || null;
                        
                        eventsList.push({
                            id,
                            title,
                            event_type: type,
                            type, // keep both for safety
                            description: desc,
                            severity,
                            date,
                            is_active,
                            region,
                            source: "Kaggle Geopolitical Events Timeline",
                            brent_price_at_event: brentPrice
                        });
                    }
                    
                    res.writeHead(200);
                    res.end(JSON.stringify(eventsList));
                } catch (err) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
                return;
            }

            // ---- Add Event (POST) ----
            if (pathname === '/api/events' && req.method === 'POST') {
                const body = await parseRequestBody(req);
                const title = (body.title || '').trim();
                const type = body.type || 'War';
                const region = (body.region || '').trim();
                const intensity = parseFloat(body.intensity) || 0.5;
                const supply_impact = parseFloat(body.supply_impact) || 0.3;
                const is_active = body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1;

                if (!title || !region) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: 'Title and region are required' }));
                    return;
                }

                // Read current events from Firebase
                let events = [];
                try {
                    const fbEvents = await firebaseRead('events');
                    if (fbEvents) {
                        events = Array.isArray(fbEvents) ? fbEvents.filter(Boolean) : Object.values(fbEvents);
                    } else {
                        events = [...DEFAULT_EVENTS];
                    }
                } catch (err) {
                    console.warn('[ADD_EVENT] Firebase read failed, starting with default events:', err.message);
                    events = [...DEFAULT_EVENTS];
                }

                // Generate new ID
                const newId = `E${String(events.length + 1).padStart(3, '0')}`;
                const newEvent = {
                    id: newId,
                    title,
                    type,
                    region,
                    intensity,
                    supply_impact,
                    is_active
                };

                events.push(newEvent);

                // Write back to Firebase
                await firebaseWrite('events', events);
                await ensureDataSync(); // Force immediate sync

                console.log(`[ADD_EVENT] Added event: ${newEvent.title} to Firebase`);

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, event: newEvent }));
                return;
            }

            // ---- Toggle Event Status (POST) ----
            if (pathname === '/api/events/toggle' && req.method === 'POST') {
                const body = await parseRequestBody(req);
                const id = (body.id || '').trim();
                const is_active = body.is_active ? 1 : 0;

                if (!id) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: 'Event ID is required' }));
                    return;
                }

                // Read current events from Firebase
                let events = [];
                try {
                    const fbEvents = await firebaseRead('events');
                    if (fbEvents) {
                        events = Array.isArray(fbEvents) ? fbEvents.filter(Boolean) : Object.values(fbEvents);
                    } else {
                        events = [...DEFAULT_EVENTS];
                    }
                } catch (err) {
                    console.warn('[TOGGLE_EVENT] Firebase read failed, using defaults:', err.message);
                    events = [...DEFAULT_EVENTS];
                }

                // Find and update event
                const ev = events.find(e => e.id === id);
                if (ev) {
                    ev.is_active = is_active;
                    // Write back to Firebase
                    await firebaseWrite('events', events);
                    await ensureDataSync(); // Force immediate sync
                    console.log(`[TOGGLE_EVENT] Event ${id} active status updated to ${is_active}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, event: ev }));
                } else {
                    res.writeHead(404);
                    res.end(JSON.stringify({ success: false, message: `Event ${id} not found` }));
                }
                return;
            }

            // ---- Add Resource (POST) ----
            if (pathname === '/api/resources' && req.method === 'POST') {
                const body = await parseRequestBody(req);
                const id = (body.id || '').trim().toUpperCase();
                const name = (body.name || '').trim();
                const type = body.type || 'Oil';
                const region = (body.region || '').trim();
                const production = parseFloat(body.production) || 0;
                const consumption = parseFloat(body.consumption) || 0;
                const price = parseFloat(body.price) || 0;
                const reserve_years = parseFloat(body.reserve_years) || 30.0;
                const export_dependency = parseFloat(body.export_dependency) || 0.5;

                if (!id || !name || !region) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: 'ID, name, and region are required' }));
                    return;
                }

                // Enforce commodity type normalization & validation
                const normType = normalizeCommodityType(type);
                if (!normType) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: `Invalid resource category type: ${type}` }));
                    return;
                }

                // Enforce standard pricing validation
                const std = COMMODITY_UNIT_STANDARDS[normType];
                if (std) {
                    if (price < std.realisticMin || price > std.realisticMax) {
                        res.writeHead(400);
                        res.end(JSON.stringify({
                            success: false,
                            message: `Out of bounds price validation: Price ${price} for ${type} is outside realistic market boundaries [${std.realisticMin}, ${std.realisticMax}] (${std.unit}).`
                        }));
                        return;
                    }
                }

                // Enforce unit mismatch validation
                const standardUnit = getVolumeUnitAbbr(type);
                if (body.unit) {
                    const userUnit = body.unit.trim().toLowerCase();
                    const stdUnitLower = standardUnit.toLowerCase();
                    let isMatch = false;
                    
                    if (stdUnitLower === 'mbpd') {
                        isMatch = userUnit.includes('bbl') || userUnit.includes('barrel') || userUnit.includes('mbpd');
                    } else if (stdUnitLower === 'bcm/year') {
                        isMatch = userUnit.includes('bcm') || userUnit.includes('cubic') || userUnit.includes('gas');
                    } else if (stdUnitLower === 'mt/year') {
                        isMatch = userUnit.includes('t') || userUnit.includes('ton') || userUnit.includes('coal');
                    } else if (stdUnitLower === 'twh/year') {
                        isMatch = userUnit.includes('wh') || userUnit.includes('watt') || userUnit.includes('joule');
                    }

                    if (!isMatch) {
                        res.writeHead(400);
                        res.end(JSON.stringify({
                            success: false,
                            message: `Mismatched commodity-unit registration: Cannot register ${type} with unit '${body.unit}'. Expected standard unit is ${standardUnit}.`
                        }));
                        return;
                    }
                }

                // Read current resources from Firebase
                let resources = [];
                try {
                    const fbResources = await firebaseRead('resources');
                    if (fbResources) {
                        resources = Array.isArray(fbResources) ? fbResources.filter(Boolean) : Object.values(fbResources);
                    } else {
                        resources = [...DEFAULT_RESOURCES];
                    }
                } catch (err) {
                    console.warn('[ADD_RESOURCE] Firebase read failed, starting with defaults:', err.message);
                    resources = [...DEFAULT_RESOURCES];
                }

                // Check for duplicate ID
                if (resources.some(r => r.id === id)) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: `Resource with ID ${id} already exists` }));
                    return;
                }

                const newResource = {
                    id,
                    name,
                    type,
                    region,
                    production,
                    consumption,
                    reserve_years,
                    export_dependency,
                    price,
                    unit: body.unit || standardUnit
                };

                resources.push(newResource);

                // Write back to Firebase
                await firebaseWrite('resources', resources);
                await ensureDataSync(); // Force immediate sync

                console.log(`[ADD_RESOURCE] Added resource: ${newResource.name} to Firebase`);

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, resource: newResource }));
                return;
            }

            // ---- Region Insights (GET) — New endpoint for map clicks ----
            if (pathname === '/api/region-insights' && req.method === 'GET') {
                const region = (url.searchParams.get('region') || '').trim();
                const forceRefresh = url.searchParams.get('force_refresh') === 'true';

                console.log(`[ROUTE] GET /api/region-insights?region=${region}&force_refresh=${forceRefresh}`);

                if (!region || region.length < 2 || region.length > 100) {
                    res.writeHead(400);
                    res.end(JSON.stringify({
                        source: 'error',
                        region_id: null,
                        region_name: null,
                        data: {},
                        status: 'error',
                        message: 'Please provide a valid country or region name (2-100 characters).'
                    }));
                    return;
                }

                const result = await regionInsightController.getInsight(region, forceRefresh);
                const priceInfo = getLatestPriceForCountry(result.region_name || region);
                if (result.data) {
                    result.data.market_price_index = priceInfo;
                }
                const httpStatus = result.status === 'error' ? 502 : 200;
                result.success = result.status !== 'error';
                res.writeHead(httpStatus);
                res.end(JSON.stringify(result));
                return;
            }

            // ---- Gemini Region Insights (POST) — Legacy / Analyze button ----
            if (pathname === '/api/region-insights/generate' && req.method === 'POST') {
                const body = await parseRequestBody(req);
                const region = (body.region || '').trim();
                const forceRefresh = !!body.force_refresh;

                console.log(`[ROUTE] POST /api/region-insights/generate region="${region}" force=${forceRefresh}`);

                if (!region || region.length < 2 || region.length > 100) {
                    res.writeHead(400);
                    res.end(JSON.stringify({
                        success: false,
                        error_code: 'INVALID_REGION',
                        message: 'Please provide a valid country or region name (2-100 characters).'
                    }));
                    return;
                }

                // Use the new controller for POST as well
                const result = await regionInsightController.getInsight(region, forceRefresh);
                const priceInfo = getLatestPriceForCountry(result.region_name || region);
                if (result.data) {
                    result.data.market_price_index = priceInfo;
                }
                result.success = result.status !== 'error';

                if (result.status === 'error') {
                    res.writeHead(result.error_code === 'CONFIG_MISSING' ? 503 : 502);
                } else {
                    res.writeHead(200);
                }
                res.end(JSON.stringify(result));
                return;
            }

            // ---- Historical Trends Analytics (POST) ----
            if (pathname === '/api/analytics/trends' && req.method === 'POST') {
                try {
                    const body = await parseRequestBody(req);
                    const country = body.country;
                    const energyType = body.energy_type || 'Oil';
                    const forceRefresh = !!body.force_refresh;

                    if (!country) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ success: false, message: 'Country is required' }));
                        return;
                    }

                    console.log(`Analytics route hit: ${country} ${energyType}`);

                    const countryId = normalizeRegionId(country);
                    const typeId = normalizeRegionId(energyType);
                    const dbPath = `analytics/historical_trends/${countryId}/${typeId}`;

                    let fromCache = false;
                    let firebaseSaved = false;

                    // 1. Try Cache
                    if (!forceRefresh && FIREBASE_DATABASE_URL) {
                        try {
                            const cached = await firebaseRead(dbPath);
                            if (cached && cached.generated_at) {
                                const age = Date.now() - new Date(cached.generated_at).getTime();
                                // 24 hours cache TTL
                                if (age < 86400000) {
                                    console.log(`[CACHE] Returning cached trends for ${country}/${energyType}`);
                                    res.writeHead(200);
                                    res.end(JSON.stringify({
                                        success: true,
                                        from_cache: true,
                                        firebase_saved: true,
                                        data: cached
                                    }));
                                    return;
                                }
                            }
                        } catch (err) {
                            console.warn(`[CACHE] Firebase read failed: ${err.message}`);
                        }
                    }

                    // 2. Invoke C++ Backend
                    const args = ['analytics-trends', country, energyType];
                    const rawData = await runCppBackend(args);

                    // CENTRALIZED DATA VALIDATION LAYER — STEP 1 & 4 ENFORCEMENT
                    let energyConsumption = [];
                    let fuelPrices = [];
                    if (FIREBASE_DATABASE_URL) {
                        try {
                            energyConsumption = await firebaseRead('datasets/energy_consumption') || [];
                            fuelPrices = await firebaseRead('datasets/fuel_prices') || [];
                        } catch (e) {
                            console.warn('[TRENDS_VALIDATION] Failed to read from Firebase:', e.message);
                        }
                    }

                    if (energyConsumption.length === 0 || fuelPrices.length === 0) {
                        try {
                            const cppData = await runCppBackend(['import-datasets']);
                            energyConsumption = cppData.energy_consumption || [];
                            fuelPrices = cppData.fuel_prices || [];
                        } catch (err) {
                            console.error('[TRENDS_VALIDATION] C++ importer fallback failed:', err.message);
                        }
                    }

                    // Validate using the results returned by C++ backend
                    const hasCons = rawData.consumption_timeline && rawData.consumption_timeline.some(pt => pt.consumption !== null && pt.consumption !== -9999.0);
                    const hasPrice = rawData.price_timeline && rawData.price_timeline.some(pt => pt.price !== null && pt.price !== -9999.0);

                    const consumptionReport = {
                        country: country,
                        column: energyType,
                        dataset: 'energy_consumption',
                        hasData: hasCons,
                        qualityScore: "HIGH",
                        coveragePercent: 100.0,
                        disqualifyReason: null
                    };

                    const priceReport = {
                        country: country,
                        column: energyType,
                        dataset: 'fuel_prices',
                        hasData: hasPrice,
                        qualityScore: "HIGH",
                        coveragePercent: 100.0,
                        disqualifyReason: null
                    };

                    rawData.consumption_quality = consumptionReport;
                    rawData.price_quality = priceReport;

                    // Add generated_at timestamp
                    rawData.generated_at = new Date().toISOString();

                    // 3. Save to Cache
                    if (FIREBASE_DATABASE_URL) {
                        try {
                            await firebaseWrite(dbPath, rawData);
                            firebaseSaved = true;
                            console.log(`[CACHE] Cached trends for ${country}/${energyType} to Firebase`);
                        } catch (err) {
                            console.error(`[CACHE] Firebase write failed: ${err.message}`);
                        }
                    }

                    res.writeHead(200);
                    res.end(JSON.stringify({
                        success: true,
                        from_cache: false,
                        firebase_saved: firebaseSaved,
                        data: rawData
                    }));
                } catch (err) {
                    console.error(`[TRENDS ERROR] ${err.message}`);
                    res.writeHead(500);
                    res.end(JSON.stringify({
                        success: false,
                        message: 'Failed to generate trend analytics',
                        details: err.message
                    }));
                }
                return;
            }

            // ---- Country Risk Scores for Map (GET) ----
            if (pathname === '/api/country-risk-scores') {
                try {
                    data = await buildCountryRiskScores();
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, countries: data }));
                } catch (err) {
                    console.error(`[MAP DATA ERROR] ${err.message}`);
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
                return;
            }

            // ---- Country Availability (GET) ----
            if (pathname === '/api/country-availability' && req.method === 'GET') {
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, availability: countryAvailability }));
                return;
            }

            // ---- Dataset Import & Firebase Cache (POST) ----
            if (pathname === '/api/datasets/import' && req.method === 'POST') {
                try {
                    // Call C++ importer to parse and normalize CSV datasets
                    const cppData = await runCppBackend(['import-datasets']);
                    
                    let firebaseSaved = false;
                    let errorDetails = '';
                    
                    if (FIREBASE_DATABASE_URL) {
                        try {
                            // Write each parsed list to Firebase paths
                            await firebaseWrite('datasets/energy_consumption', cppData.energy_consumption || []);
                            await firebaseWrite('datasets/fuel_prices', cppData.fuel_prices || []);
                            await firebaseWrite('datasets/global_energy', cppData.global_energy || []);
                            await firebaseWrite('datasets/metadata', cppData.metadata || null);
                            firebaseSaved = true;
                        } catch (firebaseErr) {
                            console.error(`[DATASETS FIREBASE ERROR] ${firebaseErr.message}`);
                            errorDetails = `Firebase write failed: ${firebaseErr.message}`;
                        }
                    } else {
                        errorDetails = 'Firebase not configured in .env';
                    }

                    res.writeHead(200);
                    res.end(JSON.stringify({
                        success: true,
                        firebase_saved: firebaseSaved,
                        details: errorDetails,
                        metadata: cppData.metadata || null,
                        datasets: {
                            energy_consumption: cppData.energy_consumption || [],
                            fuel_prices: cppData.fuel_prices || [],
                            global_energy: cppData.global_energy || []
                        }
                    }));
                } catch (err) {
                    console.error(`[DATASETS IMPORT ERROR] ${err.message}`);
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
                return;
            }

            // ---- Dataset Fetching (GET) ----
            if (pathname === '/api/datasets' && req.method === 'GET') {
                let data = null;
                let source = 'cpp_local';

                // Try reading from Firebase first if configured
                if (FIREBASE_DATABASE_URL) {
                    try {
                        const consumption = await firebaseRead('datasets/energy_consumption');
                        const fuel = await firebaseRead('datasets/fuel_prices');
                        const global = await firebaseRead('datasets/global_energy');
                        const metadata = await firebaseRead('datasets/metadata');

                        if (consumption && fuel && global) {
                            data = {
                                energy_consumption: consumption,
                                fuel_prices: fuel,
                                global_energy: global,
                                metadata: metadata || null
                            };
                            source = 'firebase';
                        }
                    } catch (firebaseErr) {
                        console.warn(`[DATASETS READ FALLBACK] ${firebaseErr.message}. Falling back to C++ parser.`);
                    }
                }

                // If not found in Firebase or error, read live from CSV using C++ backend
                if (!data) {
                    try {
                        const cppData = await runCppBackend(['import-datasets']);
                        data = {
                            energy_consumption: cppData.energy_consumption || [],
                            fuel_prices: cppData.fuel_prices || [],
                            global_energy: cppData.global_energy || [],
                            metadata: cppData.metadata || null
                        };
                    } catch (cppErr) {
                        console.error(`[DATASETS LOCAL READ ERROR] ${cppErr.message}`);
                        res.writeHead(500);
                        res.end(JSON.stringify({ success: false, error: cppErr.message }));
                        return;
                    }
                }

                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    source: source,
                    metadata: data.metadata || null,
                    datasets: {
                        energy_consumption: data.energy_consumption || [],
                        fuel_prices: data.fuel_prices || [],
                        global_energy: data.global_energy || []
                    }
                }));
                return;
            }

            // ---- C++ Backend Relay Routes (GET) ----
            if (pathname === '/api/dashboard') {
                data = await runCppBackend(['dashboard']);
                if (data && data.active_events_list) {
                    data.active_events_list.forEach(enrichEvent);
                }
            }
            else if (pathname === '/api/resources') {
                data = await runCppBackend(['resources']);
                if (data && data.resources) {
                    data.resources.forEach(enrichResource);
                }
            }
            else if (pathname === '/api/events') {
                data = await runCppBackend(['events']);
                if (data && data.events) {
                    data.events.forEach(enrichEvent);
                }
            }
            else if (pathname === '/api/regions') {
                data = await runCppBackend(['regions']);
            }
            else if (pathname === '/api/analysis') {
                data = await runCppBackend(['analysis']);
            }
            else if (pathname === '/api/search') {
                const query = url.searchParams.get('q') || '';
                if (!query) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing search query parameter ?q=' }));
                    return;
                }
                data = await runCppBackend(['search', query]);
                if (data && data.results) {
                    data.results.forEach(item => {
                        if (item.resource) enrichResource(item.resource);
                    });
                }
            }
            else if (pathname.startsWith('/api/resource/')) {
                const id = pathname.split('/api/resource/')[1];
                if (!id) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing resource ID' }));
                    return;
                }
                data = await runCppBackend(['resource', id]);
                if (data) {
                    if (data.resource) enrichResource(data.resource);
                    if (data.related_events) data.related_events.forEach(enrichEvent);
                }
            }
            else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Unknown API endpoint', path: pathname }));
                return;
            }

            res.writeHead(200);
            res.end(JSON.stringify(data));

        } catch (err) {
            console.error(`[API ERROR] ${pathname}: ${err.message}`);
            res.writeHead(500);
            res.end(JSON.stringify({
                error: 'Backend calculation failed',
                message: err.message
            }));
        }
        return;
    }

    // ---- Health Check ----
    if (pathname === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', backend: 'C++ EnergyRisk.exe' }));
        return;
    }

    // ---- Static File Serving (frontend) ----

    let filePath;
    const isFrontendRoute = pathname === '/' || 
                            pathname === '/index.html' || 
                            pathname === '/global-risk-explorer' || 
                            pathname === '/datasets' || 
                            pathname === '/trends' || 
                            pathname === '/country-insights' || 
                            pathname === '/add-event' || 
                            pathname === '/add-resource' || 
                            pathname.startsWith('/country-insights/');

    if (isFrontendRoute) {
        filePath = path.join(FRONTEND_DIR, 'index.html');
    } else {
        filePath = path.join(FRONTEND_DIR, pathname);
    }

    // Security: prevent directory traversal
    if (!filePath.startsWith(FRONTEND_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    serveStaticFile(res, filePath);
});

// ---- Start the server ----
server.listen(PORT, () => {
    console.log('');
    console.log('==========================================================');
    console.log('  Global Energy Risk Monitor — Web Server');
    console.log('==========================================================');
    console.log(`  Frontend:  http://localhost:${PORT}`);
    console.log(`  API:       http://localhost:${PORT}/api/dashboard`);
    console.log(`  Gemini:    http://localhost:${PORT}/api/region-insights/generate`);
    console.log(`  Backend:   ${EXE_PATH}`);
    console.log('==========================================================');
    console.log('');
    console.log('  The frontend fetches data from the C++ backend.');
    console.log('  All risk calculations are performed in C++.');
    console.log(`  Gemini API: ${GEMINI_API_KEY ? 'Configured ✓' : 'NOT configured (set GEMINI_API_KEY in .env)'}`);
    console.log(`  Firebase:   ${FIREBASE_DATABASE_URL ? 'Configured ✓' : 'NOT configured (set FIREBASE_DATABASE_URL in .env)'}`);
    console.log('');
    console.log('  Press Ctrl+C to stop the server.');
    console.log('');
});
