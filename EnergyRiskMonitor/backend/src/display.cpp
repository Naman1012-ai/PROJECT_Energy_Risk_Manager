// ============================================================================
// display.cpp — Output Formatting and Summary Display
// Member 6: Display Engineer — Output Formatting and Summary
// ============================================================================
// This file implements three display functions: a sorted risk score table,
// a comprehensive global risk summary with statistics and bar charts,
// and a risk level label formatter for consistent visual output.
// ============================================================================

#include "display.h"
#include <iostream>
#include <iomanip>
#include <algorithm>

using namespace std;

// ----------------------------------------------------------------------------
// printRiskLabel()
// Prints a risk level label with distinctive visual formatting:
//   HIGH   -> [!! HIGH !!]
//   MEDIUM -> [~ MEDIUM ~]
//   LOW    -> [  LOW  ]
// This function is called whenever a risk level needs to be displayed
// to ensure consistent formatting across the entire program.
// ----------------------------------------------------------------------------
void printRiskLabel(string level) {
    if (level == "HIGH") {
        cout << "[!! HIGH !!]";
    } else if (level == "MEDIUM") {
        cout << "[~ MEDIUM ~]";
    } else {
        cout << "[  LOW  ]";
    }
}

// ----------------------------------------------------------------------------
// printRiskTable()
// Calculates risk scores for all resources, sorts them by raw_score
// (highest first), and prints a formatted table with columns:
//   Resource Name (20 wide) | Region (15 wide) | Type (12 wide) |
//   Score (8 wide) | Risk Level
// Prints a header row and a dashed separator before the data rows.
// Called from main menu option 1.
// ----------------------------------------------------------------------------
void printRiskTable(vector<EnergyResource> resources, vector<GeopoliticalEvent> events) {
    cout << endl;
    cout << "=================================================================" << endl;
    cout << "          ALL ENERGY RESOURCES — RISK SCORES" << endl;
    cout << "=================================================================" << endl;

    // Calculate risk scores for all resources
    vector<RiskScore> scores;
    for (int i = 0; i < (int)resources.size(); i++) {
        scores.push_back(calculateRisk(resources[i], events));
    }

    // Sort by raw_score in descending order (highest risk first)
    for (int i = 0; i < (int)scores.size() - 1; i++) {
        for (int j = i + 1; j < (int)scores.size(); j++) {
            if (scores[j].raw_score > scores[i].raw_score) {
                RiskScore temp = scores[i];
                scores[i] = scores[j];
                scores[j] = temp;
            }
        }
    }

    // Print the table header with column alignment
    cout << endl;
    cout << left
         << setw(4)  << "#"
         << setw(25) << "Resource Name"
         << setw(18) << "Region"
         << setw(14) << "Type"
         << setw(10) << "Score"
         << "Risk Level" << endl;

    // Print separator line
    cout << string(85, '-') << endl;

    // Print each resource's data in a formatted row
    for (int i = 0; i < (int)scores.size(); i++) {
        cout << left
             << setw(4)  << (i + 1)
             << setw(25) << scores[i].resource_name
             << setw(18) << scores[i].region
             << setw(14);

        // Find the type for this resource
        string type = "";
        for (int j = 0; j < (int)resources.size(); j++) {
            if (resources[j].id == scores[i].resource_id) {
                type = resources[j].type;
                break;
            }
        }
        cout << type
             << fixed << setprecision(2) << setw(10) << scores[i].raw_score;

        // Print the risk level with visual formatting
        printRiskLabel(scores[i].level);
        cout << endl;
    }

    cout << string(85, '-') << endl;
    cout << "  Total resources: " << scores.size() << endl;
    cout << "=================================================================" << endl;
}

// ----------------------------------------------------------------------------
// displayGlobalSummary()
// Displays a comprehensive global risk summary including:
//   1) Total number of resources in the system
//   2) Global risk index (average of all raw_score values)
//   3) Total number of active geopolitical events
//   4) Count of HIGH, MEDIUM, and LOW risk resources
//   5) A simple bar chart using = signs for each risk category
//   6) The top 3 highest-risk resource names with their scores
// Called from main menu option 5.
// ----------------------------------------------------------------------------
void displayGlobalSummary(vector<EnergyResource> resources, vector<GeopoliticalEvent> events) {
    cout << endl;
    cout << "=================================================================" << endl;
    cout << "              GLOBAL ENERGY RISK SUMMARY" << endl;
    cout << "=================================================================" << endl;

    // Calculate risk scores for all resources
    vector<RiskScore> scores;
    for (int i = 0; i < (int)resources.size(); i++) {
        scores.push_back(calculateRisk(resources[i], events));
    }

    // 1) Total number of resources
    cout << endl;
    cout << "  Total Resources:       " << resources.size() << endl;

    // 2) Calculate global risk index (average of all raw scores)
    double totalScore = 0.0;
    for (int i = 0; i < (int)scores.size(); i++) {
        totalScore += scores[i].raw_score;
    }
    double globalAvg = (scores.size() > 0) ? (totalScore / scores.size()) : 0.0;

    cout << "  Global Risk Index:     " << fixed << setprecision(2) << globalAvg << " / 100  ";
    if (globalAvg > 66.0) {
        printRiskLabel("HIGH");
    } else if (globalAvg > 33.0) {
        printRiskLabel("MEDIUM");
    } else {
        printRiskLabel("LOW");
    }
    cout << endl;

    // 3) Total number of active events
    int activeEvents = 0;
    for (int i = 0; i < (int)events.size(); i++) {
        if (events[i].is_active == 1) {
            activeEvents++;
        }
    }
    cout << "  Active Events:         " << activeEvents << endl;

    // 4) Count of HIGH, MEDIUM, and LOW risk resources
    int highCount = 0, medCount = 0, lowCount = 0;
    for (int i = 0; i < (int)scores.size(); i++) {
        if (scores[i].level == "HIGH")        highCount++;
        else if (scores[i].level == "MEDIUM") medCount++;
        else                                  lowCount++;
    }

    // 5) Bar chart using = signs for each risk category
    cout << endl;
    cout << "  ----- Risk Distribution -----" << endl;
    cout << endl;

    // HIGH bar
    cout << "  HIGH   [";
    for (int i = 0; i < highCount * 3; i++) cout << "=";
    cout << "] " << highCount << " resources" << endl;

    // MEDIUM bar
    cout << "  MEDIUM [";
    for (int i = 0; i < medCount * 3; i++) cout << "=";
    cout << "] " << medCount << " resources" << endl;

    // LOW bar
    cout << "  LOW    [";
    for (int i = 0; i < lowCount * 3; i++) cout << "=";
    cout << "] " << lowCount << " resources" << endl;

    // 6) Top 3 highest-risk resources
    // Sort scores by raw_score descending
    for (int i = 0; i < (int)scores.size() - 1; i++) {
        for (int j = i + 1; j < (int)scores.size(); j++) {
            if (scores[j].raw_score > scores[i].raw_score) {
                RiskScore temp = scores[i];
                scores[i] = scores[j];
                scores[j] = temp;
            }
        }
    }

    cout << endl;
    cout << "  ----- Top 3 Highest-Risk Resources -----" << endl;
    cout << endl;

    int topCount = min(3, (int)scores.size());
    for (int i = 0; i < topCount; i++) {
        cout << "  " << (i + 1) << ". " << left << setw(25) << scores[i].resource_name
             << "Score: " << fixed << setprecision(2) << scores[i].raw_score
             << "  ";
        printRiskLabel(scores[i].level);
        cout << endl;
    }

    cout << endl;
    cout << "=================================================================" << endl;
}
