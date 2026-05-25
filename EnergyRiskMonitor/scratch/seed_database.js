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

const FIREBASE_DATABASE_URL = 'https://global-energy-risk-monitor-default-rtdb.asia-southeast1.firebasedatabase.app';

async function seed() {
    console.log('Sending default resources payload to Firebase...');
    const url = `${FIREBASE_DATABASE_URL}/resources.json`;
    try {
        const resp = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(DEFAULT_RESOURCES)
        });
        if (resp.ok) {
            console.log('Firebase database seeded successfully with realistic default values!');
        } else {
            console.error('Failed to seed Firebase:', resp.status, await resp.text());
        }
    } catch (err) {
        console.error('Error during fetch:', err);
    }
}

seed();
