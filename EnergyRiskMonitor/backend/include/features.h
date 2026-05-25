// ============================================================================
// features.h — Resource Lookup and Event Viewing Declarations
// Member 4: Feature Builder A — Resource Lookup and Events
// ============================================================================
// This header declares three feature functions: searching for a specific
// resource by name/ID, viewing all active geopolitical events, and filtering
// events by region.
// ============================================================================

#ifndef FEATURES_H
#define FEATURES_H

#include <string>
#include <vector>
#include "data_loader.h"
#include "risk_engine.h"

using namespace std;

// Asks the user to type a resource name or ID, searches the vector,
// and if found, calculates and displays its full risk assessment.
// If the resource is not found, prints an error message.
void searchResource(vector<EnergyResource> resources, vector<GeopoliticalEvent> events);

// Displays all currently active geopolitical events (is_active == 1)
// Shows title, type, region, intensity percentage, and supply impact percentage
// Prints a separator between events and a total count at the end
void showActiveEvents(vector<GeopoliticalEvent> events);

// Displays all active events for a specific region
// If no active events are found for the given region, prints a message
void showEventsForRegion(vector<GeopoliticalEvent> events, string region);

#endif // FEATURES_H
