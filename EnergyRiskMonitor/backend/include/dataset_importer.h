// ============================================================================
// dataset_importer.h — Dataset Import & Normalization Module
// ============================================================================
#ifndef DATASET_IMPORTER_H
#define DATASET_IMPORTER_H

#include <string>
#include <vector>
#include <map>

// Represents a processed historical energy record
struct DatasetRecord {
    std::string country;
    std::string region;
    int year;
    std::string energy_type;
    double value;
    std::string unit;
    std::string source_dataset;
    std::string created_at;
};

// 1. CSV Parser Module
class CSVParser {
public:
    static std::vector<std::vector<std::string>> parseCSV(const std::string& filePath);
private:
    static std::vector<std::string> parseLine(const std::string& line);
};

// 2. Data Normalization Module
class DataNormalizer {
public:
    static std::string normalizeCountry(const std::string& rawCountry);
    static std::string normalizeEnergyType(const std::string& rawType);
    static std::string getRegionForCountry(const std::string& normalizedCountry);
};

// 3. Dataset Validation Service
class DatasetValidationService {
public:
    static bool validateRecord(const std::string& rawCountry, const std::string& rawYear, 
                                const std::string& rawType, const std::string& rawValue,
                                const std::string& rawUnit, int minYear, int maxYear,
                                DatasetRecord& outRecord);
};

// 4. Firebase Dataset Repository (JSON Serialization)
class FirebaseDatasetRepository {
public:
    static std::string serializeRecords(const std::vector<DatasetRecord>& records);
    static std::string recordToJson(const DatasetRecord& r);
};

// 5. Main Dataset Importer Orchestrator
class DatasetImporter {
public:
    static std::vector<DatasetRecord> importEnergyConsumption(const std::string& filePath);
    static std::vector<DatasetRecord> importFuelPrices(const std::string& filePath);
    static std::vector<DatasetRecord> importGlobalEnergy(const std::string& filePath);
    
    // Core function to import all 3 datasets and return JSON
    static std::string importAllAndSerialize(
        const std::string& consumptionPath,
        const std::string& fuelPricesPath,
        const std::string& globalEnergyPath
    );
};

#endif // DATASET_IMPORTER_H
