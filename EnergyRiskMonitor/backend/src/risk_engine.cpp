// ============================================================================
// risk_engine.cpp — Risk Score Calculation Engine
// Member 3: Risk Engineer — Score Calculator
// ============================================================================
// This file implements the five sub-score functions and the main
// calculateRisk() function. Each sub-score measures a different dimension
// of risk (supply, conflict, trade, demand, route) on a 0-100 scale.
// The final score is a weighted combination of all five sub-scores.
// ============================================================================

#include "risk_engine.h"
#include <algorithm>

using namespace std;

// ----------------------------------------------------------------------------
// calcSupplyScore()
// Measures how much consumption exceeds production capacity.
// If consumption/production ratio exceeds 0.8, the score rises steeply.
// A production of 0 means total supply failure = max score of 100.
// Weight in final score: 30%
// ----------------------------------------------------------------------------
static double calcSupplyScore(EnergyResource r) {
    if (r.production <= 0) {
        return 100.0;
    }

    double ratio = r.consumption / r.production;
    double score = (ratio < 1.0) ? (ratio * 40.0) : (40.0 + ((ratio - 1.0) * 30.0));

    score = max(0.0, score);
    score = min(100.0, score);

    return score;
}

// ----------------------------------------------------------------------------
// calcConflictScore()
// Measures risk from active wars and political instability in the resource's
// region. Derived from active event intensity and the export_dependency proxy.
// If no active conflict events in region, or export_dependency <= 0, returns -1.0.
// Weight in final score: 30%
// ----------------------------------------------------------------------------
static double calcConflictScore(EnergyResource r, vector<GeopoliticalEvent> events) {
    if (r.export_dependency <= 0.0) {
        return 10.0;
    }

    double totalIntensity = 0.0;
    int activeCount = 0;

    for (int i = 0; i < (int)events.size(); i++) {
        if (events[i].is_active == 1 && events[i].region == r.region) {
            if (events[i].type == "War" || events[i].type == "Instability") {
                totalIntensity += events[i].intensity;
                activeCount++;
            }
        }
    }

    if (activeCount == 0) {
        return 15.0 * r.export_dependency;
    }

    double score = 15.0 + (totalIntensity / activeCount) * 60.0 * r.export_dependency;
    score = max(0.0, score);
    score = min(100.0, score);
    return score;
}

// ----------------------------------------------------------------------------
// calcTradeScore()
// Measures risk from trade sanctions and restrictions affecting the resource's
// region. Sums up (intensity * 100) for each matching active event of type
// "Sanctions" or "TradeRestriction". Capped at 100.
// Weight in final score: 20%
// ----------------------------------------------------------------------------
static double calcTradeScore(EnergyResource r, vector<GeopoliticalEvent> events) {
    double score = r.export_dependency * 15.0;
    double total = 0.0;

    for (int i = 0; i < (int)events.size(); i++) {
        if (events[i].is_active == 1 && events[i].region == r.region) {
            if (events[i].type == "Sanctions" || events[i].type == "TradeRestriction") {
                total += events[i].intensity * 100.0;
            }
        }
    }

    return min(98.0, score + total);
}

// ----------------------------------------------------------------------------
// calcDemandScore()
// Measures risk from high export dependency and low remaining reserves.
// Base score is export_dependency * 50. If reserves are below 30 years,
// an additional penalty is added: (30 - reserve_years) / 30 * 50.
// Weight in final score: 15%
// ----------------------------------------------------------------------------
static double calcDemandScore(EnergyResource r) {
    double score = 15.0 + r.export_dependency * 35.0;

    if (r.reserve_years < 60) {
        score += ((60.0 - r.reserve_years) / 60.0) * 45.0;
    }

    return min(100.0, score);
}

// ----------------------------------------------------------------------------
// calcRouteScore()
// Measures risk based on the geographic vulnerability of supply routes.
// Always returns -1.0 because no database column supports route vulnerability.
// Weight in final score: 10%
// ----------------------------------------------------------------------------
static double calcRouteScore(EnergyResource r) {
    string reg = r.region;
    double routeRisk = 20.0; // Default baseline risk

    if (reg == "Middle East" || reg == "Saudi Arabia") routeRisk = 65.0;
    else if (reg == "Russia") routeRisk = 48.0;
    else if (reg == "China") routeRisk = 40.0;
    else if (reg == "Venezuela") routeRisk = 35.0;
    else if (reg == "EU") routeRisk = 22.0;
    else if (reg == "USA") routeRisk = 15.0;

    double score = routeRisk * (0.4 + 0.6 * r.export_dependency);
    score = max(0.0, score);
    score = min(100.0, score);
    return score;
}

// ----------------------------------------------------------------------------
// calculateRisk()
// Main risk calculation function — combines all five sub-scores using
// dynamic weighted formula:
//   w1: 0.25 (supply), w2: 0.30 (conflict), w3: 0.20 (trade), w4: 0.15 (demand), w5: 0.10 (route)
// Excludes null sentinels (-1.0) dynamically.
// Returns a fully populated RiskScore struct.
// ----------------------------------------------------------------------------
RiskScore calculateRisk(EnergyResource r, vector<GeopoliticalEvent> events) {
    RiskScore score;

    // Fill in the resource identification fields
    score.resource_id = r.id;
    score.resource_name = r.name;
    score.region = r.region;

    // Calculate each of the five sub-scores
    score.supply_score   = calcSupplyScore(r);
    score.conflict_score = calcConflictScore(r, events);
    score.trade_score    = calcTradeScore(r, events);
    score.demand_score   = calcDemandScore(r);
    score.route_score    = calcRouteScore(r);

    // Dynamic weighted average calculation excluding nulls (-1.0)
    double weightedSum = 0.0;
    double weightSum = 0.0;
    int validComponents = 0;

    // Component 1: Supply (w: 0.25)
    if (score.supply_score >= 0.0) {
        weightedSum += score.supply_score * 0.25;
        weightSum += 0.25;
        validComponents++;
    }

    // Component 2: Conflict (w: 0.30)
    if (score.conflict_score >= 0.0) {
        weightedSum += score.conflict_score * 0.30;
        weightSum += 0.30;
        validComponents++;
    }

    // Component 3: Trade (w: 0.20)
    if (score.trade_score >= 0.0) {
        weightedSum += score.trade_score * 0.20;
        weightSum += 0.20;
        validComponents++;
    }

    // Component 4: Demand (w: 0.15)
    if (score.demand_score >= 0.0) {
        weightedSum += score.demand_score * 0.15;
        weightSum += 0.15;
        validComponents++;
    }

    // Component 5: Route (w: 0.10)
    if (score.route_score >= 0.0) {
        weightedSum += score.route_score * 0.10;
        weightSum += 0.10;
        validComponents++;
    }

    // If fewer than 3 valid components exist, composite score is unavailable
    if (validComponents < 3) {
        score.raw_score = -1.0;
        score.level = "INSUFFICIENT";
    } else {
        score.raw_score = weightedSum / weightSum;
        score.raw_score = max(0.0, score.raw_score);
        score.raw_score = min(100.0, score.raw_score);

        if (score.raw_score > 66.0) {
            score.level = "HIGH";
        } else if (score.raw_score > 33.0) {
            score.level = "MEDIUM";
        } else {
            score.level = "LOW";
        }
    }

    return score;
}
