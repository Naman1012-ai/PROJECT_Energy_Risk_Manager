// ============================================================================
// json_api.cpp — JSON API Output Mode for Web Frontend
// ============================================================================
// This file provides a command-line JSON mode for the Energy Risk Monitor.
// When the main executable is run with a specific command argument, it outputs
// JSON data to stdout instead of interactive console menus. This allows the
// Node.js server (server.js) to invoke the C++ binary and relay the results
// to the web frontend, keeping ALL calculations in C++.
//
// Usage:
//   EnergyRisk.exe --json dashboard
//   EnergyRisk.exe --json resources
//   EnergyRisk.exe --json events
//   EnergyRisk.exe --json regions
//   EnergyRisk.exe --json analysis
//   EnergyRisk.exe --json search <query>
//   EnergyRisk.exe --json resource <id>
// ============================================================================

#include "json_api.h"
#include "data_loader.h"
#include "risk_engine.h"
#include "dataset_importer.h"
#include "analytics_engine.h"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <map>

using namespace std;

// ----------------------------------------------------------------------------
// Helpers: JSON string escaping and number formatting
// ----------------------------------------------------------------------------

// Escapes special characters for safe JSON string output
static string jsonEscape(const string& s) {
    string result;
    for (char c : s) {
        switch (c) {
            case '"':  result += "\\\""; break;
            case '\\': result += "\\\\"; break;
            case '\n': result += "\\n";  break;
            case '\r': result += "\\r";  break;
            case '\t': result += "\\t";  break;
            default:   result += c;
        }
    }
    return result;
}

// Formats a double to a fixed number of decimal places as a string
static string fmtDouble(double val, int precision = 1) {
    ostringstream oss;
    oss << fixed << setprecision(precision) << val;
    return oss.str();
}

// ----------------------------------------------------------------------------
// JSON serializers for individual structs
// ----------------------------------------------------------------------------

static string resourceToJson(const EnergyResource& r) {
    ostringstream o;
    o << "{";
    o << "\"id\":\"" << jsonEscape(r.id) << "\",";
    o << "\"name\":\"" << jsonEscape(r.name) << "\",";
    o << "\"type\":\"" << jsonEscape(r.type) << "\",";
    o << "\"region\":\"" << jsonEscape(r.region) << "\",";
    o << "\"production\":" << fmtDouble(r.production, 1) << ",";
    o << "\"consumption\":" << fmtDouble(r.consumption, 1) << ",";
    o << "\"reserve_years\":" << fmtDouble(r.reserve_years, 1) << ",";
    o << "\"export_dependency\":" << fmtDouble(r.export_dependency, 2) << ",";
    o << "\"price\":" << fmtDouble(r.price, 2);
    o << "}";
    return o.str();
}

static string eventToJson(const GeopoliticalEvent& e) {
    ostringstream o;
    o << "{";
    o << "\"id\":\"" << jsonEscape(e.id) << "\",";
    o << "\"title\":\"" << jsonEscape(e.title) << "\",";
    o << "\"type\":\"" << jsonEscape(e.type) << "\",";
    o << "\"region\":\"" << jsonEscape(e.region) << "\",";
    o << "\"intensity\":" << fmtDouble(e.intensity, 2) << ",";
    o << "\"supply_impact\":" << fmtDouble(e.supply_impact, 2) << ",";
    o << "\"is_active\":" << e.is_active;
    o << "}";
    return o.str();
}

static string riskScoreToJson(const RiskScore& s) {
    ostringstream o;
    o << "{";
    o << "\"resource_id\":\"" << jsonEscape(s.resource_id) << "\",";
    o << "\"resource_name\":\"" << jsonEscape(s.resource_name) << "\",";
    o << "\"region\":\"" << jsonEscape(s.region) << "\",";
    o << "\"level\":\"" << jsonEscape(s.level) << "\",";
    
    if (s.raw_score < 0.0) o << "\"raw_score\":null,";
    else o << "\"raw_score\":" << fmtDouble(s.raw_score) << ",";

    if (s.supply_score < 0.0) o << "\"supply_score\":null,";
    else o << "\"supply_score\":" << fmtDouble(s.supply_score) << ",";

    if (s.conflict_score < 0.0) o << "\"conflict_score\":null,";
    else o << "\"conflict_score\":" << fmtDouble(s.conflict_score) << ",";

    if (s.trade_score < 0.0) o << "\"trade_score\":null,";
    else o << "\"trade_score\":" << fmtDouble(s.trade_score) << ",";

    if (s.demand_score < 0.0) o << "\"demand_score\":null,";
    else o << "\"demand_score\":" << fmtDouble(s.demand_score) << ",";

    if (s.route_score < 0.0) o << "\"route_score\":null";
    else o << "\"route_score\":" << fmtDouble(s.route_score);

    o << "}";
    return o.str();
}

