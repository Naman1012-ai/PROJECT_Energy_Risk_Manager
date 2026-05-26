// ============================================================================
// analytics_engine.h — C++ Analytics & Trends Calculation Engine
// ============================================================================
#ifndef ANALYTICS_ENGINE_H
#define ANALYTICS_ENGINE_H

#include <string>
#include <vector>
#include <map>

struct TrendPoint {
    int year = 0;
    double consumption_value = 0.0;
    double fuel_price_value = -9999.0;
    double moving_average = 0.0;
    double yoy_change = 0.0;
    double production_value = 0.0;
    double secondary_value = 0.0;
    bool is_estimated = false;
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

    std::string estimation_method;
    double regression_slope = 0.0;
    double regression_intercept = 0.0;
    int real_data_from = 0;
    int real_data_to = 0;
    int estimated_points_count = 0;
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
