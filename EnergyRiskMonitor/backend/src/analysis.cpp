// ============================================================================
// analysis.cpp — Supply Analysis and Region Comparison
// Member 5: Feature Builder B — Supply Analysis and Region Comparison
// ============================================================================
// This file implements two analytical functions: analyzing supply disruption
// risk across all resources, and comparing regions by their average risk
// scores. Both functions use calculateRisk() to compute scores and present
// results in formatted tables.
// ============================================================================

#include "analysis.h"
#include <iostream>
#include <iomanip>
#include <algorithm>
#include <map>

using namespace std;

// ----------------------------------------------------------------------------
// analyzeSupplyDisruption()
// Calculates risk scores for all resources, sorts them by supply_score
// (highest first), and displays a ranked list showing which resources face
// the greatest supply disruption risk. Also identifies the active events
// causing disruption in each region. Prints a count of HIGH-risk resources.
// Called from main menu option 4 (part of region comparison flow).
// ----------------------------------------------------------------------------
void analyzeSupplyDisruption(vector<EnergyResource> resources, vector<GeopoliticalEvent> events) {
    cout << endl;
    cout << "================================================================" << endl;
    cout << "            SUPPLY DISRUPTION ANALYSIS" << endl;
    cout << "================================================================" << endl;

    // Calculate risk scores for all resources
    vector<RiskScore> scores;
    for (int i = 0; i < (int)resources.size(); i++) {
        scores.push_back(calculateRisk(resources[i], events));
    }

    // Sort by supply_score in descending order (highest risk first)
    for (int i = 0; i < (int)scores.size() - 1; i++) {
        for (int j = i + 1; j < (int)scores.size(); j++) {
            if (scores[j].supply_score > scores[i].supply_score) {
                // Swap scores
                RiskScore temp = scores[i];
                scores[i] = scores[j];
                scores[j] = temp;
            }
        }
    }

    // Print the table header
    cout << endl;
    cout << left << setw(25) << "Resource"
         << setw(18) << "Region"
         << setw(15) << "Supply Score"
         << "Causing Event(s)" << endl;
    cout << string(80, '-') << endl;

    // Count resources at HIGH supply risk (supply_score > 66)
    int highRiskCount = 0;

    // Print each resource's supply disruption details
    for (int i = 0; i < (int)scores.size(); i++) {
        cout << left << setw(25) << scores[i].resource_name
             << setw(18) << scores[i].region
             << fixed << setprecision(2) << setw(15) << scores[i].supply_score;

        // Find active events that affect this resource's region
        bool hasEvent = false;
        for (int j = 0; j < (int)events.size(); j++) {
            if (events[j].is_active == 1 && events[j].region == scores[i].region) {
                if (hasEvent) cout << ", ";
                cout << events[j].title;
                hasEvent = true;
            }
        }
        if (!hasEvent) {
            cout << "None";
        }
        cout << endl;

        // Count HIGH supply risk resources
        if (scores[i].supply_score > 66.0) {
            highRiskCount++;
        }
    }

    // Print summary at the end
    cout << string(80, '-') << endl;
    cout << endl;
    cout << "  " << highRiskCount << " out of " << scores.size()
         << " resources are currently at HIGH supply disruption risk." << endl;
    cout << "================================================================" << endl;
}

// ----------------------------------------------------------------------------
// compareRegionRisk()
// Groups all resources by their region, calculates the average raw_score
// for each region, sorts regions from highest to lowest average score,
// and displays a formatted table with region name, resource count,
// average score, and risk level. Uses setw() for column alignment.
// Called from main menu option 4.
// ----------------------------------------------------------------------------
void compareRegionRisk(vector<EnergyResource> resources, vector<GeopoliticalEvent> events) {
    cout << endl;
    cout << "================================================================" << endl;
    cout << "             REGION RISK COMPARISON" << endl;
    cout << "================================================================" << endl;

    // Use maps to group data by region
    // regionScores: maps region name -> vector of raw_scores
    map<string, vector<double> > regionScores;

    // Calculate risk for each resource and group by region
    for (int i = 0; i < (int)resources.size(); i++) {
        RiskScore risk = calculateRisk(resources[i], events);
        regionScores[resources[i].region].push_back(risk.raw_score);
    }

    // Build a vector of (region_name, resource_count, average_score) for sorting
    // Using a struct-like approach with parallel vectors for simplicity
    vector<string> regionNames;
    vector<int> regionCounts;
    vector<double> regionAverages;

    // Iterate through the map and calculate averages
    for (map<string, vector<double> >::iterator it = regionScores.begin();
         it != regionScores.end(); ++it) {

        string regionName = it->first;
        vector<double> scores = it->second;

        // Calculate the average score for this region
        double sum = 0.0;
        for (int i = 0; i < (int)scores.size(); i++) {
            sum += scores[i];
        }
        double average = sum / scores.size();

        regionNames.push_back(regionName);
        regionCounts.push_back(scores.size());
        regionAverages.push_back(average);
    }

    // Sort regions by average score (descending) using bubble sort
    for (int i = 0; i < (int)regionNames.size() - 1; i++) {
        for (int j = i + 1; j < (int)regionNames.size(); j++) {
            if (regionAverages[j] > regionAverages[i]) {
                // Swap all parallel arrays
                swap(regionNames[i], regionNames[j]);
                swap(regionCounts[i], regionCounts[j]);
                swap(regionAverages[i], regionAverages[j]);
            }
        }
    }

    // Print the table header
    cout << endl;
    cout << left << setw(20) << "Region"
         << setw(12) << "Resources"
         << setw(15) << "Avg Score"
         << "Risk Level" << endl;
    cout << string(60, '-') << endl;

    // Print each region's data
    for (int i = 0; i < (int)regionNames.size(); i++) {
        // Determine the risk level for this region's average
        string level;
        if (regionAverages[i] > 66.0) {
            level = "[!! HIGH !!]";
        } else if (regionAverages[i] > 33.0) {
            level = "[~ MEDIUM ~]";
        } else {
            level = "[  LOW  ]";
        }

        cout << left << setw(20) << regionNames[i]
             << setw(12) << regionCounts[i]
             << fixed << setprecision(2) << setw(15) << regionAverages[i]
             << level << endl;
    }

    cout << string(60, '-') << endl;
    cout << endl;
    cout << "  Total regions analyzed: " << regionNames.size() << endl;
    cout << "================================================================" << endl;
}