// ----------------------------------------------------------------------------
// API endpoint handlers
// ----------------------------------------------------------------------------

// GET /api/dashboard — returns stats, risk scores, and events for the dashboard
void apiDashboard(vector<EnergyResource>& resources, vector<GeopoliticalEvent>& events) {
    // Calculate all risk scores
    vector<RiskScore> scores;
    for (int i = 0; i < (int)resources.size(); i++) {
        scores.push_back(calculateRisk(resources[i], events));
    }

    // Count active events
    int activeEvents = 0;
    for (int i = 0; i < (int)events.size(); i++) {
        if (events[i].is_active == 1) activeEvents++;
    }

    // Calculate averages and risk distribution
    double totalScore = 0;
    int highCount = 0, medCount = 0, lowCount = 0;
    for (int i = 0; i < (int)scores.size(); i++) {
        totalScore += scores[i].raw_score;
        if (scores[i].level == "HIGH") highCount++;
        else if (scores[i].level == "MEDIUM") medCount++;
        else lowCount++;
    }
    double avgScore = (scores.size() > 0) ? (totalScore / scores.size()) : 0.0;

    // Sort for top risks
    for (int i = 0; i < (int)scores.size() - 1; i++) {
        for (int j = i + 1; j < (int)scores.size(); j++) {
            if (scores[j].raw_score > scores[i].raw_score) {
                RiskScore temp = scores[i];
                scores[i] = scores[j];
                scores[j] = temp;
            }
        }
    }

    // Build JSON output
    cout << "{";

    // Stats
    cout << "\"stats\":{";
    cout << "\"total_resources\":" << resources.size() << ",";
    cout << "\"active_events\":" << activeEvents << ",";
    cout << "\"avg_risk_score\":" << fmtDouble(avgScore) << ",";
    cout << "\"high_risk_count\":" << highCount << ",";
    cout << "\"medium_risk_count\":" << medCount << ",";
    cout << "\"low_risk_count\":" << lowCount;
    cout << "},";

    // Risk scores (sorted by raw_score desc)
    cout << "\"risk_scores\":[";
    for (int i = 0; i < (int)scores.size(); i++) {
        if (i > 0) cout << ",";
        cout << riskScoreToJson(scores[i]);
    }
    cout << "],";

    // Active events
    cout << "\"active_events_list\":[";
    bool first = true;
    for (int i = 0; i < (int)events.size(); i++) {
        if (events[i].is_active == 1) {
            if (!first) cout << ",";
            cout << eventToJson(events[i]);
            first = false;
        }
    }
    cout << "]";

    cout << "}" << endl;
}

// GET /api/resources — returns all resources with their risk scores
void apiResources(vector<EnergyResource>& resources, vector<GeopoliticalEvent>& events) {
    vector<RiskScore> scores;
    for (int i = 0; i < (int)resources.size(); i++) {
        scores.push_back(calculateRisk(resources[i], events));
    }

    cout << "{\"resources\":[";
    for (int i = 0; i < (int)resources.size(); i++) {
        if (i > 0) cout << ",";
        // Merge resource data with risk score
        cout << "{";
        cout << "\"id\":\"" << jsonEscape(resources[i].id) << "\",";
        cout << "\"name\":\"" << jsonEscape(resources[i].name) << "\",";
        cout << "\"type\":\"" << jsonEscape(resources[i].type) << "\",";
        cout << "\"region\":\"" << jsonEscape(resources[i].region) << "\",";
        cout << "\"production\":" << fmtDouble(resources[i].production, 1) << ",";
        cout << "\"consumption\":" << fmtDouble(resources[i].consumption, 1) << ",";
        cout << "\"reserve_years\":" << fmtDouble(resources[i].reserve_years, 1) << ",";
        cout << "\"export_dependency\":" << fmtDouble(resources[i].export_dependency, 2) << ",";
        cout << "\"price\":" << fmtDouble(resources[i].price, 2) << ",";
        cout << "\"risk\":" << riskScoreToJson(scores[i]);
        cout << "}";
    }
    cout << "]}" << endl;
}

// GET /api/events — returns all events
void apiEvents(vector<GeopoliticalEvent>& events) {
    cout << "{\"events\":[";
    for (int i = 0; i < (int)events.size(); i++) {
        if (i > 0) cout << ",";
        cout << eventToJson(events[i]);
    }
    cout << "]}" << endl;
}

