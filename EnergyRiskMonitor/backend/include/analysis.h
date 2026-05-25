// ============================================================================
// analysis.h — Supply Analysis and Region Comparison Declarations
// Member 5: Feature Builder B — Supply Analysis and Region Comparison
// ============================================================================
// This header declares two analytical functions: one to analyze supply
// disruption risk across all resources, and one to compare regions by
// their average risk scores.
// ============================================================================

#ifndef ANALYSIS_H
#define ANALYSIS_H

#include <vector>
#include "data_loader.h"
#include "risk_engine.h"

using namespace std;

// Analyzes supply disruption risk for all resources
// Calculates each resource's risk score, sorts by supply_score (highest first),
// and displays results with associated active events. Also reports how many
// resources are at HIGH supply disruption risk.
void analyzeSupplyDisruption(vector<EnergyResource> resources, vector<GeopoliticalEvent> events);

// Groups resources by region and calculates the average risk score per region
// Sorts regions from highest to lowest average score and displays a formatted
// table with region name, resource count, average score, and risk level
void compareRegionRisk(vector<EnergyResource> resources, vector<GeopoliticalEvent> events);

#endif // ANALYSIS_H
