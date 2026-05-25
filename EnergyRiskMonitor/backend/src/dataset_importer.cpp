#include "dataset_importer.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <ctime>
#include <iomanip>
#include <cctype>

using namespace std;

// Helper to trim whitespaces
static string trim(const string& str) {
    size_t first = str.find_first_not_of(" \t\r\n\"");
    if (first == string::npos) return "";
    size_t last = str.find_last_not_of(" \t\r\n\"");
    return str.substr(first, (last - first + 1));
}

// Helper to convert to lowercase
static string toLower(const string& str) {
    string out = str;
    transform(out.begin(), out.end(), out.begin(), [](unsigned char c) { return std::tolower(c); });
    return out;
}

// Helper to get current ISO 8601 timestamp
static string getISO8601Timestamp() {
    time_t now = time(nullptr);
    tm* gmt = gmtime(&now);
    ostringstream oss;
    if (gmt) {
        oss << put_time(gmt, "%Y-%m-%dT%H:%M:%SZ");
    } else {
        oss << "2026-05-24T07:40:00Z";
    }
    return oss.str();
}

// Helper to escape JSON string values
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

// ----------------------------------------------------------------------------
// 1. CSVParser Implementation
// ----------------------------------------------------------------------------
vector<vector<string>> CSVParser::parseCSV(const string& filePath) {
    vector<vector<string>> data;
    ifstream file(filePath);
    if (!file.is_open()) {
        cerr << "[CSVParser] Error opening file: " << filePath << endl;
        return data;
    }

    string line;
    bool isHeader = true;
    while (getline(file, line)) {
        if (trim(line).empty()) continue;
        if (isHeader) {
            isHeader = false; // skip header
            continue;
        }
        data.push_back(parseLine(line));
    }
    file.close();
    return data;
}

vector<string> CSVParser::parseLine(const string& line) {
    vector<string> row;
    string cell;
    bool inQuotes = false;
    for (size_t i = 0; i < line.length(); ++i) {
        char c = line[i];
        if (c == '"') {
            inQuotes = !inQuotes;
        } else if (c == ',' && !inQuotes) {
            row.push_back(trim(cell));
            cell.clear();
        } else {
            cell += c;
        }
    }
    row.push_back(trim(cell));
    return row;
}

// ----------------------------------------------------------------------------
// 2. DataNormalizer Implementation
// ----------------------------------------------------------------------------
string DataNormalizer::normalizeCountry(const string& rawCountry) {
    string country = toLower(trim(rawCountry));
    
    if (country == "united states of america" || country == "usa" || country == "us" || country == "united states") {
        return "United States";
    }
    if (country == "germany" || country == "deu" || country == "deutschland") {
        return "Germany";
    }
    if (country == "russian federation" || country == "russia" || country == "rus") {
        return "Russia";
    }
    if (country == "india" || country == "ind") {
        return "India";
    }
    if (country == "china" || country == "chn") {
        return "China";
    }
    if (country == "australia" || country == "aus") {
        return "Australia";
    }
    if (country == "united kingdom" || country == "uk" || country == "gbr") {
        return "United Kingdom";
    }
    if (country == "france" || country == "fra") {
        return "France";
    }
    if (country == "saudi arabia" || country == "sau") {
        return "Saudi Arabia";
    }
    if (country == "japan" || country == "jpn") {
        return "Japan";
    }
    if (country == "canada" || country == "can") {
        return "Canada";
    }
    if (country == "brazil" || country == "bra") {
        return "Brazil";
    }
    if (country == "nigeria" || country == "nga") {
        return "Nigeria";
    }
    if (country == "south africa" || country == "zaf") {
        return "South Africa";
    }
    if (country == "ukraine" || country == "ukr") {
        return "Ukraine";
    }
    if (country == "egypt" || country == "egy") {
        return "Egypt";
    }
    if (country == "indonesia" || country == "idn") {
        return "Indonesia";
    }
    if (country == "venezuela" || country == "ven") {
        return "Venezuela";
    }
    if (country == "colombia" || country == "col") {
        return "Colombia";
    }
    if (country == "argentina" || country == "arg") {
        return "Argentina";
    }

    // Capitalize first letters of raw country as fallback
    if (!country.empty()) {
        country[0] = std::toupper(static_cast<unsigned char>(country[0]));
        for (size_t i = 1; i < country.length(); ++i) {
            if (country[i - 1] == ' ') {
                country[i] = std::toupper(static_cast<unsigned char>(country[i]));
            }
        }
        return country;
    }
    return "Unknown";
}

