export module Layout {

    const BufferLayout = require('buffer-layout');

    /**
     * Public key layout
     */
    export const publicKey = (property: string = 'publicKey'): Object => {
        return BufferLayout.blob(32, property);
    };

    /**
     * 64bit unsigned value layout
     */
    export const uint64 = (property: string = 'uint64'): Object => {
        return BufferLayout.blob(8, property);
    };

    /**
     * String layout
     */
    export const string = (property: string = 'string'): Object => {
        return BufferLayout.blob(32, property);
    };

    /**
     * Stream layout
     */
    export const streamLayout: typeof BufferLayout.Structure = BufferLayout.struct([
        BufferLayout.u8('initialized'),
        string('stream_name'),
        publicKey('treasurer_address'),
        BufferLayout.f64('rate_amount'),
        uint64('rate_interval_in_seconds'),
        uint64('start_utc'),
        uint64('rate_cliff_in_seconds'),
        BufferLayout.f64('cliff_vest_amount'),
        BufferLayout.f64('cliff_vest_percent'),
        publicKey('beneficiary_withdrawal_address'),
        publicKey('beneficiary_associated_token_address'),
        publicKey('treasury_address'),
        uint64('escrow_estimated_depletion_utc'),
        BufferLayout.f64('total_deposits'),
        BufferLayout.f64('total_withdrawals')
    ]);

    /**
     * Create stream instruction layout
     */
    export const createStreamLayout: typeof BufferLayout.Structure = BufferLayout.struct([
        BufferLayout.u8('tag'),
        string('stream_name'),
        publicKey('stream_address'),
        publicKey('treasury_address'),
        publicKey('beneficiary_withdrawal_address'),
        BufferLayout.f64('funding_amount'),
        BufferLayout.f64('rate_amount'),
        uint64('rate_interval_in_seconds'),
        uint64('start_utc'),
        uint64('rate_cliff_in_seconds'),
        BufferLayout.f64('cliff_vest_amount'),
        BufferLayout.f64('cliff_vest_percent')
    ]);

    /**
     * Add funds instruction layout
     */
    export const addFundsLayout: typeof BufferLayout.Structure = BufferLayout.struct([
        BufferLayout.u8('tag'),
        publicKey('contribution_token_address'),
        BufferLayout.f64('contribution_amount')
    ]);

    /**
     * Withdraw instruction layout
     */
    export const withdrawLayout: typeof BufferLayout.Structure = BufferLayout.struct([
        BufferLayout.u8('tag'),
        BufferLayout.f64('withdrawal_amount')
    ]);

}

