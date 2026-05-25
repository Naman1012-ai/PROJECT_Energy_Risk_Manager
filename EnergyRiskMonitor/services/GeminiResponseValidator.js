// ============================================================================
// GeminiResponseValidator.js
// ============================================================================
// Validates and normalizes a raw Gemini API JSON response to ensure all
// required fields exist with correct types. Returns a clean, safe object
// that the frontend can always rely on.
// ============================================================================

const VALID_SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'];

/**
 * Validate the parsed JSON response from Gemini.
 *
 * @param {object} data - Raw parsed JSON from Gemini
 * @param {string} regionName - The display name of the region (for fallback)
 * @returns {{ valid: boolean, data: object, errors: string[] }}
 */
function validateGeminiResponse(data, regionName) {
    const errors = [];

    if (!data || typeof data !== 'object') {
        console.error('[GEMINI_VALIDATOR] Response is not a valid object');
        return {
            valid: false,
            data: buildFallbackResponse(regionName),
            errors: ['Response is not a valid JSON object']
        };
    }

    console.log('[GEMINI_VALIDATOR] Validating Gemini response fields...');

    // Validate each field, providing defaults where needed
    const validated = {};

    // region_name
    validated.region_name = (typeof data.region_name === 'string' && data.region_name.length > 0)
        ? data.region_name
        : regionName;
    if (!data.region_name) errors.push('Missing region_name — using fallback');

    // query_text
    validated.query_text = (typeof data.query_text === 'string')
        ? data.query_text
        : `Energy risk analysis for ${regionName}`;

    // generated_summary
    validated.generated_summary = (typeof data.generated_summary === 'string' && data.generated_summary.length > 5)
        ? data.generated_summary
        : 'No summary available from Gemini.';
    if (!data.generated_summary) errors.push('Missing generated_summary');

    // energy_risks
    validated.energy_risks = (typeof data.energy_risks === 'string' && data.energy_risks.length > 0)
        ? data.energy_risks
        : 'Low direct energy sector exposure identified.';
    if (!data.energy_risks) errors.push('Missing energy_risks');

    // trade_supply_chain_risks
    validated.trade_supply_chain_risks = (typeof data.trade_supply_chain_risks === 'string' && data.trade_supply_chain_risks.length > 0)
        ? data.trade_supply_chain_risks
        : 'No major trade or supply chain anomalies reported.';
    if (!data.trade_supply_chain_risks) errors.push('Missing trade_supply_chain_risks');

    // infrastructure_risks
    validated.infrastructure_risks = (typeof data.infrastructure_risks === 'string' && data.infrastructure_risks.length > 0)
        ? data.infrastructure_risks
        : 'All critical energy infrastructure remains secured.';
    if (!data.infrastructure_risks) errors.push('Missing infrastructure_risks');

    // affected_resources
    validated.affected_resources = Array.isArray(data.affected_resources)
        ? data.affected_resources.filter(r => typeof r === 'string')
        : [];
    if (!Array.isArray(data.affected_resources)) errors.push('Missing or invalid affected_resources');

    // geopolitical_events
    if (Array.isArray(data.geopolitical_events)) {
        validated.geopolitical_events = data.geopolitical_events.map((ev, idx) => {
            const cleaned = {
                title: (typeof ev.title === 'string') ? ev.title : `Event ${idx + 1}`,
                description: (typeof ev.description === 'string') ? ev.description : '',
                severity: VALID_SEVERITY_LEVELS.includes(ev.severity) ? ev.severity : 'medium',
                affected_resources: Array.isArray(ev.affected_resources)
                    ? ev.affected_resources.filter(r => typeof r === 'string')
                    : [],
                region_impact: (typeof ev.region_impact === 'string') ? ev.region_impact : ''
            };
            return cleaned;
        });
    } else {
        validated.geopolitical_events = [];
        errors.push('Missing or invalid geopolitical_events');
    }

    // supply_risk_level
    validated.supply_risk_level = VALID_SEVERITY_LEVELS.includes(data.supply_risk_level)
        ? data.supply_risk_level
        : 'medium';
    if (!VALID_SEVERITY_LEVELS.includes(data.supply_risk_level)) {
        errors.push(`Invalid supply_risk_level: "${data.supply_risk_level}" — defaulting to medium`);
    }

    // fuel_price_impact
    if (typeof data.fuel_price_impact === 'object' && data.fuel_price_impact !== null) {
        validated.fuel_price_impact = {
            level: VALID_SEVERITY_LEVELS.includes(data.fuel_price_impact.level)
                ? data.fuel_price_impact.level
                : 'medium',
            summary: (typeof data.fuel_price_impact.summary === 'string')
                ? data.fuel_price_impact.summary
                : 'No price impact assessment available.'
        };
    } else {
        validated.fuel_price_impact = {
            level: 'medium',
            summary: (typeof data.fuel_price_impact === 'string')
                ? data.fuel_price_impact
                : 'No price impact assessment available.'
        };
        errors.push('Missing or invalid fuel_price_impact object');
    }

    // import_export_vulnerabilities
    validated.import_export_vulnerabilities = Array.isArray(data.import_export_vulnerabilities)
        ? data.import_export_vulnerabilities.filter(v => typeof v === 'string')
        : [];
    if (!Array.isArray(data.import_export_vulnerabilities)) {
        errors.push('Missing import_export_vulnerabilities');
    }

    // recommendation
    validated.recommendation = (typeof data.recommendation === 'string' && data.recommendation.length > 0)
        ? data.recommendation
        : 'No recommendation available.';
    if (!data.recommendation) errors.push('Missing recommendation');

    // Log results
    const isValid = errors.length === 0;
    console.log(`[GEMINI_VALIDATOR] Validation ${isValid ? 'PASSED' : 'PASSED WITH WARNINGS'} — ${errors.length} issue(s)`);
    if (errors.length > 0) {
        errors.forEach(e => console.warn(`[GEMINI_VALIDATOR]   → ${e}`));
    }

    return { valid: isValid, data: validated, errors };
}

/**
 * Build a minimal fallback response structure.
 */
function buildFallbackResponse(regionName) {
    return {
        region_name: regionName || 'Unknown',
        query_text: '',
        generated_summary: 'Unable to generate analysis. Please try again.',
        energy_risks: 'Energy risk data is currently unavailable.',
        trade_supply_chain_risks: 'Trade risk data is currently unavailable.',
        infrastructure_risks: 'Infrastructure risk data is currently unavailable.',
        affected_resources: [],
        geopolitical_events: [],
        supply_risk_level: 'medium',
        fuel_price_impact: { level: 'medium', summary: 'Data unavailable.' },
        import_export_vulnerabilities: [],
        recommendation: 'Please retry the analysis.'
    };
}

module.exports = { validateGeminiResponse, buildFallbackResponse, VALID_SEVERITY_LEVELS };
