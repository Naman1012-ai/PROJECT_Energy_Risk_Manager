// ============================================================================
// analytics_engine.h — C++ Analytics & Trends Calculation Engine
// ============================================================================
#ifndef ANALYTICS_ENGINE_H
#define ANALYTICS_ENGINE_H

#include <string>
#include <vector>
#include <map>

struct TrendPoint {
    int year;
    double consumption_value;
    double fuel_price_value;
    double moving_average;
    double yoy_change;
    double production_value;
    double secondary_value;
};

struct AnalyticsResult {
    std::string country;
    std::string energy_type;
    int min_year;
    int max_year;
    
    double avg_growth_rate; // average YoY consumption growth
    double price_change_percentage; // total price delta
    std::string transition_speed; // "Accelerating", "Steady", "Lagging"
    std::string comparison_insight; // country vs region comparison
    std::string trend_summary;
    std::string consumption_error;
    std::string price_error;

    std::vector<TrendPoint> timeline;
    std::vector<TrendPoint> consumption_timeline;
    std::vector<TrendPoint> price_timeline;
    std::map<std::string, double> resource_shares; // latest year resource mix
};

class AnalyticsEngine {
public:
    static AnalyticsResult generateTrends(
        const std::string& country,
        const std::string& energyType,
        int minYear,
        int maxYear,
        const std::string& consumptionPath,
        const std::string& fuelPricesPath,
        const std::string& globalEnergyPath
    );

    static std::string serializeResult(const AnalyticsResult& result);
};

#endif // ANALYTICS_ENGINE_H
