# Testing Strategy & Practices

## Test Framework & Configuration

### Vitest 3.2.1
- **Purpose**: Unit and integration testing
- **Configuration**: `vitest.config.ts` in project root
- **Environment**: JSDOM for DOM simulation, Node.js for server-side tests
- **Speed**: Significantly faster than Jest (used previously)

### Playwright
- **Purpose**: End-to-end (E2E) browser testing
- **Configuration**: Playwright config for browser automation
- **Browsers**: Chromium, Firefox, WebKit testing
- **Headless Mode**: Enabled by default, visual mode for debugging

## Test File Organization

### Colocation Pattern
- Test files live alongside source files
- File naming: `*.test.ts`, `*.test.tsx`
- Example structure:
  ```
  src/components/Button.tsx
  src/components/Button.test.tsx
  ```

### Current Coverage
- **24+ test files** across the codebase
- **~3,089 lines** of test code
- Test types: Unit, Integration, E2E

## Test Structure & Patterns

### Standard Test Format
```typescript
describe('ComponentName', () => {
  it('should render correctly', () => {
    // test implementation
  })

  it('should handle user interaction', () => {
    // test implementation
  })
})
```

### Test Categories

#### Unit Tests
- Individual function testing
- Component rendering in isolation
- Hook behavior verification
- Utility function validation

#### Integration Tests
- Multiple components working together
- Firebase data operations
- API route testing
- State management flows

#### E2E Tests
- Full user workflows (Playwright)
- Critical user paths:
  - Sheet music upload
  - Setlist creation
  - PDF generation
  - User authentication
  - Performance mode interactions

## Mocking & Test Utilities

### Mocking Pattern
```typescript
vi.mock('@/lib/some-module', () => ({
  someFunction: vi.fn(),
}))

// Use mocked function in tests
const mocked = vi.mocked(someFunction)
```

### Mock Types
- Firebase Firestore operations
- Google Drive API calls
- Gemini API responses
- HTTP requests
- File system operations (for Node.js tests)

### Test Fixtures & Factories
- **Purpose**: Reusable test data
- **Location**: Often in `__mocks__/` or `fixtures/` directories
- **Examples**:
  - Mock user objects
  - Sample sheet music metadata
  - Firestore document factories
  - API response fixtures

## Async Testing Patterns

### Promise Handling
```typescript
it('should load data', async () => {
  const data = await fetchData()
  expect(data).toBeDefined()
})
```

### Firebase Operations
- Real-time listener testing with vi.fake timers
- Async document reads/writes
- Transaction testing with mocked responses

### Waiting for UI Updates
- `waitFor()` for async state updates
- `screen.findBy*` for dynamic element appearance
- Proper cleanup with `afterEach()`

## Testing Best Practices

### Descriptive Test Names
- Clear intent: "should validate email format"
- Not: "test input"
- Names read as documentation

### AAA Pattern (Arrange-Act-Assert)
```typescript
// Arrange: Set up test data
const user = createMockUser()

// Act: Perform action
const result = validateUser(user)

// Assert: Verify outcome
expect(result).toBeTruthy()
```

### Parameterized Tests
```typescript
it.each([
  ['test@example.com', true],
  ['invalid-email', false],
])('should validate email: %s', (email, expected) => {
  expect(isValidEmail(email)).toBe(expected)
})
```

### Test Independence
- Each test is isolated
- No shared state between tests
- `beforeEach()` / `afterEach()` for setup/cleanup
- Firebase emulator or mocks prevent real DB calls

## Firestore Testing

### Mocking Firestore
```typescript
vi.mock('firebase/firestore', () => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
}))
```

### Testing Queries
- Mock query responses
- Test real-time listeners
- Verify update operations
- Error handling for failed operations

## API Route Testing

### Testing Next.js API Routes
```typescript
import { createMocks } from 'node-mocks-http'

it('should handle POST request', () => {
  const { req, res } = createMocks({
    method: 'POST',
    body: { /* test data */ }
  })

  handler(req, res)
  expect(res._getStatusCode()).toBe(200)
})
```

### Testing Protected Routes
- Mock Firebase authentication context
- Test permission validation
- Verify token verification
- Error responses for unauthorized access

## Component Testing

### React Component Tests
- Render with React Testing Library
- Query by role, label, or test ID
- Test user interactions (click, type)
- Verify state changes and re-renders

### Sheet Music Components
- Mock opensheetmusicdisplay rendering
- Test annotation interactions
- Verify PDF display logic
- Performance mode toggle testing

## Coverage & Gaps

### Tested Areas
- Core utilities and helpers
- State management (Zustand stores)
- API route authorization
- Component rendering logic
- Firebase integration

### Known Testing Gaps
- Some UI components have incomplete coverage
- Complex PDF generation workflows need more E2E tests
- Real-time collaboration features need integration tests
- Performance mode under load testing

## Running Tests

### Commands
```bash
npm test              # Run all tests once
npm run test:watch   # Watch mode for development
npm run test:e2e     # Run Playwright E2E tests
```

### Test Execution
- Vitest runs in parallel by default
- E2E tests run sequentially
- Timeouts: Configurable per test type
- Reporters: Console output with failure details

## CI/CD Integration

### GitHub Actions (if configured)
- Tests run on pull requests
- Build fails if tests fail
- Coverage reports generated
- E2E tests against staging environment

## Debugging Tests

### Debug Mode
```bash
# Playwright inspector
npx playwright test --debug

# Vitest watch with debugging
npm run test:watch
```

### Console Logging
- Use `console.log()` in tests
- Captured in test output
- Filter by test name in watch mode

### Checking Coverage
```bash
# Coverage not currently configured
# Could add: vitest --coverage
```
