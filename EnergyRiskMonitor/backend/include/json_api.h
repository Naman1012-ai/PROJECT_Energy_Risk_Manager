// ============================================================================
// json_api.h — JSON API Output Mode Declarations
// ============================================================================
// Declares the handleJsonApi() function that checks for the --json flag
// and routes to the appropriate JSON output handler. Returns true if
// the --json flag was present (meaning the program should exit after
// outputting JSON), or false if the program should continue with the
// normal interactive menu.
// ============================================================================

#ifndef JSON_API_H
#define JSON_API_H

// Checks if --json flag is present in command-line arguments.
// If yes, loads data, outputs JSON to stdout, and returns true.
// If no, returns false so main() can proceed with the interactive menu.
bool handleJsonApi(int argc, char* argv[]);

#endif // JSON_API_H
