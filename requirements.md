# Currency Converter - Requirements Specification

## Document Information
- **Version**: 1.0
- **Last Updated**: February 4, 2026
- **Status**: Active

---

## 1. Executive Summary

### 1.1 Purpose
The Currency Converter application provides users with real-time currency conversion capabilities, enabling quick and accurate exchange rate calculations across multiple major world currencies.

### 1.2 Business Objectives
- Provide instant currency conversion without requiring user registration
- Display real-time exchange rates from reliable sources
- Offer an intuitive, accessible user interface
- Support major global currencies for international users
- Ensure accurate calculations with proper decimal precision

---

## 2. Business Requirements

### 2.1 Core Business Rules

#### BR-001: Currency Conversion Formula
**Rule**: The converted amount MUST be calculated using the formula:
```
converted_amount = input_amount × exchange_rate
```

**Business Logic**:
- Exchange rates are fetched from external API (exchangerate-api.com)
- Rates are relative to the base currency (from currency)
- All calculations must maintain precision up to 2 decimal places for display
- Exchange rates are stored with 4 decimal places for accuracy

#### BR-002: Same Currency Conversion
**Rule**: When source and target currencies are identical, the conversion rate MUST be 1.0

**Business Logic**:
- If `fromCurrency === toCurrency`:
  - Set exchange rate to 1.0
  - Set result equal to input amount
  - Skip API call (optimization)
  - Clear any error messages

#### BR-003: Input Validation
**Rule**: Only valid numeric values (including decimals) are accepted as input

**Business Logic**:
- Accept: digits (0-9), single decimal point (.)
- Reject: negative numbers, letters, special characters (except decimal point)
- Empty string is allowed (for user editing flexibility)
- Zero (0) is considered invalid for conversion
- Validation pattern: `/^\d*\.?\d*$/`

#### BR-004: Amount Validation
**Rule**: Conversion can only proceed if amount is greater than zero

**Business Logic**:
- If amount is empty or `parseFloat(amount) <= 0`:
  - Display error: "Please enter a valid amount"
  - Prevent API call
  - Clear result display

#### BR-005: Real-time Rate Updates
**Rule**: Exchange rates MUST be refreshed when currency selection changes

**Business Logic**:
- Automatically trigger conversion when:
  - `fromCurrency` changes
  - `toCurrency` changes
- Manual refresh triggered on:
  - Input field blur event (when user finishes editing)
- Rate updates occur without user action (automatic)

#### BR-006: Currency Swap Functionality
**Rule**: Users MUST be able to swap source and target currencies

**Business Logic**:
- When swap button is clicked:
  - Set `fromCurrency` = previous `toCurrency`
  - Set `toCurrency` = previous `fromCurrency`
  - Set `amount` = previous `result` (if available) OR default to "1"
  - Trigger automatic conversion with new values
  - Animate swap button (180-degree rotation)

#### BR-007: Result Display Formatting
**Rule**: All monetary values MUST be formatted with proper locale formatting

**Business Logic**:
- Input amount display: Format with 2 decimal places minimum
- Result amount display: Format with 2 decimal places minimum
- Exchange rate display: Format with 4 decimal places
- Use `en-US` locale for number formatting
- Format: `value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`

#### BR-008: Exchange Rate Display
**Rule**: Current exchange rate MUST be displayed when conversion is successful

**Business Logic**:
- Display format: `1 {fromCurrency} = {rate} {toCurrency}`
- Rate displayed with 4 decimal places: `rate.toFixed(4)`
- Only display when conversion is successful and rate is available
- Display in secondary information area below result

---

## 3. Functional Requirements

### 3.1 User Interface Requirements

#### FR-001: Amount Input Field
- **Requirement**: User MUST be able to enter the amount to convert
- **Input Type**: Text input (allows decimal values)
- **Placeholder**: "0.00"
- **Validation**: Real-time validation as user types
- **Behavior**: 
  - Accepts numeric input with decimal point
  - Updates result in real-time if rate is already available
  - Triggers API call on blur if amount is valid

