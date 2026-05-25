// ============================================================================
// features.cpp — Resource Lookup and Event Viewing
// Member 4: Feature Builder A — Resource Lookup and Events
// ============================================================================
// This file implements three user-facing features: searching for a resource
// by name or ID, viewing all active geopolitical events, and filtering
// events by a specific region.
// ============================================================================

#include "features.h"
#include <iostream>
#include <iomanip>

using namespace std;

// ----------------------------------------------------------------------------
// searchResource()
// Prompts the user to enter a resource name or ID. Searches through the
// provided resources vector for a match (case-sensitive, partial match on
// name or exact match on ID). If found, calculates and displays the full
// risk assessment. If not found, prints an error message.
// Called from main menu option 2.
// ----------------------------------------------------------------------------
void searchResource(vector<EnergyResource> resources, vector<GeopoliticalEvent> events) {
    string query;
    cout << endl;
    cout << "========================================" << endl;
    cout << "       SEARCH ENERGY RESOURCE" << endl;
    cout << "========================================" << endl;
    cout << "Enter resource name or ID: ";

    // Use cin.ignore to clear any leftover newline from previous input
    cin.ignore();
    getline(cin, query);

    // Search through all resources for a match
    bool found = false;
    for (int i = 0; i < (int)resources.size(); i++) {
        // Check if query matches the ID or is contained in the name
        if (resources[i].id == query || resources[i].name == query ||
            resources[i].name.find(query) != string::npos) {

            found = true;

            // Calculate the risk score for this resource
            RiskScore risk = calculateRisk(resources[i], events);

            // Display full resource details
            cout << endl;
            cout << "----------------------------------------" << endl;
            cout << "  RESOURCE DETAILS" << endl;
            cout << "----------------------------------------" << endl;
            cout << "  ID:                " << resources[i].id << endl;
            cout << "  Name:              " << resources[i].name << endl;
            cout << "  Type:              " << resources[i].type << endl;
            cout << "  Region:            " << resources[i].region << endl;
            cout << "  Production:        " << resources[i].production << endl;
            cout << "  Consumption:       " << resources[i].consumption << endl;
            cout << "  Reserve Years:     " << resources[i].reserve_years << endl;
            cout << "  Export Dependency:  " << resources[i].export_dependency << endl;
            cout << "  Price (USD):       $" << fixed << setprecision(2) << resources[i].price << endl;

            // Display risk score breakdown
            cout << endl;
            cout << "----------------------------------------" << endl;
            cout << "  RISK ASSESSMENT" << endl;
            cout << "----------------------------------------" << endl;
            cout << "  Supply Score:      " << fixed << setprecision(2) << risk.supply_score << " / 100" << endl;
            cout << "  Conflict Score:    " << fixed << setprecision(2) << risk.conflict_score << " / 100" << endl;
            cout << "  Trade Score:       " << fixed << setprecision(2) << risk.trade_score << " / 100" << endl;
            cout << "  Demand Score:      " << fixed << setprecision(2) << risk.demand_score << " / 100" << endl;
            cout << "  Route Score:       " << fixed << setprecision(2) << risk.route_score << " / 100" << endl;
            cout << "  -----------------------" << endl;
            cout << "  FINAL RISK SCORE:  " << fixed << setprecision(2) << risk.raw_score << " / 100" << endl;
            cout << "  RISK LEVEL:        ";

            // Display risk level with visual emphasis
            if (risk.level == "HIGH") {
                cout << "[!! HIGH !!]" << endl;
            } else if (risk.level == "MEDIUM") {
                cout << "[~ MEDIUM ~]" << endl;
            } else {
                cout << "[  LOW  ]" << endl;
            }
            cout << "----------------------------------------" << endl;

            break;  // Stop after finding the first match
        }
    }

    // If no matching resource was found
    if (!found) {
        cout << endl;
        cout << "  Resource not found. Please check the name and try again." << endl;
        cout << endl;
        cout << "  Available resources:" << endl;
        for (int i = 0; i < (int)resources.size(); i++) {
            cout << "    - " << resources[i].id << " : " << resources[i].name << endl;
        }
    }
}

// ----------------------------------------------------------------------------
// showActiveEvents()
// Loops through all events and displays those with is_active == 1.
// Shows each event's title, type, region, intensity (as percentage),
// and supply impact (as percentage). Prints a separator between events
// and a total count at the end. Called from main menu option 3.
// ----------------------------------------------------------------------------
void showActiveEvents(vector<GeopoliticalEvent> events) {
    cout << endl;
    cout << "========================================" << endl;
    cout << "    ACTIVE GEOPOLITICAL EVENTS" << endl;
    cout << "========================================" << endl;

    int activeCount = 0;

    // Loop through all events and display active ones
    for (int i = 0; i < (int)events.size(); i++) {
        if (events[i].is_active == 1) {
            activeCount++;

            cout << endl;
            cout << "  Event #" << activeCount << endl;
            cout << "  Title:         " << events[i].title << endl;
            cout << "  Type:          " << events[i].type << endl;
            cout << "  Region:        " << events[i].region << endl;
            cout << "  Intensity:     " << fixed << setprecision(0)
                 << (events[i].intensity * 100) << "%" << endl;
            cout << "  Supply Impact: " << fixed << setprecision(0)
                 << (events[i].supply_impact * 100) << "%" << endl;
            cout << "  --------------------------------" << endl;
        }
    }

    // Print total count at the end
    cout << endl;
    cout << "  Total active events: " << activeCount << endl;
    cout << "========================================" << endl;
}

// ----------------------------------------------------------------------------
// showEventsForRegion()
// Filters and displays active events for a specific region name.
// If no active events are found for the given region, prints a message.
// Called from main menu option 3 after user specifies a region.
// ----------------------------------------------------------------------------
void showEventsForRegion(vector<GeopoliticalEvent> events, string region) {
    cout << endl;
    cout << "========================================" << endl;
    cout << "  EVENTS FOR REGION: " << region << endl;
    cout << "========================================" << endl;

    int matchCount = 0;

    // Loop through events and display those matching the region
    for (int i = 0; i < (int)events.size(); i++) {
        if (events[i].region == region && events[i].is_active == 1) {
            matchCount++;

            cout << endl;
            cout << "  Event #" << matchCount << endl;
            cout << "  Title:         " << events[i].title << endl;
            cout << "  Type:          " << events[i].type << endl;
            cout << "  Intensity:     " << fixed << setprecision(0)
                 << (events[i].intensity * 100) << "%" << endl;
            cout << "  Supply Impact: " << fixed << setprecision(0)
                 << (events[i].supply_impact * 100) << "%" << endl;
            cout << "  --------------------------------" << endl;
        }
    }

    // If no active events were found for this region
    if (matchCount == 0) {
        cout << endl;
        cout << "  No active events found for this region." << endl;
    }

    cout << endl;
    cout << "  Total matching events: " << matchCount << endl;
    cout << "========================================" << endl;
}
