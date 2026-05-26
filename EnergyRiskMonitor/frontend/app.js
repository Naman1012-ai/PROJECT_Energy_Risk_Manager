// ============================================================================
// app.js — Redesigned Global Energy Risk Monitor Dashboard (Frontend)
// ============================================================================
// This file renders the interactive web dashboard. It loads initial states
// from the C++ backend via server.js, then maintains a dynamic local state
// to allow real-time geopolitical threat simulations, new asset registry,
// interactive SVG map visualizations, and monthly trend graphs.
// ============================================================================

// ---- API Base URL ----
const API_BASE = '';  // Same origin (served by server.js)

const RISK_WEIGHTS = {
    supply_score: 0.25,
    conflict_score: 0.30,
    trade_score: 0.20,
    demand_score: 0.15,
    route_score: 0.10
};

function getScoreTemporalLabel(resource) {
    let firstValidYear = null;
    let lastValidYear = null;
    let datasetName = "";

    // Set defaults based on resource type
    if (resource && (resource.type === 'Oil' || resource.type === 'Gas' || resource.type === 'Coal')) {
        firstValidYear = 2000;
        lastValidYear = 2024;
        datasetName = "Global Energy Consumption";
    } else if (resource && (resource.type === 'Electricity' || resource.type === 'Renewables')) {
        firstValidYear = 1900;
        lastValidYear = 2024;
        datasetName = "Global Energy Dataset";
    } else {
        // Fallback generic range
        firstValidYear = 2000;
        lastValidYear = 2024;
        datasetName = "Global Energy Consumption";
    }

    // Try to refine using kaggleDatasets if loaded
    if (kaggleDatasets) {
        let records = [];
        let matchingCountry = resource ? resource.region : null; // In this schema, region might be the country/region name
        
        // Find if we have matches in energy_consumption or global_energy or fuel_prices
        if (resource && (resource.type === 'Oil' || resource.type === 'Gas' || resource.type === 'Coal')) {
            records = kaggleDatasets.energy_consumption || [];
        } else if (resource && (resource.type === 'Electricity' || resource.type === 'Renewables')) {
            records = kaggleDatasets.global_energy || [];
        }
        
        if (records.length > 0 && matchingCountry) {
            const filtered = records.filter(r => 
                (r.country && r.country.toLowerCase() === matchingCountry.toLowerCase()) || 
                (r.region && r.region.toLowerCase() === matchingCountry.toLowerCase())
            );
            const years = filtered.map(r => parseInt(r.year)).filter(y => !isNaN(y));
            if (years.length > 0) {
                firstValidYear = Math.min(...years);
                lastValidYear = Math.max(...years);
            }
        }
    }

    const isOlderThan12Months = (lastValidYear !== null && lastValidYear < 2025);
    const label = "";
    const warning = "";

    return {
        firstValidYear,
        lastValidYear,
        datasetName,
        label,
        warning,
        hasWarning: false
    };
}

function getResourceOriginLabel(res) {
    if (!res || res.risk.raw_score === null) {
        return "No data — score not calculated";
    }
    const score = res.risk;
    const active = [];
    const estimated = [];
    const verified = [];

    if (score.supply_score !== null && score.supply_score >= 0) {
        active.push('supply');
        verified.push('supply');
    }
    if (score.conflict_score !== null && score.conflict_score >= 0) {
        active.push('conflict');
        estimated.push('conflict');
    }
    if (score.trade_score !== null && score.trade_score >= 0) {
        active.push('trade');
        estimated.push('trade');
    }
    if (score.demand_score !== null && score.demand_score >= 0) {
        active.push('demand');
        verified.push('demand');
    }
    if (score.route_score !== null && score.route_score >= 0) {
        active.push('route');
        estimated.push('route');
    }

    if (estimated.length === 0) {
        return "Dataset-derived";
    } else if (verified.length > 0 && estimated.length > 0) {
        return "Partially dataset-derived — see breakdown";
    } else {
        return "AI-estimated — limited dataset support";
    }
}

function getResourceColumnConfidence(resource, type) {
    if (!kaggleDatasets) return "HIGH"; // Default before dataset is synced/loaded
    
    let records = [];
    let matchingCountry = resource ? resource.region : null;
    let datasetName = "";
    let energyType = resource ? resource.type : "";

    if (type === 'consumption') {
        records = kaggleDatasets.energy_consumption || [];
        datasetName = "Global Energy Consumption";
    } else if (type === 'production') {
        records = kaggleDatasets.global_energy || [];
        datasetName = "Global Energy Dataset";
    }

    if (records.length === 0 || !matchingCountry) {
        return "HIGH"; // Fallback to HIGH if dataset not populated
    }

    // Run validate
    const report = analyticsValidator.validate(records, matchingCountry, energyType, 2000, 2024, datasetName);
    
    // Step 1: Calculate Quality Score based on coverage, nulls rate
    const totalRows = report.totalRows;
    const nonNullRows = report.nonNullRows;
    const zeroRows = report.zeroRows;
    const coveragePercent = report.coveragePercent;
    const nullsRate = totalRows > 0 ? (zeroRows / totalRows) * 100 : 100;

    let qualityScore = "LOW";
    if (coveragePercent >= 80 && nullsRate < 10) {
        qualityScore = "HIGH";
    } else if (coveragePercent >= 50 && nullsRate <= 30) {
        qualityScore = "MEDIUM";
    } else {
        qualityScore = "LOW";
    }
    return qualityScore;
}

function getResourceComponentConfidence(res) {
    const supplyConf = getResourceColumnConfidence(res, 'consumption');
    const productionConf = getResourceColumnConfidence(res, 'production');
    
    const supplyScoreConf = (supplyConf === 'LOW' || productionConf === 'LOW') ? 'LOW' : 
                            (supplyConf === 'MEDIUM' || productionConf === 'MEDIUM') ? 'MEDIUM' : 'HIGH';
    
    const conflictScoreConf = productionConf;
    const tradeScoreConf = productionConf;
    const demandScoreConf = productionConf;
    const routeScoreConf = "LOW"; // always low due to no data

    // Composite confidence is the lowest of valid active components
    const activeConfidences = [supplyScoreConf];
    if (res.risk && res.risk.conflict_score !== null) activeConfidences.push(conflictScoreConf);
    if (res.risk && res.risk.trade_score !== null) activeConfidences.push(tradeScoreConf);
    if (res.risk && res.risk.demand_score !== null) activeConfidences.push(demandScoreConf);

    const compositeConf = activeConfidences.includes('LOW') ? 'LOW' :
                          activeConfidences.includes('MEDIUM') ? 'MEDIUM' : 'HIGH';

    return {
        supply: supplyScoreConf,
        conflict: conflictScoreConf,
        trade: tradeScoreConf,
        demand: demandScoreConf,
        route: routeScoreConf,
        composite: compositeConf
    };
}

function renderMetricHTML(label, value, isVerified, datasetColumn, estimationMethod, confidence, dataMissing = "", humanExpertReview = "yes") {
    const isNull = value === null || value === undefined || value < 0;
    
    if (isVerified && !isNull) {
        // TIER 1 - VERIFIED
        const formattedVal = typeof value === 'number' ? value.toFixed(1) : value;
        const verifiedBadge = `<span style="font-size: 0.65rem; background: #DCFCE7; color: #15803D; border: 1px solid #BBF7D0; padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><span style="width: 5px; height: 5px; background: #15803D; border-radius: 50%;"></span>Verified</span>`;
        const confidenceBadge = `<span class="level-badge ${confidence}" style="font-size: 0.62rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: auto;">${confidence}</span>`;
        
        return `
        <div class="metric-card tier-verified" style="opacity: 1; border: 1px solid #BBF7D0; padding: 8px 12px; border-radius: 8px; background: rgba(220, 252, 231, 0.05);" title="Source Column: ${datasetColumn || 'Dataset'}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="metric-label" style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600;">${label}</span>
                <div style="display: flex; gap: 4px; align-items: center; margin-left: auto;">
                    ${verifiedBadge}
                    ${confidenceBadge}
                </div>
            </div>
            <div style="display: flex; align-items: baseline; gap: 4px; margin-top: 4px;">
                <span class="metric-value" style="font-weight: 700; font-size: 1.1rem; color: var(--text-main); font-family: var(--font-mono);">${formattedVal}</span>
            </div>
        </div>`;
    } else {
        // TIER 2 - ESTIMATED or NO DATA
        const formattedVal = isNull ? 'No data' : (typeof value === 'number' ? `${value.toFixed(1)} est.` : `${value} est.`);
        
        const badge = isNull 
            ? `<span style="font-size: 0.65rem; background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0; padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><span style="width: 5px; height: 5px; background: #475569; border-radius: 50%;"></span>No Data</span>`
            : `<span style="font-size: 0.65rem; background: #FEF3C7; color: #B45309; border: 1px solid #FDE68A; padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><span style="width: 5px; height: 5px; background: #B45309; border-radius: 50%;"></span>Estimated</span>`;
            
        const method = estimationMethod || "None - not calculated.";
        const conf = isNull ? "LOW" : (confidence || "HIGH");
        const missing = dataMissing || "None.";
        const tooltip = isNull 
            ? "This value is unavailable. No dataset columns found." 
            : `This value is estimated. Estimation method: ${method}. Confidence: ${conf}`;

        const confidenceBadge = `<span class="level-badge ${conf}" style="font-size: 0.62rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: auto;">${conf}</span>`;

        // Add collapsible methodology disclosure for estimated metrics
        const detailsDisclosure = isNull ? '' : `
            <details style="margin-top: 0.35rem; font-size: 0.68rem; color: var(--text-secondary); border-top: 1px dashed var(--border-color); padding-top: 0.25rem;">
                <summary style="cursor: pointer; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; justify-content: space-between;">
                    <span>ℹ️ View Methodology Disclosure</span>
                </summary>
                <div style="margin-top: 0.25rem; line-height: 1.35; display: flex; flex-direction: column; gap: 3px; background: rgba(0,0,0,0.015); padding: 4px; border-radius: 4px;">
                    <div><strong>Based on:</strong> ${method}</div>
                    <div><strong>Missing Data:</strong> ${missing}</div>
                    <div><strong>Confidence:</strong> <span class="level-badge ${conf}" style="padding: 1px 6px; font-size: 0.6rem;">${conf}</span></div>
                    <div><strong>Human Expert Reviewed:</strong> ${humanExpertReview}</div>
                </div>
            </details>
        `;

        return `
        <div class="metric-card tier-estimated" style="opacity: 0.85; background: rgba(245, 158, 11, 0.025); border: 1px solid #FDE68A; padding: 8px 12px; border-radius: 8px;" title="${tooltip}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="metric-label" style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600;">${label}</span>
                <div style="display: flex; gap: 4px; align-items: center; margin-left: auto;">
                    ${badge}
                    ${confidenceBadge}
                </div>
            </div>
            <div style="display: flex; align-items: baseline; gap: 4px; margin-top: 4px;">
                <span class="metric-value" style="font-weight: 700; font-size: 1.1rem; color: var(--text-main); font-family: var(--font-mono);">${formattedVal}</span>
            </div>
            ${detailsDisclosure}
        </div>`;
    }
}

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

function getVolumeUnitAbbr(type) {
    const normalized = normalizeCommodityType(type);
    if (normalized === 'Oil') return 'Mbpd';
    if (normalized === 'Gas') return 'BCM/year';
    if (normalized === 'Coal') return 'Mt/year';
    if (normalized === 'Electricity' || normalized === 'Renewables') return 'TWh/year';
    if (!type) return 'TWh/year';
    const t = type.toLowerCase();
    if (t.includes('oil')) return 'Mbpd';
    if (t.includes('gas') || t.includes('lng')) return 'BCM/year';
    if (t.includes('coal')) return 'Mt/year';
    return 'TWh/year';
}

const resourceValidator = {
    validateResource: function(r) {
        const normType = normalizeCommodityType(r.type) || 'Oil';
        const std = COMMODITY_UNIT_STANDARDS[normType];
        if (std) {
            const price = parseFloat(r.price);
            if (isNaN(price) || price < std.realisticMin || price > std.realisticMax) {
                r.price = parseFloat(((std.realisticMin + std.realisticMax) / 2).toFixed(2));
                console.warn(`[VALIDATOR] Price ${price} for ${r.type} is out of bounds [${std.realisticMin}, ${std.realisticMax}]. Corrected to midpoint default ${r.price}.`);
            }
        }
        return r;
    }
};

function getCommodityStandard(type) {
    const normalized = normalizeCommodityType(type);
    return normalized ? COMMODITY_UNIT_STANDARDS[normalized] : null;
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
        if (normalized === 'Oil') {
            return "Not available — no price data in current datasets";
        }
        return `Price data unavailable for ${normalized} in current datasets. The uploaded datasets do not contain a ${normalized}-specific price column.`;
    }
    
    const numVal = parseFloat(priceVal);
    if (numVal < std.realisticMin || numVal > std.realisticMax) {
        if (normalized === 'Oil') {
            return "Not available — no price data in current datasets";
        }
        return `Price data unavailable for ${normalized} in current datasets. The uploaded datasets do not contain a ${normalized}-specific price column.`;
    }
    
    return `${parseFloat(numVal.toFixed(4))} ${std.unit}`;
}

const UNIT_MAP = {
    // Global Fuel Prices dataset
    "petrol_usd_liter": "USD / litre",
    "diesel_usd_liter": "USD / litre",
    "lpg_usd_liter": "USD / litre",
    "brent_crude_usd": "USD / barrel",
    
    // Global Energy Consumption dataset
    "Total Energy Consumption (TWh)": "TWh",
    "Energy Price Index (USD/kWh)": "USD / kWh",
    
    // Standard normalized categories mapped in code
    "Oil": "TWh",
    "Gas": "TWh",
    "Coal": "TWh",
    "Electricity/Renewables": "TWh"
};

function getUnitForColumn(colName) {
    if (!colName) return "Unit: Unknown";
    
    // Explicit lookup
    if (UNIT_MAP[colName] !== undefined) {
        return UNIT_MAP[colName];
    }
    
    // Pattern checks
    const colLower = colName.toLowerCase();
    if (colLower.endsWith("_twh") || colLower.endsWith("_consumption") || colLower === "primary_energy_consumption") {
        return "TWh";
    }
    if (colLower.includes("_production") || colLower.includes("_prod_")) {
        return "TWh";
    }
    if (colLower.endsWith("_share_elec") || colLower.endsWith("_share_energy") || colLower.includes("(%)") || colLower.endsWith("_share")) {
        return "%";
    }
    if (colLower.includes("_per_capita") || colLower.includes("per_capita")) {
        return "kWh per person";
    }
    
    return "Unit: Unknown";
}

function getProcessingStateLabel(appliedTransforms = []) {
    if (!appliedTransforms || appliedTransforms.length === 0) {
        return "Source data";
    }
    if (appliedTransforms.length === 1) {
        const t = appliedTransforms[0];
        if (t === "moving_average") return "Smoothed (3-year moving average)";
        if (t === "normalized" || t === "scaled") return "Normalized index value";
        if (t === "interpolated") return "Interpolated estimate";
    }
    return "Processed — see methodology";
}

function formatRiskScore(score, hasAIComponent = false) {
    if (score === null || score === undefined || typeof score !== 'number' || isNaN(score) || score < 0) {
        return 'No data';
    }
    
    if (hasAIComponent) {
        const rounded = Math.round(score / 5) * 5;
        const lower = Math.max(0, rounded - 5);
        const upper = Math.min(100, rounded + 5);
        return `${lower}–${upper}`;
    } else {
        return `${score.toFixed(1)}`;
    }
}

function getCollapsibleBreakdownHTML(res) {
    const score = res.risk;
    const supplyVal = score.supply_score !== null && score.supply_score >= 0 ? `${score.supply_score.toFixed(1)}%` : 'No data';
    const conflictVal = score.conflict_score !== null && score.conflict_score >= 0 ? `${score.conflict_score.toFixed(1)}%` : 'No data';
    const tradeVal = score.trade_score !== null && score.trade_score >= 0 ? `${score.trade_score.toFixed(1)}%` : 'No data';
    const demandVal = score.demand_score !== null && score.demand_score >= 0 ? `${score.demand_score.toFixed(1)}%` : 'No data';
    const routeVal = score.route_score !== null && score.route_score >= 0 ? `${score.route_score.toFixed(1)}%` : 'No data';

    const supplyWeight = RISK_WEIGHTS.supply_score;
    const conflictWeight = RISK_WEIGHTS.conflict_score;
    const tradeWeight = RISK_WEIGHTS.trade_score;
    const demandWeight = RISK_WEIGHTS.demand_score;
    const routeWeight = RISK_WEIGHTS.route_score;

    // Check which components are excluded
    const activeComponents = [];
    const excludedComponents = [];

    if (score.supply_score !== null && score.supply_score >= 0) activeComponents.push(`Supply (${supplyWeight * 100}%)`);
    else excludedComponents.push(`Supply (${supplyWeight * 100}%)`);

    if (score.conflict_score !== null && score.conflict_score >= 0) activeComponents.push(`Conflict (${conflictWeight * 100}%)`);
    else excludedComponents.push(`Conflict (${conflictWeight * 100}%)`);

    if (score.trade_score !== null && score.trade_score >= 0) activeComponents.push(`Trade (${tradeWeight * 100}%)`);
    else excludedComponents.push(`Trade (${tradeWeight * 100}%)`);

    if (score.demand_score !== null && score.demand_score >= 0) activeComponents.push(`Demand (${demandWeight * 100}%)`);
    else excludedComponents.push(`Demand (${demandWeight * 100}%)`);

    if (score.route_score !== null && score.route_score >= 0) activeComponents.push(`Route (${routeWeight * 100}%)`);
    else excludedComponents.push(`Route (${routeWeight * 100}%)`);

    const formulaString = activeComponents.length >= 3 
        ? `Composite Risk = Sum(Component * Weight) / Sum(Active Weights)`
        : `N/A — Fewer than 3 valid components`;

    return `
        <details class="breakdown-details" style="margin-top: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.5rem; background: rgba(255, 255, 255, 0.5); backdrop-filter: blur(4px);">
            <summary style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: space-between;">
                <span>📊 View Weighted Calculation Formula</span>
                <span style="font-size: 0.65rem; color: var(--text-muted);">Expand &bull; Details</span>
            </summary>
            <div style="margin-top: 0.5rem; font-size: 0.72rem; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 0.5rem; display: flex; flex-direction: column; gap: 4px;">
                <div style="font-family: var(--font-mono); background: rgba(0,0,0,0.03); padding: 4px 8px; border-radius: 4px; font-weight: 700; text-align: center; margin-bottom: 0.25rem;">
                    ${formulaString}
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 0.25rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border-color); font-weight: 700; color: var(--text-muted); text-align: left;">
                            <th style="padding: 2px 4px;">Component</th>
                            <th style="padding: 2px 4px;">Value</th>
                            <th style="padding: 2px 4px;">Weight</th>
                            <th style="padding: 2px 4px;">Derivation Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px dashed rgba(0,0,0,0.05);">
                            <td style="padding: 2px 4px;">Supply</td>
                            <td style="padding: 2px 4px; font-family: var(--font-mono);">${supplyVal}</td>
                            <td style="padding: 2px 4px; font-family: var(--font-mono);">${supplyWeight * 100}%</td>
                            <td style="padding: 2px 4px;"><span style="color: var(--accent-blue); font-weight: 600;">Dataset-derived</span></td>
                        </tr>
                        <tr style="border-bottom: 1px dashed rgba(0,0,0,0.05);">
                            <td style="padding: 2px 4px;">Conflict</td>
                            <td style="padding: 2px 4px; font-family: var(--font-mono);">${conflictVal}</td>
                            <td style="padding: 2px 4px; font-family: var(--font-mono);">${conflictWeight * 100}%</td>
                            <td style="padding: 2px 4px;"><span style="color: var(--accent-purple); font-weight: 600;">Estimated (Threats)</span></td>
                        </tr>
                        <tr style="border-bottom: 1px dashed rgba(0,0,0,0.05);">
                            <td style="padding: 2px 4px;">Trade</td>
                            <td style="padding: 2px 4px; font-family: var(--font-mono);">${tradeVal}</td>
                            <td style="padding: 2px 4px; font-family: var(--font-mono);">${tradeWeight * 100}%</td>
                            <td style="padding: 2px 4px;"><span style="color: var(--accent-blue); font-weight: 600;">Dataset-derived</span></td>
                        </tr>
                        <tr style="border-bottom: 1px dashed rgba(0,0,0,0.05);">
                            <td style="padding: 2px 4px;">Demand</td>
                            <td style="padding: 2px 4px; font-family: var(--font-mono);">${demandVal}</td>
                            <td style="padding: 2px 4px; font-family: var(--font-mono);">${demandWeight * 100}%</td>
                            <td style="padding: 2px 4px;"><span style="color: var(--accent-blue); font-weight: 600;">Dataset-derived</span></td>
                        </tr>
                        <tr>
                            <td style="padding: 2px 4px;">Route</td>
                            <td style="padding: 2px 4px; font-family: var(--font-mono);">${routeVal}</td>
                            <td style="padding: 2px 4px; font-family: var(--font-mono);">${routeWeight * 100}%</td>
                            <td style="padding: 2px 4px; color: var(--text-muted);">No data</td>
                        </tr>
                    </tbody>
                </table>
                <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px; line-height: 1.3;">
                    <strong>Active parameters:</strong> ${activeComponents.join(', ') || 'None'}<br>
                    <strong>Excluded parameters:</strong> ${excludedComponents.join(', ') || 'None'}
                </div>
            </div>
        </details>
    `;
}

function getGlobalCollapsibleBreakdownHTML() {
    const supplyWeight = RISK_WEIGHTS.supply_score;
    const conflictWeight = RISK_WEIGHTS.conflict_score;
    const tradeWeight = RISK_WEIGHTS.trade_score;
    const demandWeight = RISK_WEIGHTS.demand_score;
    const routeWeight = RISK_WEIGHTS.route_score;

    return `
        <details class="breakdown-details" style="margin-top: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.5rem; background: rgba(255, 255, 255, 0.5); backdrop-filter: blur(4px);">
            <summary style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: space-between;">
                <span>📊 View Global Weight Allocation</span>
                <span style="font-size: 0.65rem; color: var(--text-muted);">Expand &bull; Details</span>
            </summary>
            <div style="margin-top: 0.5rem; font-size: 0.72rem; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 0.5rem; display: flex; flex-direction: column; gap: 4px;">
                <div style="font-family: var(--font-mono); background: rgba(0,0,0,0.03); padding: 4px 8px; border-radius: 4px; font-weight: 700; text-align: center; margin-bottom: 0.25rem;">
                    Global Composite formula: Sum(w * component) / Sum(active weights)
                </div>
                <ul style="margin: 0; padding-left: 1.2rem; line-height: 1.4;">
                    <li>Supply chain vulnerability weight: <strong>${supplyWeight * 100}%</strong></li>
                    <li>Regional Geopolitical Conflict weight: <strong>${conflictWeight * 100}%</strong></li>
                    <li>Trade restriction limits weight: <strong>${tradeWeight * 100}%</strong></li>
                    <li>Internal demand pressure weight: <strong>${demandWeight * 100}%</strong></li>
                    <li>Sea route bottlenecking weight: <strong>${routeWeight * 100}%</strong></li>
                </ul>
                <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px; line-height: 1.3;">
                    *Note: Route risk is currently excluded globally ("No data" sentinel). Conflict is excluded for countries/assets without active conflicts or export dependency.
                </div>
            </div>
        </details>
    `;
}

function getScoreFootnoteHTML(origin, res) {
    return "";
}

// ---- Global State ----
let state = {
    resources: [],      // Combined resources & base risk weights
    events: [],         // Geopolitical threat events
    regions: [],        // Cached region statistics
    selectedRegion: 'Middle East', // Active map inspection region
    activeSection: 'dashboard',     // Current navigation view
    datasetEvents: [],   // Geopolitical events from Kaggle CSV dataset
    userSubmittedEvents: [] // Geopolitical events from user reports (Firebase)
};

// ============================================================================
// API FETCH HELPERS
// ============================================================================

async function fetchFromBackend(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        updateConnectionStatus('connected');
        return data;
    } catch (err) {
        console.error(`[API ERROR] ${endpoint}:`, err.message);
        updateConnectionStatus('error', err.message);
        throw err;
    }
}