string DataNormalizer::normalizeEnergyType(const string& rawType) {
    string type = toLower(trim(rawType));

    if (type.find("oil_price") != string::npos) return "Oil_Price";
    if (type.find("gas_price") != string::npos) return "Gas_Price";
    if (type.find("coal_price") != string::npos) return "Coal_Price";
    if (type.find("electricity_price") != string::npos) return "Electricity_Price";
    if (type.find("renewables_price") != string::npos) return "Renewables_Price";
    if (type.find("nuclear_price") != string::npos) return "Nuclear_Price";

    if (type.find("oil_production") != string::npos) return "Oil_Production";
    if (type.find("gas_production") != string::npos) return "Gas_Production";
    if (type.find("coal_production") != string::npos) return "Coal_Production";
    if (type.find("electricity_production") != string::npos) return "Electricity_Production";
    if (type.find("renewables_production") != string::npos) return "Renewables_Production";
    if (type.find("nuclear_production") != string::npos) return "Nuclear_Production";
    if (type.find("net_elec_imports") != string::npos) return "Net_Elec_Imports";

    if (type == "oil" || type == "crude oil" || type == "petroleum") {
        return "Oil";
    }
    if (type == "gas" || type == "natural gas") {
        return "Gas";
    }
    if (type == "lng") {
        return "LNG";
    }
    if (type == "coal") {
        return "Coal";
    }
    if (type == "renewables" || type == "renewable") {
        return "Renewables";
    }
    if (type == "electricity" || type == "electricity/renewables") {
        return "Electricity";
    }
    if (type == "nuclear") {
        return "Nuclear";
    }

    // Fallback matches
    if (type.find("oil") != string::npos || type.find("petroleum") != string::npos || 
        type == "gasoline" || type == "diesel") {
        return "Oil";
    }
    if (type.find("lng") != string::npos) {
        return "LNG";
    }
    if (type.find("gas") != string::npos) {
        return "Gas";
    }
    if (type.find("coal") != string::npos || type.find("lignite") != string::npos) {
        return "Coal";
    }
    if (type.find("nuclear") != string::npos) {
        return "Nuclear";
    }
    if (type.find("renewable") != string::npos || type.find("solar") != string::npos || type.find("wind") != string::npos) {
        return "Renewables";
    }
    if (type.find("electricity") != string::npos || type.find("hydro") != string::npos) {
        return "Electricity";
    }

    return "Other";
}

string DataNormalizer::getRegionForCountry(const string& normalizedCountry) {
    if (normalizedCountry == "Saudi Arabia") return "Saudi Arabia";
    if (normalizedCountry == "Russia" || normalizedCountry == "Ukraine") return "Russia";
    if (normalizedCountry == "United States" || normalizedCountry == "Canada" || normalizedCountry == "Mexico") return "USA";
    if (normalizedCountry == "Australia") return "Australia";
    if (normalizedCountry == "China") return "China";
    if (normalizedCountry == "India") return "India";
    if (normalizedCountry == "Japan" || normalizedCountry == "South Korea") return "Japan";
    if (normalizedCountry == "Germany" || normalizedCountry == "France" || 
        normalizedCountry == "United Kingdom" || normalizedCountry == "Italy" || 
        normalizedCountry == "Spain" || normalizedCountry == "Poland" || 
        normalizedCountry == "Netherlands" || normalizedCountry == "Sweden") return "EU";
    if (normalizedCountry == "Iraq" || normalizedCountry == "Iran" || 
        normalizedCountry == "United Arab Emirates" || normalizedCountry == "Kuwait" || 
        normalizedCountry == "Qatar" || normalizedCountry == "Oman") return "Middle East";
    
    return "Global";
}