#### FR-002: Source Currency Selection
- **Requirement**: User MUST be able to select source currency
- **Component**: Dropdown select
- **Default Value**: USD (US Dollar)
- **Display Format**: `{flag} {code} - {name}` (e.g., "🇺🇸 USD - US Dollar")
- **Behavior**: Automatically triggers conversion on change

#### FR-003: Target Currency Selection
- **Requirement**: User MUST be able to select target currency
- **Component**: Dropdown select
- **Default Value**: EUR (Euro)
- **Display Format**: `{flag} {code} - {name}` (e.g., "🇪🇺 EUR - Euro")
- **Behavior**: Automatically triggers conversion on change

#### FR-004: Swap Button
- **Requirement**: User MUST be able to swap source and target currencies
- **Component**: Icon button with swap arrows
- **Accessibility**: ARIA label "Swap currencies"
- **Behavior**: 
  - Swaps currency selections
  - Updates amount to previous result
  - Animates with rotation effect

#### FR-005: Result Display
- **Requirement**: Converted amount MUST be displayed prominently
- **Display Format**: 
  - Source amount: `{formatted_amount} {fromCurrency} =`
  - Result: `{formatted_result} {toCurrency}`
  - Exchange rate: `1 {fromCurrency} = {rate} {toCurrency}`
- **Visibility**: Only shown when conversion is successful

#### FR-006: Loading State
- **Requirement**: Loading indicator MUST be shown during API calls
- **Display**: Spinner animation with text "Fetching exchange rate..."
- **Behavior**: Shown when `loading === true`

#### FR-007: Error Display
- **Requirement**: Error messages MUST be displayed when conversion fails
- **Display Format**: Error icon (⚠️) + error message
- **Error Types**:
  - Invalid amount: "Please enter a valid amount"
  - API failure: Error message from API response
  - Network error: "Failed to fetch exchange rate"
  - Missing currency: "Exchange rate not found for {currency}"

### 3.2 Supported Currencies

#### FR-008: Currency List
The application MUST support the following currencies:

| Code | Name | Flag | Display Order |
|------|------|------|---------------|
| USD | US Dollar | 🇺🇸 | 1 |
| EUR | Euro | 🇪🇺 | 2 |
| GBP | British Pound | 🇬🇧 | 3 |
| JPY | Japanese Yen | 🇯🇵 | 4 |
| AUD | Australian Dollar | 🇦🇺 | 5 |
| CAD | Canadian Dollar | 🇨🇦 | 6 |
| CHF | Swiss Franc | 🇨🇭 | 7 |
| CNY | Chinese Yuan | 🇨🇳 | 8 |
| INR | Indian Rupee | 🇮🇳 | 9 |
| BRL | Brazilian Real | 🇧🇷 | 10 |
| ZAR | South African Rand | 🇿🇦 | 11 |
| MXN | Mexican Peso | 🇲🇽 | 12 |

**Business Logic**:
- Currencies are hardcoded in application (not fetched from API)
- Each currency has: code (ISO 4217), full name, flag emoji
- Fallback: If currency code not found, display code with default flag (🌍)

---

## 4. API Requirements

### 4.1 Exchange Rate API

#### API-001: Endpoint Specification
- **Endpoint**: `/api/convert`
- **Method**: GET
- **Query Parameters**:
  - `from` (required): Source currency code (ISO 4217)
  - `to` (required): Target currency code (ISO 4217)

#### API-002: External API Integration
- **Provider**: exchangerate-api.com
- **Endpoint**: `https://api.exchangerate-api.com/v4/latest/{from}`
- **Authentication**: None required (free tier)
- **Rate Limit**: Subject to provider's free tier limits

#### API-003: Request Validation
**Business Logic**:
- Validate `from` parameter exists and is not empty
- Validate `to` parameter exists and is not empty
- If validation fails: Return 400 Bad Request with error message

#### API-004: Response Handling
**Success Response** (200 OK):
```json
{
  "rate": 0.9234,
  "from": "USD",
  "to": "EUR",
  "timestamp": 1707072000
}
```

