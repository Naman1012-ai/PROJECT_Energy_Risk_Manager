// ============================================================================
// data_loader.h — Data Structures and File I/O Declarations
// Member 2: Data Manager — File Reading and Writing
// ============================================================================
// This header defines the two core data structures used throughout the
// entire project: EnergyResource and GeopoliticalEvent. It also declares
// functions to load data from CSV files and save risk scores to output files.
// ============================================================================

#ifndef DATA_LOADER_H
#define DATA_LOADER_H

#include <string>
#include <vector>

using namespace std;

// Struct representing a single energy resource loaded from energy_data.csv
// Each field corresponds to one column in the CSV file
struct EnergyResource {
    string id;                  // Unique identifier (e.g., OIL_SAU)
    string name;                // Full readable name (e.g., Saudi Crude Oil)
    string type;                // Category: Oil, Gas, Coal, Electricity, Renewable
    string region;              // Country or region name (e.g., Saudi Arabia)
    double production;          // Daily production volume
    double consumption;         // Daily consumption volume
    double reserve_years;       // Estimated years of reserves remaining
    double export_dependency;   // 0.0 to 1.0 — how much others depend on this source
    double price;               // Current price in USD
};

// Struct representing a geopolitical event loaded from events.csv
// Events affect the risk score of energy resources in their region
struct GeopoliticalEvent {
    string id;                  // Unique event identifier (e.g., E001)
    string title;               // Full event name (e.g., Russia-Ukraine War)
    string type;                // Category: War, Sanctions, Instability, TradeRestriction, ProductionCut
    string region;              // Affected country or region
    double intensity;           // Severity: 0.0 (weak) to 1.0 (very severe)
    double supply_impact;       // Supply reduction: 0.0 to 1.0
    int is_active;              // 1 = currently happening, 0 = ended
};

// Forward declaration of RiskScore (defined in risk_engine.h)
struct RiskScore;

// Reads energy_data.csv and returns a vector of all energy resources
// If the file cannot be opened, prints an error and returns an empty vector
vector<EnergyResource> loadEnergyResources(string filename);

// Reads events.csv and returns a vector of all geopolitical events
// If the file cannot be opened, prints an error and returns an empty vector
vector<GeopoliticalEvent> loadEvents(string filename);

// Saves calculated risk scores to an output CSV file
// Called when the user selects option 6 (Save and Exit) from the main menu
void saveRiskScores(vector<RiskScore> scores, string filename);

#endif // DATA_LOADER_H
