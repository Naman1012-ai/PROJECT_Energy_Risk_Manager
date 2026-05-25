const { analyticsValidator } = require('../services/analyticsValidator');

console.log('--- START VALIDATOR UNIT TESTS ---');

// Test case 1: Oil price column and unit standard lookup
const oilStd = analyticsValidator.buildEvidenceObject(
    [
        { country: 'Saudi Arabia', energy_type: 'Oil', year: 2020, value: 50.0, unit: 'USD / barrel' },
        { country: 'Saudi Arabia', energy_type: 'Oil', year: 2021, value: 60.0, unit: 'USD / barrel' }
    ],
    'Saudi Arabia',
    'Oil',
    2020,
    2021,
    'fuel_prices',
    'Price'
);
console.log('Oil Price Evidence (within realistic bounds):', oilStd);

// Test case 2: Oil price out of realistic bounds
const oilOut = analyticsValidator.buildEvidenceObject(
    [
        { country: 'Saudi Arabia', energy_type: 'Oil', year: 2020, value: 5.0, unit: 'USD / barrel' },
        { country: 'Saudi Arabia', energy_type: 'Oil', year: 2021, value: 10.0, unit: 'USD / barrel' }
    ],
    'Saudi Arabia',
    'Oil',
    2020,
    2021,
    'fuel_prices',
    'Price'
);
// Note: buildEvidenceObject itself doesn't apply the displayed realism gate on the server (which returns raw value and column), 
// but let's see what is returned:
console.log('Oil Price Evidence (out of bounds raw evidence object):', oilOut);

// Test case 3: Gas price query should strictly return null in buildEvidenceObject to avoid LPG proxy mapping
const gasPrice = analyticsValidator.buildEvidenceObject(
    [
        { country: 'Germany', energy_type: 'Gas', year: 2020, value: 15.0 }
    ],
    'Germany',
    'Gas',
    2020,
    2020,
    'fuel_prices',
    'Price'
);
console.log('Gas Price Evidence (should be null):', gasPrice);

// Test case 4: Coal price query should strictly return null in buildEvidenceObject to avoid electricity proxy mapping
const coalPrice = analyticsValidator.buildEvidenceObject(
    [
        { country: 'China', energy_type: 'Coal', year: 2020, value: 90.0 }
    ],
    'China',
    'Coal',
    2020,
    2020,
    'fuel_prices',
    'Price'
);
console.log('Coal Price Evidence (should be null):', coalPrice);

console.log('--- ALL UNIT TESTS FINISHED ---');
