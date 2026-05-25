// ============================================================================
// risk_engine.h — Risk Score Calculation Declarations
// Member 3: Risk Engineer — Score Calculator
// ============================================================================
// This header defines the RiskScore struct that holds all calculated risk
// information for a single energy resource. It also declares the main
// calculateRisk() function that combines five sub-scores into one final score.
// ============================================================================

#ifndef RISK_ENGINE_H
#define RISK_ENGINE_H

#include <string>
#include <vector>
#include "data_loader.h"

using namespace std;

// Struct holding the complete risk assessment for one energy resource
// Contains the final score, the five individual sub-scores, and the risk level
struct RiskScore {
    string resource_id;         // ID of the energy resource (e.g., OIL_RUS)
    string resource_name;       // Full name of the resource
    string region;              // Region of the resource
    string level;               // Risk classification: HIGH, MEDIUM, or LOW
    double raw_score;           // Final weighted risk score (0 to 100)
    double supply_score;        // Supply disruption sub-score (weight: 30%)
    double conflict_score;      // Conflict intensity sub-score (weight: 25%)
    double trade_score;         // Trade restrictions sub-score (weight: 20%)
    double demand_score;        // Demand pressure sub-score (weight: 15%)
    double route_score;         // Route vulnerability sub-score (weight: 10%)
};

// Calculates the complete risk assessment for one energy resource
// Takes the resource and a list of all geopolitical events as input
// Returns a fully populated RiskScore struct with all sub-scores and final level
RiskScore calculateRisk(EnergyResource r, vector<GeopoliticalEvent> events);

#endif // RISK_ENGINE_H
