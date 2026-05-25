// ============================================================================
// FirebaseRegionInsightRepository.js
// ============================================================================
// Handles all Firebase Realtime Database read/write operations for
// region insights cached under /gemini_region_insights/{region_id}.
//
// Uses the zero-dependency HTTPS helper from server.js (passed in as dep).
// ============================================================================

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

class FirebaseRegionInsightRepository {
    /**
     * @param {string} firebaseDatabaseUrl - Firebase Realtime Database URL
     * @param {Function} httpsRequest - HTTPS request helper function
     */
    constructor(firebaseDatabaseUrl, httpsRequest) {
        this.dbUrl = firebaseDatabaseUrl;
        this.httpsRequest = httpsRequest;
    }

    /**
     * Check if this repository is configured (has a database URL).
     */
    isConfigured() {
        return !!this.dbUrl;
    }

    /**
     * Build the Firebase REST URL for a given path.
     * @param {string} dbPath
     * @returns {string}
     */
    _buildUrl(dbPath) {
        return `${this.dbUrl}/${dbPath}.json`;
    }

    /**
     * Read data from Firebase at the given path.
     * @param {string} dbPath - e.g. "gemini_region_insights/china"
     * @returns {Promise<object|null>}
     */
    async read(dbPath) {
        if (!this.isConfigured()) {
            console.warn('[FIREBASE_REPO] Firebase not configured — skipping read');
            return null;
        }

        const url = this._buildUrl(dbPath);
        console.log(`[FIREBASE_REPO] Reading from: ${url}`);

        try {
            const resp = await this.httpsRequest(url, { method: 'GET', timeout: 10000 });

            if (resp.status !== 200) {
                console.error(`[FIREBASE_REPO] Read failed: HTTP ${resp.status}`);
                return null;
            }

            const data = JSON.parse(resp.body);
            console.log(`[FIREBASE_REPO] Read result: ${data ? 'data found' : 'null/empty'}`);
            return data;
        } catch (err) {
            console.error(`[FIREBASE_REPO] Read error at "${dbPath}": ${err.message}`);
            return null;
        }
    }

    /**
     * Write data to Firebase at the given path.
     * @param {string} dbPath
     * @param {object} data
     * @returns {Promise<boolean>} true if successful
     */
    async write(dbPath, data) {
        if (!this.isConfigured()) {
            console.warn('[FIREBASE_REPO] Firebase not configured — skipping write');
            return false;
        }

        const url = this._buildUrl(dbPath);
        const payload = JSON.stringify(data);
        console.log(`[FIREBASE_REPO] Writing to: ${url} (${payload.length} bytes)`);

        try {
            const resp = await this.httpsRequest(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                timeout: 10000
            });

            if (resp.status !== 200) {
                console.error(`[FIREBASE_REPO] Write failed: HTTP ${resp.status}`);
                return false;
            }

            console.log(`[FIREBASE_REPO] Write successful at "${dbPath}"`);
            return true;
        } catch (err) {
            console.error(`[FIREBASE_REPO] Write error at "${dbPath}": ${err.message}`);
            return false;
        }
    }

    /**
     * Fetch cached region insight data from Firebase.
     *
     * @param {string} regionId - Normalized region_id
     * @returns {Promise<{ data: object|null, isFresh: boolean, age_minutes: number }>}
     */
    async getCachedInsight(regionId) {
        const dbPath = `gemini_region_insights/${regionId}`;
        console.log(`[FIREBASE_REPO] Cache lookup: /${dbPath}`);

        const cached = await this.read(dbPath);

        if (!cached || !cached.updated_at) {
            console.log(`[FIREBASE_REPO] CACHE MISS — no data found for "${regionId}"`);
            return { data: null, isFresh: false, age_minutes: -1 };
        }

        const age = Date.now() - new Date(cached.updated_at).getTime();
        const ageMinutes = Math.round(age / 60000);
        const isFresh = age < CACHE_TTL_MS;

        console.log(`[FIREBASE_REPO] CACHE ${isFresh ? 'HIT' : 'STALE'} — age: ${ageMinutes}min (TTL: ${CACHE_TTL_MS / 60000}min)`);

        return { data: cached, isFresh, age_minutes: ageMinutes };
    }

    /**
     * Save a Gemini insight to Firebase cache.
     *
     * @param {string} regionId - Normalized region_id
     * @param {object} insightData - Validated Gemini response
     * @returns {Promise<boolean>}
     */
    async saveInsight(regionId, insightData) {
        const dbPath = `gemini_region_insights/${regionId}`;
        console.log(`[FIREBASE_REPO] Saving insight to /${dbPath}`);

        // Attach timestamps
        const now = new Date().toISOString();
        insightData.created_at = insightData.created_at || now;
        insightData.updated_at = now;

        const success = await this.write(dbPath, insightData);
        console.log(`[FIREBASE_REPO] Save result: ${success ? 'SUCCESS' : 'FAILED'}`);
        return success;
    }
}

module.exports = { FirebaseRegionInsightRepository, CACHE_TTL_MS };