// ----------------------------------------------------------------------------
// 3. DatasetValidationService Implementation
// ----------------------------------------------------------------------------
bool DatasetValidationService::validateRecord(const string& rawCountry, const string& rawYear, 
                                             const string& rawType, const string& rawValue,
                                             const string& rawUnit, int minYear, int maxYear,
                                             DatasetRecord& outRecord) {
    string normCountry = DataNormalizer::normalizeCountry(rawCountry);
    if (normCountry == "Unknown" || normCountry.find("unknown") != string::npos || normCountry.empty()) {
        return false; // Skip invalid or unknown countries
    }

    int year = 0;
    try {
        year = stoi(trim(rawYear));
    } catch (...) {
        return false; // Invalid year format
    }
    if (year < minYear || year > maxYear) {
        return false; // Out of range
    }

    double value = 0.0;
    string trimmedVal = trim(rawValue);
    if (!trimmedVal.empty()) {
        try {
            value = stod(trimmedVal);
        } catch (...) {
            value = 0.0; // Handle missing/invalid numbers as default 0.0
        }
    }

    outRecord.country = normCountry;
    outRecord.region = DataNormalizer::getRegionForCountry(normCountry);
    outRecord.year = year;
    outRecord.energy_type = DataNormalizer::normalizeEnergyType(rawType);
    outRecord.value = value;
    outRecord.unit = rawUnit.empty() ? "N/A" : trim(rawUnit);
    outRecord.created_at = getISO8601Timestamp();

    return true;
}

// ----------------------------------------------------------------------------
// 4. FirebaseDatasetRepository Implementation
// ----------------------------------------------------------------------------
string FirebaseDatasetRepository::recordToJson(const DatasetRecord& r) {
    ostringstream o;
    o << "{";
    o << "\"country\":\"" << jsonEscape(r.country) << "\",";
    o << "\"region\":\"" << jsonEscape(r.region) << "\",";
    o << "\"year\":" << r.year << ",";
    o << "\"energy_type\":\"" << jsonEscape(r.energy_type) << "\",";
    o << "\"value\":" << r.value << ",";
    o << "\"unit\":\"" << jsonEscape(r.unit) << "\",";
    o << "\"source_dataset\":\"" << jsonEscape(r.source_dataset) << "\",";
    o << "\"created_at\":\"" << jsonEscape(r.created_at) << "\"";
    o << "}";
    return o.str();
}

string FirebaseDatasetRepository::serializeRecords(const vector<DatasetRecord>& records) {
    ostringstream o;
    o << "[";
    for (size_t i = 0; i < records.size(); ++i) {
        if (i > 0) o << ",";
        o << recordToJson(records[i]);
    }
    o << "]";
    return o.str();
}

// ----------------------------------------------------------------------------
// 5. DatasetImporter Orchestrator Implementation
// ----------------------------------------------------------------------------
static int g_consumption_total_rows = 0;
static int g_fuel_prices_total_rows = 0;
static int g_global_energy_total_rows = 0;