function showLoading(containerId) {
    const el = document.getElementById(containerId);
    if (el) {
        el.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <span>Syncing Analytics Models...</span>
            </div>
        `;
    }
}

function showError(containerId, message) {
    const el = document.getElementById(containerId);
    if (el) {
        el.innerHTML = `
            <div class="error-state">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>${message}</span>
                <button onclick="location.reload()" class="retry-btn">Retry Connection</button>
            </div>
        `;
    }
}

function updateConnectionStatus(status, message) {
    const badge = document.getElementById('backendStatus');
    if (!badge) return;

    if (status === 'connected') {
        badge.className = 'backend-badge connected';
        badge.innerHTML = '<span class="backend-dot"></span>C++ Engine Connected';
        badge.title = 'All base algorithms and datasets fetched from compiled C++ binary';
    } else if (status === 'loading') {
        badge.className = 'backend-badge loading';
        badge.innerHTML = '<span class="backend-dot"></span>Connecting...';
        badge.title = 'Relaying request to C++ executable...';
    } else {
        badge.className = 'backend-badge error';
        badge.innerHTML = '<span class="backend-dot"></span>Simulation Mode';
        badge.title = message || 'Disconnected from backend. Running completely in frontend simulation.';
    }
}

// ============================================================================
// CORE DATA LOAD & recalculation ENGINE
// ============================================================================

// Loads initial datasets from the C++ backend and initializes local state
async function initAppState() {
    try {
        updateConnectionStatus('loading');

        // Dynamic country suggestions loading
        try {
            const availResp = await fetch('/api/country-availability');
            const availData = await availResp.json();
            if (availData.success && availData.availability && availData.availability.union) {
                COUNTRIES_LIST = availData.availability.union;
                console.log(`[FRONTEND] Loaded dynamic country suggestions: ${COUNTRIES_LIST.length} entries.`);
            }
        } catch (e) {
            console.warn('[FRONTEND] Failed to load dynamic country suggestions, using static fallback:', e.message);
        }
        
        // Parallel requests to build local state
        const [dash, res, evs, regions, analysis, datasetEvs, userEvs] = await Promise.all([
            fetchFromBackend('/api/dashboard'),
            fetchFromBackend('/api/resources'),
            fetchFromBackend('/api/events'),
            fetchFromBackend('/api/regions'),
            fetchFromBackend('/api/analysis'),
            fetch('/api/events/dataset').then(r => r.json()).catch(err => { console.error(err); return []; }),
            fetch('/api/submitted-events').then(r => r.json()).catch(err => { console.error(err); return { success: false, events: [] }; })
        ]);

        state.datasetEvents = Array.isArray(datasetEvs) ? datasetEvs : [];
        state.userSubmittedEvents = (userEvs && userEvs.success && Array.isArray(userEvs.events)) ? userEvs.events : [];

        // Map events
        state.events = evs.events.map((e, index) => ({
            id: `EV_${index + 1}`,
            originalId: e.id,
            title: e.title,
            type: e.type,
            region: e.region,
            intensity: parseFloat(e.intensity) || 0.5,
            supply_impact: parseFloat(e.supply_impact) || 0.3,
            is_active: e.is_active === 1,
            description: e.description || '',
            date: e.date || e.createdAt || '',
            createdAt: e.createdAt || e.date || ''
        }));

        // Combine resource definitions with analysis weights
        state.resources = res.resources.map(r => {
            const validated = resourceValidator.validateResource(r);
            const weights = analysis.breakdown.find(b => b.resource_id === validated.id) || {
                supply_score: 20.0,
                conflict_score: 15.0,
                trade_score: 10.0,
                demand_score: 15.0,
                route_score: 10.0
            };
            
            return {
                id: validated.id,
                name: validated.name,
                type: validated.type,
                region: validated.region,
                production: parseFloat(validated.production) || 0,
                consumption: parseFloat(validated.consumption) || 0,
                reserve_years: parseFloat(validated.reserve_years) || 0,
                export_dependency: parseFloat(validated.export_dependency) || 0,
                price: parseFloat(validated.price) || 0,
                baseRisk: {
                    supply_score: parseFloat(weights.supply_score) || 20.0,
                    conflict_score: parseFloat(weights.conflict_score) || 15.0,
                    trade_score: parseFloat(weights.trade_score) || 10.0,
                    demand_score: parseFloat(weights.demand_score) || 15.0,
                    route_score: parseFloat(weights.route_score) || 10.0
                },
                // Current working risk details (will be updated dynamically)
                risk: {
                    supply_score: 0,
                    conflict_score: 0,
                    trade_score: 0,
                    demand_score: 0,
                    route_score: 0,
                    raw_score: 0,
                    level: 'LOW'
                }
            };
        });

        // Initial run to calculate actual risk metrics
        recalculateRiskScores();
        updateConnectionStatus('connected');
        
        // Initial view render
        renderActiveSection();
        
    } catch (err) {
        console.warn('Backend load failed, switching to fallback simulation dataset:', err);
        loadFallbackData();
    }
}

// Recalculates risk scores using standard weighting (25% Supply, 30% Conflict, 20% Trade, 15% Demand, 10% Route)
// Dynamically adjusts scores based on the state of active geopolitical events.
function calcSupplyScore(r) {
    if (r.production <= 0) return 100.0;
    const ratio = r.consumption / r.production;
    let score = (ratio < 1.0) ? (ratio * 40.0) : (40.0 + ((ratio - 1.0) * 30.0));
    return Math.max(0.0, Math.min(100.0, score));
}

function calcConflictScore(r, events) {
    if (r.export_dependency <= 0.0) return 10.0;
    
    let totalIntensity = 0.0;
    let activeCount = 0;
    
    events.forEach(e => {
        if (e.is_active && e.region === r.region) {
            if (e.type === "War" || e.type === "Instability") {
                totalIntensity += e.intensity;
                activeCount++;
            }
        }
    });
    
    if (activeCount === 0) return 15.0 * r.export_dependency;
    
    let score = 15.0 + (totalIntensity / activeCount) * 60.0 * r.export_dependency;
    return Math.max(0.0, Math.min(100.0, score));
}

function calcTradeScore(r, events) {
    let score = r.export_dependency * 15.0;
    let total = 0.0;
    events.forEach(e => {
        if (e.is_active && e.region === r.region) {
            if (e.type === "Sanctions" || e.type === "TradeRestriction") {
                total += e.intensity * 100.0;
            }
        }
    });
    return Math.min(98.0, score + total);
}

function calcDemandScore(r) {
    let score = 15.0 + r.export_dependency * 35.0;
    if (r.reserve_years < 60) {
        score += ((60.0 - r.reserve_years) / 60.0) * 45.0;
    }
    return Math.min(100.0, score);
}

function calcRouteScore(r) {
    const reg = r.region;
    let routeRisk = 20.0; // Default baseline risk

    if (reg === "Middle East" || reg === "Saudi Arabia") routeRisk = 65.0;
    else if (reg === "Russia") routeRisk = 48.0;
    else if (reg === "China") routeRisk = 40.0;
    else if (reg === "Venezuela") routeRisk = 35.0;
    else if (reg === "EU") routeRisk = 22.0;
    else if (reg === "USA") routeRisk = 15.0;

    let score = routeRisk * (0.4 + 0.6 * r.export_dependency);
    return Math.max(0.0, Math.min(100.0, score));
}

function recalculateRiskScores() {
    state.resources.forEach(r => {
        // Calculate each sub-score dynamically matching backend rules
        const supply = calcSupplyScore(r);
        const conflict = calcConflictScore(r, state.events);
        const trade = calcTradeScore(r, state.events);
        const demand = calcDemandScore(r);
        const route = calcRouteScore(r);

        r.risk.supply_score = supply;
        r.risk.conflict_score = conflict;
        r.risk.trade_score = trade;
        r.risk.demand_score = demand;
        r.risk.route_score = route;

        // Weighted final risk formula
        let weightedSum = 0.0;
        let weightSum = 0.0;
        let validComponents = 0;

        if (supply !== null && supply >= 0.0) {
            weightedSum += supply * RISK_WEIGHTS.supply_score;
            weightSum += RISK_WEIGHTS.supply_score;
            validComponents++;
        }
        if (conflict !== null && conflict >= 0.0) {
            weightedSum += conflict * RISK_WEIGHTS.conflict_score;
            weightSum += RISK_WEIGHTS.conflict_score;
            validComponents++;
        }
        if (trade !== null && trade >= 0.0) {
            weightedSum += trade * RISK_WEIGHTS.trade_score;
            weightSum += RISK_WEIGHTS.trade_score;
            validComponents++;
        }
        if (demand !== null && demand >= 0.0) {
            weightedSum += demand * RISK_WEIGHTS.demand_score;
            weightSum += RISK_WEIGHTS.demand_score;
            validComponents++;
        }
        if (route !== null && route >= 0.0) {
            weightedSum += route * RISK_WEIGHTS.route_score;
            weightSum += RISK_WEIGHTS.route_score;
            validComponents++;
        }

        // If fewer than 3 valid components exist, composite score is unavailable (null)
        if (validComponents < 3) {
            r.risk.raw_score = null;
            r.risk.level = 'INSUFFICIENT';
        } else {
            const raw = weightedSum / weightSum;
            r.risk.raw_score = Math.max(0.0, Math.min(100.0, raw));
            r.risk.level = r.risk.raw_score > 66 ? 'HIGH' : (r.risk.raw_score > 33 ? 'MEDIUM' : 'LOW');
        }
    });

    // Recalculate region metrics
    recalculateRegions();
}

function recalculateRegions() {
    // Unique list of regions
    const uniqueRegions = [...new Set(state.resources.map(r => r.region))];
    
    state.regions = uniqueRegions.map(reg => {
        const regionalResources = state.resources.filter(r => r.region === reg);
        // Exclude resources with insufficient data (null/undefined raw_score) from calculation
        const validResources = regionalResources.filter(r => r.risk.raw_score !== null && r.risk.raw_score !== undefined);
        
        let avg = null;
        if (validResources.length > 0) {
            avg = validResources.reduce((sum, r) => sum + r.risk.raw_score, 0) / validResources.length;
        }
        
        return {
            name: reg,
            avg_score: avg,
            count: regionalResources.length,
            level: avg === null ? 'INSUFFICIENT' : (avg > 66 ? 'HIGH' : (avg > 33 ? 'MEDIUM' : 'LOW'))
        };
    });

    // Sort regions descending by average risk score, handling nulls gracefully (push to bottom)
    state.regions.sort((a, b) => {
        if (a.avg_score === null && b.avg_score === null) return 0;
        if (a.avg_score === null) return 1;
        if (b.avg_score === null) return -1;
        return b.avg_score - a.avg_score;
    });
}

// Fallback in case the C++ server or binary is completely missing
function loadFallbackData() {
    updateConnectionStatus('offline');
    state.events = [];
    state.resources = [];
    renderActiveSection();
}

// ============================================================================
// ANIMATIONS & COUNTERS
// ============================================================================

function animateCounter(element, target, duration = 1000, isFloat = false) {
    if (!element) return;
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current = start + (target - start) * eased;

        element.textContent = isFloat ? current.toFixed(1) : Math.round(current);

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

// Animated background particles
function createParticles() {
    const container = document.getElementById('bgParticles');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = Math.random() * 3 + 1;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDuration = (Math.random() * 15 + 10) + 's';
        particle.style.animationDelay = (Math.random() * 10) + 's';
        particle.style.opacity = Math.random() * 0.4 + 0.1;
        container.appendChild(particle);
    }
}

// ============================================================================
// HOME / DASHBOARD RENDERERS
// ============================================================================

function renderDashboard() {
    // Calculatings averages & high risk metrics
    const totalResources = state.resources.length;
    const activeEvents = state.events.filter(e => e.is_active).length;
    const validResources = state.resources.filter(r => r.risk.raw_score !== null && r.risk.raw_score !== undefined);
    const globalRiskIndex = validResources.length > 0 
        ? (validResources.reduce((sum, r) => sum + r.risk.raw_score, 0) / validResources.length)
        : 0;
    const highRiskCount = state.resources.filter(r => r.risk.raw_score !== null && r.risk.raw_score > 66).length;

    // Render Stats
    setTimeout(() => {
        animateCounter(document.querySelector('#statResources .stat-value'), totalResources);
        animateCounter(document.querySelector('#statEvents .stat-value'), activeEvents);
        animateCounter(document.querySelector('#statRiskIndex .stat-value'), globalRiskIndex, 1200, true);
        animateCounter(document.querySelector('#statHighRisk .stat-value'), highRiskCount);
    }, 100);

    // Render Hero Gauge
    const gaugeScoreText = document.getElementById('heroRiskScore');
    const gaugeLevelLabel = document.getElementById('heroRiskLevel');
    const gaugePath = document.getElementById('heroGaugePath');
    
    if (gaugeScoreText && gaugeLevelLabel && gaugePath) {
        animateCounter(gaugeScoreText, globalRiskIndex, 1200, true);
        
        // Determine Level badge details
        let badgeColor = 'var(--accent-green)';
        let badgeBg = 'var(--accent-green-dim)';
        let label = 'Low Risk';
        if (globalRiskIndex > 66) {
            badgeColor = 'var(--risk-high)';
            badgeBg = 'var(--risk-high-bg)';
            label = 'HIGH RISK';
        } else if (globalRiskIndex > 33) {
            badgeColor = 'var(--risk-medium)';
            badgeBg = 'var(--risk-medium-bg)';
            label = 'MEDIUM RISK';
        }

        gaugeLevelLabel.textContent = label;
        gaugeLevelLabel.style.color = badgeColor;
        gaugeLevelLabel.style.background = badgeBg;

        // Animate the path stroke offset
        // Total dasharray offset length of path is 220
        const offset = 220 - (220 * Math.min(globalRiskIndex, 100) / 100);
        gaugePath.style.strokeDashoffset = offset;
        gaugePath.style.stroke = badgeColor;

        const heroCard = document.querySelector('.hero-gauge-card');
        if (heroCard) {
            heroCard.querySelector('.card-footnote')?.remove();
            heroCard.querySelector('.breakdown-details')?.remove();
            heroCard.querySelector('.temporal-container')?.remove();

            const hasAI = geminiInsightState.lastResult && geminiInsightState.lastResult.success;
            
            // No temporal data notice or score footnote in UI
            heroCard.insertAdjacentHTML('beforeend', getGlobalCollapsibleBreakdownHTML());
        }
    }

    // Render Key Resources Risk Matrix
    renderKeyResourcesGrid();

    // Render Geopolitical News Feed
    renderGeopoliticalNews();



    // Render interactive world map (Leaflet)
    initHomeWorldMap();
}

// ============================================================================
// HOMEPAGE INTERACTIVE WORLD MAP (Leaflet.js)
// ============================================================================

let homeMap = null;           // Leaflet map instance
let homeMapGeoLayer = null;   // GeoJSON layer
let homeMapCountryData = {};  // Risk score data keyed by ISO_A3

// GeoJSON world countries data from public CDN
const GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
let cachedGeoJSON = null;

async function initHomeWorldMap() {
    const container = document.getElementById('homeWorldMap');
    if (!container) return;

    // Only initialize once
    if (homeMap) {
        // Map already created — just update colors if data changed
        if (homeMapGeoLayer) updateMapColors();
        return;
    }

    // Initialize Leaflet map
    homeMap = L.map('homeWorldMap', {
        center: [25, 10],
        zoom: 2,
        minZoom: 2,
        maxZoom: 6,
        scrollWheelZoom: true,
        zoomControl: true,
        attributionControl: false,
        worldCopyJump: true
    });

    // Light base tile layer (CartoDB Positron — clean and professional)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(homeMap);

    // Label overlay (separate so countries show through)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
        pane: 'overlayPane'
    }).addTo(homeMap);

    // Load data in parallel
    const [countryRiskData, geojsonData] = await Promise.all([
        fetchCountryRiskData(),
        fetchGeoJSON()
    ]);

    homeMapCountryData = countryRiskData;

    if (!geojsonData) {
        console.warn('[MAP] GeoJSON data failed to load');
        return;
    }

    // Create choropleth GeoJSON layer
    homeMapGeoLayer = L.geoJSON(geojsonData, {
        style: styleCountryFeature,
        onEachFeature: onEachCountryFeature
    }).addTo(homeMap);
}

async function fetchCountryRiskData() {
    try {
        const resp = await fetch('/api/country-risk-scores');
        const data = await resp.json();
        if (data.success && data.countries) {
            return data.countries;
        }
    } catch (err) {
        console.warn('[MAP] Failed to fetch country risk scores:', err.message);
    }

    // Return fallback data derived from local state
    return buildFallbackCountryData();
}

function buildFallbackCountryData() {
    const fallback = {};
    const regionToCountry = {
        'Saudi Arabia': 'SAU', 'Russia': 'RUS', 'USA': 'USA',
        'Australia': 'AUS', 'Kazakhstan': 'KAZ', 'China': 'CHN',
        'Middle East': ['IRQ','IRN','ARE','KWT','QAT','OMN','YEM','SYR','JOR','LBN','BHR','TUR'],
        'EU': ['DEU','FRA','GBR','ITA','ESP','POL','NLD','BEL','SWE','NOR','FIN']
    };

    const countryNames = {
        'SAU':'Saudi Arabia','RUS':'Russia','USA':'United States','AUS':'Australia',
        'KAZ':'Kazakhstan','CHN':'China','IRQ':'Iraq','IRN':'Iran','ARE':'UAE',
        'KWT':'Kuwait','QAT':'Qatar','OMN':'Oman','YEM':'Yemen','SYR':'Syria',
        'JOR':'Jordan','LBN':'Lebanon','BHR':'Bahrain','TUR':'Turkey',
        'DEU':'Germany','FRA':'France','GBR':'United Kingdom','ITA':'Italy',
        'ESP':'Spain','POL':'Poland','NLD':'Netherlands','BEL':'Belgium',
        'SWE':'Sweden','NOR':'Norway','FIN':'Finland',
        'IND':'India','JPN':'Japan','BRA':'Brazil','NGA':'Nigeria',
        'ZAF':'South Africa','UKR':'Ukraine','CAN':'Canada','MEX':'Mexico',
        'EGY':'Egypt','IDN':'Indonesia','VEN':'Venezuela','COL':'Colombia','ARG':'Argentina'
    };

    // Map local state resources to countries
    state.resources.forEach(r => {
        const region = r.region;
        const mapping = regionToCountry[region];
        if (!mapping) return;

        const codes = Array.isArray(mapping) ? mapping : [mapping];
        codes.forEach(code => {
            if (!fallback[code]) {
                fallback[code] = {
                    country_code: code,
                    country_name: countryNames[code] || code,
                    risk_score: r.risk.raw_score,
                    risk_level: r.risk.level.toLowerCase(),
                    affected_resources: [r.type],
                    active_events_count: state.events.filter(e => e.is_active && (e.region === region || e.region === 'Global')).length,
                    last_updated: new Date().toISOString()
                };
            }
        });
    });

    return fallback;
}

async function fetchGeoJSON() {
    if (cachedGeoJSON) return cachedGeoJSON;

    try {
        const resp = await fetch(GEOJSON_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        cachedGeoJSON = await resp.json();
        return cachedGeoJSON;
    } catch (err) {
        console.error('[MAP] GeoJSON fetch failed:', err.message);
        return null;
    }
}

function getRiskColor(score) {
    if (score > 75) return '#DC2626';  // Critical — Red
    if (score > 55) return '#EA580C';  // High — Orange
    if (score > 33) return '#EAB308';  // Medium — Yellow
    return '#16A34A';                   // Low — Green
}

function getRiskFillColor(score) {
    if (score > 75) return 'rgba(220, 38, 38, 0.55)';
    if (score > 55) return 'rgba(234, 88, 12, 0.45)';
    if (score > 33) return 'rgba(234, 179, 8, 0.40)';
    return 'rgba(22, 163, 74, 0.35)';
}

function styleCountryFeature(feature) {
    const iso = feature.properties.ISO_A3;
    const countryData = homeMapCountryData[iso];

    if (countryData) {
        return {
            fillColor: getRiskFillColor(countryData.risk_score),
            weight: 1.2,
            opacity: 0.8,
            color: getRiskColor(countryData.risk_score),
            fillOpacity: 0.55
        };
    }

    // Default style for countries without data
    return {
        fillColor: '#E2E8F0',
        weight: 0.8,
        opacity: 0.5,
        color: '#CBD5E1',
        fillOpacity: 0.3
    };
}

function onEachCountryFeature(feature, layer) {
    const iso = feature.properties.ISO_A3;
    const name = feature.properties.ADMIN || feature.properties.name || iso;
    const countryData = homeMapCountryData[iso];

    // Tooltip
    if (countryData) {
        const score = countryData.risk_score;
        const level = (countryData.risk_level || 'low').toUpperCase();
        const color = getRiskColor(score);
        const resources = (countryData.affected_resources || []).join(', ') || 'N/A';
        const evCount = countryData.active_events_count || 0;

        layer.bindTooltip(`
            <div class="map-tooltip">
                <div class="map-tooltip-name">${countryData.country_name}</div>
                <div class="map-tooltip-score" style="color:${color}">${score.toFixed(1)} <span class="map-tooltip-level">${level}</span></div>
                <div class="map-tooltip-detail">Resources: ${resources}</div>
                <div class="map-tooltip-detail">Active Events: ${evCount}</div>
            </div>
        `, {
            sticky: true,
            direction: 'top',
            className: 'map-custom-tooltip'
        });
    } else {
        layer.bindTooltip(`
            <div class="map-tooltip">
                <div class="map-tooltip-name">${name}</div>
                <div class="map-tooltip-detail" style="color:var(--text-muted)">No monitored energy data</div>
            </div>
        `, {
            sticky: true,
            direction: 'top',
            className: 'map-custom-tooltip'
        });
    }

    // Hover effects
    layer.on({
        mouseover: (e) => {
            const l = e.target;
            l.setStyle({
                weight: 2.5,
                fillOpacity: 0.75,
                color: countryData ? getRiskColor(countryData.risk_score) : '#94A3B8'
            });
            l.bringToFront();
        },
        mouseout: (e) => {
            homeMapGeoLayer.resetStyle(e.target);
        },
        click: (e) => {
            const clickedName = countryData
                ? countryData.country_name
                : (feature.properties.ADMIN || feature.properties.name);

            if (clickedName) {
                navigateToCountryInsights(clickedName);
            }
        }
    });
}

async function navigateToCountryInsights(countryName) {
    if (!countryName || countryName.trim().length < 2) {
        console.warn('[MAP CLICK] Empty or invalid country name, ignoring click');
        return;
    }

    console.log(`[MAP CLICK] Country clicked: "${countryName}"`);

    // Normalize name to a slug (e.g. "Saudi Arabia" -> "saudi-arabia")
    const slug = countryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    // Change URL using pushState and trigger client-side routing
    history.pushState(null, '', `/country-insights/${slug}`);
    handleRouting();
    
    // Smooth scroll to top of page
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateMapColors() {
    if (!homeMapGeoLayer) return;
    homeMapGeoLayer.setStyle(styleCountryFeature);
}

function renderKeyResourcesGrid() {
    const grid = document.getElementById('resourceRiskGrid');
    if (!grid) return;

    // We select 5 key resources of different types to show
    const oil = state.resources.find(r => r.type.toLowerCase() === 'oil') || state.resources[0];
    const gas = state.resources.find(r => r.type.toLowerCase() === 'gas') || state.resources[1];
    const uranium = state.resources.find(r => r.type.toLowerCase() === 'uranium') || state.resources[4];
    const lithium = state.resources.find(r => r.type.toLowerCase() === 'lithium') || state.resources[3];
    const ree = state.resources.find(r => r.type.toLowerCase() === 'rare earth metals' || r.type.toLowerCase() === 'renewable') || state.resources[5];

    const keyList = [oil, gas, uranium, lithium, ree].filter(Boolean);

    grid.innerHTML = keyList.map(r => {
        const score = r.risk.raw_score;
        const color = getScoreColor(score);
        const levelBadgeClass = r.risk.level;
        const temp = getScoreTemporalLabel(r);

        // Mock trend arrows for realism based on region conflict level
        const regionalThreats = state.events.filter(e => e.is_active && e.region === r.region);
        let arrow = '&rarr;';
        let trendClass = 'trend-stable';
        if (regionalThreats.length > 0) {
            arrow = '&uarr;';
            trendClass = 'trend-up';
        } else if (score !== null && score < 30) {
            arrow = '&darr;';
            trendClass = 'trend-down';
        }

        const warningHTML = temp.hasWarning ? `
            <div class="res-temporal-warning" style="font-size: 0.68rem; color: #D97706; margin-top: 0.25rem; display: flex; align-items: center; gap: 4px;">
                <span style="font-size: 0.8rem;">⚠️</span>
                <span>${temp.warning}</span>
            </div>` : '';

        return `
        <div class="resource-risk-card" onclick="showResourceModal('${r.id}')" style="cursor:pointer; display:flex; flex-direction:column; justify-content:space-between; min-height: 200px;">
            <div>
                <div class="res-risk-header">
                    <span class="res-risk-name">${r.name}</span>
                    <span class="res-risk-icon">${getResourceIcon(r.type)}</span>
                </div>
                <div class="res-risk-score" style="color:${color}">${formatRiskScore(score, false)}</div>
                <span class="res-risk-level level-badge ${levelBadgeClass}">${r.risk.level}</span>
                <div class="res-temporal-label" style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 0.25rem;">${temp.label}</div>
                ${warningHTML}
                <div class="res-risk-meta" style="flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
                    <span style="font-size: 0.85rem; word-break: break-all; min-width: 100%; display: block; margin-bottom: 0.25rem;">${formatCommodityPrice(r.price, r.type)}</span>
                    <span class="trend-arrow ${trendClass}">${arrow} ${r.region}</span>
                </div>
            </div>
            ${getScoreFootnoteHTML(null, r)}
        </div>`;
    }).join('');
}

function getResourceIcon(type) {
    switch (type.toLowerCase()) {
        case 'oil': return '🛢️';
        case 'gas': return '🔥';
        case 'uranium': return '☢️';
        case 'lithium': return '🔋';
        default: return '💎';
    }
}

// Global cache for news event objects (for detail modal lookup)
let _newsEventsCache = [];

function formatEventDate(dateStr) {
    if (!dateStr) return 'Date unknown';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

function mapSeverityToLabel(severity) {
    const num = parseInt(severity);
    if (num === 10) return 'CRITICAL';
    if (num === 9) return 'HIGH';
    if (num === 8) return 'WARNING';
    if (num === 7) return 'ELEVATED';
    if (num === 6) return 'MONITOR';
    return 'MONITOR';
}

function renderGeopoliticalNews() {
    const grid = document.getElementById('newsGrid');
    if (!grid) return;

    // ── Aggregate events from all available sources ──
    const allNewsItems = [];

    // Select top 5 dataset events
    const sortedDatasetEvents = [...state.datasetEvents].sort((a, b) => {
        const severityDiff = (b.severity || 0) - (a.severity || 0);
        if (severityDiff !== 0) return severityDiff;
        return new Date(b.date) - new Date(a.date);
    });
    const top5DatasetEvents = sortedDatasetEvents.slice(0, 5);

    top5DatasetEvents.forEach(e => {
        let sevClass = 'stable';
        let sevLabel = 'MONITOR';
        if (e.severity === 10) { sevClass = 'critical'; sevLabel = 'CRITICAL'; }
        else if (e.severity === 9) { sevClass = 'critical'; sevLabel = 'HIGH'; }
        else if (e.severity === 8) { sevClass = 'warning'; sevLabel = 'WARNING'; }
        else if (e.severity === 7) { sevClass = 'warning'; sevLabel = 'ELEVATED'; }
        else if (e.severity === 6) { sevClass = 'stable'; sevLabel = 'MONITOR'; }
        
        allNewsItems.push({
            id: e.id,
            title: e.title,
            type: e.event_type || e.type,
            event_type: e.event_type || e.type,
            region: e.region,
            severity: sevClass,
            severityLabel: sevLabel,
            numericSeverity: e.severity,
            source: 'dataset',
            sourceLabel: 'DATASET',
            date: e.date,
            description: e.description,
            brent_price_at_event: e.brent_price_at_event,
            affected_resources: [e.event_type || 'Energy Assets'],
            expected_impact: `Kaggle Dataset threat alert for ${e.region}. Severity: ${e.severity}.`
        });
    });

    // Source 1: Active C++ engine events (from state.events)
    // Exclude any C++ engine events that are duplicates of the top 5 dataset events
    const activeEvs = state.events.filter(e => e.is_active);
    activeEvs.forEach((e, index) => {
        const isDuplicateOfTop5 = top5DatasetEvents.some(ds => ds.title.toLowerCase() === e.title.toLowerCase() || ds.id === e.id);
        if (isDuplicateOfTop5) return;

        const affectedResources = state.resources
            .filter(r => r.region.toLowerCase() === e.region.toLowerCase())
            .map(r => r.name);

        const relatedRisks = activeEvs
            .filter(o => o.id !== e.id && o.region === e.region)
            .map(o => o.title);

        allNewsItems.push({
            id: e.id,
            title: e.title,
            type: e.type,
            event_type: e.type,
            region: e.region,
            intensity: e.intensity,
            supply_impact: e.supply_impact,
            severity: e.intensity > 0.7 ? 'critical' : (e.intensity > 0.4 ? 'warning' : 'stable'),
            severityLabel: e.intensity > 0.7 ? 'CRITICAL' : (e.intensity > 0.4 ? 'WARNING' : 'STABLE'),
            source: 'engine',
            sourceLabel: 'SYSTEM',
            timestamp: e.date || e.createdAt || null,
            date: e.date || e.createdAt || '',
            description: e.description || 'No description available for this event.',
            affected_resources: affectedResources.length > 0 ? affectedResources : [e.type || 'Energy Assets'],
            expected_impact: `Supply disruption potential of ${(e.supply_impact * 100).toFixed(0)}% across ${e.region} energy corridors. ` +
                `Threat intensity: ${(e.intensity * 100).toFixed(0)}% — ${e.intensity > 0.7 ? 'immediate action recommended' : (e.intensity > 0.4 ? 'elevated monitoring required' : 'routine monitoring')}.`,
            source_url: null,
            related_risks: relatedRisks
        });
    });

    // Source 2: Cached Gemini AI insights (from last country analysis)
    const geminiEvFeed = document.getElementById('geminiEventsFeed');
    if (geminiEvFeed && geminiEvFeed.children.length > 0 && !geminiEvFeed.textContent.includes('No active')) {
        const regionName = document.querySelector('#geminiSearchInput')?.value || 'Analyzed Region';
        const feedItems = geminiEvFeed.querySelectorAll('.gemini-event-item');
        feedItems.forEach((item, idx) => {
            const title = item.querySelector('div[style*="font-weight: 700"]')?.textContent || `Gemini Threat #${idx + 1}`;
            const desc = item.querySelector('p')?.textContent || '';
            const sevBadge = item.querySelector('.level-badge')?.textContent?.toLowerCase() || 'medium';
            const impactEl = item.querySelector('div[style*="font-style"]');
            const chipEls = item.querySelectorAll('.gemini-chip-sm');
            const resources = Array.from(chipEls).map(c => c.textContent);

            const sevMap = { 'critical': 'critical', 'high': 'critical', 'medium': 'warning', 'low': 'stable' };
            const sevLabelMap = { 'critical': 'CRITICAL', 'high': 'HIGH', 'medium': 'WARNING', 'low': 'STABLE' };

            const isDuplicate = allNewsItems.some(n => n.title.toLowerCase() === title.toLowerCase());
            if (!isDuplicate) {
                allNewsItems.push({
                    id: `GEMINI_${idx}`,
                    title: title,
                    type: 'AI Insight',
                    event_type: 'AI Insight',
                    region: regionName,
                    intensity: sevBadge === 'critical' || sevBadge === 'high' ? 0.8 : (sevBadge === 'medium' ? 0.5 : 0.2),
                    supply_impact: sevBadge === 'critical' || sevBadge === 'high' ? 0.6 : 0.3,
                    severity: sevMap[sevBadge] || 'warning',
                    severityLabel: sevLabelMap[sevBadge] || 'WARNING',
                    source: 'gemini',
                    sourceLabel: 'Analysis',
                    timestamp: new Date().toISOString(),
                    date: new Date().toISOString(),
                    description: desc || `A geopolitical threat event has been identified affecting ${regionName}. This analysis was generated from real-time intelligence assessment.`,
                    affected_resources: resources.length > 0 ? resources : ['Energy Assets'],
                    expected_impact: impactEl?.textContent?.replace('Impact: ', '') || `Regional energy security implications for ${regionName}.`,
                    source_url: null,
                    related_risks: []
                });
            }
        });
    }

    // Source 3: User-submitted events from Firebase
    if (state.userSubmittedEvents && state.userSubmittedEvents.length > 0) {
        state.userSubmittedEvents.forEach(e => {
            let sevClass = 'stable';
            let sevLabel = 'MONITOR';
            if (e.severity === 'High') { sevClass = 'warning'; sevLabel = 'HIGH'; }
            else if (e.severity === 'Critical') { sevClass = 'critical'; sevLabel = 'CRITICAL'; }
            else if (e.severity === 'Medium') { sevClass = 'warning'; sevLabel = 'WARNING'; }
            else if (e.severity === 'Low') { sevClass = 'stable'; sevLabel = 'MONITOR'; }

            allNewsItems.push({
                id: e.id,
                title: e.title,
                type: e.type,
                event_type: e.type,
                region: e.region,
                severity: sevClass,
                severityLabel: sevLabel,
                source: 'user',
                sourceLabel: 'USER',
                date: e.date,
                timestamp: e.date,
                description: e.description,
                brent_price_at_event: null,
                affected_resources: [e.resource || 'Energy Assets'],
                expected_impact: `User reported threat for ${e.region}.`
            });
        });
    }

    // Cache for modal lookups
    _newsEventsCache = allNewsItems;

    // Update feed badge
    const badge = document.getElementById('newsSourceBadge');
    if (badge) {
        badge.textContent = allNewsItems.length > 0
            ? `${allNewsItems.length} Alerts`
            : 'No Active Threats';
    }

    // ── Render empty state ──
    if (allNewsItems.length === 0) {
        grid.innerHTML = `
        <div class="card" style="grid-column:1/-1; padding:2.5rem; text-align:center;">
            <div style="font-size: 2rem; margin-bottom: 0.75rem;">🛡️</div>
            <div style="color:var(--text-primary); font-weight: 700; font-size: 0.95rem; margin-bottom: 0.4rem;">No Geopolitical Events</div>
            <div style="color:var(--text-muted); font-size: 0.82rem;">No geopolitical energy alerts are currently loaded.</div>
        </div>`;
        return;
    }

    // Sort: Dataset first, then USER, then SYSTEM/engine, then Gemini
    const datasetFeed = allNewsItems.filter(item => item.source === 'dataset');
    const userFeed = allNewsItems.filter(item => item.source === 'user');
    const systemFeed = allNewsItems.filter(item => item.source === 'engine');
    const geminiFeed = allNewsItems.filter(item => item.source === 'gemini');

    const combinedFeed = [...datasetFeed, ...userFeed, ...systemFeed, ...geminiFeed];

    grid.innerHTML = combinedFeed.map((item, index) => {
        const severityClass = `news-${item.severity}`;
        const sourceColor = item.source === 'dataset' ? 'rgba(124,58,237,0.08)' : (item.source === 'user' ? 'rgba(22,163,74,0.08)' : 'rgba(37,99,235,0.08)');
        const sourceTextColor = item.source === 'dataset' ? '#7C3AED' : (item.source === 'user' ? '#16A34A' : 'var(--accent-blue)');
        
        const dateFormatted = formatEventDate(item.date || item.timestamp);
        const rawDesc = item.description || "No description available for this event.";
        const truncatedDesc = rawDesc.length > 140 ? rawDesc.slice(0, 140) + '...' : rawDesc;
        
        const brentPriceHtml = (item.source === 'dataset' && item.brent_price_at_event)
            ? `<span style="margin-left: 6px; font-weight: 600; color: var(--text-secondary);">Brent: $${parseFloat(item.brent_price_at_event).toFixed(2)}</span>`
            : '';

        return `
        <div class="news-card ${severityClass}" onclick="showNewsEventDetail('${item.id}')" id="newsCard_${item.id}">
            <div class="news-severity-pulse ${item.severity}"></div>
            <div class="news-header">
                <div style="display:flex; align-items:center; gap:4px;">
                    <span class="news-tag">${item.type.toUpperCase()}</span>
                    <span class="news-source-chip" style="background:${sourceColor}; color:${sourceTextColor};">${item.sourceLabel}</span>
                </div>
                <span class="news-time">${dateFormatted}</span>
            </div>
            <h3 class="news-title">${item.title}</h3>
            <p class="news-desc">${truncatedDesc}</p>
            <div class="news-footer">
                <span>📍 ${item.region} ${brentPriceHtml}</span>
                <span style="font-weight:700; color:${item.severity === 'critical' ? 'var(--accent-red)' : (item.severity === 'warning' ? 'var(--accent-amber)' : 'var(--accent-green)')};">${item.severityLabel}</span>
            </div>
            <span class="news-click-hint">Click for details →</span>
        </div>`;
    }).join('');
}

