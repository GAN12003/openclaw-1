"use strict";

/**
 * Safety rules for economic actions. No autonomous spending or signing.
 */
function getPolicy() {
  return {
    autonomous_spending: false,
    signing_enabled: false,
    approval_required: true,
    max_monthly_budget: process.env.PICLAW_MONTHLY_BUDGET || null,
  };
}

module.exports = { getPolicy };
