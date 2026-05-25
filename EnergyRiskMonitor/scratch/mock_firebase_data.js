const https = require('https');

const FIREBASE_DATABASE_URL = "https://global-energy-risk-monitor-default-rtdb.asia-southeast1.firebasedatabase.app";
const url = `${FIREBASE_DATABASE_URL}/gemini_region_insights/china.json`;

const mockData = {
    region_name: "China",
    query_text: "Analyze the latest geopolitical and energy-risk situation for China...",
    generated_summary: "China maintains an active energy strategy with significant domestic coal reserves but stays highly vulnerable to sea lane supply disruptions.",
    affected_resources: ["oil", "gas", "coal", "electricity", "renewables"],
    geopolitical_events: [
        {
            title: "South China Sea Transit Vigilance",
            description: "Heightened naval patrols increase maritime shipping transit uncertainty.",
            severity: "medium",
            affected_resources: ["oil", "gas"],
            region_impact: "Localized shipping delay risk"
        }
    ],
    supply_risk_level: "medium",
    fuel_price_impact: {
        level: "medium",
        summary: "Moderate upward pressure on LNG import spot prices."
    },
    import_export_vulnerabilities: [
        "Highly reliant on Malacca Strait for crude imports",
        "Export restrictions on critical mineral processing equipment"
    ],
    recommendation: "Increase strategic petroleum reserves and accelerate domestic green hydrogen infrastructure.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
};

function httpsRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const reqOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: 10000
        };

        const req = https.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, body });
            });
        });

        req.on('error', reject);
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

async function main() {
    console.log(`Writing mock China cached data to: ${url}`);
    try {
        const resp = await httpsRequest(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mockData)
        });
        console.log(`Response status: ${resp.status}`);
        console.log(`Body: ${resp.body}`);
    } catch (e) {
        console.error(`Error writing to Firebase:`, e);
    }
}

main();