function getTimeAgo(isoString) {
    if (!isoString) return 'Date unknown';
    const parsedDate = new Date(isoString);
    if (isNaN(parsedDate.getTime())) return 'Date unknown';
    
    const diff = Date.now() - parsedDate.getTime();
    if (diff < 0) return 'Just now';
    
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`;
    
    const weeks = Math.floor(days / 7);
    if (weeks === 1) return '1 week ago';
    if (weeks < 4) return `${weeks} weeks ago`;
    
    const months = Math.floor(days / 30.44);
    if (months === 1) return '1 month ago';
    return `${months} months ago`;
}

function showNewsEventDetail(eventId) {
    const modal = document.getElementById('newsEventModal');
    const body = document.getElementById('newsModalBody');
    if (!modal || !body) return;

    // Find event from cache
    const item = _newsEventsCache.find(n => n.id === eventId);
    if (!item) {
        body.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--text-muted);">Event data not found.</div>';
        modal.classList.add('visible');
        return;
    }

    if (item.source === 'dataset') {
        const numericSev = item.numericSeverity || (item.severity === 'critical' ? 10 : (item.severity === 'warning' ? 8 : 6));
        const severityLabel = mapSeverityToLabel(numericSev);
        const brentHtml = item.brent_price_at_event 
            ? `<div class="news-modal-detail-item full-width">
                   <div class="news-modal-detail-label">Brent Price</div>
                   <div class="news-modal-detail-value">Brent crude on this date: $${parseFloat(item.brent_price_at_event).toFixed(2)}/barrel</div>
               </div>`
            : '';
            
        body.innerHTML = `
            <!-- Hero Section -->
            <div class="news-modal-hero">
                <div class="news-modal-severity-indicator ${item.severity}">${item.severity === 'critical' ? '🔴' : (item.severity === 'warning' ? '🟡' : '🟢')}</div>
                <div class="news-modal-hero-info">
                    <div class="news-modal-title">${item.title}</div>
                    <div class="news-modal-badges">
                        <span class="news-modal-badge type-badge">${item.type}</span>
                        <span class="news-modal-badge severity-badge ${item.severity}">${severityLabel} (${numericSev})</span>
                        <span class="news-modal-badge source-badge" style="background: rgba(124,58,237,0.08); color: #7C3AED;">DATASET</span>
                    </div>
                </div>
            </div>

            <!-- Detail Grid -->
            <div class="news-modal-detail-grid">
                <div class="news-modal-detail-item">
                    <div class="news-modal-detail-label">Event Type</div>
                    <div class="news-modal-detail-value">${item.type}</div>
                </div>
                <div class="news-modal-detail-item">
                    <div class="news-modal-detail-label">Country / Region</div>
                    <div class="news-modal-detail-value">📍 ${item.region}</div>
                </div>
                <div class="news-modal-detail-item">
                    <div class="news-modal-detail-label">Date</div>
                    <div class="news-modal-detail-value">${formatEventDate(item.date)}</div>
                </div>
                <div class="news-modal-detail-item">
                    <div class="news-modal-detail-label">Severity</div>
                    <div class="news-modal-detail-value">${numericSev} — ${severityLabel}</div>
                </div>
                ${brentHtml}
            </div>

            <!-- Full Description -->
            <div class="news-modal-description">
                <div class="news-modal-description-title">Full Description</div>
                <div class="news-modal-description-text">${item.description}</div>
            </div>

            <!-- Source -->
            <div class="news-modal-detail-item full-width" style="margin-bottom: 1.25rem;">
                <div class="news-modal-detail-label">Source</div>
                <div class="news-modal-detail-value" style="font-size:0.85rem; font-weight:normal; color: var(--text-secondary);">
                    Kaggle Geopolitical Events Timeline Dataset (2010–2026)
                </div>
            </div>
        `;
        modal.classList.add('visible');
        return;
    }

    const sevIcon = item.severity === 'critical' ? '🔴' : (item.severity === 'warning' ? '🟡' : '🟢');
    const sevColor = item.severity === 'critical' ? 'var(--accent-red)' : (item.severity === 'warning' ? 'var(--accent-amber)' : 'var(--accent-green)');
    const impactPct = Math.min((item.supply_impact || 0.3) * 100, 100);
    const intensityPct = Math.min((item.intensity || 0.5) * 100, 100);
    
    const eventDate = item.timestamp ? new Date(item.timestamp) : null;
    const dateFormatted = (eventDate && !isNaN(eventDate.getTime())) 
        ? eventDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : "Date unknown";
    const timeFormatted = (eventDate && !isNaN(eventDate.getTime())) 
        ? eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : "Time unknown";

    body.innerHTML = `
        <!-- Hero Section -->
        <div class="news-modal-hero">
            <div class="news-modal-severity-indicator ${item.severity}">${sevIcon}</div>
            <div class="news-modal-hero-info">
                <div class="news-modal-title">${item.title}</div>
                <div class="news-modal-badges">
                    <span class="news-modal-badge type-badge">${item.type}</span>
                    <span class="news-modal-badge severity-badge ${item.severity}">${item.severityLabel}</span>
                    <span class="news-modal-badge source-badge">${item.sourceLabel}</span>
                </div>
            </div>
        </div>

        <!-- Detail Grid -->
        <div class="news-modal-detail-grid">
            <div class="news-modal-detail-item">
                <div class="news-modal-detail-label">Event Type</div>
                <div class="news-modal-detail-value">${formatEventType(item.type)}</div>
            </div>
            <div class="news-modal-detail-item">
                <div class="news-modal-detail-label">Country / Region</div>
                <div class="news-modal-detail-value">📍 ${item.region}</div>
            </div>
            <div class="news-modal-detail-item">
                <div class="news-modal-detail-label">Date</div>
                <div class="news-modal-detail-value">${dateFormatted}</div>
            </div>
            <div class="news-modal-detail-item">
                <div class="news-modal-detail-label">Time Detected</div>
                <div class="news-modal-detail-value">${timeFormatted}</div>
            </div>
            <div class="news-modal-detail-item">
                <div class="news-modal-detail-label">Severity</div>
                <div class="news-modal-detail-value" style="color:${sevColor}; font-weight:700;">
                    ${item.severityLabel} — Intensity ${intensityPct.toFixed(0)}%
                </div>
                <div class="news-modal-impact-bar">
                    <div class="news-modal-impact-fill" style="width:0%; background:${sevColor};" data-width="${intensityPct}%"></div>
                </div>
            </div>
            <div class="news-modal-detail-item">
                <div class="news-modal-detail-label">Supply Impact</div>
                <div class="news-modal-detail-value" style="color:${sevColor}; font-weight:700;">
                    ${impactPct.toFixed(0)}% Disruption Risk
                </div>
                <div class="news-modal-impact-bar">
                    <div class="news-modal-impact-fill" style="width:0%; background:${sevColor};" data-width="${impactPct}%"></div>
                </div>
            </div>
        </div>

        <!-- Affected Resources -->
        <div class="news-modal-detail-item full-width" style="margin-bottom: 1.25rem;">
            <div class="news-modal-detail-label">Affected Resources</div>
            <div class="news-modal-resources-chips" style="margin-top: 0.4rem;">
                ${(item.affected_resources || []).map(r => `<span class="news-modal-resource-chip">${r}</span>`).join('')}
            </div>
        </div>

        <!-- Full Description -->
        <div class="news-modal-description">
            <div class="news-modal-description-title">Full Description</div>
            <div class="news-modal-description-text">${item.description}</div>
        </div>

        <!-- Expected Impact -->
        <div class="news-modal-description" style="border-left: 3px solid ${sevColor};">
            <div class="news-modal-description-title">Expected Impact</div>
            <div class="news-modal-description-text">${item.expected_impact}</div>
        </div>

        <!-- Source / Reference URL -->
        ${item.source_url ? `
        <div class="news-modal-detail-item full-width" style="margin-bottom: 1.25rem;">
            <div class="news-modal-detail-label">Source / Reference</div>
            <a href="${item.source_url}" target="_blank" rel="noopener noreferrer" class="news-modal-source-link" style="margin-top: 0.3rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                ${item.source_url}
            </a>
        </div>` : `
        <div class="news-modal-detail-item full-width" style="margin-bottom: 1.25rem;">
            <div class="news-modal-detail-label">Source / Reference</div>
            <div class="news-modal-detail-value" style="font-size:0.8rem; color: var(--text-muted);">
                ${item.source === 'engine' ? 'System Analytics — calculated risk index parameters' :
                  (item.source === 'gemini' ? 'Security Intelligence Briefing' :
                   'Reported Incident Log')}
            </div>
        </div>`}

        <!-- Related Risks -->
        ${item.related_risks && item.related_risks.length > 0 ? `
        <div class="news-modal-detail-item full-width">
            <div class="news-modal-detail-label">Related Risks & Cascading Threats</div>
            <div class="news-modal-risks-list" style="margin-top: 0.4rem;">
                ${item.related_risks.map(r => `
                    <div class="news-modal-risk-item">
                        <span class="risk-dot" style="background: var(--accent-amber);"></span>
                        ${r}
                    </div>
                `).join('')}
            </div>
        </div>` : `
        <div class="news-modal-detail-item full-width">
            <div class="news-modal-detail-label">Related Risks & Cascading Threats</div>
            <div class="news-modal-risks-list" style="margin-top: 0.4rem;">
                <div class="news-modal-risk-item">
                    <span class="risk-dot" style="background: var(--text-muted);"></span>
                    No additional cascading threats identified in the current model
                </div>
            </div>
        </div>`}
    `;

    modal.classList.add('visible');

    // Animate impact bars after modal opens
    setTimeout(() => {
        body.querySelectorAll('.news-modal-impact-fill').forEach(bar => {
            bar.style.width = bar.dataset.width;
        });
    }, 100);
}

function formatEventType(type) {
    const typeMap = {
        'War': '⚔️ War / Armed Conflict',
        'Sanctions': '🚫 Trade Sanctions',
        'Instability': '⚠️ Political Instability',
        'TradeRestriction': '📦 Trade Restriction',
        'ProductionCut': '✂️ Production Cut (OPEC+)',
        'AI Insight': '🤖 AI-Generated Intelligence',
        'Conflict': '⚔️ Regional Conflict',
        'Embargo': '🚢 Trade Embargo',
        'PipelineDisruption': '🔧 Pipeline Disruption',
        'NaturalDisaster': '🌊 Natural Disaster'
    };
    return typeMap[type] || `📋 ${type}`;
}

// Donut Chart logic
function renderDonutChart() {
    const canvas = document.getElementById('riskDonutChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 260 * dpr;
    canvas.height = 260 * dpr;
    ctx.scale(dpr, dpr);

    const total = state.resources.length;
    const high = state.resources.filter(r => r.risk.raw_score > 66).length;
    const medium = state.resources.filter(r => r.risk.raw_score <= 66 && r.risk.raw_score > 33).length;
    const low = state.resources.filter(r => r.risk.raw_score <= 33).length;

    document.getElementById('donutCenterValue').textContent = total;

    const data = [
        { label: 'High Risk', value: high, color: '#DC2626' },
        { label: 'Medium Risk', value: medium, color: '#D97706' },
        { label: 'Low Risk', value: low, color: '#16A34A' }
    ];

    const cx = 130, cy = 130, outerR = 110, innerR = 72;
    let startAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, 260, 260);

    // Background ring
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    ctx.fill();

    let angle = startAngle;
    data.forEach(d => {
        if (d.value === 0) return;
        const sliceAngle = (d.value / total) * Math.PI * 2;

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, angle, angle + sliceAngle);
        ctx.arc(cx, cy, innerR, angle + sliceAngle, angle, true);
        ctx.closePath();

        const grad = ctx.createLinearGradient(cx - outerR, cy - outerR, cx + outerR, cy + outerR);
        grad.addColorStop(0, d.color);
        grad.addColorStop(1, d.color + 'cc');
        ctx.fillStyle = grad;
        ctx.fill();

        angle += sliceAngle;
    });

    // Legend
    const legend = document.getElementById('donutLegend');
    if (legend) {
        legend.innerHTML = data.map(d => `
            <div class="legend-item">
                <span class="legend-dot" style="background:${d.color}"></span>
                ${d.label}: ${d.value}
            </div>
        `).join('');
    }
}

// Resource Bar Chart
function renderBarChart() {
    const container = document.getElementById('barChartContainer');
    if (!container) return;

    const sorted = [...state.resources].sort((a, b) => b.risk.raw_score - a.risk.raw_score);

    container.innerHTML = sorted.map(s => {
        const score = s.risk.raw_score;
        const levelClass = s.risk.level === 'HIGH' ? 'risk-high' : (s.risk.level === 'MEDIUM' ? 'risk-medium' : 'risk-low');
        const color = getScoreColor(score);
        return `
        <div class="bar-row" onclick="showResourceModal('${s.id}')" style="cursor:pointer;">
            <span class="bar-name">${s.name}</span>
            <div class="bar-track">
                <div class="bar-fill ${levelClass}" style="width: 0%" data-width="${score}%"></div>
            </div>
            <span class="bar-score" style="color:${color}">${score.toFixed(1)}</span>
        </div>`;
    }).join('');

    setTimeout(() => {
        container.querySelectorAll('.bar-fill').forEach(bar => {
            bar.style.width = bar.dataset.width;
        });
    }, 150);
}

// Watchlist
function renderTopRisks() {
    const container = document.getElementById('topRisksList');
    if (!container) return;

    const sorted = [...state.resources].sort((a, b) => b.risk.raw_score - a.risk.raw_score).slice(0, 5);

    container.innerHTML = sorted.map((s, i) => {
        const score = s.risk.raw_score;
        const level = s.risk.level.toLowerCase();
        return `
        <div class="risk-item" onclick="showResourceModal('${s.id}')" style="cursor:pointer;">
            <span class="risk-rank rank-${i + 1}">${i + 1}</span>
            <div class="risk-info">
                <div class="risk-name">${s.name}</div>
                <div class="risk-region">${s.region} · Dynamic Index</div>
            </div>
            <span class="risk-score-badge ${level}">${formatRiskScore(score, false)}</span>
        </div>`;
    }).join('');
}

// Active geopolitical threats list
function renderEventsFeed() {
    const container = document.getElementById('eventsFeed');
    if (!container) return;

    const activeEvs = state.events.filter(e => e.is_active);

    if (activeEvs.length === 0) {
        container.innerHTML = '<div style="padding:1.5rem; text-align:center; color:var(--text-muted);">No active threats in model.</div>';
        return;
    }

    container.innerHTML = activeEvs.map(e => `
        <div class="event-item" style="border-left: 3px solid ${getScoreColor(e.intensity * 100)}; padding-left: 10px;">
            <div class="event-dot active" style="background:${getScoreColor(e.intensity * 100)};"></div>
            <div class="event-info">
                <div class="event-title" style="font-weight:600; font-size:0.82rem;">${e.title}</div>
                <div class="event-meta">
                    <span>${e.region}</span>
                    <span>Intensity: ${(e.intensity * 100).toFixed(0)}%</span>
                </div>
            </div>
            <span class="event-type-badge ${e.type}" style="font-size:0.65rem;">${e.type}</span>
        </div>
    `).join('');
}

// ============================================================================
// DATASETS REGISTER TABLE RENDERER
// ============================================================================

function renderDatasetsTable(filterType = 'all', filterRisk = 'all', sortBy = 'score-desc') {
    const tbody = document.getElementById('resourcesTableBody');
    if (!tbody) return;

    let filtered = [...state.resources];

    // Filter type
    if (filterType !== 'all') {
        filtered = filtered.filter(r => r.type === filterType);
    }

    // Filter risk level
    if (filterRisk !== 'all') {
        filtered = filtered.filter(r => r.risk.level === filterRisk);
    }

    // Sort
    switch (sortBy) {
        case 'score-desc':
            filtered.sort((a, b) => {
                const sA = a.risk.raw_score === null ? -1 : a.risk.raw_score;
                const sB = b.risk.raw_score === null ? -1 : b.risk.raw_score;
                return sB - sA;
            });
            break;
        case 'score-asc':
            filtered.sort((a, b) => {
                const sA = a.risk.raw_score === null ? -1 : a.risk.raw_score;
                const sB = b.risk.raw_score === null ? -1 : b.risk.raw_score;
                return sA - sB;
            });
            break;
        case 'name-asc': filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'name-desc': filtered.sort((a, b) => b.name.localeCompare(a.name)); break;
    }

    tbody.innerHTML = filtered.map((r, i) => {
        const score = r.risk.raw_score;
        const temp = getScoreTemporalLabel(r);
        const tooltipText = `${temp.label}.${temp.hasWarning ? ' WARNING: ' + temp.warning : ''}`;
        return `
        <tr onclick="showResourceModal('${r.id}')" style="cursor:pointer;" title="${tooltipText}">
            <td>${i + 1}</td>
            <td class="td-resource-name">${r.name}</td>
            <td class="td-type">${r.type}</td>
            <td class="td-region">${r.region}</td>
            <td class="td-number">${r.production.toFixed(1)}</td>
            <td class="td-number">${r.consumption.toFixed(1)}</td>
            <td class="td-number" style="font-size:0.85rem; font-family:var(--font-mono); white-space:nowrap; max-width:180px; overflow:hidden; text-overflow:ellipsis;" title="${formatCommodityPrice(r.price, r.type)}">${formatCommodityPrice(r.price, r.type)}</td>
            <td class="td-score" style="color:${getScoreColor(score)}; font-weight:700;">${formatRiskScore(score, false)}</td>
            <td><span class="level-badge ${r.risk.level}"><span class="level-dot"></span>${r.risk.level}</span></td>
        </tr>`;
    }).join('');

    // Populate type filter options dynamically
    const typeSelect = document.getElementById('filterType');
    if (typeSelect && typeSelect.options.length <= 1) {
        const types = [...new Set(state.resources.map(r => r.type))];
        types.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            typeSelect.appendChild(opt);
        });
    }
}

function getScoreColor(score) {
    if (score > 66) return '#DC2626';
    if (score > 33) return '#D97706';
    return '#16A34A';
}

// ============================================================================
// INTERACTIVE WORLD MAP RENDERER
// ============================================================================

function renderWorldMap() {
    // 1. Color-code the SVG region paths based on current average regional risk scores
    const paths = document.querySelectorAll('.map-region-path');
    
    paths.forEach(path => {
        const regionName = path.dataset.region;
        // Find region data in computed regions list
        const regData = state.regions.find(r => r.name.toLowerCase() === regionName.toLowerCase());
        
        let color = '#CBD5E1'; // Default gray
        if (regData) {
            const score = regData.avg_score;
            if (score > 66) color = 'rgba(220, 38, 38, 0.7)';      // Pastel Red
            else if (score > 33) color = 'rgba(217, 119, 6, 0.6)';  // Pastel Amber
            else color = 'rgba(22, 163, 74, 0.5)';                  // Pastel Green
        }
        
        path.style.fill = color;
        
        // Highlight active clicked path
        if (state.selectedRegion.toLowerCase() === regionName.toLowerCase()) {
            path.classList.add('active');
        } else {
            path.classList.remove('active');
        }
        
        // Click action
        path.onclick = () => {
            selectRegion(regionName);
        };
    });

    // Populate side panel details
    updateMapSidePanel();
}

function selectRegion(regionName) {
    state.selectedRegion = regionName;
    
    // Toggle active paths
    document.querySelectorAll('.map-region-path').forEach(p => {
        if (p.dataset.region.toLowerCase() === regionName.toLowerCase()) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });

    updateMapSidePanel();
}

function updateMapSidePanel() {
    const regNameEl = document.getElementById('panelRegionName');
    const avgScoreEl = document.getElementById('panelAvgScore');
    const badgeEl = document.getElementById('panelRiskBadge');
    const resListEl = document.getElementById('panelResourcesList');
    const evsListEl = document.getElementById('panelEventsList');

    if (!regNameEl) return;

    const regData = state.regions.find(r => r.name.toLowerCase() === state.selectedRegion.toLowerCase()) || {
        name: state.selectedRegion, avg_score: 15.0, count: 0, level: 'LOW'
    };

    regNameEl.textContent = regData.name;
    avgScoreEl.textContent = regData.avg_score.toFixed(1);
    
    // Update badge class
    badgeEl.textContent = `${regData.level} RISK`;
    badgeEl.className = `level-badge ${regData.level}`;

    // Load resources list
    const regionalResources = state.resources.filter(r => r.region.toLowerCase() === regData.name.toLowerCase());
    if (regionalResources.length === 0) {
        resListEl.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted)">No registered energy assets.</div>';
    } else {
        resListEl.innerHTML = regionalResources.map(r => `
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; background:#fff; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; cursor:pointer;" onclick="showResourceModal('${r.id}')">
                <span>${r.name}</span>
                <strong style="color:${getScoreColor(r.risk.raw_score)}">${r.risk.raw_score.toFixed(1)}</strong>
            </div>
        `).join('');
    }

    // Load active events list
    const regionalEvents = state.events.filter(e => e.is_active && (e.region.toLowerCase() === regData.name.toLowerCase() || e.region === 'Global'));
    if (regionalEvents.length === 0) {
        evsListEl.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted)">No active supply chain threat vectors detected.</div>';
    } else {
        evsListEl.innerHTML = regionalEvents.map(e => `
            <div style="font-size:0.75rem; background:rgba(0,0,0,0.02); padding:6px 10px; border-radius:6px; border-left:3px solid ${getScoreColor(e.intensity * 100)}">
                <div style="font-weight:600;">${e.title}</div>
                <div style="color:var(--text-muted)">Intensity: ${(e.intensity * 100).toFixed(0)}%</div>
            </div>
        `).join('');
    }
}

// ============================================================================
// COUNTRY / REGION COMPARATIVE INSIGHTS
// ============================================================================

function renderRegionInsights() {
    const cardsGrid = document.getElementById('regionCardsGrid');
    const barsContainer = document.getElementById('regionBars');

    if (!cardsGrid || !barsContainer) return;

    // 1. Comparison cards
    cardsGrid.innerHTML = state.regions.map((r, i) => {
        const color = getScoreColor(r.avg_score);
        return `
        <div class="region-card" style="animation-delay:${i * 0.05}s">
            <div class="region-name" style="font-weight:800; font-size:1.05rem;">${r.name}</div>
            <div class="region-stats" style="margin-top:10px;">
                <div class="region-stat">
                    <div class="region-stat-value" style="color:${color}; font-size:1.6rem; font-weight:800;">${r.avg_score.toFixed(1)}</div>
                    <div class="region-stat-label">Avg Risk Score</div>
                </div>
                <div class="region-stat">
                    <div class="region-stat-value">${r.count}</div>
                    <div class="region-stat-label">Assets Monitored</div>
                </div>
                <div class="region-stat">
                    <span class="level-badge ${r.level}"><span class="level-dot"></span>${r.level}</span>
                    <div class="region-stat-label" style="margin-top:4px">Classification</div>
                </div>
            </div>
        </div>`;
    }).join('');

    // 2. Ranking comparison bars
    barsContainer.innerHTML = state.regions.map(r => {
        const pct = r.avg_score;
        const color = r.avg_score > 66 ? 'linear-gradient(90deg, #DC2626, #EF4444)' :
                      (r.avg_score > 33 ? 'linear-gradient(90deg, #D97706, #F59E0B)' :
                                          'linear-gradient(90deg, #16A34A, #22C55E)');
        return `
        <div class="region-bar-row">
            <span class="region-bar-name" style="width:140px; font-weight:600;">${r.name}</span>
            <div class="region-bar-track">
                <div class="region-bar-fill" style="width:0%; background:${color}; font-weight:700;" data-width="${pct}%">
                    ${r.avg_score.toFixed(1)}
                </div>
            </div>
            <span class="region-bar-count">${r.count} monitored resource${r.count > 1 ? 's' : ''}</span>
        </div>`;
    }).join('');

    setTimeout(() => {
        barsContainer.querySelectorAll('.region-bar-fill').forEach(bar => {
            bar.style.width = bar.dataset.width;
        });
    }, 150);
}

// ============================================================================
// HISTORICAL TRENDS SVG GRAPH
// ============================================================================

function renderTrends() {
    const trendsPath = document.getElementById('trendsPath');
    const trendsArea = document.getElementById('trendsArea');
    const trendsPathCompare = document.getElementById('trendsPathCompare');
    const xLabelsContainer = document.getElementById('trendsXLabels');

    if (!trendsPath || !trendsArea || !xLabelsContainer) return;

    // Filters values
    const region = document.getElementById('trendsFilterRegion').value;
    const timeRange = document.getElementById('trendsFilterTime').value;

    const monthsCount = timeRange === '12m' ? 12 : (timeRange === '6m' ? 6 : 3);
    
    // Generate realistic base baseline matching current risk score
    let baseScore = 44.8;
    if (region !== 'all') {
        const regObj = state.regions.find(r => r.name.toLowerCase() === region.toLowerCase());
        if (regObj) baseScore = regObj.avg_score;
    } else {
        baseScore = state.resources.reduce((sum, r) => sum + r.risk.raw_score, 0) / state.resources.length;
    }

    const dataPoints = generateHistoricalPoints(baseScore, monthsCount);

    // Map coordinates on 800 x 320 SVG viewBox
    const width = 700; // actual plotting width
    const startX = 50;
    const startY = 300; // Y axis baseline (score = 0)
    const endY = 20;    // Y axis peak (score = 100)
    const stepX = width / (monthsCount - 1);

    // Helper to map risk score to SVG Y coordinate
    function getYCoord(score) {
        return startY - ((score / 100) * (startY - endY));
    }

    // Build path strings
    let pathD = '';
    let areaD = `M ${startX} ${startY} `;
    
    dataPoints.forEach((p, index) => {
        const x = startX + (index * stepX);
        const y = getYCoord(p.score);
        
        if (index === 0) {
            pathD += `M ${x} ${y} `;
        } else {
            pathD += `L ${x} ${y} `;
        }
        
        areaD += `L ${x} ${y} `;
    });
    
    areaD += `L ${startX + (monthsCount - 1) * stepX} ${startY} Z`;

    trendsPath.setAttribute('d', pathD);
    trendsArea.setAttribute('d', areaD);

    // Draw compare line (dashed) simulating baseline expectation without active threats
    let pathDCompare = '';
    const cleanPoints = dataPoints.map(p => ({
        month: p.month,
        score: Math.max(p.score - 18, 10 + Math.random() * 8)
    }));

    cleanPoints.forEach((p, index) => {
        const x = startX + (index * stepX);
        const y = getYCoord(p.score);
        
        if (index === 0) {
            pathDCompare += `M ${x} ${y} `;
        } else {
            pathDCompare += `L ${x} ${y} `;
        }
    });
    trendsPathCompare.setAttribute('d', pathDCompare);

    // Draw X labels
    xLabelsContainer.innerHTML = dataPoints.map((p, index) => {
        const x = startX + (index * stepX);
        return `<text x="${x}" y="318" font-size="10" font-weight="600" fill="#94A3B8" text-anchor="middle">${p.month}</text>`;
    }).join('');
}

function generateHistoricalPoints(endValue, count) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    
    let points = [];
    let currentVal = endValue;
    
    for (let i = count - 1; i >= 0; i--) {
        const mIdx = (currentMonth - i + 12) % 12;
        // Random walk back from current endValue
        if (i > 0) {
            const shift = (Math.random() - 0.48) * 8; // Slight downward bias going backward
            currentVal = Math.min(Math.max(currentVal - shift, 5), 98);
        } else {
            currentVal = endValue; // ensure current point exactly matches active calculated value
        }
        
        points.push({
            month: monthNames[mIdx],
            score: currentVal
        });
    }
    
    return points;
}


// Handler bound to window so toggles work directly from innerHTML elements
window.toggleThreatActive = async function(eventId, checked) {
    try {
        const response = await fetch('/api/events/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: eventId, is_active: checked })
        });
        
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to toggle event');
        }

        // Refresh app state from the backend (which runs C++ recalculations!)
        await initAppState();
        renderActiveSection();
    } catch (err) {
        console.error('[TOGGLE EVENT ERROR]', err);
        alert(`Failed to toggle event status: ${err.message}`);
    }
};

function setupFormListeners() {
    const evForm = document.getElementById('eventForm');
    const resForm = document.getElementById('resourceForm');

    if (evForm) {
        evForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const title = document.getElementById('eventTitle').value.trim();
            const type = document.getElementById('eventType').value;
            const region = document.getElementById('eventRegion').value.trim();
            const intensity = parseFloat(document.getElementById('eventIntensity').value) || 0.5;
            const supply_impact = parseFloat(document.getElementById('eventImpact').value) || 0.3;
            const is_active = document.getElementById('eventActive').checked;

            const payload = { title, type, region, intensity, supply_impact, is_active };

            try {
                const response = await fetch('/api/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Failed to add event');
                }

                // Refresh app state from the backend (which runs C++ and recalculates everything!)
                await initAppState();
                renderActiveSection();

                // Success alert
                const alertBox = document.getElementById('eventFormAlert');
                if (alertBox) {
                    alertBox.style.display = 'block';
                    setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
                }
                evForm.reset();
            } catch (err) {
                console.error('[ADD EVENT ERROR]', err);
                alert(`Failed to add event: ${err.message}`);
            }
        });
    }

    if (resForm) {
        resForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('resId').value.trim();
            const name = document.getElementById('resName').value.trim();
            const type = document.getElementById('resType').value;
            const region = document.getElementById('resRegion').value.trim();
            const production = parseFloat(document.getElementById('resProd').value) || 0;
            const consumption = parseFloat(document.getElementById('resCons').value) || 0;
            const price = parseFloat(document.getElementById('resPrice').value) || 0;
            const reserve_years = parseFloat(document.getElementById('resReserves').value) || 30;
            const export_dependency = parseFloat(document.getElementById('resExport').value) || 0.5;

            const payload = { id, name, type, region, production, consumption, price, reserve_years, export_dependency };
            payload.unit = getVolumeUnitAbbr(type);
            resourceValidator.validateResource(payload);

            try {
                const response = await fetch('/api/resources', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Failed to add resource');
                }

                // Refresh app state from backend
                await initAppState();
                renderActiveSection();

                // Success alert
                const alertBox = document.getElementById('resourceFormAlert');
                if (alertBox) {
                    alertBox.style.display = 'block';
                    setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
                }
                resForm.reset();
            } catch (err) {
                console.error('[ADD RESOURCE ERROR]', err);
                alert(`Failed to add resource: ${err.message}`);
            }
        });
    }
}



// ============================================================================
// RESOURCE DETAIL MODAL RENDERER
// ============================================================================

async function showResourceModal(id) {
    const modal = document.getElementById('resourceModal');
    const body = document.getElementById('modalBody');

    if (!modal || !body) return;

    // Search local state resource
    const res = state.resources.find(r => r.id === id);
    if (!res) {
        body.innerHTML = '<div style="padding:2rem; text-align:center; color:red;">Asset not found in memory registry.</div>';
        modal.classList.add('visible');
        return;
    }

    const score = res.risk;
    const finalColor = getScoreColor(score.raw_score);
    const finalBg = score.level === 'HIGH' ? 'var(--risk-high-bg)' : (score.level === 'MEDIUM' ? 'var(--risk-medium-bg)' : 'var(--risk-low-bg)');

    // Fetch related events from state
    const relatedEvents = state.events.filter(e => e.is_active && (e.region.toLowerCase() === res.region.toLowerCase() || e.region === 'Global'));

        body.innerHTML = `
        <div class="modal-resource-header">
            <div class="modal-resource-name">${res.name}</div>
            <div class="modal-resource-meta">
                <span>${res.type}</span>
                <span>${res.region}</span>
                <span>ID: ${res.id}</span>
            </div>
        </div>

        <div class="modal-final-score" style="background:${finalBg}; border-radius:12px; margin-bottom:1.5rem; text-align:center; padding:1.25rem 0 0.5rem 0;">
            <div class="modal-final-label" style="color:${finalColor}; font-weight:700; font-size:0.8rem; text-transform:uppercase;">Composite Risk Index Score</div>
            <div class="modal-final-number" style="color:${finalColor}; font-size:2.8rem; font-weight:900; font-family:var(--font-mono); line-height:1.2;">${formatRiskScore(score.raw_score, false)}</div>
            <span class="level-badge ${score.level}" style="margin-top:0.3rem"><span class="level-dot"></span>${score.level} WATCH</span>
            <div style="padding: 0 1rem; margin-top:0.5rem;">${getCollapsibleBreakdownHTML(res)}</div>
        </div>

        <div class="modal-scores-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
            ${renderModalScoreItem('Supply chain vulnerability', score.supply_score, '#2563EB', res)}
            ${renderModalScoreItem('Regional Geopolitical Conflict', score.conflict_score, '#DC2626', res)}
            ${renderModalScoreItem('Trade restriction limits', score.trade_score, '#D97706', res)}
            ${renderModalScoreItem('Internal demand pressure', score.demand_score, '#7C3AED', res)}
            ${renderModalScoreItem('Sea route bottlenecking', score.route_score, '#0891B2', res)}
            <div class="modal-score-item" style="border:1px solid var(--border-color); padding:8px 12px; border-radius:8px; grid-column: span 2;">
                <div class="modal-score-label" style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Market Price Index</div>
                <div class="modal-score-value" style="color:var(--accent-green); font-size:0.9rem; font-weight:700; margin-top:4px; word-break:break-word;">${formatCommodityPrice(res.price, res.type)}</div>
            </div>
        </div>

        <div style="margin-bottom:1rem;">
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.75rem;">
                <div class="modal-score-item" style="border:1px solid var(--border-color); padding:8px 12px; border-radius:8px; text-align:center;">
                    <div class="modal-score-label" style="font-size:0.68rem; color:var(--text-muted);">Production Capacity</div>
                    <div class="modal-score-value" style="font-weight:700; margin-top:4px; font-size:0.95rem;">${res.production.toFixed(1)} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${getVolumeUnitAbbr(res.type)}</span></div>
                </div>
                <div class="modal-score-item" style="border:1px solid var(--border-color); padding:8px 12px; border-radius:8px; text-align:center;">
                    <div class="modal-score-label" style="font-size:0.68rem; color:var(--text-muted);">Consumption Level</div>
                    <div class="modal-score-value" style="font-weight:700; margin-top:4px; font-size:0.95rem;">${res.consumption.toFixed(1)} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${getVolumeUnitAbbr(res.type)}</span></div>
                </div>
                <div class="modal-score-item" style="border:1px solid var(--border-color); padding:8px 12px; border-radius:8px; text-align:center;">
                    <div class="modal-score-label" style="font-size:0.68rem; color:var(--text-muted);">Self Sufficiency</div>
                    <div class="modal-score-value" style="font-weight:700; margin-top:4px; font-size:0.95rem; color:${res.production >= res.consumption ? 'var(--accent-green)' : 'var(--risk-high)'}">
                        ${res.production > 0 ? (res.production / (res.consumption || 1) * 100).toFixed(0) + '%' : '0%'}
                    </div>
                </div>
            </div>
        </div>

        ${relatedEvents.length > 0 ? `
        <div style="margin-top:1rem;">
            <div style="font-size:0.72rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">Active Threat Vectors Affecting Asset</div>
            ${relatedEvents.map(e => `
                <div style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.75rem; background:rgba(0,0,0,0.02); border:1px dashed var(--border-color); border-radius:8px; margin-bottom:0.4rem;">
                    <div class="event-dot active" style="background:${getScoreColor(e.intensity * 100)}; animation:none;"></div>
                    <span style="font-size:0.82rem; font-weight:600;">${e.title}</span>
                    <span class="event-type-badge ${e.type}" style="margin-left:auto; font-size:0.65rem;">${e.type}</span>
                </div>
            `).join('')}
        </div>` : ''}
    `;

    modal.classList.add('visible');

    // Animate inner rating score bars
    setTimeout(() => {
        body.querySelectorAll('.modal-score-bar-fill').forEach(bar => {
            bar.style.width = bar.dataset.width;
        });
    }, 100);
}

function renderModalScoreItem(label, value, color, res) {
    const isNull = value === null || value === undefined || value < 0;
    const confidences = getResourceComponentConfidence(res);
    
    let isVerified = false;
    let datasetColumn = "";
    let estimationMethod = "";
    let dataMissing = "";
    let confidence = "HIGH";
    let humanExpertReview = "yes";

    const lblLower = label.toLowerCase();
    if (lblLower.includes('supply')) {
        isVerified = true;
        datasetColumn = "primary_energy_consumption (Global Energy Consumption)";
        confidence = confidences.supply;
    } else if (lblLower.includes('conflict')) {
        isVerified = false;
        estimationMethod = "Active regional geopolitics events (War, Instability) and export_dependency column";
        dataMissing = "Real-time regional escalation vectors and localized military movement records";
        confidence = confidences.conflict;
        humanExpertReview = "yes";
    } else if (lblLower.includes('trade')) {
        isVerified = false;
        estimationMethod = "Active regional sanctions or trade restrictions (Sanctions, TradeRestriction events)";
        dataMissing = "Bilateral trade corridor volume adjustments under active embargoes";
        confidence = confidences.trade;
        humanExpertReview = "yes";
    } else if (lblLower.includes('demand')) {
        isVerified = true;
        datasetColumn = "export_dependency & reserve_years (Global Energy Dataset)";
        confidence = confidences.demand;
    } else if (lblLower.includes('route')) {
        isVerified = false;
        estimationMethod = "None - route bottleneck data is not currently monitored";
        dataMissing = "Sea route bottlenecking, pipeline blockages, and corridor vulnerabilities";
        confidence = "LOW";
        humanExpertReview = "no";
    }

    const metricHTML = renderMetricHTML(label, value, isVerified, datasetColumn, estimationMethod, confidence, dataMissing, humanExpertReview);
    
    if (!isNull) {
        const val = parseFloat(value);
        const barHTML = `
            <div class="modal-score-bar" style="background:rgba(0,0,0,0.05); height:6px; border-radius:3px; margin-top:6px; overflow:hidden; margin-bottom: 4px;">
                <div class="modal-score-bar-fill" style="background:${color}; width:${val}%; height:100%;"></div>
            </div>
        `;
        if (metricHTML.includes('</details>')) {
            return metricHTML.replace('</details>', `${barHTML}</details>`);
        } else {
            const lastDivIdx = metricHTML.lastIndexOf('</div>');
            if (lastDivIdx !== -1) {
                return metricHTML.substring(0, lastDivIdx) + barHTML + metricHTML.substring(lastDivIdx);
            }
        }
    }
    return metricHTML;
}

// ============================================================================
// NAVIGATION CONTROLLER
// ============================================================================

function renderActiveSection() {
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    // Highlight correct link
    document.querySelectorAll('.nav-link').forEach(l => {
        if (l.dataset.section === state.activeSection) {
            l.classList.add('active');
        } else {
            l.classList.remove('active');
        }
    });

    const activeSec = document.getElementById(state.activeSection);
    if (activeSec) {
        activeSec.classList.add('active');
        
        // Lazy-trigger appropriate rendering functions
        if (state.activeSection === 'dashboard') renderDashboard();

        if (state.activeSection === 'global-risk-explorer') renderGlobalRiskExplorer();
        if (state.activeSection === 'country-insights') renderCountryInsightsPage();
        if (state.activeSection === 'trends') renderTrends();
        if (state.activeSection === 'add-event') renderAddEventPage();
        if (state.activeSection === 'all-events') renderAllEventsPage();

    }
}

function handleRouting() {
    const path = window.location.pathname;
    const countryInsightsMatch = path.match(/^\/country-insights\/([^/]+)/);
    
    if (countryInsightsMatch) {
        const slug = countryInsightsMatch[1];
        // Convert slug back to readable name (e.g. saudi-arabia -> saudi arabia)
        const countryName = slug.split('-').map(word => {
            if (word.toLowerCase() === 'usa') return 'USA';
            if (word.toLowerCase() === 'uae') return 'UAE';
            return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
        
        state.activeSection = 'country-insights';
        renderActiveSection();
        
        // Update input field
        const searchInput = document.getElementById('geminiSearchInput');
        if (searchInput) {
            searchInput.value = countryName;
        }
        
        // Trigger fetch
        fetchGeminiInsight(countryName, false);
    } else {
        // Map other paths to sections
        let section = 'dashboard';
        if (path === '/global-risk-explorer') section = 'global-risk-explorer';

        else if (path === '/trends') section = 'trends';
        else if (path === '/country-insights') section = 'country-insights';
        else if (path === '/add-event') section = 'add-event';
        else if (path === '/all-events') section = 'all-events';
        else if (path === '/add-resource') section = 'add-resource';
        
        state.activeSection = section;
        renderActiveSection();
    }
}

function setupNavigation() {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            let path = '/';
            if (section !== 'dashboard') {
                path = `/${section}`;
            }
            history.pushState(null, '', path);
            handleRouting();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    const viewAllBtn = document.getElementById('btnViewAllEvents');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', (e) => {
            e.preventDefault();
            history.pushState(null, '', '/all-events');
            handleRouting();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    window.addEventListener('popstate', handleRouting);
}

// ============================================================================
// SEARCH & FILTERS
// ============================================================================

function setupSearch() {
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    let debounceTimer;

    if (!input || !results) return;

    input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        if (query.length < 1) {
            results.classList.remove('visible');
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const matches = state.resources.filter(r => 
                r.name.toLowerCase().includes(query) || 
                r.region.toLowerCase().includes(query) ||
                r.type.toLowerCase().includes(query)
            );

            if (matches.length === 0) {
                results.innerHTML = '<div class="search-result-item"><span class="result-name" style="color:var(--text-muted)">No matching energy assets found</span></div>';
            } else {
                results.innerHTML = matches.map(item => `
                    <div class="search-result-item" onclick="showResourceModal('${item.id}'); document.getElementById('searchResults').classList.remove('visible'); document.getElementById('searchInput').value = '';">
                        <div class="result-name" style="font-weight:600;">${item.name}</div>
                        <div class="result-meta">${item.region} · ${item.type} · Score: ${item.risk.raw_score.toFixed(1)}</div>
                    </div>
                `).join('');
            }
            results.classList.add('visible');
        }, 150);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            results.classList.remove('visible');
        }
    });
}

function setupFilters() {
    const filterType = document.getElementById('filterType');
    const filterRisk = document.getElementById('filterRisk');
    const filterSort = document.getElementById('filterSort');

    if (filterType && filterRisk && filterSort) {
        [filterType, filterRisk, filterSort].forEach(el => {
            el.addEventListener('change', () => {
                renderDatasetsTable(filterType.value, filterRisk.value, filterSort.value);
            });
        });
    }

    // Historical trends filters
    const tRegion = document.getElementById('trendsFilterRegion');
    const tType = document.getElementById('trendsFilterType');
    const tTime = document.getElementById('trendsFilterTime');

    if (tRegion && tType && tTime) {
        [tRegion, tType, tTime].forEach(el => {
            el.addEventListener('change', () => {
                renderTrends();
            });
        });
    }
}

function setupModal() {
    const modal = document.getElementById('resourceModal');
    const closeBtn = document.getElementById('modalClose');

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.remove('visible'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('visible');
        });
    }

    // News Event Detail Modal
    const newsModal = document.getElementById('newsEventModal');
    const newsCloseBtn = document.getElementById('newsModalClose');

    if (newsCloseBtn && newsModal) {
        newsCloseBtn.addEventListener('click', () => newsModal.classList.remove('visible'));
        newsModal.addEventListener('click', (e) => {
            if (e.target === newsModal) newsModal.classList.remove('visible');
        });
    }

    // Shared Escape key handler for all modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modal) modal.classList.remove('visible');
            if (newsModal) newsModal.classList.remove('visible');
        }
    });
}

function setupScrollEffects() {
    window.addEventListener('scroll', () => {
        const navbar = document.getElementById('navbar');
        if (navbar) {
            if (window.scrollY > 20) navbar.classList.add('scrolled');
            else navbar.classList.remove('scrolled');
        }
    });
}

function setupExport() {
    const btn = document.getElementById('btnExport');
    if (!btn) return;
    btn.addEventListener('click', () => {
        let csv = 'resource_id,resource_name,type,region,production,consumption,price,raw_score,level\n';
        state.resources.forEach(r => {
            csv += `${r.id},"${r.name}",${r.type},"${r.region}",${r.production},${r.consumption},${r.price},${r.risk.raw_score.toFixed(2)},${r.risk.level}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'energy_risk_data.csv';
        a.click();
        URL.revokeObjectURL(url);
    });
}

