// ============================================================================
// data_loader.cpp — CSV File Reading and Risk Score Saving
// Member 2: Data Manager — File Reading and Writing
// ============================================================================
// This file implements functions to read energy resource data and geopolitical
// event data from CSV files, and to save calculated risk scores to an output
// CSV file. All file I/O uses standard C++ ifstream/ofstream.
// ============================================================================

#include "data_loader.h"
#include "risk_engine.h"
#include <fstream>
#include <iostream>
#include <sstream>

using namespace std;

// ----------------------------------------------------------------------------
// loadEnergyResources()
// Opens the given CSV file, skips the header row, and reads each remaining
// line into an EnergyResource struct. Fields are separated by commas.
// Returns a vector of all successfully parsed resources.
// If the file cannot be opened, prints an error and returns an empty vector.
// ----------------------------------------------------------------------------
vector<EnergyResource> loadEnergyResources(string filename) {
  vector<EnergyResource> resources;
  ifstream file(filename);

  // Check if the file was opened successfully
  if (!file.is_open()) {
    cout << "ERROR: Could not open file: " << filename << endl;
    cout << "Please make sure the file exists in the data/ folder." << endl;
    return resources;
  }

  string line;

  // Skip the first line (header row with column names)
  getline(file, line);

  // Read each remaining line and parse into an EnergyResource struct
  while (getline(file, line)) {
    // Skip empty lines
    if (line.empty())
      continue;

    stringstream ss(line);
    string token;
    EnergyResource r;

    // Parse each comma-separated field in order
    getline(ss, r.id, ',');
    getline(ss, r.name, ',');
    getline(ss, r.type, ',');
    getline(ss, r.region, ',');

    // Parse numeric fields — convert strings to doubles
    getline(ss, token, ',');
    r.production = stod(token);

    getline(ss, token, ',');
    r.consumption = stod(token);

    getline(ss, token, ',');
    r.reserve_years = stod(token);

    getline(ss, token, ',');
    r.export_dependency = stod(token);

    getline(ss, token, ',');
    r.price = stod(token);

    // Add the parsed resource to the vector
    resources.push_back(r);
  }

  file.close();
  cout << "Successfully loaded " << resources.size()
       << " energy resources from " << filename << endl;
  return resources;
}

// ----------------------------------------------------------------------------
// loadEvents()
// Opens the given CSV file, skips the header row, and reads each remaining
// line into a GeopoliticalEvent struct. Fields are separated by commas.
// Returns a vector of all successfully parsed events.
// If the file cannot be opened, prints an error and returns an empty vector.
// ----------------------------------------------------------------------------
vector<GeopoliticalEvent> loadEvents(string filename) {
  vector<GeopoliticalEvent> events;
  ifstream file(filename);

  // Check if the file was opened successfully
  if (!file.is_open()) {
    cout << "ERROR: Could not open file: " << filename << endl;
    cout << "Please make sure the file exists in the data/ folder." << endl;
    return events;
  }

  string line;

  // Skip the first line (header row with column names)
  getline(file, line);

  // Read each remaining line and parse into a GeopoliticalEvent struct
  while (getline(file, line)) {
    // Skip empty lines
    if (line.empty())
      continue;

    stringstream ss(line);
    string token;
    GeopoliticalEvent e;

    // Parse each comma-separated field in order
    getline(ss, e.id, ',');
    getline(ss, e.title, ',');
    getline(ss, e.type, ',');
    getline(ss, e.region, ',');

    // Parse numeric fields
    getline(ss, token, ',');
    e.intensity = stod(token);

    getline(ss, token, ',');
    e.supply_impact = stod(token);

    getline(ss, token, ',');
    e.is_active = stoi(token);

    // Add the parsed event to the vector
    events.push_back(e);
  }

  file.close();
  cout << "Successfully loaded " << events.size()
       << " geopolitical events from " << filename << endl;
  return events;
}

// ----------------------------------------------------------------------------
// saveRiskScores()
// Writes all calculated risk scores to a CSV file. The file includes a header
// row followed by one line per RiskScore struct. This function is called when
// the user selects option 6 (Save and Exit) from the main menu.
// ----------------------------------------------------------------------------
void saveRiskScores(vector<RiskScore> scores, string filename) {
  ofstream file(filename);

  // Check if the file was opened successfully for writing
  if (!file.is_open()) {
    cout << "ERROR: Could not open file for writing: " << filename << endl;
    return;
  }

  // Write the header row
  file << "resource_id,resource_name,region,raw_score,level,supply_score,"
          "conflict_score,trade_score,demand_score,route_score"
       << endl;

  // Write one line per risk score
  for (int i = 0; i < (int)scores.size(); i++) {
    file << scores[i].resource_id << "," << scores[i].resource_name << ","
         << scores[i].region << "," << scores[i].raw_score << ","
         << scores[i].level << "," << scores[i].supply_score << ","
         << scores[i].conflict_score << "," << scores[i].trade_score << ","
         << scores[i].demand_score << "," << scores[i].route_score << endl;
  }

  file.close();
  cout << "Risk scores saved successfully to " << filename << endl;
  cout << "Total scores written: " << scores.size() << endl;
}
