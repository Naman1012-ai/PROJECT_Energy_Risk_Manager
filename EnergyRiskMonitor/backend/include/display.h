// ============================================================================
// display.h — Output Formatting and Summary Declarations
// Member 6: Display Engineer — Output Formatting and Summary
// ============================================================================
// This header declares three display functions: printing a sorted risk table,
// displaying a global risk summary with statistics and bar charts, and
// formatting risk level labels for consistent output across the program.
// ============================================================================

#ifndef DISPLAY_H
#define DISPLAY_H

#include <string>
#include <vector>
#include "data_loader.h"
#include "risk_engine.h"

using namespace std;

// Calculates risk scores for all resources, sorts them by raw_score (highest
// first), and prints a formatted table with columns: Name, Region, Type,
// Score, and Risk Level. Uses setw() for alignment.
void printRiskTable(vector<EnergyResource> resources, vector<GeopoliticalEvent> events);

// Displays a comprehensive global risk summary including:
// total resources, global average risk score, total active events,
// count of HIGH/MEDIUM/LOW resources, a bar chart using = signs,
// and the top 3 highest-risk resources with their scores
void displayGlobalSummary(vector<EnergyResource> resources, vector<GeopoliticalEvent> events);

// Formats and prints a risk level label with distinctive visual styling:
// HIGH   -> [!! HIGH !!]
// MEDIUM -> [~ MEDIUM ~]
// LOW    -> [  LOW  ]
void printRiskLabel(string level);

#endif // DISPLAY_H