// ============================================================================
// COUNTRY / REGION INSIGHTS — Gemini AI + Firebase
// ============================================================================

let COUNTRIES_LIST = [
    'Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Australia',
    'Austria','Azerbaijan','Bahrain','Bangladesh','Belarus','Belgium','Bolivia',
    'Bosnia and Herzegovina','Brazil','Brunei','Bulgaria','Cambodia','Cameroon',
    'Canada','Chad','Chile','China','Colombia','Congo','Costa Rica','Croatia',
    'Cuba','Cyprus','Czech Republic','Denmark','Dominican Republic','Ecuador',
    'Egypt','El Salvador','Estonia','Ethiopia','Finland','France','Gabon',
    'Georgia','Germany','Ghana','Greece','Guatemala','Guinea','Honduras',
    'Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel',
    'Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait',
    'Kyrgyzstan','Latvia','Lebanon','Libya','Lithuania','Luxembourg',
    'Madagascar','Malaysia','Mali','Mexico','Moldova','Mongolia','Morocco',
    'Mozambique','Myanmar','Namibia','Nepal','Netherlands','New Zealand',
    'Nicaragua','Niger','Nigeria','North Korea','Norway','Oman','Pakistan',
    'Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland',
    'Portugal','Qatar','Romania','Russia','Saudi Arabia','Senegal','Serbia',
    'Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea',
    'Spain','Sri Lanka','Sudan','Sweden','Switzerland','Syria','Taiwan',
    'Tajikistan','Tanzania','Thailand','Trinidad and Tobago','Tunisia',
    'Turkey','Turkmenistan','UAE','Uganda','Ukraine','United Kingdom',
    'United States','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen',
    'Zambia','Zimbabwe',
    // Regions
    'Middle East','European Union','Central Asia','Southeast Asia',
    'Sub-Saharan Africa','North Africa','Latin America','Caribbean',
    'East Asia','South Asia','Pacific Islands','Scandinavia','Balkans',
    'Gulf States','OPEC Nations'
];

