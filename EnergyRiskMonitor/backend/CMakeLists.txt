cmake_minimum_required(VERSION 3.10)
project(GlobalEnergyRiskMonitor)

set(CMAKE_CXX_STANDARD 20)

include_directories(include)

file(GLOB SOURCES "src/*.cpp")

add_executable(EnergyRisk ${SOURCES})

set_target_properties(EnergyRisk PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/build
)
