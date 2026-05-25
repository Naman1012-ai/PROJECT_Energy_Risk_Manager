// ============================================================================
// main.cpp — Main Menu and Program Entry Point
// Member 1: Team Leader + Main Menu + Data Files
// ============================================================================
// This is the central file of the Global Energy Risk Monitor System.
// It loads data from CSV files, displays the interactive menu, and connects
// all feature modules together. The menu runs in a loop until the user
// chooses to save results and exit.
// ============================================================================

#include <iostream>
#include <string>
#include <vector>

// Include all module headers
#include "data_loader.h"
#include "risk_engine.h"
#include "features.h"
#include "analysis.h"
#include "display.h"
#include "json_api.h"

using namespace std;

// ----------------------------------------------------------------------------
// displayWelcomeBanner()
// Prints a visually appealing welcome screen when the program starts.
// Shows the program title and a brief description of what it does.
// ----------------------------------------------------------------------------
void displayWelcomeBanner() {
    cout << endl;
    cout << "=================================================================" << endl;
    cout << "=                                                               =" << endl;
    cout << "=       GLOBAL ENERGY RISK MONITOR SYSTEM                       =" << endl;
    cout << "=                                                               =" << endl;
    cout << "=       Real-time energy risk assessment and analysis            =" << endl;
    cout << "=       B.Tech Second Semester — Team Project                    =" << endl;
    cout << "=                                                               =" << endl;
    cout << "=================================================================" << endl;
    cout << endl;
}

// ----------------------------------------------------------------------------
// displayMenu()
// Prints the main menu with 6 options for the user to choose from.
// Returns the user's choice as an integer.
// ----------------------------------------------------------------------------
int displayMenu() {
    cout << endl;
    cout << "========================================" << endl;
    cout << "           MAIN MENU" << endl;
    cout << "========================================" << endl;
    cout << "  1) View all resources and risk scores" << endl;
    cout << "  2) Search for a resource by name" << endl;
    cout << "  3) View active geopolitical events" << endl;
    cout << "  4) Compare regions by risk" << endl;
    cout << "  5) View global risk summary" << endl;
    cout << "  6) Save results and exit" << endl;
    cout << "========================================" << endl;
    cout << "  Enter your choice (1-6): ";

    int choice;
    cin >> choice;

    // Handle invalid input (non-numeric)
    if (cin.fail()) {
        cin.clear();        // Clear the error flag
        cin.ignore(1000, '\n');  // Discard invalid input
        return -1;          // Return invalid choice
    }

    return choice;
}

// ============================================================================
// main() — Program Entry Point
// Loads all data from CSV files, then runs the interactive menu loop.
// Each menu option calls the appropriate function from the corresponding
// module. The loop continues until the user selects option 6 (Save and Exit).
// ============================================================================
int main(int argc, char* argv[]) {
    // --- JSON API Mode ---
    // If the program is run with --json flag, output JSON and exit
    // This is used by server.js to get data for the web frontend
    if (handleJsonApi(argc, argv)) {
        return 0;  // JSON was output, exit without showing interactive menu
    }

    // Display the welcome banner
    displayWelcomeBanner();

    // --- Load data from CSV files (done once at startup) ---
    cout << "Loading data files..." << endl;
    cout << endl;

    // Load energy resources from CSV file
    vector<EnergyResource> resources = loadEnergyResources("../../data/energy_data.csv");

    // Load geopolitical events from CSV file
    vector<GeopoliticalEvent> events = loadEvents("../../data/events.csv");

    // Verify that data was loaded successfully
    if (resources.empty()) {
        cout << "WARNING: No energy resources were loaded!" << endl;
        cout << "Please check that ../../data/energy_data.csv exists and is formatted correctly." << endl;
    }
    if (events.empty()) {
        cout << "WARNING: No geopolitical events were loaded!" << endl;
        cout << "Please check that ../../data/events.csv exists and is formatted correctly." << endl;
    }

    cout << endl;
    cout << "System ready. " << resources.size() << " resources and "
         << events.size() << " events loaded." << endl;

    // --- Main menu loop — keeps running until user picks option 6 ---
    bool running = true;
    while (running) {

        // Display the menu and get the user's choice
        int choice = displayMenu();

        // Execute the selected option
        switch (choice) {

            case 1:
                // Option 1: View all resources and risk scores (Member 6)
                printRiskTable(resources, events);
                break;

            case 2:
                // Option 2: Search for a resource by name (Member 4)
                searchResource(resources, events);
                break;

            case 3: {
                // Option 3: View active geopolitical events (Member 4)
                // First show all active events, then ask if user wants to filter by region
                showActiveEvents(events);

                cout << endl;
                cout << "  Would you like to filter events by region? (y/n): ";
                char filterChoice;
                cin >> filterChoice;

                if (filterChoice == 'y' || filterChoice == 'Y') {
                    string region;
                    cout << "  Enter region name: ";
                    cin.ignore();
                    getline(cin, region);
                    showEventsForRegion(events, region);
                }
                break;
            }

            case 4:
                // Option 4: Compare regions by risk (Member 5)
                // Show both supply disruption analysis and region comparison
                analyzeSupplyDisruption(resources, events);
                compareRegionRisk(resources, events);
                break;

            case 5:
                // Option 5: View global risk summary (Member 6)
                displayGlobalSummary(resources, events);
                break;

            case 6: {
                // Option 6: Save results and exit (Member 2)
                cout << endl;
                cout << "  Calculating final risk scores..." << endl;

                // Calculate risk scores for all resources
                vector<RiskScore> allScores;
                for (int i = 0; i < (int)resources.size(); i++) {
                    allScores.push_back(calculateRisk(resources[i], events));
                }

                // Save to output CSV file
                saveRiskScores(allScores, "../../data/risk_scores_output.csv");

                cout << endl;
                cout << "========================================" << endl;
                cout << "  Thank you for using the Global" << endl;
                cout << "  Energy Risk Monitor System!" << endl;
                cout << "========================================" << endl;
                cout << endl;

                // Exit the menu loop
                running = false;
                break;
            }

            default:
                // Handle invalid menu choice
                cout << endl;
                cout << "  Invalid choice. Please enter a number from 1 to 6." << endl;
                break;
        }
    }

    return 0;
}