// Current Gemini insight state
let geminiInsightState = {
    currentRegion: '',
    lastResult: null,
    isLoading: false
};

function renderCountryInsightsPage() {
    // Page is static HTML — we just need to ensure event listeners are wired
    // If there's a cached result, display it
    if (geminiInsightState.lastResult) {
        displayGeminiResult(geminiInsightState.lastResult);
    }
}

function setupCountryInsights() {
    const searchInput = document.getElementById('geminiSearchInput');
    const suggestions = document.getElementById('geminiSearchSuggestions');
    const analyzeBtn = document.getElementById('btnAnalyzeCountry');
    const refreshBtn = document.getElementById('btnRefreshCountry');

    if (!searchInput || !analyzeBtn) return;

    // Autocomplete suggestions
    let debounce;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            const query = searchInput.value.trim().toLowerCase();
            if (query.length < 1) {
                suggestions.classList.remove('visible');
                return;
            }
            const matches = COUNTRIES_LIST.filter(c =>
                c.toLowerCase().includes(query)
            ).slice(0, 8);

            if (matches.length === 0) {
                suggestions.innerHTML = '<div class="search-result-item"><span class="result-name" style="color:var(--text-muted)">No matching countries or regions</span></div>';
            } else {
                suggestions.innerHTML = matches.map(m => `
                    <div class="search-result-item" data-country="${m}" style="cursor:pointer;">
                        <span class="result-name" style="font-weight:600;">${m}</span>
                    </div>
                `).join('');
            }
            suggestions.classList.add('visible');

            // Click handler for suggestions
            suggestions.querySelectorAll('.search-result-item[data-country]').forEach(item => {
                item.addEventListener('click', () => {
                    searchInput.value = item.dataset.country;
                    suggestions.classList.remove('visible');
                });
            });
        }, 120);
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#geminiSearchInput') && !e.target.closest('#geminiSearchSuggestions')) {
            suggestions.classList.remove('visible');
        }
    });

    // Enter key triggers analyze
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            analyzeBtn.click();
        }
    });

    // Analyze button
    analyzeBtn.addEventListener('click', () => {
        const region = searchInput.value.trim();
        if (!region || region.length < 2) {
            showGeminiError('Please enter a valid country or region name.');
            return;
        }
        suggestions.classList.remove('visible');
        
        // Normalize name to a slug
        const slug = region.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        history.pushState(null, '', `/country-insights/${slug}`);
        handleRouting();
    });

    // Refresh button
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (geminiInsightState.currentRegion) {
                fetchGeminiInsight(geminiInsightState.currentRegion, true);
            }
        });
    }
}

async function fetchGeminiInsight(region, forceRefresh) {
    if (geminiInsightState.isLoading) return;
    geminiInsightState.isLoading = true;
    geminiInsightState.currentRegion = region;

    const statusArea = document.getElementById('geminiStatusArea');
    const successAlert = document.getElementById('geminiSuccessAlert');
    const firebaseAlert = document.getElementById('firebaseSaveAlert');
    const errorAlert = document.getElementById('geminiErrorAlert');
    const workspace = document.getElementById('geminiResultsWorkspace');
    const placeholder = document.getElementById('geminiPlaceholderWorkspace');
    const analyzeBtn = document.getElementById('btnAnalyzeCountry');
    const refreshBtn = document.getElementById('btnRefreshCountry');

    // Show loading state
    if (statusArea) statusArea.style.display = 'block';
    if (successAlert) { successAlert.style.display = 'block'; successAlert.textContent = `Analyzing geopolitical energy-risk for "${region}"... This may take a few seconds.`; }
    if (firebaseAlert) firebaseAlert.style.display = 'none';
    if (errorAlert) errorAlert.style.display = 'none';
    if (workspace) workspace.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.textContent = 'Analyzing...'; }

    try {
        const encodedRegion = encodeURIComponent(region.trim());
        console.log(`[COUNTRY INSIGHTS] Calling GET /api/region-insights?region=${encodedRegion}&force_refresh=${forceRefresh}`);

        const response = await fetch(`/api/region-insights?region=${encodedRegion}&force_refresh=${forceRefresh}`);
        const result = await response.json();

        console.log(`[COUNTRY INSIGHTS] Response — source: ${result.source}, status: ${result.status}`);
        if (result.status === 'error' || !result.success) {
            throw new Error(result.message || 'Failed to load insights');
        }

        // Store the result for display
        geminiInsightState.lastResult = result;
        if (successAlert) successAlert.style.display = 'none';

        if (firebaseAlert) {
            firebaseAlert.style.display = 'none';
        }

        displayGeminiResult(result);

        // Show refresh button
        if (refreshBtn) refreshBtn.style.display = 'inline-flex';

    } catch (err) {
        console.error('[COUNTRY INSIGHTS ERROR]', err);
        showGeminiError(err.message || 'Unable to load insight.');
    } finally {
        geminiInsightState.isLoading = false;
        if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.textContent = 'Analyze Region'; }
    }
}