// GET /api/regions — returns region-grouped risk comparison
void apiRegions(vector<EnergyResource>& resources, vector<GeopoliticalEvent>& events) {
    // Calculate risk for each resource
    vector<RiskScore> scores;
    for (int i = 0; i < (int)resources.size(); i++) {
        scores.push_back(calculateRisk(resources[i], events));
    }

    // Group by region
    map<string, vector<double> > regionScores;
    for (int i = 0; i < (int)scores.size(); i++) {
        regionScores[scores[i].region].push_back(scores[i].raw_score);
    }

    // Build region data
    vector<string> regionNames;
    vector<int> regionCounts;
    vector<double> regionAverages;

    for (map<string, vector<double> >::iterator it = regionScores.begin();
         it != regionScores.end(); ++it) {
        double sum = 0;
        for (int i = 0; i < (int)it->second.size(); i++) {
            sum += it->second[i];
        }
        regionNames.push_back(it->first);
        regionCounts.push_back(it->second.size());
        regionAverages.push_back(sum / it->second.size());
    }

    // Sort by average score descending
    for (int i = 0; i < (int)regionNames.size() - 1; i++) {
        for (int j = i + 1; j < (int)regionNames.size(); j++) {
            if (regionAverages[j] > regionAverages[i]) {
                swap(regionNames[i], regionNames[j]);
                swap(regionCounts[i], regionCounts[j]);
                swap(regionAverages[i], regionAverages[j]);
            }
        }
    }

    cout << "{\"regions\":[";
    for (int i = 0; i < (int)regionNames.size(); i++) {
        if (i > 0) cout << ",";
        string level = (regionAverages[i] > 66.0) ? "HIGH" :
                        (regionAverages[i] > 33.0) ? "MEDIUM" : "LOW";
        cout << "{";
        cout << "\"name\":\"" << jsonEscape(regionNames[i]) << "\",";
        cout << "\"count\":" << regionCounts[i] << ",";
        cout << "\"avg_score\":" << fmtDouble(regionAverages[i]) << ",";
        cout << "\"level\":\"" << level << "\"";
        cout << "}";
    }
    cout << "]}" << endl;
}

// GET /api/analysis — returns full risk breakdown and supply disruption ranking
void apiAnalysis(vector<EnergyResource>& resources, vector<GeopoliticalEvent>& events) {
    vector<RiskScore> scores;
    for (int i = 0; i < (int)resources.size(); i++) {
        scores.push_back(calculateRisk(resources[i], events));
    }

    // Sort by raw_score descending for breakdown
    vector<RiskScore> sortedByScore = scores;
    for (int i = 0; i < (int)sortedByScore.size() - 1; i++) {
        for (int j = i + 1; j < (int)sortedByScore.size(); j++) {
            if (sortedByScore[j].raw_score > sortedByScore[i].raw_score) {
                RiskScore temp = sortedByScore[i];
                sortedByScore[i] = sortedByScore[j];
                sortedByScore[j] = temp;
            }
        }
    }

    // Sort by supply_score descending
    vector<RiskScore> sortedBySupply = scores;
    for (int i = 0; i < (int)sortedBySupply.size() - 1; i++) {
        for (int j = i + 1; j < (int)sortedBySupply.size(); j++) {
            if (sortedBySupply[j].supply_score > sortedBySupply[i].supply_score) {
                RiskScore temp = sortedBySupply[i];
                sortedBySupply[i] = sortedBySupply[j];
                sortedBySupply[j] = temp;
            }
        }
    }

    cout << "{";
    // Breakdown sorted by overall score
    cout << "\"breakdown\":[";
    for (int i = 0; i < (int)sortedByScore.size(); i++) {
        if (i > 0) cout << ",";
        cout << riskScoreToJson(sortedByScore[i]);
    }
    cout << "],";

    // Supply disruption ranking
    cout << "\"supply_ranking\":[";
    for (int i = 0; i < (int)sortedBySupply.size(); i++) {
        if (i > 0) cout << ",";
        cout << "{";
        cout << "\"resource_name\":\"" << jsonEscape(sortedBySupply[i].resource_name) << "\",";
        cout << "\"region\":\"" << jsonEscape(sortedBySupply[i].region) << "\",";
        cout << "\"supply_score\":" << fmtDouble(sortedBySupply[i].supply_score);
        // Find active events for this region
        cout << ",\"causing_events\":[";
        bool firstEvt = true;
        for (int j = 0; j < (int)events.size(); j++) {
            if (events[j].is_active == 1 && events[j].region == sortedBySupply[i].region) {
                if (!firstEvt) cout << ",";
                cout << "\"" << jsonEscape(events[j].title) << "\"";
                firstEvt = false;
            }
        }
        cout << "]";
        cout << "}";
    }
    cout << "]";

    cout << "}" << endl;
}

