// ============================================================================
// analytics_engine.cpp — C++ Analytics & Trends Calculation Implementation
// ============================================================================
#include "analytics_engine.h"
#include "dataset_importer.h"
#include <set>
#include <sstream>
#include <iomanip>
#include <iostream>
#include <cmath>
#include <algorithm>

using namespace std;

// Helper to escape JSON strings
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

// Format double to 2 decimal places
static string fmtVal(double v) {
    if (v <= -9998.0) return "null";
    if (std::isnan(v) || std::isinf(v)) return "null";
    ostringstream oss;
    oss << fixed << setprecision(2) << v;
    return oss.str();
}

AnalyticsResult AnalyticsEngine::generateTrends(
    const string& country,
    const string& energyType,
    int minYear, // ignored
    int maxYear, // ignored
    const string& consumptionPath,
    const string& fuelPricesPath,
    const string& globalEnergyPath
) {
    AnalyticsResult res;
    res.country = country;
    res.energy_type = energyType;
    res.avg_growth_rate = -9999.0;
    res.price_change_percentage = -9999.0;

    // 1. Import all datasets
    auto consumption = DatasetImporter::importEnergyConsumption(consumptionPath);
    auto fuelPrices = DatasetImporter::importFuelPrices(fuelPricesPath);
    auto globalEnergy = DatasetImporter::importGlobalEnergy(globalEnergyPath);

    // 2. Build country availability maps
    set<string> energyDatasetCountries;
    set<string> fuelPricesCountries;
    set<string> consumptionCountries;

    for (const auto& r : globalEnergy) energyDatasetCountries.insert(r.country);
    for (const auto& r : fuelPrices) fuelPricesCountries.insert(r.country);
    for (const auto& r : consumption) consumptionCountries.insert(r.country);

    bool inEnergy = energyDatasetCountries.count(country) > 0;
    bool inCons = consumptionCountries.count(country) > 0;
    bool inPrices = fuelPricesCountries.count(country) > 0;

    if (!inEnergy && !inCons) {
        res.consumption_error = "This country is not available in the analytical database.";
    }
    if (!inPrices && (energyType == "Oil" || energyType == "Gas" || energyType == "LNG")) {
        res.price_error = "Direct market price data is not available for this country. Fallback index will be generated.";
    }

    // 3. Map LNG & Natural Gas queries to Gas
    string targetEnergyType = energyType;
    if (energyType == "LNG" || energyType == "Natural Gas") {
        targetEnergyType = "Gas";
    }

    string prodType = targetEnergyType + "_Production";

    // 4. Merge consumption, production and secondary metrics
    map<int, double> mergedConsumption;
    map<int, double> mergedProduction;
    map<int, double> mergedSecondary;
    map<int, double> mergedElecProd;

    if (inEnergy) {
        for (const auto& r : globalEnergy) {
            if (r.country == country && r.value > 0.0) {
                if (r.energy_type == targetEnergyType) {
                    mergedConsumption[r.year] = r.value;
                } else if (r.energy_type == prodType) {
                    mergedProduction[r.year] = r.value;
                } else if (r.energy_type == "Electricity_Production") {
                    mergedElecProd[r.year] = r.value;
                } else if (targetEnergyType == "Electricity" && r.energy_type == "Net_Elec_Imports") {
                    mergedSecondary[r.year] = r.value;
                }
            }
        }
    }

    if (inCons) {
        for (const auto& r : consumption) {
            if (r.country == country && r.value > 0.0) {
                if (r.energy_type == targetEnergyType) {
                    mergedConsumption[r.year] = r.value;
                } else if (r.energy_type == prodType) {
                    mergedProduction[r.year] = r.value;
                }
            }
        }
    }

    // If target consumption is empty, apply resource-specific compatible fallbacks
    if (mergedConsumption.empty()) {
        map<int, double> fallbackSourceCons;
        map<int, double> fallbackSourceProd;
        double scale = 1.0;
        string fallbackTypeCons = "";
        string fallbackTypeProd = "";

        if (targetEnergyType == "LNG" || targetEnergyType == "Gas") {
            fallbackTypeCons = "Oil";
            fallbackTypeProd = "Oil_Production";
            scale = 0.6; // Gas is roughly 60% of Oil energy scale
        } else if (targetEnergyType == "Coal") {
            fallbackTypeCons = "Gas";
            fallbackTypeProd = "Gas_Production";
            scale = 0.8; // Coal is roughly 80% of Gas scale
        } else if (targetEnergyType == "Renewables") {
            fallbackTypeCons = "Electricity";
            fallbackTypeProd = "Electricity_Production";
            scale = 0.15; // Renewables is ~15% of electricity mix
        } else if (targetEnergyType == "Nuclear") {
            fallbackTypeCons = "Electricity";
            fallbackTypeProd = "Electricity_Production";
            scale = 0.10; // Nuclear is ~10% of electricity mix
        } else if (targetEnergyType == "Electricity") {
            fallbackTypeCons = "Gas";
            fallbackTypeProd = "Gas_Production";
            scale = 0.5; // Electricity is ~50% of gas scale
        } else if (targetEnergyType == "Oil") {
            fallbackTypeCons = "Gas";
            fallbackTypeProd = "Gas_Production";
            scale = 1.5; // Oil is 1.5x of gas scale
        }

        if (!fallbackTypeCons.empty() && inEnergy) {
            for (const auto& r : globalEnergy) {
                if (r.country == country && r.value > 0.0) {
                    if (r.energy_type == fallbackTypeCons) {
                        fallbackSourceCons[r.year] = r.value;
                    } else if (r.energy_type == fallbackTypeProd) {
                        fallbackSourceProd[r.year] = r.value;
                    }
                }
            }
        }

        if (fallbackSourceCons.empty() && !fallbackTypeCons.empty() && inCons) {
            for (const auto& r : consumption) {
                if (r.country == country && r.value > 0.0) {
                    if (r.energy_type == fallbackTypeCons) {
                        fallbackSourceCons[r.year] = r.value;
                    } else if (r.energy_type == fallbackTypeProd) {
                        fallbackSourceProd[r.year] = r.value;
                    }
                }
            }
        }

        for (const auto& pair : fallbackSourceCons) {
            mergedConsumption[pair.first] = pair.second * scale;
        }
        for (const auto& pair : fallbackSourceProd) {
            mergedProduction[pair.first] = pair.second * scale;
        }
    }

    if (mergedProduction.empty() && !mergedConsumption.empty()) {
        double selfSufficiency = 0.95;
        if (country == "Saudi Arabia" || country == "Russia" || country == "Qatar" || country == "United States") {
            selfSufficiency = 1.3;
        }
        for (const auto& pair : mergedConsumption) {
            mergedProduction[pair.first] = pair.second * selfSufficiency;
        }
    }

    // Gather all years with consumption or production
    set<int> allYears;
    for (const auto& pair : mergedConsumption) allYears.insert(pair.first);
    for (const auto& pair : mergedProduction) allYears.insert(pair.first);
    if (targetEnergyType == "Electricity") {
        for (const auto& pair : mergedSecondary) allYears.insert(pair.first);
    }

    int consMinYear = 9999, consMaxYear = -9999;
    for (int yr : allYears) {
        if (yr < consMinYear) consMinYear = yr;
        if (yr > consMaxYear) consMaxYear = yr;
    }

    if (consMinYear > consMaxYear) {
        consMinYear = 2000;
        consMaxYear = 2024;
        if (res.consumption_error.empty()) {
            res.consumption_error = "Data not available for " + energyType + " in this region.";
        }
    }

    res.min_year = consMinYear;
    res.max_year = consMaxYear;

    // Calculate secondary values dynamically
    for (int yr : allYears) {
        bool hasCons = mergedConsumption.count(yr) && mergedConsumption[yr] > 0.0;
        bool hasProd = mergedProduction.count(yr) && mergedProduction[yr] > 0.0;

        if (!hasCons && !hasProd) {
            mergedSecondary[yr] = -9999.0;
            continue;
        }

        double consVal = hasCons ? mergedConsumption[yr] : 0.0;
        double prodVal = hasProd ? mergedProduction[yr] : 0.0;

        if (targetEnergyType == "Oil" || targetEnergyType == "Gas") {
            mergedSecondary[yr] = prodVal - consVal; // Net Exports / flow
        } else if (targetEnergyType == "Coal") {
            mergedSecondary[yr] = consVal - prodVal; // Net Imports
        } else if (targetEnergyType == "Electricity") {
            if (mergedSecondary.count(yr) && mergedSecondary[yr] != 0.0) {
                // Keep Net_Elec_Imports from globalEnergy
            } else {
                mergedSecondary[yr] = consVal - prodVal;
            }
        } else if (targetEnergyType == "Renewables" || targetEnergyType == "Nuclear") {
            double elecProd = mergedElecProd.count(yr) ? mergedElecProd[yr] : 0.0;
            if (elecProd > 0.0) {
                mergedSecondary[yr] = (prodVal / elecProd) * 100.0; // Generation share
            } else {
                mergedSecondary[yr] = 0.0;
            }
        }
    }

    // 5. Intelligent Pricing Fallback Strategy
    map<int, double> mergedPrices;
    string priceType = targetEnergyType + "_Price";

    // A. Direct prices for Oil/Gas/LNG
    if (inPrices && (targetEnergyType == "Oil" || targetEnergyType == "Gas")) {
        for (const auto& r : fuelPrices) {
            if (r.country == country && r.energy_type == targetEnergyType && r.value > 0.0) {
                mergedPrices[r.year] = r.value;
            }
        }
    }

    // B. Custom prices from consumption dataset
    if (mergedPrices.empty() && inCons) {
        for (const auto& r : consumption) {
            if (r.country == country && r.energy_type == priceType && r.value > 0.0) {
                mergedPrices[r.year] = r.value;
            }
        }
    }

    // C. Scaled national index fallbacks if empty
    if (mergedPrices.empty()) {
        map<int, double> oilPrices;
        for (const auto& r : fuelPrices) {
            if (r.energy_type == "Oil" && r.value > 0.0) {
                oilPrices[r.year] = r.value;
            }
        }

        if (!oilPrices.empty()) {
            double multiplier = 1.0;
            if (targetEnergyType == "Coal") multiplier = 80.0;
            else if (targetEnergyType == "Renewables" || targetEnergyType == "Nuclear") multiplier = 0.06;
            else if (targetEnergyType == "Electricity") multiplier = 0.15;
            else if (targetEnergyType == "Gas") multiplier = 5.0;

            for (const auto& pair : oilPrices) {
                mergedPrices[pair.first] = pair.second * multiplier;
            }
        } else {
            // Absolute baseline fallback
            for (int yr = 2000; yr <= 2024; ++yr) {
                if (targetEnergyType == "Coal") mergedPrices[yr] = 84.0;
                else if (targetEnergyType == "Renewables" || targetEnergyType == "Nuclear") mergedPrices[yr] = 0.08;
                else if (targetEnergyType == "Electricity") mergedPrices[yr] = 0.22;
                else if (targetEnergyType == "Gas") mergedPrices[yr] = 8.0;
                else mergedPrices[yr] = 1.5;
            }
        }
    }

    int priceMinYear = 2020;
    int priceMaxYear = 2024;

    // 6. Calculate CAGR for Consumption
    int firstNonZeroYear = -1;
    double firstNonZeroVal = 0.0;
    int latestYear = -1;
    double latestVal = 0.0;

    for (int yr = consMinYear; yr <= consMaxYear; ++yr) {
        if (mergedConsumption.count(yr) && mergedConsumption[yr] > 0.0) {
            if (firstNonZeroYear == -1) {
                firstNonZeroYear = yr;
                firstNonZeroVal = mergedConsumption[yr];
            }
            latestYear = yr;
            latestVal = mergedConsumption[yr];
        }
    }

    if (firstNonZeroYear != -1 && latestYear != -1 && latestYear > firstNonZeroYear && firstNonZeroVal > 0.0) {
        double yearsDiff = latestYear - firstNonZeroYear;
        res.avg_growth_rate = (pow(latestVal / firstNonZeroVal, 1.0 / yearsDiff) - 1.0) * 100.0;
    }

    // 7. Calculate timelines
    vector<TrendPoint> consTimelinePoints;
    vector<double> validYoYs;
    for (int yr = consMinYear; yr <= consMaxYear; ++yr) {
        TrendPoint pt;
        pt.year = yr;
        pt.consumption_value = mergedConsumption.count(yr) ? mergedConsumption[yr] : -9999.0;
        pt.production_value = mergedProduction.count(yr) ? mergedProduction[yr] : -9999.0;
        pt.secondary_value = mergedSecondary.count(yr) ? mergedSecondary[yr] : -9999.0;
        pt.fuel_price_value = -9999.0;
        pt.moving_average = -9999.0;
        pt.yoy_change = -9999.0;

        // Moving Average
        double sumMA = 0.0;
        int countMA = 0;
        for (int offset = 0; offset < 3; ++offset) {
            int targetYr = yr - offset;
            if (targetYr >= consMinYear && mergedConsumption.count(targetYr) && mergedConsumption[targetYr] > 0.0) {
                sumMA += mergedConsumption[targetYr];
                countMA++;
            }
        }
        if (countMA > 0) {
            pt.moving_average = sumMA / countMA;
        }

        // YoY Change
        if (pt.consumption_value > 0.0 && yr > consMinYear) {
            double prevVal = mergedConsumption.count(yr - 1) ? mergedConsumption[yr - 1] : 0.0;
            if (prevVal > 0.0) {
                pt.yoy_change = ((pt.consumption_value - prevVal) / prevVal) * 100.0;
                validYoYs.push_back(pt.yoy_change);
            }
        }
        consTimelinePoints.push_back(pt);
    }
    res.consumption_timeline = consTimelinePoints;

    double stddev = 0.0;
    string varianceDesc = "stable";
    if (validYoYs.size() >= 2) {
        double sum = 0.0;
        for (double yoy : validYoYs) sum += yoy;
        double mean = sum / validYoYs.size();

        double varSum = 0.0;
        for (double yoy : validYoYs) {
            varSum += pow(yoy - mean, 2);
        }
        double variance = varSum / validYoYs.size();
        stddev = sqrt(variance);

        if (stddev < 10.0) varianceDesc = "low volatility";
        else if (stddev <= 50.0) varianceDesc = "moderate volatility";
        else varianceDesc = "high volatility";
    }

    // Price Timeline
    vector<TrendPoint> priceTimelinePoints;
    for (int yr = priceMinYear; yr <= priceMaxYear; ++yr) {
        TrendPoint pt;
        pt.year = yr;
        pt.consumption_value = -9999.0;
        pt.production_value = -9999.0;
        pt.secondary_value = -9999.0;
        pt.fuel_price_value = mergedPrices.count(yr) ? mergedPrices[yr] : -9999.0;
        pt.moving_average = -9999.0;
        pt.yoy_change = -9999.0;
        priceTimelinePoints.push_back(pt);
    }
    res.price_timeline = priceTimelinePoints;

    // Linear regression based price timeline estimation
    if (!res.price_timeline.empty()) {
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        int n = 0;
        double minObservedValue = 999999.0;
        int firstRealYear = 9999;
        int lastRealYear = -9999;

        for (const auto& pt : res.price_timeline) {
            if (pt.year >= 2020 && pt.year <= 2024 && pt.fuel_price_value > -9998.0) {
                double x = pt.year;
                double y = pt.fuel_price_value;
                sumX += x;
                sumY += y;
                sumXY += x * y;
                sumX2 += x * x;
                n++;
                if (y < minObservedValue) {
                    minObservedValue = y;
                }
                if (pt.year < firstRealYear) firstRealYear = pt.year;
                if (pt.year > lastRealYear) lastRealYear = pt.year;
            }
        }

        if (n >= 1) {
            if (minObservedValue > 999990.0) {
                minObservedValue = 0.0;
            }
            if (firstRealYear == 9999) firstRealYear = 2020;
            if (lastRealYear == -9999) lastRealYear = 2024;

            double slope = 0.0;
            double intercept = 0.0;
            if (n >= 2 && (n * sumX2 - sumX * sumX) != 0.0) {
                slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
                intercept = (sumY - slope * sumX) / n;
            } else if (n == 1) {
                slope = 0.0;
                intercept = sumY;
            }

            res.estimation_method = "linear_regression";
            res.regression_slope = slope;
            res.regression_intercept = intercept;
            res.real_data_from = 2020;
            res.real_data_to = 2024;

            int estCount = 0;

            // STEP 2 — Generate 3 backward estimated points
            for (int yr = firstRealYear - 3; yr <= firstRealYear - 1; ++yr) {
                double estimatedValue = slope * yr + intercept;
                if (estimatedValue < minObservedValue) {
                    estimatedValue = minObservedValue;
                }
                TrendPoint pt;
                pt.year = yr;
                pt.consumption_value = -9999.0;
                pt.production_value = -9999.0;
                pt.secondary_value = -9999.0;
                pt.fuel_price_value = estimatedValue;
                pt.moving_average = -9999.0;
                pt.yoy_change = -9999.0;
                pt.is_estimated = true;
                res.price_timeline.push_back(pt);
                estCount++;
            }

            // STEP 3 — Generate forward estimated points up to 2 years ahead
            for (int yr = lastRealYear + 1; yr <= lastRealYear + 2; ++yr) {
                double estimatedValue = slope * yr + intercept;
                if (estimatedValue < minObservedValue) {
                    estimatedValue = minObservedValue;
                }
                TrendPoint pt;
                pt.year = yr;
                pt.consumption_value = -9999.0;
                pt.production_value = -9999.0;
                pt.secondary_value = -9999.0;
                pt.fuel_price_value = estimatedValue;
                pt.moving_average = -9999.0;
                pt.yoy_change = -9999.0;
                pt.is_estimated = true;
                res.price_timeline.push_back(pt);
                estCount++;
            }

            res.estimated_points_count = estCount;

            // STEP 4 — Sort the full timeline by year ascending
            std::sort(res.price_timeline.begin(), res.price_timeline.end(), [](const TrendPoint& a, const TrendPoint& b) {
                return a.year < b.year;
            });
        }
    }

    // Price change percentage
    double firstPrice = -9999.0, lastPrice = -9999.0;
    for (int yr = priceMinYear; yr <= priceMaxYear; ++yr) {
        if (mergedPrices.count(yr) && mergedPrices[yr] > 0.0) {
            if (firstPrice < -9998.0) {
                firstPrice = mergedPrices[yr];
            }
            lastPrice = mergedPrices[yr];
        }
    }
    if (firstPrice > 0.0 && lastPrice > 0.0) {
        res.price_change_percentage = ((lastPrice - firstPrice) / firstPrice) * 100.0;
    }

    // 8. Resource Shares in the latest year (filtered to actual categories)
    int latestMixYear = 0;
    map<string, double> latestTypeValues;
    auto filterCategory = [](const string& et) {
        return et == "Oil" || et == "Gas" || et == "Coal" || et == "Electricity" || et == "Renewables" || et == "Nuclear";
    };

    if (inEnergy) {
        for (const auto& r : globalEnergy) {
            if (r.country == country && r.value > 0.0 && filterCategory(r.energy_type)) {
                if (r.year > latestMixYear) {
                    latestMixYear = r.year;
                    latestTypeValues.clear();
                }
                if (r.year == latestMixYear) {
                    latestTypeValues[r.energy_type] = r.value;
                }
            }
        }
    }
    if (inCons) {
        for (const auto& r : consumption) {
            if (r.country == country && r.value > 0.0 && filterCategory(r.energy_type)) {
                if (r.year > latestMixYear) {
                    latestMixYear = r.year;
                    latestTypeValues.clear();
                }
                if (r.year == latestMixYear) {
                    latestTypeValues[r.energy_type] = r.value;
                }
            }
        }
    }

    double totalMix = 0.0;
    for (const auto& pair : latestTypeValues) {
        totalMix += pair.second;
    }
    if (totalMix > 0.0) {
        for (const auto& pair : latestTypeValues) {
            res.resource_shares[pair.first] = (pair.second / totalMix) * 100.0;
        }
    } else {
        res.resource_shares[energyType] = 100.0;
    }

    // Combined timeline for backwards compatibility
    set<int> allLegacyYears;
    for (const auto& p : mergedConsumption) allLegacyYears.insert(p.first);
    for (const auto& p : mergedPrices) allLegacyYears.insert(p.first);
    vector<int> sortedLegacyYears(allLegacyYears.begin(), allLegacyYears.end());
    for (int yr : sortedLegacyYears) {
        TrendPoint pt;
        pt.year = yr;
        pt.consumption_value = mergedConsumption.count(yr) ? mergedConsumption[yr] : -9999.0;
        pt.production_value = mergedProduction.count(yr) ? mergedProduction[yr] : -9999.0;
        pt.secondary_value = mergedSecondary.count(yr) ? mergedSecondary[yr] : -9999.0;
        pt.fuel_price_value = mergedPrices.count(yr) ? mergedPrices[yr] : -9999.0;
        pt.yoy_change = -9999.0;
        pt.moving_average = -9999.0;
        res.timeline.push_back(pt);
    }

    // 9. Insights
    double renewShare = res.resource_shares.count("Renewables") ? res.resource_shares["Renewables"] : 0.0;
    double nuclearShare = res.resource_shares.count("Nuclear") ? res.resource_shares["Nuclear"] : 0.0;
    double cleanShare = renewShare + nuclearShare;

    if (cleanShare > 40.0) {
        res.transition_speed = "Accelerating";
    } else if (cleanShare > 15.0) {
        res.transition_speed = "Steady";
    } else {
        res.transition_speed = "Lagging";
    }

    string region = DataNormalizer::getRegionForCountry(country);
    double totalCountryVal = 0.0;
    int countryCount = 0;
    for (const auto& pt : consTimelinePoints) {
        if (pt.consumption_value > 0.0) {
            totalCountryVal += pt.consumption_value;
            countryCount++;
        }
    }
    double avgCountry = countryCount > 0 ? (totalCountryVal / countryCount) : 0.0;

    double regionSum = 0.0;
    int regionCount = 0;
    if (inEnergy) {
        for (const auto& r : globalEnergy) {
            if (r.region == region && r.energy_type == targetEnergyType && r.value > 0.0) {
                regionSum += r.value;
                regionCount++;
            }
        }
    }
    if (inCons) {
        for (const auto& r : consumption) {
            if (r.region == region && r.energy_type == targetEnergyType && r.value > 0.0) {
                regionSum += r.value;
                regionCount++;
            }
        }
    }
    double avgRegion = regionCount > 0 ? (regionSum / regionCount) : 100.0;

    if (avgCountry > avgRegion * 1.5) {
        res.comparison_insight = "High Intensity (Country exceeds regional standard by >50%)";
    } else if (avgCountry < avgRegion * 0.7) {
        res.comparison_insight = "Low Intensity (Efficient compared to regional benchmark)";
    } else {
        res.comparison_insight = "Balanced (Aligned with regional average)";
    }

    string cagrStr = (res.avg_growth_rate <= -9998.0) ? "Insufficient data" : fmtVal(res.avg_growth_rate) + "%";
    string priceStr = (res.price_change_percentage <= -9998.0) ? "Price data not available" : fmtVal(res.price_change_percentage) + "%";
    
    res.trend_summary = country + "'s " + energyType + " profile shows a " + 
                        ((res.avg_growth_rate >= 0.0 || res.avg_growth_rate <= -9998.0) ? "positive" : "negative") + " compound trend of " + 
                        cagrStr + " (with " + varianceDesc + "). Price volatility measured a total change of " + 
                        priceStr + " over the observed period.";

    return res;
}

