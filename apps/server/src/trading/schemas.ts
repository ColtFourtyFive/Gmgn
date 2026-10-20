// Request schemas of the trading API (docs/API.md, "Trading"). Cross-field
// rules live in superRefine so a 400 names the offending field.
//
// One module per area under ./schemas/ (this file only re-exports them):
//   common     field validators, the exit-strategy schema, PATCH bodies
//   swap       quote, initials, swap
//   orders     condition orders
//   portfolio  portfolio and activity queries
//   copy       copy-trade tasks
//   sniper     sniper tasks
//   alerts     alerts, signal subscriptions, holding alerts
//   launch     token launch
// Add a schema to the module of its area; a new area gets its own module and a line here.

export { MAX_STRATEGY_ORDERS, patchSchema } from './schemas/common';
export * from './schemas/swap';
export * from './schemas/orders';
export * from './schemas/portfolio';
export * from './schemas/copy';
export * from './schemas/sniper';
export * from './schemas/alerts';
export * from './schemas/launch';