**Error Responses**:
- **400 Bad Request**: Missing required parameters
  ```json
  { "error": "Missing required parameters: from and to" }
  ```
- **404 Not Found**: Currency not found in API response
  ```json
  { "error": "Exchange rate not found for {currency}" }
  ```
- **500 Internal Server Error**: API fetch failure
  ```json
  { "error": "Failed to fetch exchange rate" }
  ```

#### API-005: Error Handling Business Logic
- Log all errors to console for debugging
- Return user-friendly error messages
- Never expose internal API errors to end users
- Handle network failures gracefully
- Handle invalid JSON responses

---

## 5. State Management Requirements

### 5.1 Application State

#### ST-001: Amount State
- **Variable**: `amount` (string)
- **Initial Value**: "1"
- **Updates**: On user input, on currency swap
- **Validation**: Real-time validation on change

#### ST-002: Currency States
- **Variables**: `fromCurrency`, `toCurrency` (string)
- **Initial Values**: "USD", "EUR"
- **Updates**: On dropdown selection, on swap action
- **Validation**: Must match supported currency codes

#### ST-003: Result State
- **Variable**: `result` (string)
- **Initial Value**: "" (empty)
- **Updates**: After successful conversion
- **Format**: Numeric string with 2 decimal places

#### ST-004: Exchange Rate State
- **Variable**: `rate` (number | null)
- **Initial Value**: null
- **Updates**: After successful API call
- **Usage**: Used for real-time calculation when amount changes

#### ST-005: Loading State
- **Variable**: `loading` (boolean)
- **Initial Value**: false
- **Updates**: 
  - Set to `true` when API call starts
  - Set to `false` when API call completes (success or error)

#### ST-006: Error State
- **Variable**: `error` (string)
- **Initial Value**: "" (empty)
- **Updates**: 
  - Set on validation failure
  - Set on API error
  - Cleared on successful conversion or when starting new conversion

---

## 6. Business Logic Flow

### 6.1 Conversion Flow

```
1. User enters amount OR changes currency selection
   ↓
2. Validate amount (if provided)
   ├─ Invalid → Display error, stop
   └─ Valid → Continue
   ↓
3. Check if fromCurrency === toCurrency
   ├─ Yes → Set rate = 1, result = amount, skip API
   └─ No → Continue
   ↓
4. Set loading = true, clear error
   ↓
5. Call /api/convert?from={from}&to={to}
   ↓
6. Handle API response
   ├─ Success → Extract rate, calculate result, set states
   └─ Error → Set error message, clear result
   ↓
7. Set loading = false
   ↓
8. Display result (if successful)
```

### 6.2 Real-time Calculation Flow

```
1. User types in amount field
   ↓
2. Validate input format (regex: /^\d*\.?\d*$/)
   ├─ Invalid → Ignore input
   └─ Valid → Update amount state
   ↓
3. Check if rate exists and amount > 0
   ├─ Yes → Calculate: result = amount × rate
   └─ No → Clear result
   ↓
4. Update result display (if calculated)
```

### 6.3 Currency Swap Flow

```
1. User clicks swap button
   ↓
2. Store current values:
   - tempFrom = fromCurrency
   - tempTo = toCurrency
   - tempAmount = result (if exists) OR "1"
   ↓
3. Swap values:
   - fromCurrency = tempTo
   - toCurrency = tempFrom
   - amount = tempAmount
   ↓
4. Trigger automatic conversion (useEffect detects change)
   ↓
5. Animate swap button (rotate 180deg)
```

---

## 7. Data Formatting Rules

### 7.1 Number Formatting
- **Locale**: en-US
- **Minimum Decimal Places**: 2
- **Maximum Decimal Places**: 2 (for amounts), 4 (for exchange rates)
- **Thousands Separator**: Comma (,)
- **Decimal Separator**: Period (.)

**Examples**:
- `1000` → `1,000.00`
- `1234.5` → `1,234.50`
- `0.9234` → `0.9234` (exchange rate, 4 decimals)