// GET /api/search?q=<query> — search resources by name or ID
void apiSearch(vector<EnergyResource>& resources, vector<GeopoliticalEvent>& events, const string& query) {
    cout << "{\"results\":[";
    bool first = true;

    for (int i = 0; i < (int)resources.size(); i++) {
        // Case-insensitive partial match on name or exact match on id
        string nameLower = resources[i].name;
        string idLower = resources[i].id;
        string queryLower = query;
        for (char& c : nameLower) c = tolower(c);
        for (char& c : idLower) c = tolower(c);
        for (char& c : queryLower) c = tolower(c);

        if (idLower == queryLower || nameLower.find(queryLower) != string::npos) {
            if (!first) cout << ",";
            RiskScore risk = calculateRisk(resources[i], events);
            cout << "{";
            cout << "\"resource\":" << resourceToJson(resources[i]) << ",";
            cout << "\"risk\":" << riskScoreToJson(risk);
            cout << "}";
            first = false;
        }
    }

    cout << "]}" << endl;
}

// GET /api/resource/<id> — get detailed info for a single resource
void apiResourceDetail(vector<EnergyResource>& resources, vector<GeopoliticalEvent>& events, const string& id) {
    for (int i = 0; i < (int)resources.size(); i++) {
        if (resources[i].id == id) {
            RiskScore risk = calculateRisk(resources[i], events);

            // Find related events
            cout << "{";
            cout << "\"resource\":" << resourceToJson(resources[i]) << ",";
            cout << "\"risk\":" << riskScoreToJson(risk) << ",";
            cout << "\"related_events\":[";
            bool first = true;
            for (int j = 0; j < (int)events.size(); j++) {
                if (events[j].is_active == 1 && events[j].region == resources[i].region) {
                    if (!first) cout << ",";
                    cout << eventToJson(events[j]);
                    first = false;
                }
            }
            cout << "]";
            cout << "}" << endl;
            return;
        }
    }

    // Not found
    cout << "{\"error\":\"Resource not found\",\"id\":\"" << jsonEscape(id) << "\"}" << endl;
}

// ============================================================================
// handleJsonApi() — Main entry point for JSON mode
// Called from main() when --json flag is detected.
// Loads data, determines which sub-command was requested, and routes to
// the appropriate handler function.
// ============================================================================
bool handleJsonApi(int argc, char* argv[]) {
    // Check if --json flag is present
    if (argc < 3) return false;
    string flag = argv[1];
    if (flag != "--json") return false;

    string command = argv[2];

    // Load data from CSV files (relative to executable location)
    vector<EnergyResource> resources = loadEnergyResources("../../data/energy_data.csv");
    vector<GeopoliticalEvent> events = loadEvents("../../data/events.csv");

    // Suppress the "Successfully loaded..." messages from data_loader
    // by redirecting cerr (data_loader uses cout, so we handle it)
    // Note: The loading messages go to cerr in server.js since we only parse stdout

    if (command == "dashboard") {
        apiDashboard(resources, events);
    } else if (command == "resources") {
        apiResources(resources, events);
    } else if (command == "events") {
        apiEvents(events);
    } else if (command == "regions") {
        apiRegions(resources, events);
    } else if (command == "analysis") {
        apiAnalysis(resources, events);
    } else if (command == "search" && argc >= 4) {
        apiSearch(resources, events, argv[3]);
    } else if (command == "resource" && argc >= 4) {
        apiResourceDetail(resources, events, argv[3]);
    } else if (command == "import-datasets") {
        string json = DatasetImporter::importAllAndSerialize(
            "../../data/Gobal Energy Consumption (2000-2024).csv",
            "../../data/Global Fuel Prices (2020-2026).csv",
            "../../data/Global Energy Dataset (1900-2024).csv"
        );
        cout << json << endl;
    } else if (command == "analytics-trends" && argc >= 7) {
        string country = argv[3];
        string energyType = argv[4];
        int minYear = stoi(argv[5]);
        int maxYear = stoi(argv[6]);
        string json = AnalyticsEngine::serializeResult(
            AnalyticsEngine::generateTrends(
                country, energyType, minYear, maxYear,
                "../../data/Gobal Energy Consumption (2000-2024).csv",
                "../../data/Global Fuel Prices (2020-2026).csv",
                "../../data/Global Energy Dataset (1900-2024).csv"
            )
        );
        cout << json << endl;
    } else {
        cout << "{\"error\":\"Unknown command\",\"command\":\"" << jsonEscape(command) << "\"}" << endl;
    }

    return true;
}
