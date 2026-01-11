#!/bin/bash

set -e

cd "$(dirname "$0")/.."

echo "=========================================="
echo "Running All Tests"
echo "=========================================="
echo ""

echo "=== 1. Running Unit Tests ==="
if yarn test; then
  echo "✓ Unit tests passed"
else
  echo "✗ Unit tests failed"
  UNIT_TEST_EXIT_CODE=1
fi
echo ""

echo "=== 2. Running Integration Tests ==="
if yarn test:integration; then
  echo "✓ Integration tests passed"
else
  echo "✗ Integration tests failed"
  INTEGRATION_TEST_EXIT_CODE=1
fi
echo ""

echo "=== 3. Running E2E Tests ==="
if yarn test:e2e; then
  echo "✓ E2E tests passed"
else
  echo "✗ E2E tests failed"
  E2E_TEST_EXIT_CODE=1
fi
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="

if [ -z "$UNIT_TEST_EXIT_CODE" ] && [ -z "$INTEGRATION_TEST_EXIT_CODE" ] && [ -z "$E2E_TEST_EXIT_CODE" ]; then
  echo "✓ All tests passed!"
  exit 0
else
  echo "✗ Some tests failed:"
  [ -n "$UNIT_TEST_EXIT_CODE" ] && echo "  - Unit tests"
  [ -n "$INTEGRATION_TEST_EXIT_CODE" ] && echo "  - Integration tests"
  [ -n "$E2E_TEST_EXIT_CODE" ] && echo "  - E2E tests"
  exit 1
fi

