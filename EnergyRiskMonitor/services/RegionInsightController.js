// ============================================================================
// RegionInsightController.js
// ============================================================================
// Orchestrates the full flow:
//   1. Normalize region input
//   2. Check Firebase cache
//   3. Call Gemini (with fallback)
//   4. Save to Firebase
//   5. Return structured response
//
// Used by the GET /api/region-insights?region=X endpoint.
// ============================================================================

const { normalizeRegion } = require('./RegionNormalizer');
const { FirebaseRegionInsightRepository } = require('./FirebaseRegionInsightRepository');
const { GeminiFallbackService } = require('./GeminiFallbackService');

class RegionInsightController {
    /**
     * @param {FirebaseRegionInsightRepository} firebaseRepo
     * @param {GeminiFallbackService} geminiFallbackService
     */
    constructor(firebaseRepo, geminiFallbackService) {
        this.firebaseRepo = firebaseRepo;
        this.geminiService = geminiFallbackService;
    }

    /**
     * Handle a region insight request.
     *
     * @param {string} rawRegion - The raw region string from the query (e.g. "China", "CN", "People's Republic of China")
     * @param {boolean} forceRefresh - If true, skip cache and call Gemini directly
     * @returns {Promise<object>} Standard response envelope
     */
    async getInsight(rawRegion, forceRefresh = false) {
        console.log('');
        console.log('=== [REGION_INSIGHT_CONTROLLER] New Request ===');
        console.log(`[REGION_INSIGHT_CONTROLLER] Selected country (raw): "${rawRegion}"`);
        console.log(`[REGION_INSIGHT_CONTROLLER] Force refresh: ${forceRefresh}`);

        // --- 1. Validate input ---
        if (!rawRegion || typeof rawRegion !== 'string' || rawRegion.trim().length < 2) {
            console.error(`[REGION_INSIGHT_CONTROLLER] INVALID INPUT: "${rawRegion}"`);
            return {
                source: 'error',
                region_id: null,
                region_name: null,
                data: {},
                status: 'error',
                message: 'Please provide a valid country or region name (2+ characters).'
            };
        }

        // --- 2. Normalize region ---
        const { region_id, region_name, was_alias } = normalizeRegion(rawRegion);
        console.log(`[REGION_INSIGHT_CONTROLLER] Normalized region_id: "${region_id}"`);
        console.log(`[REGION_INSIGHT_CONTROLLER] Display name: "${region_name}"`);
        console.log(`[REGION_INSIGHT_CONTROLLER] Was alias match: ${was_alias}`);

        if (!region_id) {
            console.error(`[REGION_INSIGHT_CONTROLLER] Normalization failed for "${rawRegion}"`);
            return {
                source: 'error',
                region_id: null,
                region_name: rawRegion,
                data: {},
                status: 'error',
                message: 'Could not resolve region. Please try a different name.'
            };
        }

        const firebasePath = `gemini_region_insights/${region_id}`;
        console.log(`[REGION_INSIGHT_CONTROLLER] Firebase lookup path: /${firebasePath}`);

        // --- 3. Check Firebase cache (unless force refresh) ---
        if (!forceRefresh && this.firebaseRepo.isConfigured()) {
            console.log(`[REGION_INSIGHT_CONTROLLER] Checking Firebase cache...`);
            const cached = await this.firebaseRepo.getCachedInsight(region_id);

            if (cached.data && cached.isFresh) {
                console.log(`[REGION_INSIGHT_CONTROLLER] ✓ CACHE HIT — returning cached data (${cached.age_minutes}min old)`);
                console.log(`[REGION_INSIGHT_CONTROLLER] Final response status: success (firebase_cache)`);
                return {
                    source: 'firebase_cache',
                    region_id: region_id,
                    region_name: region_name,
                    data: cached.data,
                    status: 'success',
                    message: `Cached data returned (${cached.age_minutes} minutes old).`,
                    from_cache: true,
                    firebase_saved: true
                };
            } else {
                console.log(`[REGION_INSIGHT_CONTROLLER] CACHE MISS or STALE — proceeding to Gemini`);
            }
        } else if (forceRefresh) {
            console.log(`[REGION_INSIGHT_CONTROLLER] Skipping cache (force_refresh=true)`);
        } else {
            console.log(`[REGION_INSIGHT_CONTROLLER] Firebase not configured — skipping cache`);
        }

        // --- 4. Call Gemini (with fallback) ---
        console.log(`[REGION_INSIGHT_CONTROLLER] Calling Gemini API...`);
        const geminiResult = await this.geminiService.callWithFallback(region_id, region_name);
        console.log(`[REGION_INSIGHT_CONTROLLER] Gemini result source: "${geminiResult.source}"`);
        console.log(`[REGION_INSIGHT_CONTROLLER] Gemini result status: "${geminiResult.status}"`);

        // --- 5. Save to Firebase (if we got fresh Gemini data) ---
        let firebaseSaved = false;
        if (geminiResult.source === 'gemini_live' && this.firebaseRepo.isConfigured()) {
            console.log(`[REGION_INSIGHT_CONTROLLER] Saving fresh Gemini data to Firebase...`);
            firebaseSaved = await this.firebaseRepo.saveInsight(region_id, geminiResult.data);
            console.log(`[REGION_INSIGHT_CONTROLLER] Firebase save result: ${firebaseSaved ? 'SUCCESS' : 'FAILED'}`);
        }

        // --- 6. Build final response ---
        const response = {
            source: geminiResult.source,
            region_id: region_id,
            region_name: region_name,
            data: geminiResult.data,
            status: geminiResult.status,
            message: geminiResult.message,
            from_cache: geminiResult.source === 'firebase_cache' || geminiResult.source === 'firebase_fallback',
            firebase_saved: firebaseSaved
        };

        if (geminiResult.error_code) {
            response.error_code = geminiResult.error_code;
        }

        console.log(`[REGION_INSIGHT_CONTROLLER] Final response status: ${response.status} (${response.source})`);
        console.log('=== [REGION_INSIGHT_CONTROLLER] Request Complete ===');
        console.log('');

        return response;
    }
}

module.exports = { RegionInsightController };