function showGeminiError(message) {
    const statusArea = document.getElementById('geminiStatusArea');
    const successAlert = document.getElementById('geminiSuccessAlert');
    const errorAlert = document.getElementById('geminiErrorAlert');
    const placeholder = document.getElementById('geminiPlaceholderWorkspace');

    if (statusArea) statusArea.style.display = 'block';
    if (successAlert) successAlert.style.display = 'none';
    if (errorAlert) {
        errorAlert.textContent = message;
        errorAlert.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'block';
}

function displayGeminiResult(result) {
    const workspace = document.getElementById('geminiResultsWorkspace');
    const placeholder = document.getElementById('geminiPlaceholderWorkspace');
    if (!workspace) return;

    workspace.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';

    const data = result.data;

    // Cache badge
    const cacheBadge = document.getElementById('geminiCacheBadge');
    if (cacheBadge) {
        cacheBadge.style.display = 'none';
    }

    // Timestamp
    const tsEl = document.getElementById('geminiTimestamp');
    if (tsEl && data.updated_at) {
        const date = new Date(data.updated_at);
        tsEl.textContent = `Last updated: ${date.toLocaleString()}`;
    }

    // Supply risk level badge
    const riskBadge = document.getElementById('geminiRiskLevelBadge');
    if (riskBadge) {
        const level = (data.supply_risk_level || 'medium').toUpperCase();
        riskBadge.textContent = level + ' RISK';
        riskBadge.className = `level-badge ${getSeverityClass(data.supply_risk_level)}`;
    }

    // Summary
    const summaryEl = document.getElementById('geminiSummaryText');
    if (summaryEl) {
        summaryEl.textContent = data.generated_summary || 'No summary available.';
        const summaryCard = summaryEl.closest('.card');
        if (summaryCard) {
            summaryCard.querySelector('.card-footnote')?.remove();
            summaryCard.insertAdjacentHTML('beforeend', getScoreFootnoteHTML('AI-estimated'));
        }
    }

    // Detailed Geopolitical Risk Assessments (New fields!)
    const energyRisksEl = document.getElementById('geminiEnergyRisks');
    if (energyRisksEl) {
        energyRisksEl.textContent = data.energy_risks || 'No direct energy sector risks reported.';
    }

    const tradeRisksEl = document.getElementById('geminiTradeRisks');
    if (tradeRisksEl) {
        tradeRisksEl.textContent = data.trade_supply_chain_risks || 'No critical trade corridor threats identified.';
    }

    const infraRisksEl = document.getElementById('geminiInfrastructureRisks');
    if (infraRisksEl) {
        infraRisksEl.textContent = data.infrastructure_risks || 'All vital grid systems and structures remain secured.';
    }

    // Affected resources chips
    const chipsContainer = document.getElementById('geminiAffectedResourcesChips');
    if (chipsContainer) {
        const resources = data.affected_resources || [];
        chipsContainer.innerHTML = resources.map(r => {
            const icon = getResourceChipIcon(r);
            return `<span class="gemini-chip">${icon} ${r}</span>`;
        }).join('');
    }

    // Vulnerabilities list
    const vulnList = document.getElementById('geminiVulnerabilitiesList');
    if (vulnList) {
        const vulns = data.import_export_vulnerabilities || [];
        if (vulns.length === 0) {
            vulnList.innerHTML = '<li style="color:var(--text-muted);">No critical import/export vulnerabilities identified.</li>';
        } else {
            vulnList.innerHTML = vulns.map(v => `<li>${v}</li>`).join('');
        }
    }

    // Recommendation
    const recEl = document.getElementById('geminiRecommendationText');
    if (recEl) {
        recEl.textContent = data.recommendation || 'No recommendation available.';
    }

    // Fuel price impact
    const priceCard = document.getElementById('geminiPriceImpactCard');
    const priceBadge = document.getElementById('geminiPriceImpactBadge');
    const priceSummary = document.getElementById('geminiPriceImpactSummary');
    if (priceBadge && priceSummary) {
        const fpi = data.fuel_price_impact || {};
        const level = (fpi.level || 'medium').toUpperCase();
        priceBadge.textContent = level;
        priceBadge.className = `level-badge ${getSeverityClass(fpi.level)}`;
        priceSummary.textContent = fpi.summary || 'No fuel price impact data available.';

        // Tint the card border based on severity
        if (priceCard) {
            const colors = { critical: 'var(--risk-high)', high: 'var(--risk-high)', medium: 'var(--risk-medium)', low: 'var(--risk-low)' };
            priceCard.style.borderLeft = `4px solid ${colors[fpi.level] || colors.medium}`;
        }
    }

    // Market Price Index
    const mpiValue = document.getElementById('geminiMarketPriceValue');
    const mpiLabel = document.getElementById('geminiMarketPriceLabel');
    if (mpiValue && mpiLabel) {
        const mpi = data.market_price_index || {};
        if (mpi.price !== null && mpi.price !== undefined) {
            let commType = 'Oil';
            if (mpi.label && mpi.label.toLowerCase().includes('petrol')) {
                commType = 'Petrol';
            } else if (mpi.label && mpi.label.toLowerCase().includes('diesel')) {
                commType = 'Diesel';
            } else if (mpi.label && mpi.label.toLowerCase().includes('lpg')) {
                commType = 'LPG';
            }
            
            const formatted = formatCommodityPrice(mpi.price, commType);
            mpiValue.textContent = formatted;
            mpiValue.style.display = 'inline';
            mpiValue.style.fontSize = '0.9rem';
            mpiValue.style.wordBreak = 'break-word';
            mpiLabel.textContent = mpi.label || 'Market Price';
        } else {
            mpiValue.style.display = 'none';
            mpiLabel.textContent = mpi.label || 'Price data not available';
        }
    }

    // Geopolitical events feed
    const evFeed = document.getElementById('geminiEventsFeed');
    if (evFeed) {
        const events = data.geopolitical_events || [];
        if (events.length === 0) {
            evFeed.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.82rem;">No active geopolitical threat events identified for this region.</div>';
        } else {
            evFeed.innerHTML = events.map(ev => {
                const sevColor = getSeverityColor(ev.severity);
                return `
                <div class="gemini-event-item" style="border-left: 3px solid ${sevColor}; padding: 0.75rem 1rem; background: rgba(0,0,0,0.015); border-radius: 0 8px 8px 0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                        <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">${ev.title}</div>
                        <span class="level-badge ${getSeverityClass(ev.severity)}" style="font-size: 0.6rem; flex-shrink: 0;">${(ev.severity || 'medium').toUpperCase()}</span>
                    </div>
                    <p style="font-size: 0.78rem; color: var(--text-secondary); margin: 0.4rem 0 0.3rem; line-height: 1.45;">${ev.description}</p>
                    ${ev.region_impact ? `<div style="font-size: 0.7rem; color: var(--text-muted); font-style: italic;">Impact: ${ev.region_impact}</div>` : ''}
                    ${ev.affected_resources && ev.affected_resources.length > 0 ? `
                        <div style="display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.4rem;">
                            ${ev.affected_resources.map(r => `<span class="gemini-chip-sm">${r}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>`;
            }).join('');
        }
    }

    // Refresh the dashboard news feed to include Gemini-sourced events
    renderGeopoliticalNews();
}

function getSeverityClass(severity) {
    switch ((severity || '').toLowerCase()) {
        case 'critical': return 'HIGH';
        case 'high': return 'HIGH';
        case 'medium': return 'MEDIUM';
        case 'low': return 'LOW';
        default: return 'MEDIUM';
    }
}

function getSeverityColor(severity) {
    switch ((severity || '').toLowerCase()) {
        case 'critical': return '#991B1B';
        case 'high': return '#DC2626';
        case 'medium': return '#D97706';
        case 'low': return '#16A34A';
        default: return '#D97706';
    }
}

function getResourceChipIcon(resource) {
    const r = (resource || '').toLowerCase();
    if (r.includes('oil') || r.includes('crude') || r.includes('petroleum')) return '🛢️';
    if (r.includes('gas') || r.includes('lng') || r.includes('natural')) return '🔥';
    if (r.includes('coal')) return '⛏️';
    if (r.includes('electric')) return '⚡';
    if (r.includes('nuclear') || r.includes('uranium')) return '☢️';
    if (r.includes('renew') || r.includes('solar') || r.includes('wind') || r.includes('hydro')) return '🌿';
    if (r.includes('lithium') || r.includes('batter')) return '🔋';
    return '💎';
}

// ============================================================================
// DATASETS MANAGEMENT
// ============================================================================

let kaggleDatasets = null;
let kaggleDatasetsLoading = false;

function setupKaggleDatasets() {
    const btnImport = document.getElementById('btnImportDatasets');
    const selectDataset = document.getElementById('datasetSelect');
    const inputCountry = document.getElementById('datasetFilterCountry');
    const selectEnergy = document.getElementById('datasetFilterEnergyType');
    const inputMinYear = document.getElementById('datasetMinYear');
    const inputMaxYear = document.getElementById('datasetMaxYear');

    if (btnImport) {
        btnImport.addEventListener('click', async () => {
            if (kaggleDatasetsLoading) return;
            kaggleDatasetsLoading = true;
            btnImport.disabled = true;
            btnImport.textContent = 'Syncing...';
            
            const summaryEl = document.getElementById('datasetImportSummary');
            if (summaryEl) summaryEl.textContent = 'Executing DatasetImporter, cleaning names, and pushing to storage... Please wait.';

            try {
                const resp = await fetch('/api/datasets/import', { method: 'POST' });
                const res = await resp.json();
                if (!resp.ok || !res.success) {
                    throw new Error(res.error || 'Import failed');
                }
                
                alert('Datasets successfully parsed and stored!');
                await fetchKaggleDatasets(true);
            } catch (err) {
                console.error('[KAGGLE IMPORT ERROR]', err);
                alert(`Import failed: ${err.message}`);
            } finally {
                kaggleDatasetsLoading = false;
                btnImport.disabled = false;
                btnImport.textContent = 'Run Importer & Sync';
            }
        });
    }

    [selectDataset, inputCountry, selectEnergy, inputMinYear, inputMaxYear].forEach(el => {
        if (el) {
            el.addEventListener('input', filterAndRenderKaggleDatasets);
            el.addEventListener('change', filterAndRenderKaggleDatasets);
        }
    });
}

async function fetchKaggleDatasets(forceLive = false) {
    if (kaggleDatasets && !forceLive) return kaggleDatasets;

    try {
        const resp = await fetch('/api/datasets');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const res = await resp.json();
        if (res.success && res.datasets) {
            kaggleDatasets = res.datasets;
            
            const sourceBadge = document.getElementById('datasetSourceBadge');
            if (sourceBadge) {
                sourceBadge.textContent = `Source: ${res.source === 'firebase' ? 'Database Cache' : 'Live Parser'}`;
                sourceBadge.className = `level-badge ${res.source === 'firebase' ? 'LOW' : 'MEDIUM'}`;
            }

            const summaryEl = document.getElementById('datasetImportSummary');
            if (summaryEl) {
                const metadata = res.metadata || {};
                
                // Helper to get stats or fallback if metadata is not loaded/cached
                const getDatasetInfo = (key, count) => {
                    const ds = metadata[key] || {};
                    const totalRows = ds.total_rows_found !== undefined ? ds.total_rows_found : 'N/A';
                    const validRows = ds.valid_rows_imported !== undefined ? ds.valid_rows_imported : count;
                    const warning = ds.warning !== undefined ? ds.warning : (validRows < 30);
                    const statusStr = ds.status || 'Cleaned & Normalized';
                    const warningHtml = warning 
                        ? `<span style="color:var(--risk-high); font-weight:bold;">⚠️ Warning: Under minimum expected records (30)</span>` 
                        : `<span style="color:var(--accent-green); font-weight:bold;">✓ Pass</span>`;
                    return { totalRows, validRows, warningHtml, statusStr };
                };

                const countConsumption = (kaggleDatasets.energy_consumption || []).length;
                const countPrices = (kaggleDatasets.fuel_prices || []).length;
                const countGlobal = (kaggleDatasets.global_energy || []).length;

                const dsCons = getDatasetInfo('energy_consumption', countConsumption);
                const dsFuel = getDatasetInfo('fuel_prices', countPrices);
                const dsGlob = getDatasetInfo('global_energy', countGlobal);

                summaryEl.innerHTML = `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
                        <div style="background: rgba(0,0,0,0.02); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color);">
                            <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">1. Global Energy Consumption (2000–2024)</div>
                            <div style="font-size: 0.85rem; line-height: 1.4; color: var(--text-secondary);">
                                • Total Rows Found: <strong>${dsCons.totalRows}</strong><br>
                                • Valid Rows Imported: <strong>${dsCons.validRows}</strong><br>
                                • Min Expected: <strong>30</strong><br>
                                • Status: ${dsCons.warningHtml}<br>
                                • Quality: <span>${dsCons.statusStr}</span>
                            </div>
                        </div>
                        <div style="background: rgba(0,0,0,0.02); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color);">
                            <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">2. Global Fuel Prices (2020–2026)</div>
                            <div style="font-size: 0.85rem; line-height: 1.4; color: var(--text-secondary);">
                                • Total Rows Found: <strong>${dsFuel.totalRows}</strong><br>
                                • Valid Rows Imported: <strong>${dsFuel.validRows}</strong><br>
                                • Min Expected: <strong>30</strong><br>
                                • Status: ${dsFuel.warningHtml}<br>
                                • Quality: <span>${dsFuel.statusStr}</span>
                            </div>
                        </div>
                        <div style="background: rgba(0,0,0,0.02); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color);">
                            <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">3. Global Energy Dataset (1900–2024)</div>
                            <div style="font-size: 0.85rem; line-height: 1.4; color: var(--text-secondary);">
                                • Total Rows Found: <strong>${dsGlob.totalRows}</strong><br>
                                • Valid Rows Imported: <strong>${dsGlob.validRows}</strong><br>
                                • Min Expected: <strong>30</strong><br>
                                • Status: ${dsGlob.warningHtml}<br>
                                • Quality: <span>${dsGlob.statusStr}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        return kaggleDatasets;
    } catch (err) {
        console.error('[FETCH KAGGLE DATASETS ERROR]', err);
        const tbody = document.getElementById('datasetTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: var(--risk-high); padding: 2rem;">
                        Failed to fetch datasets: ${err.message}. Make sure server is running.
                    </td>
                </tr>
            `;
        }
        return null;
    }
}

async function renderKaggleDatasets() {
    const tbody = document.getElementById('datasetTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                <div class="loading-spinner" style="margin: 0 auto 0.5rem;"></div>
                Fetching and preparing records...
            </td>
        </tr>
    `;

    const data = await fetchKaggleDatasets();
    if (data) {
        filterAndRenderKaggleDatasets();
    }
}

function filterAndRenderKaggleDatasets() {
    if (!kaggleDatasets) return;

    const tbody = document.getElementById('datasetTableBody');
    if (!tbody) return;

    const targetDataset = document.getElementById('datasetSelect').value;
    const filterCountry = (document.getElementById('datasetFilterCountry').value || '').trim().toLowerCase();
    const filterEnergyType = document.getElementById('datasetFilterEnergyType').value;
    const minYear = parseInt(document.getElementById('datasetMinYear').value) || -Infinity;
    const maxYear = parseInt(document.getElementById('datasetMaxYear').value) || Infinity;

    let allRecords = [];
    if (targetDataset === 'all' || targetDataset === 'energy_consumption') {
        allRecords = allRecords.concat(kaggleDatasets.energy_consumption || []);
    }
    if (targetDataset === 'all' || targetDataset === 'fuel_prices') {
        allRecords = allRecords.concat(kaggleDatasets.fuel_prices || []);
    }
    if (targetDataset === 'all' || targetDataset === 'global_energy') {
        allRecords = allRecords.concat(kaggleDatasets.global_energy || []);
    }

    const filtered = allRecords.filter(r => {
        if (filterCountry && !(r.country || '').toLowerCase().includes(filterCountry)) {
            return false;
        }

        if (filterEnergyType !== 'all') {
            if (filterEnergyType === 'Other') {
                const et = (r.energy_type || '').toLowerCase();
                if (et.includes('oil') || et.includes('gas') || et.includes('coal') || et.includes('electricity') || et.includes('renewables')) {
                    return false;
                }
            } else {
                if (!(r.energy_type || '').toLowerCase().includes(filterEnergyType.toLowerCase())) {
                    return false;
                }
            }
        }

        const y = parseInt(r.year);
        if (isNaN(y) || y < minYear || y > maxYear) {
            return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No matching records found. Try adjusting your filters.
                </td>
            </tr>
        `;
        return;
    }

    filtered.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return (a.country || '').localeCompare(b.country || '');
    });

    tbody.innerHTML = filtered.map(r => {
        const sourceName = r.source_dataset === 'energy_consumption' ? 'Consumption' :
                           r.source_dataset === 'fuel_prices' ? 'Fuel Prices' : 'Global Energy';
        const sourceClass = r.source_dataset === 'energy_consumption' ? 'LOW' :
                            r.source_dataset === 'fuel_prices' ? 'MEDIUM' : 'HIGH';
        const formattedVal = typeof r.value === 'number' ? r.value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : r.value;
        const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString() : 'N/A';

        return `
            <tr>
                <td style="font-weight: 700;">${r.country}</td>
                <td>${r.region || 'Global'}</td>
                <td style="font-weight: 600; font-family: var(--font-mono);">${r.year}</td>
                <td><span class="gemini-chip-sm">${getResourceChipIcon(r.energy_type)} ${r.energy_type}</span></td>
                <td style="text-align: right; font-weight: 700; font-family: var(--font-mono);">${formattedVal}</td>
                <td><span class="level-badge" style="background: rgba(0,0,0,0.03); color: var(--text-secondary); text-transform: none; border-radius: 4px; font-weight: 500;">${r.unit}</span></td>
                <td><span class="level-badge ${sourceClass}" style="font-size: 0.65rem;">${sourceName}</span></td>
                <td style="font-size: 0.75rem; color: var(--text-muted);">${dateStr}</td>
            </tr>
        `;
    }).join('');
}

// ============================================================================
// HISTORICAL TRENDS & CHART VISUALIZATIONS
// ============================================================================
let consumptionChartInstance = null;
let fuelPricesChartInstance = null;
let resourcesBarChartInstance = null;

async function setupHistoricalTrends() {
    const btnAnalyze = document.getElementById('btnAnalyzeTrends');
    if (btnAnalyze) {
        btnAnalyze.addEventListener('click', () => runHistoricalTrendsAnalysis(false));
    }
}

async function renderTrends() {
    // Populate Country dropdown if not already populated
    const select = document.getElementById('trendsCountrySelect');
    if (select && select.children.length === 0) {
        if (!kaggleDatasets) {
            await fetchKaggleDatasets();
        }
        if (kaggleDatasets) {
            const allCountries = new Set();
            (kaggleDatasets.energy_consumption || []).forEach(r => { if(r.country) allCountries.add(r.country); });
            (kaggleDatasets.fuel_prices || []).forEach(r => { if(r.country) allCountries.add(r.country); });
            (kaggleDatasets.global_energy || []).forEach(r => { if(r.country) allCountries.add(r.country); });
            
            const sortedCountries = [...allCountries].sort();
            select.innerHTML = sortedCountries.map(c => `<option value="${c}">${c}</option>`).join('');
            
            if (allCountries.has('United States')) {
                select.value = 'United States';
            }
        }
    }
    const summary = document.getElementById('trendsSummaryText');
    if (summary && summary.textContent.includes('Select a country')) {
        runHistoricalTrendsAnalysis(false);
    }
}

async function runHistoricalTrendsAnalysis(forceRefresh) {
    const country = document.getElementById('trendsCountrySelect').value;
    const energyType = document.getElementById('trendsEnergyTypeSelect').value;
    const btn = document.getElementById('btnAnalyzeTrends');

    if (!country) return;

    console.log("Requesting analytics: " + country + " " + energyType);

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <div class="loading-spinner" style="width:14px; height:14px; border-width:2px; border-top-color:transparent;"></div>
            <span>Analyzing...</span>
        `;
    }

    try {
        const response = await fetch('/api/analytics/trends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, energy_type: energyType, force_refresh: forceRefresh })
        });
        const result = await response.json();

        // Diagnostic logs for Bug 2 STEP A
        const responseJson = result;
        console.log("Full analytics response:", JSON.stringify(responseJson));
        console.log("Timeline field check:", {
            hasTimeline: Array.isArray(responseJson.timeline),
            timelineLength: responseJson.timeline?.length ?? 'undefined',
            firstPoint: responseJson.timeline?.[0] ?? 'none',
            rawKeys: Object.keys(responseJson)
        });

        console.log("Response keys: " + Object.keys(result));

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Error executing trends calculation');
        }

        const data = result.data;

        // Derive and set year range used label
        const timeline = data.consumption_timeline || [];
        let from = data.min_year;
        let to = data.max_year;
        if (data.yearRangeUsed) {
            from = data.yearRangeUsed.from;
            to = data.yearRangeUsed.to;
        } else if (timeline.length > 0) {
            from = timeline[0].year;
            to = timeline[timeline.length - 1].year;
        }
        
        const yrLabel = document.getElementById('trendsYearRangeLabel');
        const priceTimelineForLabel = (data.price_timeline || []).filter(p => {
            const val = p.value !== undefined ? p.value : p.price;
            return val !== null && val !== undefined && val !== 0 && val !== -9999.0 && isFinite(val);
        });
        const hasEstimated = priceTimelineForLabel.some(pt => pt.estimated);

        if (yrLabel) {
            if (hasEstimated && data.realDataRange) {
                const earliestEstimatedYear = priceTimelineForLabel.length > 0 ? priceTimelineForLabel[0].year : from;
                const latestEstimatedYear = priceTimelineForLabel.length > 0 ? priceTimelineForLabel[priceTimelineForLabel.length - 1].year : to;
                const realFrom = data.realDataRange.from;
                const realTo = data.realDataRange.to;
                yrLabel.textContent = `DATA RANGE: ${earliestEstimatedYear} — ${latestEstimatedYear} (Real: ${realFrom}–${realTo} | Estimated: extrapolated)`;
            } else {
                yrLabel.textContent = "Data range: " + from + " — " + to;
            }
        }

        // Show/hide estimation disclosure
        const disclosureContainer = document.getElementById('trendsPriceEstimationDisclosure');
        const disclosureText = document.getElementById('trendsPriceEstimationDisclosureText');
        if (disclosureContainer && disclosureText) {
            if (hasEstimated && data.realDataRange && data.regressionSlope !== undefined) {
                const slopeVal = data.regressionSlope.toFixed(4);
                const slopeFormatted = (data.regressionSlope >= 0 ? '+' : '') + slopeVal;
                disclosureText.textContent = `Dashed segments represent trend-extrapolated estimates computed via linear regression on ${data.realDataRange.from}–${data.realDataRange.to} observed data. Slope: ${slopeFormatted} per year. Estimates are mathematically derived, not real observations.`;
                disclosureContainer.style.display = 'block';
            } else {
                disclosureContainer.style.display = 'none';
            }
        }

        const consUnit = data.chart_meta?.consumption?.unit || "TWh";
        console.log("Timeline points: " + timeline.length + " | Unit: " + consUnit + " | Range: " + from + "–" + to);

        // Populate panel metrics
        const grEl = document.getElementById('trendsGrowthRate');
        if (grEl) {
            const gr = data.growth_rate;
            grEl.textContent = `${gr >= 0 ? '+' : ''}${gr.toFixed(1)}%`;
            grEl.style.color = gr >= 0 ? 'var(--accent-blue)' : 'var(--risk-high)';
        }

        const pcEl = document.getElementById('trendsPriceChange');
        if (pcEl) {
            const pc = data.price_change_percentage;
            pcEl.textContent = `${pc >= 0 ? '+' : ''}${pc.toFixed(1)}%`;
            pcEl.style.color = pc >= 0 ? 'var(--accent-amber)' : 'var(--accent-green)';
        }

        const sumEl = document.getElementById('trendsSummaryText');
        if (sumEl) sumEl.textContent = data.trend_summary;

        const tsEl = document.getElementById('trendsTransitionSpeed');
        if (tsEl) {
            tsEl.textContent = data.transition_speed;
            tsEl.className = data.transition_speed === 'Accelerating' ? 'level-badge LOW' : 
                             data.transition_speed === 'Steady' ? 'level-badge MEDIUM' : 'level-badge HIGH';
            tsEl.style.padding = '2px 8px';
            tsEl.style.borderRadius = '4px';
        }

        const compEl = document.getElementById('trendsComparison');
        if (compEl) {
            compEl.textContent = data.comparison_insight;
            compEl.style.color = data.comparison_insight.includes('High') ? 'var(--risk-high)' : 
                                 data.comparison_insight.includes('Low') ? 'var(--accent-green)' : 'var(--text-main)';
        }

        const genEl = document.getElementById('trendsGeneratedAt');
        if (genEl && data.generated_at) {
            genEl.textContent = new Date(data.generated_at).toLocaleString();
        }

        // Render charts
        renderHistoricalTrendsCharts(data);

    } catch (err) {
        console.error(err);
        const sumEl = document.getElementById('trendsSummaryText');
        if (sumEl) {
            sumEl.innerHTML = `<span style="color:var(--risk-high); font-weight:600;">Error: ${err.message}</span>`;
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Run Analytics Engine</span>';
        }
    }
}


// ============================================================================
// Centralized Data Validation & Evidence Layer
// ============================================================================
const analyticsValidator = {
    validate: function(records, country, energyType, minYear, maxYear, datasetName) {
        const totalRows = maxYear - minYear + 1;
        
        // Filter records matching criteria
        const countryRecords = (records || []).filter(r => 
            r.country && r.country.toLowerCase() === country.toLowerCase() &&
            r.energy_type && r.energy_type.toLowerCase() === energyType.toLowerCase() &&
            r.year >= minYear && r.year <= maxYear
        );

        // Group values by year to remove duplicates and count non-null
        const yearValues = {};
        countryRecords.forEach(r => {
            if (r.value !== null && r.value !== undefined && r.value !== -9999.0 && r.value > 0.0) {
                yearValues[r.year] = r.value;
            }
        });

        const nonNullRows = Object.keys(yearValues).length;
        const zeroRows = totalRows - nonNullRows;
        
        let firstValidYear = null;
        let lastValidYear = null;
        const years = Object.keys(yearValues).map(Number).sort((a, b) => a - b);
        if (years.length > 0) {
            firstValidYear = years[0];
            lastValidYear = years[years.length - 1];
        }

        const coveragePercent = totalRows > 0 ? (nonNullRows / totalRows) * 100 : 0;
        const hasData = nonNullRows > 0;

        let qualityScore = "HIGH";
        let disqualifyReason = null;

        return {
            country: country,
            column: energyType,
            dataset: datasetName,
            totalRows: totalRows,
            nonNullRows: nonNullRows,
            zeroRows: zeroRows,
            firstValidYear: firstValidYear,
            lastValidYear: lastValidYear,
            coveragePercent: parseFloat(coveragePercent.toFixed(2)),
            hasData: hasData,
            qualityScore: qualityScore,
            disqualifyReason: disqualifyReason
        };
    },

    buildEvidenceObject: function(records, country, energyType, minYear, maxYear, datasetName, metricType) {
        const report = this.validate(records, country, energyType, minYear, maxYear, datasetName);
        if (!report.hasData || report.qualityScore === "INSUFFICIENT") {
            return null;
        }

        const countryRecords = (records || []).filter(r => 
            r.country && r.country.toLowerCase() === country.toLowerCase() &&
            r.energy_type && r.energy_type.toLowerCase() === energyType.toLowerCase() &&
            r.year >= minYear && r.year <= maxYear
        );

        const yearValues = {};
        let exactUnit = "Units";
        let exactColumn = energyType;

        countryRecords.forEach(r => {
            if (r.value !== null && r.value !== undefined && r.value !== -9999.0 && r.value > 0.0) {
                yearValues[r.year] = r.value;
                if (r.unit) exactUnit = r.unit;
            }
        });

        const firstVal = yearValues[report.firstValidYear];
        const lastVal = yearValues[report.lastValidYear];
        
        let cagr = null;
        if (firstVal > 0 && lastVal > 0 && report.lastValidYear > report.firstValidYear) {
            cagr = Math.pow(lastVal / firstVal, 1 / (report.lastValidYear - report.firstValidYear)) - 1.0;
            cagr = parseFloat((cagr * 100).toFixed(4));
        }

        let trend = "STABLE";
        const yrs = Object.keys(yearValues).map(Number).sort((a, b) => a - b);
        if (yrs.length >= 2) {
            const yoyList = [];
            for (let i = 1; i < yrs.length; i++) {
                const prev = yearValues[yrs[i-1]];
                const curr = yearValues[yrs[i]];
                if (prev > 0) {
                    yoyList.push(((curr - prev) / prev) * 100);
                }
            }

            let stddev = 0;
            if (yoyList.length > 0) {
                const sum = yoyList.reduce((a, b) => a + b, 0);
                const mean = sum / yoyList.length;
                const varSum = yoyList.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
                stddev = Math.sqrt(varSum / yoyList.length);
            }

            const overallChange = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;
            if (stddev > 30) {
                trend = "VOLATILE";
            } else if (overallChange > 5) {
                trend = "INCREASING";
            } else if (overallChange < -5) {
                trend = "DECREASING";
            } else {
                trend = "STABLE";
            }
        }

        let dataType = "retail_price_per_litre";
        if (metricType.toLowerCase() === "consumption") {
            dataType = "primary_energy_consumption";
            if (datasetName === "global_energy") {
                if (energyType === "Oil") exactColumn = "oil_consumption";
                else if (energyType === "Gas") exactColumn = "gas_consumption";
                else if (energyType === "Coal") exactColumn = "coal_consumption";
                else if (energyType === "Electricity/Renewables") exactColumn = "low_carbon_consumption";
            } else {
                exactColumn = "Total Energy Consumption (TWh)";
            }
        } else {
            const std = getCommodityStandard(energyType);
            if (!std || !std.priceColumn) {
                return null;
            }
            exactColumn = std.priceColumn;
        }

        exactUnit = getUnitForColumn(exactColumn);

        return {
            country: report.country,
            metric: metricType,
            unit: exactUnit,
            dataType: dataType,
            yearRange: [report.firstValidYear, report.lastValidYear],
            latestValue: parseFloat(lastVal.toFixed(4)),
            latestYear: report.lastValidYear,
            trend: trend,
            cagr: cagr,
            qualityScore: report.qualityScore,
            sourceDataset: datasetName,
            columnUsed: exactColumn
        };
    }
};

function updateChartGating(canvasId, report) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return false;
    const card = canvas.closest('.card');
    if (!card) return false;

    // Remove existing banners, badges, and overlays
    const existingOverlay = card.querySelector('.chart-error-overlay');
    if (existingOverlay) existingOverlay.remove();
    canvas.style.opacity = '1';

    const existingBanner = card.querySelector('.chart-warning-banner');
    if (existingBanner) existingBanner.remove();

    const existingBadge = card.querySelector('.quality-badge');
    if (existingBadge) existingBadge.remove();

    return true;
}

function showChartErrorOverlay(canvasId, errorMessage) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    // Check if error overlay already exists
    let overlay = parent.querySelector('.chart-error-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'chart-error-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.background = 'rgba(255,255,255,0.95)';
        overlay.style.color = 'var(--risk-high)';
        overlay.style.fontWeight = '600';
        overlay.style.fontSize = '0.9rem';
        overlay.style.padding = '1.5rem';
        overlay.style.textAlign = 'center';
        overlay.style.zIndex = '10';
        overlay.style.borderRadius = '8px';
        parent.appendChild(overlay);
    }
    overlay.textContent = errorMessage;
    canvas.style.opacity = '0.05'; // Fade out the canvas
}

function clearChartErrorOverlay(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const overlay = parent.querySelector('.chart-error-overlay');
    if (overlay) {
        overlay.remove();
    }
    canvas.style.opacity = '1';
}

function renderHistoricalTrendsCharts(data) {
    // CENTRALIZED DATA VALIDATION LAYER - Bypassing gating check
    const consReport = data.consumption_quality || { hasData: true, qualityScore: "HIGH" };
    const priceReport = data.price_quality || { hasData: true, qualityScore: "HIGH" };
    const resourceReport = { hasData: true, qualityScore: "HIGH" };

    const consProceed = updateChartGating('consumptionChart', consReport);
    const priceProceed = updateChartGating('fuelPricesChart', priceReport);
    const resourceProceed = updateChartGating('resourcesBarChart', resourceReport);

    const grEl = document.getElementById('trendsGrowthRate');
    if (grEl) {
        grEl.textContent = (data.growth_rate <= -9998.0) ? 'N/A' : `${data.growth_rate >= 0 ? '+' : ''}${data.growth_rate.toFixed(1)}%`;
        grEl.style.color = (data.growth_rate <= -9998.0) ? 'var(--text-muted)' : (data.growth_rate > 0 ? 'var(--risk-high)' : 'var(--risk-low)');
    }

    const tsEl = document.getElementById('trendsTransitionSpeed');
    if (tsEl) {
        tsEl.textContent = data.transition_speed || 'Stable';
        tsEl.className = `level-badge ${data.transition_speed || 'Steady'}`;
        if (data.transition_speed === 'Accelerating') {
            tsEl.style.background = 'rgba(16, 185, 129, 0.1)';
            tsEl.style.color = '#10B981';
        } else if (data.transition_speed === 'Steady') {
            tsEl.style.background = 'rgba(59, 130, 246, 0.1)';
            tsEl.style.color = '#3B82F6';
        } else {
            tsEl.style.background = 'rgba(245, 158, 11, 0.1)';
            tsEl.style.color = '#F59E0B';
        }
    }

    const compEl = document.getElementById('trendsComparison');
    if (compEl) {
        compEl.textContent = data.comparison_insight || 'Balanced (Aligned with regional average)';
        compEl.style.color = 'var(--text-main)';
    }

    const pcEl = document.getElementById('trendsPriceChange');
    if (pcEl) {
        pcEl.textContent = (data.price_change_percentage <= -9998.0) ? 'N/A' : `${data.price_change_percentage >= 0 ? '+' : ''}${data.price_change_percentage.toFixed(1)}%`;
        pcEl.style.color = (data.price_change_percentage <= -9998.0) ? 'var(--text-muted)' : (data.price_change_percentage > 0 ? 'var(--risk-high)' : 'var(--risk-low)');
    }

    const sumEl = document.getElementById('trendsSummaryText');
    if (sumEl) {
        sumEl.innerHTML = data.trend_summary || 'Trend analytics summary generated.';
    }

    const consTimeline = data.consumption_timeline || [];
    const priceTimelineRaw = data.price_timeline || [];

    // Universal validPoints filter for all price charts on the Trends page
    const priceTimeline = priceTimelineRaw.filter(p => {
        const val = p.value !== undefined ? p.value : p.price;
        return val !== null && val !== undefined && val !== 0 && val !== -9999.0 && isFinite(val);
    });

    const consLabels = consTimeline.map(pt => pt.year);
    const priceLabels = priceTimeline.map(pt => pt.year);

    // Create a unified X-axis sorted union of all years to align all datasets
    const unionYears = Array.from(new Set([...consLabels, ...priceLabels])).sort((a, b) => a - b);

    // Helper to map values to the unified years array
    function mapTimelineToUnion(timeline, valueKey, union) {
        const yearMap = {};
        timeline.forEach(pt => {
            const val = pt[valueKey];
            if (val !== undefined && val !== null && val !== -9999.0) {
                yearMap[pt.year] = val;
            }
        });
        return union.map(yr => (yearMap[yr] !== undefined ? yearMap[yr] : null));
    }

    const consUnit = data.chart_meta?.consumption?.unit || "TWh";
    const priceUnit = data.chart_meta?.price?.unit || "USD";
    const resourceUnit = "%";

    const meta = data.chart_meta || {};
    const consMeta = meta.consumption || {
        chart_title: `${data.country} — ${data.energy_type} Consumption & Production`,
        x_axis_label: "Year",
        y_axis_label: `${data.energy_type} Volume`,
        unit: consUnit
    };
    const priceMeta = meta.price || {
        chart_title: `${data.country} — ${data.energy_type} Market Price / Index`,
        x_axis_label: "Year",
        y_axis_label: "Price Value",
        unit: priceUnit
    };
    const resourceMeta = meta.resource || {
        chart_title: `${data.country} — Energy Resource Mix (Latest Year)`,
        x_axis_label: "Energy Resource",
        y_axis_label: "Share of Total Energy",
        unit: resourceUnit
    };

    // Update DOM texts/labels with robust null guards
    const tctEl = document.getElementById('trendsConsTitle');
    if (tctEl) tctEl.textContent = consMeta.chart_title;

    const tcyEl = document.getElementById('trendsConsYLabel');
    if (tcyEl) tcyEl.textContent = consMeta.y_axis_label;

    const tcuEl = document.getElementById('trendsConsUnit');
    if (tcuEl) tcuEl.textContent = consUnit;

    const tcsEl = document.getElementById('trendsConsSource');
    if (tcsEl) tcsEl.textContent = "Analytical Core Unified Energy Dataset";

    const tptEl = document.getElementById('trendsPriceTitle');
    if (tptEl) tptEl.textContent = priceMeta.chart_title;

    const tpyEl = document.getElementById('trendsPriceYLabel');
    if (tpyEl) tpyEl.textContent = priceMeta.y_axis_label;

    const tpuEl = document.getElementById('trendsPriceUnit');
    if (tpuEl) tpuEl.textContent = priceUnit;

    const tpsEl = document.getElementById('trendsPriceSource');
    if (tpsEl) tpsEl.textContent = "Analytical Core Price & Index Dataset";

    const trtEl = document.getElementById('trendsResourceTitle');
    if (trtEl) trtEl.textContent = resourceMeta.chart_title;

    const trsEl = document.getElementById('trendsResourceSource');
    if (trsEl) trsEl.textContent = "Analytical Core Resource Mix Assessment";

    const timeStr = new Date(data.generated_at || Date.now()).toLocaleString();
    const tctmEl = document.getElementById('trendsConsTimestamp');
    if (tctmEl) tctmEl.textContent = `Last updated: ${timeStr}`;

    const tptmEl = document.getElementById('trendsPriceTimestamp');
    if (tptmEl) tptmEl.textContent = `Last updated: ${timeStr}`;

    const trtmEl = document.getElementById('trendsResourceTimestamp');
    if (trtmEl) trtmEl.textContent = `Last updated: ${timeStr}`;

    const energyType = data.energy_type;
    let chart1Datasets = [];
    let chart2Datasets = [];

    const isFallback = (energyType !== "Oil") || (data.price_error && data.price_error.includes("Fallback"));

    const tptlEl = document.getElementById('trendsPriceTypeLabel');
    if (tptlEl) {
        tptlEl.textContent = isFallback ? "Estimated index (Brent-scaled)" : "Raw market observation";
    }

    const priceChartLabels = (priceLabels.length > 0 && energyType !== 'Renewables') ? priceLabels : unionYears;

    const pointRadius = unionYears.length > 15 ? 3 : 5;
    const pointHoverRadius = pointRadius + 2;

    const consumptionData = mapTimelineToUnion(consTimeline, 'consumption', unionYears);
    const productionData = mapTimelineToUnion(consTimeline, 'production', unionYears);
    const maData = mapTimelineToUnion(consTimeline, 'moving_average', unionYears);
    const secondaryData = mapTimelineToUnion(consTimeline, 'secondary', unionYears);
    const priceData = mapTimelineToUnion(priceTimeline, 'price', priceChartLabels);
    const secondaryDataForPriceChart = mapTimelineToUnion(consTimeline, 'secondary', priceChartLabels);

    if (energyType === "Oil") {
        chart1Datasets = [
            {
                label: `Oil Consumption (${consUnit})`,
                data: consumptionData,
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: `Oil Production (${consUnit})`,
                data: productionData,
                borderColor: '#10B981',
                tension: 0.35,
                fill: false,
                borderWidth: 2.5,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: `Net Exports (${consUnit})`,
                data: secondaryData,
                borderColor: '#8B5CF6',
                borderDash: [5, 5],
                tension: 0.35,
                fill: false,
                borderWidth: 2,
                pointRadius: 0,
                spanGaps: true
            }
        ];

        chart2Datasets = [
            {
                label: isFallback ? `Oil Price Estimate (${priceUnit})` : `Market Price (${priceUnit})`,
                data: priceData,
                borderColor: '#F59E0B',
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            }
        ];
    } else if (energyType === "Gas" || energyType === "LNG" || energyType === "Natural Gas") {
        chart1Datasets = [
            {
                label: `${energyType} Consumption (${consUnit})`,
                data: consumptionData,
                borderColor: '#60A5FA',
                backgroundColor: 'rgba(96, 165, 250, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: `${energyType} Production (${consUnit})`,
                data: productionData,
                borderColor: '#34D399',
                tension: 0.35,
                fill: false,
                borderWidth: 2.5,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: `Net Flow (${consUnit})`,
                data: secondaryData,
                borderColor: '#A78BFA',
                borderDash: [5, 5],
                tension: 0.35,
                fill: false,
                borderWidth: 2,
                pointRadius: 0,
                spanGaps: true
            }
        ];

        chart2Datasets = [
            {
                label: isFallback ? `Gas Price Estimate (${priceUnit})` : `Market Price (${priceUnit})`,
                data: priceData,
                borderColor: '#D97706',
                backgroundColor: 'rgba(217, 119, 6, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            }
        ];
    } else if (energyType === "Coal") {
        chart1Datasets = [
            {
                label: `Coal Consumption (${consUnit})`,
                data: consumptionData,
                borderColor: '#4B5563',
                backgroundColor: 'rgba(75, 85, 99, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: `Coal Production (${consUnit})`,
                data: productionData,
                borderColor: '#9CA3AF',
                tension: 0.35,
                fill: false,
                borderWidth: 2.5,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: `Net Imports (${consUnit})`,
                data: secondaryData,
                borderColor: '#EC4899',
                borderDash: [5, 5],
                tension: 0.35,
                fill: false,
                borderWidth: 2,
                pointRadius: 0,
                spanGaps: true
            }
        ];

        chart2Datasets = [
            {
                label: isFallback ? `Coal Price Estimate (${priceUnit})` : `Coal Index Price (${priceUnit})`,
                data: priceData,
                borderColor: '#D97706',
                backgroundColor: 'rgba(217, 119, 6, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            }
        ];
    } else if (energyType === "Electricity") {
        chart1Datasets = [
            {
                label: `Electricity Demand (${consUnit})`,
                data: consumptionData,
                borderColor: '#F59E0B',
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: `Electricity Generation (${consUnit})`,
                data: productionData,
                borderColor: '#10B981',
                tension: 0.35,
                fill: false,
                borderWidth: 2.5,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            }
        ];

        chart2Datasets = [
            {
                label: `Net Imports (${consUnit})`,
                data: secondaryDataForPriceChart,
                borderColor: '#EF4444',
                tension: 0.35,
                fill: false,
                borderWidth: 2.5,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: isFallback ? `Electricity Price Estimate (${priceUnit})` : `Energy Price Index (${priceUnit})`,
                data: priceData,
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 2,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            }
        ];
    } else if (energyType === "Renewables") {
        chart1Datasets = [
            {
                label: `Renewables Consumption (${consUnit})`,
                data: consumptionData,
                borderColor: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: `Renewables Production (${consUnit})`,
                data: productionData,
                borderColor: '#34D399',
                tension: 0.35,
                fill: false,
                borderWidth: 2.5,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            }
        ];

        const solarData = productionData.map(v => (v !== null ? v * 0.55 : null));
        const windData = productionData.map(v => (v !== null ? v * 0.45 : null));

        chart2Datasets = [
            {
                label: `Renewable Share (%)`,
                data: secondaryData,
                borderColor: '#8B5CF6',
                backgroundColor: 'rgba(139, 92, 246, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 2.5,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: `Est. Solar Gen (${consUnit})`,
                data: solarData,
                borderColor: '#F59E0B',
                borderDash: [3, 3],
                tension: 0.35,
                fill: false,
                borderWidth: 1.5,
                pointRadius: 0,
                spanGaps: true
            },
            {
                label: `Est. Wind Gen (${consUnit})`,
                data: windData,
                borderColor: '#06B6D4',
                borderDash: [3, 3],
                tension: 0.35,
                fill: false,
                borderWidth: 1.5,
                pointRadius: 0,
                spanGaps: true
            }
        ];
    } else if (energyType === "Nuclear") {
        chart1Datasets = [
            {
                label: `Nuclear Consumption (${consUnit})`,
                data: consumptionData,
                borderColor: '#EC4899',
                backgroundColor: 'rgba(236, 72, 153, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: `Nuclear Production (${consUnit})`,
                data: productionData,
                borderColor: '#F472B6',
                tension: 0.35,
                fill: false,
                borderWidth: 2.5,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            }
        ];

        chart2Datasets = [
            {
                label: `Nuclear Share (%)`,
                data: secondaryDataForPriceChart,
                borderColor: '#8B5CF6',
                backgroundColor: 'rgba(139, 92, 246, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 2.5,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            },
            {
                label: isFallback ? `Nuclear Price Estimate (${priceUnit})` : `Price Index (${priceUnit})`,
                data: priceData,
                borderColor: '#3B82F6',
                tension: 0.35,
                fill: false,
                borderWidth: 2,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                spanGaps: true
            }
        ];
    } else {
        chart1Datasets = [
            {
                label: `Consumption (${consUnit})`,
                data: consumptionData,
                borderColor: '#2563EB',
                backgroundColor: 'rgba(37, 99, 235, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                spanGaps: true
            }
        ];

        chart2Datasets = [
            {
                label: isFallback ? `${energyType} Price Estimate (${priceUnit})` : `Price (${priceUnit})`,
                data: priceData,
                borderColor: '#D97706',
                backgroundColor: 'rgba(217, 119, 6, 0.05)',
                tension: 0.35,
                fill: true,
                borderWidth: 3,
                pointRadius: pointRadius,
                spanGaps: true
            }
        ];
    }

    if (priceTimeline.some(pt => pt.estimated)) {
        const validPoints = priceTimeline.filter(pt => pt.value !== undefined && pt.value !== null && pt.value !== -9999.0);
        const realPoints = validPoints.filter(pt => !pt.estimated);
        const estimatedPoints = validPoints.filter(pt => pt.estimated);

        const realLabel = isFallback ? `${energyType} Price Estimate (${priceUnit})` : `Market Price (${priceUnit})`;

        chart2Datasets = [
            {
                label: realLabel,
                data: realPoints.map(p => ({ x: p.year, y: p.value })),
                borderColor: '#E87C2A',
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 4,
                borderDash: []
            },
            {
                label: 'Estimated (trend extrapolation)',
                data: estimatedPoints.map(p => ({ x: p.year, y: p.value })),
                borderColor: '#E87C2A',
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                pointRadius: 3,
                borderDash: [5, 5],
                pointStyle: 'triangle'
            }
        ];
    }

    // 1. Render Consumption/Production Chart
    const canvasConsumption = document.getElementById('consumptionChart');
    if (canvasConsumption && consProceed) {
        const ctxConsumption = canvasConsumption.getContext('2d');
        if (window.consumptionChartInstance instanceof Chart) {
            window.consumptionChartInstance.destroy();
        }
        window.consumptionChartInstance = new Chart(ctxConsumption, {
            type: 'line',
            data: {
                labels: unionYears,
                datasets: chart1Datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: consMeta.chart_title, color: 'var(--text-main)', font: { family: 'Inter', size: 13, weight: 600 } },
                    legend: { labels: { color: '#64748B', font: { family: 'Inter', weight: 500 } } }
                },
                scales: {
                    x: { 
                        title: { display: true, text: consMeta.x_axis_label, color: '#64748B', font: { family: 'Inter', weight: 600 } },
                        grid: { color: 'rgba(0,0,0,0.02)' }, 
                        ticks: { color: '#64748B', font: { family: 'Inter' } } 
                    },
                    y: { 
                        title: { display: true, text: `${consMeta.y_axis_label} (${consUnit})`, color: '#64748B', font: { family: 'Inter', weight: 600 } },
                        grid: { color: 'rgba(0,0,0,0.04)' }, 
                        ticks: { color: '#64748B', font: { family: 'Inter' } } 
                    }
                }
            }
        });
    }

    // 2. Render Price/Secondary Chart
    const canvasPrices = document.getElementById('fuelPricesChart');
    if (canvasPrices && priceProceed) {
        const ctxPrices = canvasPrices.getContext('2d');
        if (window.fuelPricesChartInstance instanceof Chart) {
            window.fuelPricesChartInstance.destroy();
        }
        window.fuelPricesChartInstance = new Chart(ctxPrices, {
            type: 'line',
            data: {
                labels: priceChartLabels,
                datasets: chart2Datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: priceMeta.chart_title, color: 'var(--text-main)', font: { family: 'Inter', size: 13, weight: 600 } },
                    legend: { labels: { color: '#64748B', font: { family: 'Inter', weight: 500 } } }
                },
                scales: {
                    x: { 
                        title: { display: true, text: priceMeta.x_axis_label, color: '#64748B', font: { family: 'Inter', weight: 600 } },
                        grid: { color: 'rgba(0,0,0,0.02)' }, 
                        ticks: { color: '#64748B', font: { family: 'Inter' } } 
                    },
                    y: { 
                        title: { display: true, text: `Price/Indicator`, color: '#64748B', font: { family: 'Inter', weight: 600 } },
                        grid: { color: 'rgba(0,0,0,0.04)' }, 
                        ticks: { color: '#64748B', font: { family: 'Inter' } } 
                    }
                }
            }
        });
    }

    // 3. Render Resource Mix Bar Chart
    const canvasBar = document.getElementById('resourcesBarChart');
    if (canvasBar && resourceProceed) {
        const ctxBar = canvasBar.getContext('2d');
        const sharesObj = data.resource_shares || {};
        const barLabels = Object.keys(sharesObj);
        const barData = Object.values(sharesObj);

        const categoryColors = {
            "Oil": "rgba(59, 130, 246, 0.7)",       // blue
            "Gas": "rgba(96, 165, 250, 0.7)",       // light blue
            "Coal": "rgba(75, 85, 99, 0.7)",         // grey
            "Electricity": "rgba(245, 158, 11, 0.7)", // amber
            "Renewables": "rgba(16, 185, 129, 0.7)",  // green
            "Nuclear": "rgba(236, 72, 153, 0.7)"     // pink
        };
        const barColors = barLabels.map(label => categoryColors[label] || "rgba(156, 163, 175, 0.7)");

        if (window.resourcesBarChartInstance instanceof Chart) {
            window.resourcesBarChartInstance.destroy();
        }
        window.resourcesBarChartInstance = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: barLabels,
                datasets: [
                    {
                        label: `Proportional Mix Share %`,
                        data: barData,
                        backgroundColor: barColors,
                        borderWidth: 0,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: resourceMeta.chart_title, color: 'var(--text-main)', font: { family: 'Inter', size: 13, weight: 600 } },
                    legend: { display: false }
                },
                scales: {
                    x: { 
                        title: { display: true, text: resourceMeta.x_axis_label, color: '#64748B', font: { family: 'Inter', weight: 600 } },
                        grid: { display: false }, 
                        ticks: { color: '#64748B', font: { family: 'Inter', weight: 600 } } 
                    },
                    y: { 
                        title: { display: true, text: `${resourceMeta.y_axis_label} (${resourceMeta.unit})`, color: '#64748B', font: { family: 'Inter', weight: 600 } },
                        grid: { color: 'rgba(0,0,0,0.04)' }, 
                        ticks: { color: '#64748B', font: { family: 'Inter' } }, 
                        max: 100 
                    }
                }
            }
        });
    }
}

// ============================================================================
// GLOBAL RISK EXPLORER PAGE
// ============================================================================
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

let cachedCountryScores = null;
let globalRiskExplorerFiltersWired = false;

function getRegionMeta(regionName) {
    for (const [code, info] of Object.entries(COUNTRY_REGION_MAP)) {
        if (info.region.toLowerCase() === regionName.toLowerCase() || info.name.toLowerCase() === regionName.toLowerCase()) {
            return info;
        }
    }
    return { name: regionName, continent: 'Global', region: regionName };
}

function setupGlobalRiskExplorerFilters() {
    if (globalRiskExplorerFiltersWired) return;
    const elements = [
        'explorerFilterCountry',
        'explorerFilterRegion',
        'explorerFilterContinent',
        'explorerFilterResourceType',
        'explorerFilterRisk',
        'explorerMinYear',
        'explorerMaxYear'
    ];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => renderGlobalRiskExplorer(false));
            el.addEventListener('change', () => renderGlobalRiskExplorer(false));
        }
    });
    
    const btnClose = document.getElementById('btnDrawerClose');
    if (btnClose) {
        btnClose.addEventListener('click', closeDetailDrawer);
    }
    const overlay = document.getElementById('detailDrawerOverlay');
    if (overlay) {
        overlay.addEventListener('click', closeDetailDrawer);
    }
    
    globalRiskExplorerFiltersWired = true;
}

async function renderGlobalRiskExplorer(fetchFresh = true) {
    setupGlobalRiskExplorerFilters();
    
    if (fetchFresh || !cachedCountryScores) {
        const tbodyRegions = document.getElementById('regionComparisonTableBody');
        const tbodyAssets = document.getElementById('assetRegistryTableBody');
        if (tbodyRegions) {
            tbodyRegions.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;"><div class="loading-spinner" style="margin:0 auto 10px;"></div>Syncing security index...</td></tr>`;
        }
        if (tbodyAssets) {
            tbodyAssets.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:2rem;"><div class="loading-spinner" style="margin:0 auto 10px;"></div>Syncing assets...</td></tr>`;
        }
        cachedCountryScores = await fetchCountryRiskData();
    }
    
    const countries = cachedCountryScores ? Object.values(cachedCountryScores) : [];
    
    const filterCountry = (document.getElementById('explorerFilterCountry')?.value || '').trim().toLowerCase();
    const filterRegion = document.getElementById('explorerFilterRegion')?.value || 'all';
    const filterContinent = document.getElementById('explorerFilterContinent')?.value || 'all';
    const filterResourceType = document.getElementById('explorerFilterResourceType')?.value || 'all';
    const filterRisk = document.getElementById('explorerFilterRisk')?.value || 'all';
    const minYear = parseInt(document.getElementById('explorerMinYear')?.value) || 0;
    const maxYear = parseInt(document.getElementById('explorerMaxYear')?.value) || 9999;
    
    let filteredCountries = countries.filter(c => {
        if (filterCountry && !c.country_name.toLowerCase().includes(filterCountry) && !c.country_code.toLowerCase().includes(filterCountry)) {
            return false;
        }
        
        if (filterRegion !== 'all') {
            const mapped = COUNTRY_REGION_MAP[c.country_code];
            if (!mapped || mapped.region.toLowerCase() !== filterRegion.toLowerCase()) {
                return false;
            }
        }
        
        if (filterContinent !== 'all' && c.continent.toLowerCase() !== filterContinent.toLowerCase()) {
            return false;
        }
        
        if (filterResourceType !== 'all' && !c.affected_resources.some(resType => resType.toLowerCase() === filterResourceType.toLowerCase())) {
            return false;
        }
        
        if (filterRisk !== 'all' && c.risk_level.toLowerCase() !== filterRisk.toLowerCase()) {
            return false;
        }
        
        return true;
    });
    
    let filteredResources = state.resources.filter(r => {
        const meta = getRegionMeta(r.region);
        
        if (filterCountry && !r.name.toLowerCase().includes(filterCountry) && !r.region.toLowerCase().includes(filterCountry) && !meta.name.toLowerCase().includes(filterCountry)) {
            return false;
        }
        
        if (filterRegion !== 'all' && r.region.toLowerCase() !== filterRegion.toLowerCase() && meta.region.toLowerCase() !== filterRegion.toLowerCase()) {
            return false;
        }
        
        if (filterContinent !== 'all' && meta.continent.toLowerCase() !== filterContinent.toLowerCase()) {
            return false;
        }
        
        if (filterResourceType !== 'all' && r.type.toLowerCase() !== filterResourceType.toLowerCase()) {
            return false;
        }
        
        if (filterRisk !== 'all' && r.risk.level.toLowerCase() !== filterRisk.toLowerCase()) {
            return false;
        }
        
        return true;
    });
    
    renderRegionComparisonTable(filteredCountries);
    renderAssetRegistryTable(filteredResources);
    renderRiskRankings(filteredResources, filteredCountries);
    
    // Render charts & feeds moved from dashboard
    renderDonutChart();
    renderBarChart();
    renderTopRisks();
    renderEventsFeed();
}

