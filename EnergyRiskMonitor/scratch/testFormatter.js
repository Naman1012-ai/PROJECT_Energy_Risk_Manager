// Mock of frontend COMMODITY_UNIT_STANDARDS and helpers from app.js
const COMMODITY_UNIT_STANDARDS = {
    "Oil": {
        priceColumn: "brent_crude_usd",
        unit: "USD / barrel",
        realisticMin: 20,
        realisticMax: 200,
        dataset: "Global_Fuel_Prices"
    },
    "Gas": {
        priceColumn: null,
        unit: "USD / MMBtu",
        realisticMin: 1,
        realisticMax: 70,
        dataset: null,
        note: "No gas-specific price column exists in uploaded datasets"
    },
    "Coal": {
        priceColumn: null,
        unit: "USD / metric ton",
        realisticMin: 40,
        realisticMax: 450,
        dataset: null,
        note: "No coal-specific price column exists in uploaded datasets"
    },
    "Electricity": {
        priceColumn: "Energy Price Index (USD/kWh)",
        unit: "USD / kWh",
        realisticMin: 0.01,
        realisticMax: 0.80,
        dataset: "Global_Energy_Consumption"
    },
    "Renewables": {
        priceColumn: null,
        unit: "USD / kWh",
        realisticMin: 0.01,
        realisticMax: 0.50,
        dataset: null,
        note: "No renewables-specific price column exists in uploaded datasets"
    },
    "LPG": {
        priceColumn: "lpg_usd_liter",
        unit: "USD / litre",
        realisticMin: 0.05,
        realisticMax: 2.50,
        dataset: "Global_Fuel_Prices"
    },
    "Petrol": {
        priceColumn: "petrol_usd_liter",
        unit: "USD / litre",
        realisticMin: 0.05,
        realisticMax: 3.00,
        dataset: "Global_Fuel_Prices"
    },
    "Diesel": {
        priceColumn: "diesel_usd_liter",
        unit: "USD / litre",
        realisticMin: 0.05,
        realisticMax: 3.00,
        dataset: "Global_Fuel_Prices"
    }
};

function normalizeCommodityType(type) {
    if (!type) return null;
    const t = type.trim().toLowerCase();
    if (t === 'oil' || t === 'crude oil') return 'Oil';
    if (t === 'gas' || t === 'natural gas') return 'Gas';
    if (t === 'coal') return 'Coal';
    if (t === 'electricity' || t === 'electricity/renewables') return 'Electricity';
    if (t === 'renewables' || t === 'renewable') return 'Renewables';
    if (t === 'lpg') return 'LPG';
    if (t === 'petrol') return 'Petrol';
    if (t === 'diesel') return 'Diesel';
    
    if (t.includes('oil')) return 'Oil';
    if (t.includes('gas')) return 'Gas';
    if (t.includes('coal')) return 'Coal';
    if (t.includes('electricity') || t.includes('low_carbon') || t.includes('low carbon')) return 'Electricity';
    if (t.includes('renewable')) return 'Renewables';
    return null;
}

function formatCommodityPrice(priceVal, type) {
    const normalized = normalizeCommodityType(type);
    if (!normalized) {
        return "Not available";
    }
    const std = COMMODITY_UNIT_STANDARDS[normalized];
    if (!std || !std.priceColumn) {
        return `Not available — no ${normalized} price data in current datasets`;
    }
    
    if (priceVal === null || priceVal === undefined || isNaN(priceVal) || priceVal === '') {
        return `Price data unavailable for ${normalized} in current datasets. The uploaded datasets do not contain a ${normalized}-specific price column.`;
    }
    
    const numVal = parseFloat(priceVal);
    if (numVal < std.realisticMin || numVal > std.realisticMax) {
        return `Price data unavailable for ${normalized} in current datasets. The uploaded datasets do not contain a ${normalized}-specific price column.`;
    }
    
    return `${parseFloat(numVal.toFixed(4))} ${std.unit}`;
}

console.log('--- START FORMATTER UNIT TESTS ---');

// Test Case 1: Gas (no priceColumn)
console.log('Gas price:', formatCommodityPrice(15.0, 'Gas'));
console.log('Natural Gas price:', formatCommodityPrice(15.0, 'Natural Gas'));

// Test Case 2: Coal (no priceColumn)
console.log('Coal price:', formatCommodityPrice(90.0, 'Coal'));

// Test Case 3: Renewables (no priceColumn)
console.log('Renewables price:', formatCommodityPrice(0.05, 'Renewables'));

// Test Case 4: Oil - valid
console.log('Oil valid (82.4):', formatCommodityPrice(82.4, 'Oil'));

// Test Case 5: Oil - invalid/out-of-bounds (too low)
console.log('Oil too low (10.0):', formatCommodityPrice(10.0, 'Oil'));

// Test Case 6: Oil - invalid/out-of-bounds (too high)
console.log('Oil too high (250.0):', formatCommodityPrice(250.0, 'Oil'));

// Test Case 7: Electricity - valid
console.log('Electricity valid (0.24):', formatCommodityPrice(0.24, 'Electricity'));

// Test Case 8: Electricity - invalid/out-of-bounds
console.log('Electricity invalid (1.50):', formatCommodityPrice(1.50, 'Electricity'));

// Test Case 9: LPG - valid
console.log('LPG valid (1.20):', formatCommodityPrice(1.20, 'LPG'));

console.log('--- ALL FORMATTER UNIT TESTS FINISHED ---');
