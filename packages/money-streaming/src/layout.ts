const BufferLayout = require("buffer-layout");

/**
 * Public key layout
 */
export const publicKey = (property: string = "publicKey"): Object => {
  return BufferLayout.blob(32, property);
};

/**
 * 64bit unsigned value layout
 */
export const uint64 = (property: string = "uint64"): Object => {
  return BufferLayout.blob(8, property);
};

/**
 * String layout
 */
export const string = (property: string = "string"): Object => {
  return BufferLayout.blob(32, property);
};

/**
 * Stream layout
 */
export const streamV0Layout: typeof BufferLayout.Structure = BufferLayout.struct([
  BufferLayout.u8("initialized"),
  string("stream_name"),
  publicKey("treasurer_address"),
  BufferLayout.f64("rate_amount"),
  uint64("rate_interval_in_seconds"),
  BufferLayout.nu64("funded_on_utc"),
  BufferLayout.nu64("start_utc"),
  uint64("rate_cliff_in_seconds"),
  BufferLayout.f64("cliff_vest_amount"),
  BufferLayout.f64("cliff_vest_percent"),
  publicKey("beneficiary_address"),
  publicKey("stream_associated_token"),
  publicKey("treasury_address"),
  BufferLayout.nu64("escrow_estimated_depletion_utc"),
  BufferLayout.f64("total_deposits"),
  BufferLayout.f64("total_withdrawals"),
  BufferLayout.f64("escrow_vested_amount_snap"),
  uint64("escrow_vested_amount_snap_block_height"),
  uint64("escrow_vested_amount_snap_block_time"),
  uint64("stream_resumed_block_height"),
  uint64("stream_resumed_block_time"),
  uint64("auto_pause_in_seconds"),
]);

/**
 * StreamV2 layout
 */
export const streamLayout: typeof BufferLayout.Structure = BufferLayout.struct([
  BufferLayout.u8("initialized"),
  string("stream_name"),
  publicKey("treasurer_address"),
  BufferLayout.f64("rate_amount"),
  uint64("rate_interval_in_seconds"),
  uint64("funded_on_utc"),
  uint64("start_utc"),
  uint64("rate_cliff_in_seconds"),
  BufferLayout.f64("cliff_vest_amount"),
  BufferLayout.f64("cliff_vest_percent"),
  publicKey("beneficiary_address"),
  publicKey("beneficiary_associated_token"),
  publicKey("treasury_address"),
  uint64("escrow_estimated_depletion_utc"),
  BufferLayout.f64("allocation_reserved"),
  BufferLayout.f64("allocation"),  
  BufferLayout.f64("escrow_vested_amount_snap"),
  uint64("escrow_vested_amount_snap_slot"),
  uint64("escrow_vested_amount_snap_block_time"),
  uint64("stream_resumed_slot"),
  uint64("stream_resumed_block_time"),
  uint64("auto_pause_in_seconds"),
]);

/**
 * Create stream instruction layout
 */
export const createStreamLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("tag"),
    string("stream_name"),
    BufferLayout.f64("rate_amount"),
    uint64("rate_interval_in_seconds"),
    BufferLayout.f64("allocation_reserved"),
    BufferLayout.f64("allocation"),
    uint64("funded_on_utc"),
    uint64("start_utc"),
    uint64("rate_cliff_in_seconds"),
    BufferLayout.f64("cliff_vest_amount"),
    BufferLayout.f64("cliff_vest_percent"),
    uint64("auto_off_clock_in_seconds"),
  ]);

/**
 * Add funds instruction layout
 */
export const addFundsLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("tag"),
    BufferLayout.f64("amount"),
    BufferLayout.u8("allocation_type"),
    publicKey("allocation_stream_address")
  ]);

/**
 * Withdraw instruction layout
 */
export const withdrawLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("tag"),
    BufferLayout.f64("amount"),
  ]);

/**
 * Pause or resume stream instruction layout
 */
export const pauseOrResumeLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([BufferLayout.u8("tag")]);

/**
 * Stream Terms layout
 */
export const streamTermsLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("initialized"),
    publicKey("proposed_by"),
    publicKey("stream_id"),
    string("stream_name"),
    publicKey("treasurer_address"),
    publicKey("beneficiary_address"),
    publicKey("associated_token_address"),
    BufferLayout.f64("rate_amount"),
    uint64("rate_interval_in_seconds"),
    uint64("rate_cliff_in_seconds"),
    BufferLayout.f64("cliff_vest_amount"),
    BufferLayout.f64("cliff_vest_percent"),
    uint64("auto_pause_in_seconds"),
  ]);

/**
 * Propose update instruction layout
 */
export const proposeUpdateLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("tag"),
    publicKey("proposed_by"),
    string("stream_name"),
    publicKey("treasurer_address"),
    publicKey("beneficiary_address"),
    publicKey("associated_token_address"),
    BufferLayout.f64("rate_amount"),
    uint64("rate_interval_in_seconds"),
    uint64("rate_cliff_in_seconds"),
    BufferLayout.f64("cliff_vest_amount"),
    BufferLayout.f64("cliff_vest_percent"),
    uint64("auto_pause_in_seconds"),
  ]);

/**
 * Answer update instruction layout
 */
export const answerUpdateLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("tag"), 
    BufferLayout.u8("approve")
  ]);

/**
 * Close stream instruction layout
 */
export const closeStreamLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("tag"),
    BufferLayout.u8("auto_close_treasury")
  ]);

/**
 * Treasury layout
 */
export const treasuryV0Layout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("initialized"),
    uint64("treasury_block_height"),
    publicKey("treasury_mint_address"),
    publicKey("treasury_base_address"),
  ]);

/**
 * TreasuryV2 layout
 */
export const treasuryLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("initialized"),
    uint64("slot"),
    publicKey("treasurer_address"),
    publicKey("associated_token_address"),
    publicKey("mint_address"),
    string("label"),
    BufferLayout.f64("balance"),
    BufferLayout.f64("allocation_reserved"),
    BufferLayout.f64("allocation_committed"),
    uint64("streams_amount"),
    uint64("created_on_utc"),
    BufferLayout.f64("depletion_rate"),
    BufferLayout.u8("type"),
  ]);

/**
 * Create Treasury layout
 */
export const createTreasuryLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("tag"),
    uint64("slot"),
    string("label"),
    BufferLayout.u8("treasury_type")
  ]);

/**
 * Close treasury instruction layout
 */
export const closeTreasuryLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("tag")
  ]);

/**
 * Upgrade treasury instruction layout
 */
 export const upgradeTreasuryLayout: typeof BufferLayout.Structure =
  BufferLayout.struct([
    BufferLayout.u8("tag")
  ]);