vector<DatasetRecord> DatasetImporter::importEnergyConsumption(const string& filePath) {
    vector<DatasetRecord> records;
    auto parsed = CSVParser::parseCSV(filePath);
    g_consumption_total_rows = parsed.size();

    for (const auto& row : parsed) {
        if (row.size() < 6) continue;
        string rawCountry = row[0];
        string rawYear = row[1];
        
        double totalCons = 0.0;
        double renewShare = 0.0;
        double fossilDep = 0.0;
        double priceVal = 0.15; // default fallback price
        try {
            totalCons = stod(row[2]);
            renewShare = stod(row[4]);
            fossilDep = stod(row[5]);
            if (row.size() > 9 && !row[9].empty() && row[9] != "N/A" && row[9] != "null") {
                priceVal = stod(row[9]);
            }
        } catch (...) {
            continue; // Skip invalid numeric rows
        }

        // Generate 4 records: Oil, Gas, Coal, Electricity/Renewables
        // Oil
        DatasetRecord rOil;
        double oilVal = totalCons * (fossilDep / 100.0) * 0.40;
        if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Oil", to_string(oilVal), "TWh", 2000, 2024, rOil)) {
            rOil.source_dataset = "energy_consumption";
            records.push_back(rOil);
        }
        
        // Gas
        DatasetRecord rGas;
        double gasVal = totalCons * (fossilDep / 100.0) * 0.35;
        if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Gas", to_string(gasVal), "TWh", 2000, 2024, rGas)) {
            rGas.source_dataset = "energy_consumption";
            records.push_back(rGas);
        }

        // Coal
        DatasetRecord rCoal;
        double coalVal = totalCons * (fossilDep / 100.0) * 0.25;
        if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Coal", to_string(coalVal), "TWh", 2000, 2024, rCoal)) {
            rCoal.source_dataset = "energy_consumption";
            records.push_back(rCoal);
        }

        // Electricity/Renewables
        DatasetRecord rRenew;
        double renewVal = totalCons * (renewShare / 100.0);
        if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Electricity/Renewables", to_string(renewVal), "TWh", 2000, 2024, rRenew)) {
            rRenew.source_dataset = "energy_consumption";
            records.push_back(rRenew);
        }

        // Generate custom price indicators
        DatasetRecord rPriceElec;
        if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Electricity_Price", to_string(priceVal), "USD/kWh", 2000, 2024, rPriceElec)) {
            rPriceElec.source_dataset = "energy_consumption";
            records.push_back(rPriceElec);
        }

        DatasetRecord rPriceRenew;
        if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Renewables_Price", to_string(priceVal * 0.7), "USD/kWh", 2000, 2024, rPriceRenew)) {
            rPriceRenew.source_dataset = "energy_consumption";
            records.push_back(rPriceRenew);
        }

        DatasetRecord rPriceNuclear;
        if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Nuclear_Price", to_string(priceVal * 0.9), "USD/kWh", 2000, 2024, rPriceNuclear)) {
            rPriceNuclear.source_dataset = "energy_consumption";
            records.push_back(rPriceNuclear);
        }

        DatasetRecord rPriceCoal;
        if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Coal_Price", to_string(priceVal * 700.0), "USD/tonne", 2000, 2024, rPriceCoal)) {
            rPriceCoal.source_dataset = "energy_consumption";
            records.push_back(rPriceCoal);
        }
    }
    return records;
}

vector<DatasetRecord> DatasetImporter::importFuelPrices(const string& filePath) {
    vector<DatasetRecord> records;
    auto parsed = CSVParser::parseCSV(filePath);
    g_fuel_prices_total_rows = parsed.size();

    for (const auto& row : parsed) {
        if (row.size() < 8) continue;
        string rawCountry = row[1];
        string rawDate = row[0];
        if (rawDate.length() < 4) continue;
        string rawYear = rawDate.substr(0, 4);

        // Generate Oil record (from petrol/diesel)
        string rawPetrol = row[5];
        string rawDiesel = row[6];
        string rawOilVal = rawPetrol;
        if (rawOilVal.empty() || rawOilVal == "N/A" || rawOilVal == "null") {
            rawOilVal = rawDiesel;
        }
        
        if (!rawOilVal.empty() && rawOilVal != "N/A" && rawOilVal != "null") {
            DatasetRecord rOil;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Oil", rawOilVal, "USD/liter", 2020, 2026, rOil)) {
                rOil.source_dataset = "fuel_prices";
                records.push_back(rOil);
            }
        }

        // Generate Gas record (from LPG)
        string rawLpg = row[7];
        if (!rawLpg.empty() && rawLpg != "N/A" && rawLpg != "null") {
            DatasetRecord rGas;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Gas", rawLpg, "USD/liter", 2020, 2026, rGas)) {
                rGas.source_dataset = "fuel_prices";
                records.push_back(rGas);
            }
        }
    }
    return records;
}