### 7.2 Currency Display Format
- **Amount Display**: `{formatted_number} {currency_code}`
- **Rate Display**: `1 {from_code} = {rate} {to_code}`
- **Currency Selector**: `{flag} {code} - {name}`

---

## 8. User Experience Requirements

### 8.1 Responsive Design
- **Desktop**: Full-width converter (max 600px)
- **Mobile**: Stacked layout, full-width inputs
- **Tablet**: Optimized spacing and layout

### 8.2 Accessibility
- **ARIA Labels**: All interactive elements must have proper labels
- **Keyboard Navigation**: Full keyboard support
- **Screen Readers**: Semantic HTML structure
- **Color Contrast**: WCAG AA compliant

### 8.3 Performance
- **Initial Load**: < 2 seconds
- **API Response**: < 1 second (depends on external API)
- **UI Updates**: Instant (no perceived delay)
- **Animation**: Smooth 60fps transitions

---

## 9. Error Handling Requirements

### 9.1 Validation Errors
- **Invalid Amount**: Display immediately, prevent API call
- **Empty Amount**: Allow (for editing), show error only on blur if still empty

### 9.2 API Errors
- **Network Failure**: Display "Failed to fetch exchange rate"
- **Invalid Currency**: Display "Exchange rate not found for {currency}"
- **Server Error**: Display generic error message
- **Timeout**: Handle gracefully (if implemented)

### 9.3 User Feedback
- **Loading**: Show spinner and message
- **Success**: Display result prominently
- **Error**: Display error message with icon
- **Empty State**: Show placeholder or default values

---

## 10. Technical Constraints

### 10.1 Technology Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: CSS Modules
- **Runtime**: Node.js 18+

### 10.2 API Constraints
- **Rate Limiting**: Subject to exchangerate-api.com free tier
- **Caching**: No caching implemented (real-time rates)
- **Fallback**: No fallback API (single source)

### 10.3 Browser Support
- **Modern Browsers**: Chrome, Firefox, Safari, Edge (latest 2 versions)
- **Features Used**: 
  - CSS Grid/Flexbox
  - ES6+ JavaScript
  - Fetch API
  - CSS Custom Properties

---

## 11. Acceptance Criteria

### AC-001: Basic Conversion
**Given** a user enters 100 USD
**When** they select EUR as target currency
**Then** the converted amount should display correctly with current exchange rate

### AC-002: Same Currency
**Given** user selects USD as both source and target
**When** conversion is triggered
**Then** result should equal input amount and rate should be 1.0

### AC-003: Currency Swap
**Given** user has converted 100 USD to EUR
**When** they click swap button
**Then** currencies should swap and amount should update to EUR result

### AC-004: Input Validation
**Given** user enters invalid characters
**When** they type in amount field
**Then** invalid characters should be rejected

### AC-005: Real-time Updates
**Given** user changes currency selection
**When** new selection is made
**Then** conversion should automatically trigger without user action

### AC-006: Error Handling
**Given** API call fails
**When** conversion is attempted
**Then** error message should display and result should be cleared

### AC-007: Loading State
**Given** API call is in progress
**When** user views the interface
**Then** loading spinner and message should be visible

### AC-008: Formatting
**Given** conversion result is 1234.567
**When** result is displayed
**Then** it should be formatted as "1,234.57"

---

## 12. Future Enhancements (Out of Scope)

- Historical exchange rate data
- Currency charts and graphs
- Favorite currencies list
- Conversion history
- Multiple currency comparison
- Offline mode with cached rates
- Additional currency support
- API key support for premium rate providers
- Rate alerts and notifications

---

## 13. Glossary

- **Exchange Rate**: The value of one currency expressed in terms of another currency
- **Base Currency**: The currency used as the reference point for exchange rates (from currency)
- **Target Currency**: The currency to convert to (to currency)
- **ISO 4217**: International standard for currency codes (e.g., USD, EUR)
- **Real-time**: Data that is current and up-to-date, typically within minutes of market changes

---

## 14. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-04 | Development Team | Initial requirements specification |