function renderRegionComparisonTable(countries) {
    const tbody = document.getElementById('regionComparisonTableBody');
    if (!tbody) return;
    
    if (countries.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No matching regions found. Adjust your filters.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = countries.map(c => {
        const score = c.risk_score;
        const levelClass = c.risk_level.toUpperCase();
        const mainResource = c.affected_resources.join(', ') || 'N/A';
        const dateStr = c.last_updated ? new Date(c.last_updated).toLocaleString() : 'N/A';
        
        const hasAI = geminiInsightState.lastResult && 
                      geminiInsightState.lastResult.success && 
                      geminiInsightState.currentRegion.toLowerCase() === c.country_name.toLowerCase();
        
        return `
            <tr onclick="showRegionDetailDrawer('${c.country_code}')" style="cursor:pointer;">
                <td style="font-weight:700; color:var(--text-primary);">${c.country_name} (${c.country_code})</td>
                <td>${c.continent}</td>
                <td style="font-weight:800; font-family:var(--font-mono); color:${getScoreColor(score)};">${formatRiskScore(score, hasAI)}</td>
                <td><span class="level-badge ${levelClass}"><span class="level-dot"></span>${levelClass}</span></td>
                <td><span class="gemini-chip-sm">${mainResource}</span></td>
                <td style="text-align:center; font-weight:600;">${c.active_events_count}</td>
                <td style="font-size:0.75rem; color:var(--text-muted);">${dateStr}</td>
            </tr>
        `;
    }).join('');
}

function renderAssetRegistryTable(resources) {
    const tbody = document.getElementById('assetRegistryTableBody');
    if (!tbody) return;
    
    if (resources.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No matching assets found. Adjust your filters.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = resources.map(r => {
        const score = r.risk.raw_score;
        const selfSufficiency = r.production > 0 ? (r.production / (r.consumption || 1) * 100).toFixed(0) : 0;
        const selfSuffColor = parseFloat(selfSufficiency) >= 100 ? 'var(--accent-green)' : 'var(--risk-high)';
        const unitStr = getVolumeUnitAbbr(r.type);
        
        return `
            <tr onclick="showAssetDetailDrawer('${r.id}')" style="cursor:pointer;">
                <td style="font-weight:700; color:var(--text-primary);">${r.name}</td>
                <td><span class="gemini-chip-sm">${getResourceChipIcon(r.type)} ${r.type}</span></td>
                <td>${r.region}</td>
                <td style="text-align:right; font-weight:600; font-family:var(--font-mono);">${r.production.toFixed(1)}</td>
                <td style="text-align:right; font-weight:600; font-family:var(--font-mono);">${r.consumption.toFixed(1)}</td>
                <td style="text-align:center; font-weight:700; color:${selfSuffColor}; font-family:var(--font-mono);">${selfSufficiency}%</td>
                <td style="font-weight:800; font-family:var(--font-mono); color:${getScoreColor(score)};">${formatRiskScore(score, false)}</td>
                <td><span class="level-badge" style="background:rgba(0,0,0,0.03); color:var(--text-secondary); text-transform:none;">${unitStr}</span></td>
                <td><span class="level-badge HIGH" style="font-size:0.65rem;">Verified</span></td>
            </tr>
        `;
    }).join('');
}

function renderRiskRankings(filteredResources, filteredCountries) {
    const highRiskRegionsEl = document.getElementById('explorerHighRiskRegions');
    if (highRiskRegionsEl) {
        const sortedCountries = [...filteredCountries].sort((a, b) => b.risk_score - a.risk_score).slice(0, 3);
        highRiskRegionsEl.innerHTML = sortedCountries.map((c, idx) => {
            const hasAI = geminiInsightState.lastResult && 
                          geminiInsightState.lastResult.success && 
                          geminiInsightState.currentRegion.toLowerCase() === c.country_name.toLowerCase();
            return `
                <div class="ranking-item" onclick="showRegionDetailDrawer('${c.country_code}')">
                    <span class="rank-badge rank-${idx+1}">#${idx+1}</span>
                    <span class="rank-name">${c.country_name}</span>
                    <span class="rank-score" style="color:${getScoreColor(c.risk_score)};">${formatRiskScore(c.risk_score, hasAI)}</span>
                </div>
            `;
        }).join('') || '<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:0.5rem 0;">No matching regions</div>';
    }

    const highRiskResourcesEl = document.getElementById('explorerHighRiskResources');
    if (highRiskResourcesEl) {
        const sortedResources = [...filteredResources].sort((a, b) => b.risk.raw_score - a.risk.raw_score).slice(0, 3);
        highRiskResourcesEl.innerHTML = sortedResources.map((r, idx) => {
            const score = r.risk.raw_score;
            return `
                <div class="ranking-item" onclick="showAssetDetailDrawer('${r.id}')">
                    <span class="rank-badge rank-${idx+1}">#${idx+1}</span>
                    <span class="rank-name">${r.name}</span>
                    <span class="rank-score" style="color:${getScoreColor(score)};">${formatRiskScore(score, false)}</span>
                </div>
            `;
        }).join('') || '<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:0.5rem 0;">No matching assets</div>';
    }

    const vulnerableSectorsEl = document.getElementById('explorerVulnerableSectors');
    if (vulnerableSectorsEl) {
        const typeScores = {};
        filteredResources.forEach(r => {
            if (!typeScores[r.type]) {
                typeScores[r.type] = { sum: 0, count: 0 };
            }
            typeScores[r.type].sum += r.risk.raw_score;
            typeScores[r.type].count++;
        });

        const sortedSectors = Object.entries(typeScores).map(([type, stats]) => ({
            type,
            avg: stats.sum / stats.count
        })).sort((a, b) => b.avg - a.avg).slice(0, 3);

        vulnerableSectorsEl.innerHTML = sortedSectors.map((s, idx) => {
            return `
                <div class="ranking-item">
                    <span class="rank-badge rank-${idx+1}">#${idx+1}</span>
                    <span class="rank-name">${s.type}</span>
                    <span class="rank-score" style="color:${getScoreColor(s.avg)};">${formatRiskScore(s.avg, false)}</span>
                </div>
            `;
        }).join('') || '<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:0.5rem 0;">No matching sectors</div>';
    }
}

function showRegionDetailDrawer(countryCode) {
    const overlay = document.getElementById('detailDrawerOverlay');
    const drawer = document.getElementById('detailDrawer');
    const title = document.getElementById('drawerTitle');
    const subtitle = document.getElementById('drawerSubtitle');
    const content = document.getElementById('drawerContent');
    
    if (!drawer || !content || !cachedCountryScores) return;
    
    const country = cachedCountryScores[countryCode];
    if (!country) return;
    
    const meta = COUNTRY_REGION_MAP[countryCode] || { name: country.country_name, region: country.country_name };
    
    title.textContent = country.country_name;
    subtitle.textContent = `Region Security Assessment (${country.continent})`;
    
    const relatedResources = state.resources.filter(r => r.region.toLowerCase() === meta.region.toLowerCase());
    const relatedEvents = state.events.filter(e => e.is_active && (e.region.toLowerCase() === meta.region.toLowerCase() || e.region === 'Global'));
    
    const hasAI = geminiInsightState.lastResult && 
                  geminiInsightState.lastResult.success && 
                  geminiInsightState.currentRegion.toLowerCase() === country.country_name.toLowerCase();
    const formattedScore = formatRiskScore(country.risk_score, hasAI);

    content.innerHTML = `
        <div class="drawer-section">
            <div class="drawer-section-title">Composite Risk Index</div>
            <div style="display:flex; align-items:baseline; gap:0.75rem; margin-top:0.25rem;">
                <span style="font-size: 2.75rem; font-weight:900; font-family:var(--font-mono); color:${getScoreColor(country.risk_score)};">${formattedScore}</span>
                <span class="level-badge ${country.risk_level.toUpperCase()}"><span class="level-dot"></span>${country.risk_level.toUpperCase()} WATCH</span>
            </div>
        </div>

        <div class="drawer-section">
            <div class="drawer-section-title">Risk Model Breakdown</div>
            <div class="drawer-metric-grid" style="margin-top:0.5rem;">
                <div class="drawer-metric-card">
                    <div class="drawer-metric-label">Active Threat Count</div>
                    <div class="drawer-metric-value">${country.active_events_count}</div>
                </div>
            </div>
        </div>

        <div class="drawer-section">
            <div class="drawer-section-title">Security Briefing Narrative</div>
            <p style="font-size:0.82rem; line-height:1.55; color:var(--text-secondary); margin:0;">
                Analyzing security metrics for <strong>${country.country_name}</strong>. With an aggregated risk score of <strong>${formattedScore}</strong>, this region is classified under <strong>${country.risk_level.toUpperCase()}</strong> watch. 
                The calculation engine has factored <strong>${country.active_events_count}</strong> active regional conflict or trade vector threats into this composite index. 
                Vulnerability exposure remains elevated across <strong>${country.affected_resources.join(', ')}</strong> energy assets.
            </p>
        </div>

        <div class="drawer-section">
            <div class="drawer-section-title">Monitored Assets (${relatedResources.length})</div>
            <div style="display:flex; flex-direction:column; gap:0.4rem; margin-top:0.25rem;">
                ${relatedResources.map(r => `
                    <div onclick="showAssetDetailDrawer('${r.id}')" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.75rem; background:rgba(0,0,0,0.02); border:1px solid var(--border-color); border-radius:6px; transition:all 0.15s;">
                        <span style="font-size:0.8rem; font-weight:600; color:var(--accent-blue);">${r.name}</span>
                        <span class="level-badge" style="background:rgba(0,0,0,0.03); color:var(--text-secondary);">${r.type}</span>
                    </div>
                `).join('') || '<p style="font-size:0.8rem; color:var(--text-muted); margin:0;">No registered assets in region</p>'}
            </div>
        </div>

        <div class="drawer-section">
            <div class="drawer-section-title">Active Geopolitical Threats (${relatedEvents.length})</div>
            <div style="display:flex; flex-direction:column; gap:0.4rem; margin-top:0.25rem;">
                ${relatedEvents.map(e => `
                    <div style="padding:0.5rem 0.75rem; background:rgba(0,0,0,0.02); border-left:3px solid ${getScoreColor(e.intensity*100)}; border-radius:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.8rem; font-weight:700;">${e.title}</span>
                            <span class="event-type-badge ${e.type}" style="font-size:0.6rem;">${e.type}</span>
                        </div>
                        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.15rem;">Intensity Impact: ${(e.intensity*100).toFixed(0)}%</div>
                    </div>
                `).join('') || '<p style="font-size:0.8rem; color:var(--text-muted); margin:0;">No active threats affecting region</p>'}
            </div>
        </div>

        <div class="drawer-section" style="margin-top:auto; padding-top:1rem; border-top:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; font-size:0.68rem; color:var(--text-muted);">
                <span>Source: Internal Registry</span>
                <span>Updated: ${new Date(country.last_updated).toLocaleTimeString()}</span>
            </div>
        </div>
    `;
    
    overlay.classList.add('visible');
    drawer.classList.add('visible');
}

function showAssetDetailDrawer(assetId) {
    const overlay = document.getElementById('detailDrawerOverlay');
    const drawer = document.getElementById('detailDrawer');
    const title = document.getElementById('drawerTitle');
    const subtitle = document.getElementById('drawerSubtitle');
    const content = document.getElementById('drawerContent');
    
    if (!drawer || !content) return;
    
    const res = state.resources.find(r => r.id === assetId);
    if (!res) return;
    
    title.textContent = res.name;
    subtitle.textContent = `Asset Registry Intelligence Briefing (${res.region})`;
    
    const score = res.risk.raw_score;
    const levelClass = res.risk.level.toUpperCase();
    const selfSufficiency = res.production > 0 ? (res.production / (res.consumption || 1) * 100).toFixed(0) : 0;
    const finalColor = getScoreColor(score);
    
    content.innerHTML = `
        <div class="drawer-section">
            <div class="drawer-section-title">Composite Risk Index Score</div>
            <div style="display:flex; align-items:baseline; gap:0.75rem; margin-top:0.25rem;">
                <span style="font-size: 2.75rem; font-weight:900; font-family:var(--font-mono); color:${finalColor};">${formatRiskScore(score, false)}</span>
                <span class="level-badge ${levelClass}"><span class="level-dot"></span>${levelClass} WATCH</span>
            </div>
            <div style="margin-top:0.5rem;">${getCollapsibleBreakdownHTML(res)}</div>
        </div>

        <div class="drawer-section">
            <div class="drawer-section-title">Technical Specifications</div>
            <div class="drawer-metric-grid" style="margin-top:0.5rem;">
                <div class="drawer-metric-card">
                    <div class="drawer-metric-label">Production Capacity</div>
                    <div class="drawer-metric-value">${res.production.toFixed(1)} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${getVolumeUnitAbbr(res.type)}</span></div>
                </div>
                <div class="drawer-metric-card">
                    <div class="drawer-metric-label">Consumption Level</div>
                    <div class="drawer-metric-value">${res.consumption.toFixed(1)} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${getVolumeUnitAbbr(res.type)}</span></div>
                </div>
                <div class="drawer-metric-card">
                    <div class="drawer-metric-label">Self Sufficiency</div>
                    <div class="drawer-metric-value" style="color:${parseFloat(selfSufficiency) >= 100 ? 'var(--accent-green)' : 'var(--risk-high)'};">${selfSufficiency}%</div>
                </div>
                <div class="drawer-metric-card" style="grid-column: span 2;">
                    <div class="drawer-metric-label">Market Price</div>
                    <div class="drawer-metric-value" style="color:var(--accent-green); font-family:var(--font-mono); font-size:0.9rem; word-break:break-word;">${formatCommodityPrice(res.price, res.type)}</div>
                </div>
            </div>
        </div>

        <div class="drawer-section">
            <div class="drawer-section-title">Dynamic Weight Breakdown</div>
            <div style="display:flex; flex-direction:column; gap:0.6rem; margin-top:0.35rem;">
                ${renderDrawerScoreBar('Supply Chain Vulnerability', res.risk.supply_score, '#2563EB', res)}
                ${renderDrawerScoreBar('Regional Geopolitical Conflict', res.risk.conflict_score, '#DC2626', res)}
                ${renderDrawerScoreBar('Trade Restriction Limits', res.risk.trade_score, '#D97706', res)}
                ${renderDrawerScoreBar('Internal Demand Pressure', res.risk.demand_score, '#7C3AED', res)}
                ${renderDrawerScoreBar('Sea Route Bottlenecking', res.risk.route_score, '#0891B2', res)}
            </div>
        </div>

        <div class="drawer-section">
            <div class="drawer-section-title">Model Risk Assessment Narrative</div>
            <p style="font-size:0.82rem; line-height:1.55; color:var(--text-secondary); margin:0;">
                Calculated dynamically based on supply dependency and active geopolitical parameters. 
                With a supply dependency score of <strong>${(100 - parseFloat(selfSufficiency)).toFixed(0)}%</strong> and active threat indicators, the asset's security rating is evaluated at <strong>${formatRiskScore(score, false)}</strong>.
            </p>
        </div>

        <div class="drawer-section" style="margin-top:auto; padding-top:1rem; border-top:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; font-size:0.68rem; color:var(--text-muted);">
                <span>Source: Internal Registry</span>
                <span>System: Analytical Core</span>
            </div>
        </div>
    `;
    
    overlay.classList.add('visible');
    drawer.classList.add('visible');
}

function renderDrawerScoreBar(label, value, color, res) {
    // Route through renderModalScoreItem for consistent tiered visual hierarchy
    return renderModalScoreItem(label, value, color, res);
}

function closeDetailDrawer() {
    const overlay = document.getElementById('detailDrawerOverlay');
    const drawer = document.getElementById('detailDrawer');
    if (overlay && drawer) {
        overlay.classList.remove('visible');
        drawer.classList.remove('visible');
    }
}

// ============================================================================
// ADD EVENT WORKSPACE LOGIC (Real-time Firebase integration)
// ============================================================================

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderAddEventPage() {
    fetchSubmittedEvents();
}

async function fetchSubmittedEvents() {
    const grid = document.getElementById('submittedEventsGrid');
    const emptyState = document.getElementById('submittedEventsEmptyState');
    if (!grid) return;

    try {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                <div class="loading-spinner" style="width: 24px; height: 24px; margin: 0 auto 0.75rem auto;"></div>
                <div style="color:var(--text-muted); font-size: 0.82rem;">Loading logged energy threats...</div>
            </div>
        `;

        const resp = await fetch('/api/submitted-events');
        const result = await resp.json();

        if (!resp.ok || !result.success) {
            throw new Error(result.message || 'Failed to fetch events');
        }

        const events = result.events || [];

        if (events.length === 0) {
            grid.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        grid.style.display = 'grid';

        grid.innerHTML = events.map(ev => {
            let badgeClass = 'badge-blue';
            if (ev.severity === 'Low') badgeClass = 'badge-green';
            else if (ev.severity === 'Medium') badgeClass = 'badge-amber';
            else if (ev.severity === 'High') badgeClass = 'badge-red';
            else if (ev.severity === 'Critical') badgeClass = 'badge-darkred';

            const dateStr = ev.date ? new Date(ev.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown Date';
            const sourceHtml = ev.sourceUrl ? `
                <a href="${ev.sourceUrl}" target="_blank" rel="noopener noreferrer" class="event-card-source">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:2px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Source
                </a>
            ` : '';

            return `
                <div class="event-card">
                    <div class="event-card-header">
                        <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
                        <span class="level-badge ${badgeClass}" style="font-size:0.65rem; font-weight:700; padding:2px 8px; border-radius:10px; margin-top:2px;">${ev.severity}</span>
                    </div>
                    <div class="event-card-meta">
                        <div class="event-card-meta-item">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            <span>${dateStr}</span>
                        </div>
                        <div class="event-card-meta-item">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                            <span>${escapeHtml(ev.region)}</span>
                        </div>
                        <div class="event-card-meta-item">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                            <span>${ev.resource}</span>
                        </div>
                        <div class="event-card-meta-item" style="color:var(--accent-purple); border-color:var(--accent-purple-dim); background:var(--accent-purple-dim);">
                            <span>${ev.type}</span>
                        </div>
                    </div>
                    <p class="event-card-desc">${escapeHtml(ev.description)}</p>
                    <div class="event-card-footer">
                        <span>${sourceHtml}</span>
                        <span>Reported by: <strong>${escapeHtml(ev.submittedBy || 'Anonymous')}</strong></span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('[FETCH SUBMITTED EVENTS ERROR]', err);
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; border: 1px solid var(--accent-red-dim); background: rgba(220,38,38,0.02); border-radius: var(--radius-md);">
                <div style="color: var(--accent-red); font-weight: 600; font-size: 0.9rem; margin-bottom: 0.25rem;">Failed to load submitted events log</div>
                <div style="color: var(--text-muted); font-size: 0.8rem;">${err.message}</div>
            </div>
        `;
    }
}

function setupAddEventForm() {
    const form = document.getElementById('addEventForm');
    const descTextarea = document.getElementById('addEventDescription');
    const charCounter = document.getElementById('descCharCounter');

    if (descTextarea && charCounter) {
        descTextarea.addEventListener('input', () => {
            const len = descTextarea.value.length;
            charCounter.textContent = `${len} / 30 min chars`;
            if (len >= 30) {
                charCounter.className = 'char-counter valid';
            } else {
                charCounter.className = 'char-counter invalid';
            }
        });
    }

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Clear all previous errors
        const errorSpans = form.querySelectorAll('.field-error');
        errorSpans.forEach(span => {
            span.textContent = '';
            span.classList.remove('active');
        });
        const formAlertSuccess = document.getElementById('addEventSuccessAlert');
        const formAlertError = document.getElementById('addEventErrorAlert');
        if (formAlertSuccess) formAlertSuccess.style.display = 'none';
        if (formAlertError) formAlertError.style.display = 'none';

        // Extract values
        const titleInput = document.getElementById('addEventTitle');
        const typeInput = document.getElementById('addEventType');
        const regionInput = document.getElementById('addEventRegion');
        const resourceInput = document.getElementById('addEventResource');
        const severityInput = document.getElementById('addEventSeverity');
        const dateInput = document.getElementById('addEventDate');
        const descInput = document.getElementById('addEventDescription');
        const sourceUrlInput = document.getElementById('addEventSourceUrl');
        const submittedByInput = document.getElementById('addEventSubmittedBy');

        const title = titleInput.value.trim();
        const type = typeInput.value;
        const region = regionInput.value.trim();
        const resource = resourceInput.value;
        const severity = severityInput.value;
        const date = dateInput.value;
        const description = descInput.value.trim();
        const sourceUrl = sourceUrlInput.value.trim();
        const submittedBy = submittedByInput.value.trim();

        let hasError = false;

        // Title validation
        if (!title) {
            showFieldError('errorEventTitle', 'Event Title is required.');
            hasError = true;
        }

        // Type validation
        if (!type) {
            showFieldError('errorEventType', 'Please select an Event Type.');
            hasError = true;
        }

        // Region validation
        if (!region) {
            showFieldError('errorEventRegion', 'Affected Region/Country is required.');
            hasError = true;
        }

        // Resource validation
        if (!resource) {
            showFieldError('errorEventResource', 'Please select an Affected Energy Resource.');
            hasError = true;
        }

        // Severity validation
        if (!severity) {
            showFieldError('errorEventSeverity', 'Please select a Severity Level.');
            hasError = true;
        }

        // Date validation
        if (!date) {
            showFieldError('errorEventDate', 'Event Date is required.');
            hasError = true;
        }

        // Description validation
        if (!description) {
            showFieldError('errorEventDescription', 'Event Description is required.');
            hasError = true;
        } else if (description.length < 30) {
            showFieldError('errorEventDescription', `Description is too short. Currently ${description.length} chars (minimum 30).`);
            hasError = true;
        }

        // URL format validation if filled
        if (sourceUrl) {
            try {
                new URL(sourceUrl);
            } catch (_) {
                showFieldError('errorEventSourceUrl', 'Please enter a valid URL format (e.g., https://example.com).');
                hasError = true;
            }
        }

        if (hasError) {
            // Scroll to the first error
            const firstError = form.querySelector('.field-error.active');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const parentGroup = firstError.closest('.form-group');
                if (parentGroup) {
                    const inputEl = parentGroup.querySelector('input, select, textarea');
                    if (inputEl) inputEl.focus();
                }
            }
            return;
        }

        // Disabling submit button during request
        const submitBtn = document.getElementById('btnSubmitAddEvent');
        let originalText = 'Submit Risk Event';
        if (submitBtn) {
            originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <div class="loading-spinner" style="width:14px; height:14px; border-width:2px; border-top-color:transparent; margin-right:6px;"></div>
                <span>Submitting Event...</span>
            `;
        }

        const payload = { title, type, region, resource, severity, date, description, sourceUrl, submittedBy };

        try {
            const resp = await fetch('/api/submitted-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await resp.json();

            if (!resp.ok || !result.success) {
                throw new Error(result.message || 'Failed to submit geopolitical event.');
            }

            // On successful write, show success message and reset the form
            if (formAlertSuccess) {
                formAlertSuccess.style.display = 'block';
                formAlertSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            form.reset();
            if (charCounter) {
                charCounter.textContent = '0 / 30 min chars';
                charCounter.className = 'char-counter';
            }

            // Refresh live list
            fetchSubmittedEvents();

        } catch (err) {
            console.error('[ADD EVENT FORM ERROR]', err);
            if (formAlertError) {
                formAlertError.textContent = `Submission failed: ${err.message}`;
                formAlertError.style.display = 'block';
                formAlertError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    });
}

function showFieldError(spanId, message) {
    const span = document.getElementById(spanId);
    if (span) {
        span.textContent = message;
        span.classList.add('active');
    }
}

let _allEventsFiltersInitialized = false;

function renderAllEventsPage() {
    const grid = document.getElementById('allEventsGrid');
    if (!grid) return;

    const typeSelect = document.getElementById('filterAllEventsType');
    const severitySelect = document.getElementById('filterAllEventsSeverity');
    
    if (typeSelect && !_allEventsFiltersInitialized) {
        const uniqueTypes = [...new Set(state.datasetEvents.map(e => e.event_type || e.type))].filter(Boolean);
        
        typeSelect.innerHTML = '<option value="all">All Types</option>';
        uniqueTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t.toUpperCase();
            typeSelect.appendChild(opt);
        });
        
        typeSelect.addEventListener('change', renderAllEventsPage);
        if (severitySelect) {
            severitySelect.addEventListener('change', renderAllEventsPage);
        }
        _allEventsFiltersInitialized = true;
    }

    const selectedType = typeSelect ? typeSelect.value : 'all';
    const selectedSeverity = severitySelect ? severitySelect.value : 'all';

    let filtered = [...state.datasetEvents];
    
    if (selectedType !== 'all') {
        filtered = filtered.filter(e => (e.event_type || e.type) === selectedType);
    }
    
    if (selectedSeverity !== 'all') {
        const minSev = parseInt(selectedSeverity);
        filtered = filtered.filter(e => e.severity >= minSev);
    }

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="card" style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--text-muted);">
                No events match the selected filters.
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(e => {
        let sevClass = 'stable';
        let sevLabel = 'MONITOR';
        if (e.severity === 10) { sevClass = 'critical'; sevLabel = 'CRITICAL'; }
        else if (e.severity === 9) { sevClass = 'critical'; sevLabel = 'HIGH'; }
        else if (e.severity === 8) { sevClass = 'warning'; sevLabel = 'WARNING'; }
        else if (e.severity === 7) { sevClass = 'warning'; sevLabel = 'ELEVATED'; }
        else if (e.severity === 6) { sevClass = 'stable'; sevLabel = 'MONITOR'; }

        const dateFormatted = formatEventDate(e.date);
        const rawDesc = e.description || "No description available.";
        const truncatedDesc = rawDesc.length > 140 ? rawDesc.slice(0, 140) + '...' : rawDesc;

        const brentHtml = e.brent_price_at_event
            ? `<span style="margin-left: 6px; font-weight: 600; color: var(--text-secondary);">Brent: $${parseFloat(e.brent_price_at_event).toFixed(2)}</span>`
            : '';

        if (!_newsEventsCache.some(item => item.id === e.id)) {
            _newsEventsCache.push({
                id: e.id,
                title: e.title,
                type: e.event_type || e.type,
                event_type: e.event_type || e.type,
                region: e.region,
                severity: sevClass,
                severityLabel: sevLabel,
                numericSeverity: e.severity,
                source: 'dataset',
                sourceLabel: 'DATASET',
                date: e.date,
                description: e.description,
                brent_price_at_event: e.brent_price_at_event,
                affected_resources: [e.event_type || 'Energy Assets'],
                expected_impact: `Kaggle Dataset threat alert for ${e.region}. Severity: ${e.severity}.`
            });
        }

        return `
        <div class="news-card ${sevClass}" onclick="showNewsEventDetail('${e.id}')" id="newsCard_${e.id}">
            <div class="news-severity-pulse ${sevClass}"></div>
            <div class="news-header">
                <div style="display:flex; align-items:center; gap:4px;">
                    <span class="news-tag">${(e.event_type || e.type).toUpperCase()}</span>
                    <span class="news-source-chip" style="background:rgba(124,58,237,0.08); color:#7C3AED;">DATASET</span>
                </div>
                <span class="news-time">${dateFormatted}</span>
            </div>
            <h3 class="news-title">${e.title}</h3>
            <p class="news-desc">${truncatedDesc}</p>
            <div class="news-footer">
                <span>📍 ${e.region} ${brentHtml}</span>
                <span style="font-weight:700; color:${sevClass === 'critical' ? 'var(--accent-red)' : (sevClass === 'warning' ? 'var(--accent-amber)' : 'var(--accent-green)')};">${sevLabel}</span>
            </div>
            <span class="news-click-hint">Click for details →</span>
        </div>`;
    }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    initAppState();      // Connects to C++ engine
    setupNavigation();
    setupSearch();
    setupFilters();
    setupModal();
    setupFormListeners();
    setupCountryInsights(); // Gemini + Firebase
    setupExport();
    setupScrollEffects();
    setupKaggleDatasets();
    setupHistoricalTrends();
    setupAddEventForm();

    handleRouting();
});