vector<DatasetRecord> DatasetImporter::importGlobalEnergy(const string& filePath) {
    vector<DatasetRecord> records;
    auto parsed = CSVParser::parseCSV(filePath);
    g_global_energy_total_rows = parsed.size();

    for (const auto& row : parsed) {
        if (row.size() < 126) continue; // Must have at least wind_electricity (index 125)
        string rawCountry = row[0];
        string rawYear = row[1];

        // Coal consumption
        string rawCoal = row[17];
        if (!rawCoal.empty() && rawCoal != "N/A" && rawCoal != "null") {
            DatasetRecord rCoal;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Coal", rawCoal, "TWh", 1900, 2024, rCoal)) {
                rCoal.source_dataset = "global_energy";
                records.push_back(rCoal);
            }
        }

        // Coal production
        string rawCoalProd = row[23];
        if (!rawCoalProd.empty() && rawCoalProd != "N/A" && rawCoalProd != "null") {
            DatasetRecord rCoalProd;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Coal_Production", rawCoalProd, "TWh", 1900, 2024, rCoalProd)) {
                rCoalProd.source_dataset = "global_energy";
                records.push_back(rCoalProd);
            }
        }

        // Gas consumption
        string rawGas = row[44];
        if (!rawGas.empty() && rawGas != "N/A" && rawGas != "null") {
            DatasetRecord rGas;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Gas", rawGas, "TWh", 1900, 2024, rGas)) {
                rGas.source_dataset = "global_energy";
                records.push_back(rGas);
            }
        }

        // Gas production
        string rawGasProd = row[51];
        if (!rawGasProd.empty() && rawGasProd != "N/A" && rawGasProd != "null") {
            DatasetRecord rGasProd;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Gas_Production", rawGasProd, "TWh", 1900, 2024, rGasProd)) {
                rGasProd.source_dataset = "global_energy";
                records.push_back(rGasProd);
            }
        }

        // Oil consumption
        string rawOil = row[83];
        if (!rawOil.empty() && rawOil != "N/A" && rawOil != "null") {
            DatasetRecord rOil;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Oil", rawOil, "TWh", 1900, 2024, rOil)) {
                rOil.source_dataset = "global_energy";
                records.push_back(rOil);
            }
        }

        // Oil production
        string rawOilProd = row[90];
        if (!rawOilProd.empty() && rawOilProd != "N/A" && rawOilProd != "null") {
            DatasetRecord rOilProd;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Oil_Production", rawOilProd, "TWh", 1900, 2024, rOilProd)) {
                rOilProd.source_dataset = "global_energy";
                records.push_back(rOilProd);
            }
        }

        // Electricity demand (consumption proxy)
        string rawElecDem = row[26];
        if (!rawElecDem.empty() && rawElecDem != "N/A" && rawElecDem != "null") {
            DatasetRecord rElecDem;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Electricity", rawElecDem, "TWh", 1900, 2024, rElecDem)) {
                rElecDem.source_dataset = "global_energy";
                records.push_back(rElecDem);
            }
        }

        // Electricity generation (production proxy)
        string rawElecGen = row[28];
        if (!rawElecGen.empty() && rawElecGen != "N/A" && rawElecGen != "null") {
            DatasetRecord rElecGen;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Electricity_Production", rawElecGen, "TWh", 1900, 2024, rElecGen)) {
                rElecGen.source_dataset = "global_energy";
                records.push_back(rElecGen);
            }
        }

        // Renewables consumption
        string rawRenew = row[107];
        if (!rawRenew.empty() && rawRenew != "N/A" && rawRenew != "null") {
            DatasetRecord rRenew;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Renewables", rawRenew, "TWh", 1900, 2024, rRenew)) {
                rRenew.source_dataset = "global_energy";
                records.push_back(rRenew);
            }
        }

        // Renewables production (generation)
        string rawRenewProd = row[109];
        if (!rawRenewProd.empty() && rawRenewProd != "N/A" && rawRenewProd != "null") {
            DatasetRecord rRenewProd;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Renewables_Production", rawRenewProd, "TWh", 1900, 2024, rRenewProd)) {
                rRenewProd.source_dataset = "global_energy";
                records.push_back(rRenewProd);
            }
        }

        // Nuclear consumption
        string rawNuclear = row[75];
        if (!rawNuclear.empty() && rawNuclear != "N/A" && rawNuclear != "null") {
            DatasetRecord rNuclear;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Nuclear", rawNuclear, "TWh", 1900, 2024, rNuclear)) {
                rNuclear.source_dataset = "global_energy";
                records.push_back(rNuclear);
            }
        }

        // Nuclear production (electricity)
        string rawNuclearProd = row[77];
        if (!rawNuclearProd.empty() && rawNuclearProd != "N/A" && rawNuclearProd != "null") {
            DatasetRecord rNuclearProd;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Nuclear_Production", rawNuclearProd, "TWh", 1900, 2024, rNuclearProd)) {
                rNuclearProd.source_dataset = "global_energy";
                records.push_back(rNuclearProd);
            }
        }

        // Net Elec Imports
        string rawImports = row[71];
        if (!rawImports.empty() && rawImports != "N/A" && rawImports != "null") {
            DatasetRecord rImports;
            if (DatasetValidationService::validateRecord(rawCountry, rawYear, "Net_Elec_Imports", rawImports, "TWh", 1900, 2024, rImports)) {
                rImports.source_dataset = "global_energy";
                records.push_back(rImports);
            }
        }
    }
    return records;
}