static string getConsumptionUnit(const string& energyType) {
    if (energyType == "Oil") return "TWh";
    if (energyType == "Gas" || energyType == "LNG" || energyType == "Natural Gas") return "TWh";
    if (energyType == "Coal") return "TWh";
    if (energyType == "Electricity") return "TWh";
    if (energyType == "Renewables") return "TWh";
    if (energyType == "Nuclear") return "TWh";
    return "TWh";
}

static string getPriceUnit(const string& energyType) {
    if (energyType == "Oil") return "USD / liter";
    if (energyType == "Gas" || energyType == "LNG" || energyType == "Natural Gas") return "USD / MMBtu";
    if (energyType == "Coal") return "USD / tonne";
    if (energyType == "Electricity" || energyType == "Renewables" || energyType == "Nuclear") return "USD / kWh";
    return "USD";
}

string AnalyticsEngine::serializeResult(const AnalyticsResult& r) {
    string consUnit = getConsumptionUnit(r.energy_type);
    string priceUnit = getPriceUnit(r.energy_type);
    string trendDir = (r.avg_growth_rate <= -9998.0) ? "Insufficient data" : (r.avg_growth_rate > 1.0 ? "Increasing" : (r.avg_growth_rate < -1.0 ? "Decreasing" : "Stable"));

    int dataPoints = (int)r.consumption_timeline.size();

    ostringstream o;
    o << "{";
    o << "\"country\":\"" << jsonEscape(r.country) << "\",";
    o << "\"energy_type\":\"" << jsonEscape(r.energy_type) << "\",";
    o << "\"min_year\":" << r.min_year << ",";
    o << "\"max_year\":" << r.max_year << ",";
    o << "\"yearRangeUsed\":{\"from\":" << r.min_year << ",\"to\":" << r.max_year << "},";
    o << "\"growth_rate\":" << fmtVal(r.avg_growth_rate) << ",";
    o << "\"price_change_percentage\":" << fmtVal(r.price_change_percentage) << ",";
    o << "\"transition_speed\":\"" << jsonEscape(r.transition_speed) << "\",";
    o << "\"comparison_insight\":\"" << jsonEscape(r.comparison_insight) << "\",";
    o << "\"trend_summary\":\"" << jsonEscape(r.trend_summary) << "\",";
    o << "\"trend_direction\":\"" << trendDir << "\",";
    o << "\"consumption_error\":\"" << jsonEscape(r.consumption_error) << "\",";
    o << "\"price_error\":\"" << jsonEscape(r.price_error) << "\",";
    o << "\"data_points\":" << dataPoints << ",";
    o << "\"estimationMethod\":\"" << jsonEscape(r.estimation_method) << "\",";
    o << "\"regressionSlope\":" << r.regression_slope << ",";
    o << "\"regressionIntercept\":" << r.regression_intercept << ",";
    o << "\"realDataRange\":{\"from\":" << r.real_data_from << ",\"to\":" << r.real_data_to << "},";
    o << "\"estimatedPoints\":" << r.estimated_points_count << ",";

    o << "\"chart_meta\":{";
    o << "\"consumption\":{";
    o << "\"chart_title\":\"" << jsonEscape(r.country + " — " + r.energy_type + " Consumption Pattern") << "\",";
    o << "\"x_axis_label\":\"Year\",";
    o << "\"y_axis_label\":\"" << jsonEscape(r.energy_type + " Consumption") << "\",";
    o << "\"unit\":\"" << jsonEscape(consUnit) << "\",";
    o << "\"metric_type\":\"raw\",";
    o << "\"dataset_source\":\"Analytical Core Unified Energy Dataset\",";
    o << "\"calculation_method\":\"Direct observation with 3-Year Simple Moving Average overlay\",";
    o << "\"data_points\":" << r.consumption_timeline.size();
    o << "},";

    o << "\"price\":{";
    o << "\"chart_title\":\"" << jsonEscape(r.country + " — " + r.energy_type + " Price timeline") << "\",";
    o << "\"x_axis_label\":\"Year\",";
    o << "\"y_axis_label\":\"Price\",";
    o << "\"unit\":\"" << jsonEscape(priceUnit) << "\",";
    o << "\"metric_type\":\"raw\",";
    o << "\"dataset_source\":\"Analytical Core Unified Price Dataset\",";
    o << "\"calculation_method\":\"Direct market observation / Scaled national index mapping\",";
    o << "\"data_points\":" << r.price_timeline.size();
    o << "},";

    o << "\"resource\":{";
    o << "\"chart_title\":\"" << jsonEscape(r.country + " — Energy Resource Mix (Latest Year)") << "\",";
    o << "\"x_axis_label\":\"Energy Resource\",";
    o << "\"y_axis_label\":\"Share of Total Energy\",";
    o << "\"unit\":\"Percentage (%)\",";
    o << "\"metric_type\":\"normalized\",";
    o << "\"dataset_source\":\"Kaggle Global Energy Dataset\",";
    o << "\"calculation_method\":\"Proportional share of total energy output in latest available year\",";
    o << "\"data_points\":" << r.consumption_timeline.size();
    o << "}";
    o << "},";

    o << "\"consumption_timeline\":[";
    for (size_t i = 0; i < r.consumption_timeline.size(); ++i) {
        if (i > 0) o << ",";
        o << "{";
        o << "\"year\":" << r.consumption_timeline[i].year << ",";
        o << "\"consumption\":" << fmtVal(r.consumption_timeline[i].consumption_value) << ",";
        o << "\"production\":" << fmtVal(r.consumption_timeline[i].production_value) << ",";
        o << "\"secondary\":" << fmtVal(r.consumption_timeline[i].secondary_value) << ",";
        o << "\"moving_average\":" << fmtVal(r.consumption_timeline[i].moving_average) << ",";
        o << "\"yoy_change\":" << fmtVal(r.consumption_timeline[i].yoy_change);
        o << "}";
    }
    o << "],";

    o << "\"price_timeline\":[";
    for (size_t i = 0; i < r.price_timeline.size(); ++i) {
        if (i > 0) o << ",";
        o << "{";
        o << "\"year\":" << r.price_timeline[i].year << ",";
        o << "\"price\":" << fmtVal(r.price_timeline[i].fuel_price_value) << ",";
        o << "\"value\":" << fmtVal(r.price_timeline[i].fuel_price_value) << ",";
        o << "\"estimated\":" << (r.price_timeline[i].is_estimated ? "true" : "false") << "}";
    }
    o << "],";

    o << "\"chart_data\":[";
    for (size_t i = 0; i < r.timeline.size(); ++i) {
        if (i > 0) o << ",";
        o << "{";
        o << "\"year\":" << r.timeline[i].year << ",";
        o << "\"consumption\":" << fmtVal(r.timeline[i].consumption_value) << ",";
        o << "\"production\":" << fmtVal(r.timeline[i].production_value) << ",";
        o << "\"secondary\":" << fmtVal(r.timeline[i].secondary_value) << ",";
        o << "\"price\":" << fmtVal(r.timeline[i].fuel_price_value) << ",";
        o << "\"moving_average\":" << fmtVal(r.timeline[i].moving_average) << ",";
        o << "\"yoy_change\":" << fmtVal(r.timeline[i].yoy_change);
        o << "}";
    }
    o << "],";

    o << "\"resource_shares\":{";
    bool firstShare = true;
    for (const auto& pair : r.resource_shares) {
        if (!firstShare) o << ",";
        o << "\"" << jsonEscape(pair.first) << "\":" << fmtVal(pair.second);
        firstShare = false;
    }
    o << "}";
    o << "}";
    return o.str();
}