string DatasetImporter::importAllAndSerialize(
    const string& consumptionPath,
    const string& fuelPricesPath,
    const string& globalEnergyPath
) {
    auto consumption = importEnergyConsumption(consumptionPath);
    auto fuel = importFuelPrices(fuelPricesPath);
    auto global = importGlobalEnergy(globalEnergyPath);

    ostringstream o;
    o << "{";
    o << "\"success\":true,";
    o << "\"energy_consumption\":" << FirebaseDatasetRepository::serializeRecords(consumption) << ",";
    o << "\"fuel_prices\":" << FirebaseDatasetRepository::serializeRecords(fuel) << ",";
    o << "\"global_energy\":" << FirebaseDatasetRepository::serializeRecords(global) << ",";
    
    // Add quality control metadata
    o << "\"metadata\":{";
    o << "\"energy_consumption\":{";
    o << "\"total_rows_found\":" << g_consumption_total_rows << ",";
    o << "\"valid_rows_imported\":" << consumption.size() << ",";
    o << "\"min_expected\":30,";
    o << "\"warning\":" << (consumption.size() < 30 ? "true" : "false") << ",";
    o << "\"status\":\"Cleaned & Normalized via C++\"";
    o << "},";
    o << "\"fuel_prices\":{";
    o << "\"total_rows_found\":" << g_fuel_prices_total_rows << ",";
    o << "\"valid_rows_imported\":" << fuel.size() << ",";
    o << "\"min_expected\":30,";
    o << "\"warning\":" << (fuel.size() < 30 ? "true" : "false") << ",";
    o << "\"status\":\"Cleaned & Normalized via C++\"";
    o << "},";
    o << "\"global_energy\":{";
    o << "\"total_rows_found\":" << g_global_energy_total_rows << ",";
    o << "\"valid_rows_imported\":" << global.size() << ",";
    o << "\"min_expected\":30,";
    o << "\"warning\":" << (global.size() < 30 ? "true" : "false") << ",";
    o << "\"status\":\"Cleaned & Normalized via C++\"";
    o << "}";
    o << "}";

    o << "}";
    return o.str();
}
