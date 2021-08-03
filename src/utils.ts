import base58 from "bs58";
import base64 from "base64-js";

/**
 * Solana
 */
import { Token, AccountInfo, MintInfo, AccountLayout, MintLayout, TOKEN_PROGRAM_ID, u64 } from '@solana/spl-token';
import { TokenInfo, TokenListContainer, TokenListProvider } from "@solana/spl-token-registry";
import {
    Commitment,
    Connection,
    Finality,
    ParsedConfirmedTransaction,
    PartiallyDecodedInstruction,
    PublicKey,
    Transaction,
    LAMPORTS_PER_SOL,
    TransactionInstruction,
    SystemProgram

} from "@solana/web3.js";

/**
 * Serum
 */
import { Swap } from "@project-serum/swap";
import { Provider, Wallet } from "@project-serum/anchor";

/**
 * MSP
 */
import * as Layout from "./layout";
import * as Instructions from './instructions';
import { MEAN_TOKEN_LIST } from "./token-list";
import { u64Number } from "./u64n";
import {
    Constants,
    MSP_ACTIONS,
    StreamActivity,
    StreamInfo,
    StreamTermsInfo,
    TransactionFees,
    TreasuryInfo

} from './types';
import { Account } from "@solana/web3.js";

String.prototype.toPublicKey = function (): PublicKey {
    return new PublicKey(this.toString());
}

let defaultStreamTermsInfo: StreamTermsInfo = {
    id: undefined,
    initialized: false,
    streamId: undefined,
    streamMemo: "",
    treasurerAddress: undefined,
    beneficiaryAddress: undefined,
    associatedToken: undefined,
    rateAmount: 0,
    rateIntervalInSeconds: 0,
    rateCliffInSeconds: 0,
    cliffVestAmount: 0,
    cliffVestPercent: 0,
    autoPauseInSeconds: 0
}

let defaultStreamInfo: StreamInfo = {
    id: undefined,
    initialized: false,
    memo: "",
    treasurerAddress: undefined,
    rateAmount: 0,
    rateIntervalInSeconds: 0,
    fundedOnUtc: undefined,
    startUtc: undefined,
    rateCliffInSeconds: 0,
    cliffVestAmount: 0,
    cliffVestPercent: 0,
    beneficiaryAddress: undefined,
    associatedToken: undefined,
    escrowVestedAmount: 0,
    escrowUnvestedAmount: 0,
    treasuryAddress: undefined,
    escrowEstimatedDepletionUtc: undefined,
    totalDeposits: 0,
    totalWithdrawals: 0,
    escrowVestedAmountSnap: 0,
    escrowVestedAmountSnapBlockHeight: 0,
    escrowVestedAmountSnapBlockTime: 0,
    streamResumedBlockHeight: 0,
    streamResumedBlockTime: 0,
    autoPauseInSeconds: 0,
    isStreaming: false,
    isUpdatePending: false,
    transactionSignature: undefined,
    blockTime: 0
}

let defaultTreasuryInfo: TreasuryInfo = {
    id: undefined,
    initialized: false,
    treasuryBlockHeight: 0,
    treasuryMintAddress: undefined,
    treasuryBaseAddress: undefined
}

let defaultStreamActivity: StreamActivity = {
    signature: '',
    initializer: '',
    action: '',
    amount: 0,
    mint: '',
    blockTime: 0,
    utcDate: ''
}

const parseStreamData = (
    streamId: PublicKey,
    streamData: Buffer,
    currentBlockTime: number,
    friendly: boolean = true

): StreamInfo => {

    let stream: StreamInfo = defaultStreamInfo;
    let decodedData = Layout.streamLayout.decode(streamData);
    let fundedOnUtc = new Date(decodedData.funded_on_utc);
    let startDateUtc = new Date(decodedData.start_utc);
    let escrowVestedAmountSnapBlockHeight = parseFloat(u64Number.fromBuffer(decodedData.escrow_vested_amount_snap_block_height).toString());
    let escrowVestedAmountSnapBlockTime = parseFloat(u64Number.fromBuffer(decodedData.escrow_vested_amount_snap_block_time).toString());
    let streamResumedBlockHeight = parseFloat(u64Number.fromBuffer(decodedData.stream_resumed_block_height).toString());
    let streamResumedBlockTime = parseFloat(u64Number.fromBuffer(decodedData.stream_resumed_block_time).toString());
    let autoPauseInSeconds = parseFloat(u64Number.fromBuffer(decodedData.auto_pause_in_seconds).toString());
    let rateIntervalInSeconds = parseFloat(u64Number.fromBuffer(decodedData.rate_interval_in_seconds).toString());
    let isStreaming = streamResumedBlockTime >= escrowVestedAmountSnapBlockTime ? 1 : 0;
    let lastTimeSnap = isStreaming === 1 ? streamResumedBlockTime : escrowVestedAmountSnapBlockTime;
    let escrowVestedAmount = 0.0;
    let rateAmount = decodedData.rate_amount;

    if (rateIntervalInSeconds === 0) {
        rateIntervalInSeconds = 1;
    }

    let rate = rateAmount && rateIntervalInSeconds ? (rateAmount / rateIntervalInSeconds * isStreaming) : 0;

    if (rateAmount === 0) {
        rateAmount = decodedData.total_deposits - decodedData.total_withdrawals;
        rate = rateAmount && rateIntervalInSeconds ? (rateAmount / rateIntervalInSeconds) : 0;
    }

    const elapsedTime = currentBlockTime - lastTimeSnap;
    const beneficiaryAssociatedToken = new PublicKey(decodedData.stream_associated_token);
    const associatedToken = (friendly ? beneficiaryAssociatedToken.toBase58() : beneficiaryAssociatedToken);

    if (currentBlockTime >= lastTimeSnap) {
        escrowVestedAmount = decodedData.escrow_vested_amount_snap + rate * elapsedTime;

        if (escrowVestedAmount >= decodedData.total_deposits - decodedData.total_withdrawals) {
            escrowVestedAmount = decodedData.total_deposits - decodedData.total_withdrawals;
        }
    }

    let escrowUnvestedAmount = decodedData.total_deposits - decodedData.total_withdrawals - escrowVestedAmount;
    let escrowEstimatedDepletionDateUtc = new Date(decodedData.escrow_estimated_depletion_utc);

    if (decodedData.escrow_estimated_depletion_utc === 0) {
        let depletionTimeInSeconds = rate ? (decodedData.total_deposits / rate) : 0;
        escrowEstimatedDepletionDateUtc.setTime(startDateUtc.getTime() + depletionTimeInSeconds * 1000);
    }

    let nameBuffer = Buffer
        .alloc(decodedData.stream_name.length, decodedData.stream_name)
        .filter(function (elem, index) {
            return elem !== 0;
        });

    const id = friendly !== undefined ? streamId.toBase58() : streamId;
    const treasurerAddress = new PublicKey(decodedData.treasurer_address);
    const beneficiaryAddress = new PublicKey(decodedData.beneficiary_address);
    const treasuryAddress = new PublicKey(decodedData.treasury_address);

    Object.assign(stream, { id: id }, {
        initialized: decodedData.initialized ? true : false,
        memo: new TextDecoder().decode(nameBuffer),
        treasurerAddress: friendly !== undefined ? treasurerAddress.toBase58() : treasurerAddress,
        rateAmount: decodedData.rate_amount,
        rateIntervalInSeconds: rateIntervalInSeconds,
        fundedOnUtc: fundedOnUtc.toUTCString(),
        startUtc: startDateUtc.toUTCString(),
        rateCliffInSeconds: parseFloat(u64Number.fromBuffer(decodedData.rate_cliff_in_seconds).toString()),
        cliffVestAmount: decodedData.cliff_vest_amount,
        cliffVestPercent: decodedData.cliff_vest_percent,
        beneficiaryAddress: friendly !== undefined ? beneficiaryAddress.toBase58() : beneficiaryAddress,
        associatedToken: associatedToken,
        escrowVestedAmount: escrowVestedAmount,
        escrowUnvestedAmount: escrowUnvestedAmount,
        treasuryAddress: friendly !== undefined ? treasuryAddress.toBase58() : treasuryAddress,
        escrowEstimatedDepletionUtc: escrowEstimatedDepletionDateUtc.toUTCString(),
        totalDeposits: decodedData.total_deposits,
        totalWithdrawals: decodedData.total_withdrawals,
        escrowVestedAmountSnap: decodedData.escrow_vested_amount_snap,
        escrowVestedAmountSnapBlockHeight: escrowVestedAmountSnapBlockHeight,
        escrowVestedAmountSnapBlockTime: escrowVestedAmountSnapBlockTime,
        streamResumedBlockHeight: streamResumedBlockHeight,
        streamResumedBlockTime: streamResumedBlockTime,
        autoPauseInSeconds: autoPauseInSeconds,
        isStreaming: (isStreaming === 1 && escrowVestedAmount < (decodedData.total_deposits - decodedData.total_withdrawals)) ? true : false,
        isUpdatePending: false,
        transactionSignature: '',
        blockTime: 0
    });

    return stream;
}

const parseStreamTermsData = (
    id: PublicKey,
    streamTermData: Buffer,
    friendly: boolean = true

): StreamTermsInfo => {

    let streamTerms: StreamTermsInfo = defaultStreamTermsInfo;
    let decodedData = Layout.streamTermsLayout.decode(streamTermData);
    let autoPauseInSeconds = parseFloat(u64Number.fromBuffer(decodedData.auto_pause_in_seconds).toString());
    let rateIntervalInSeconds = parseFloat(u64Number.fromBuffer(decodedData.rate_interval_in_seconds).toString());

    const beneficiaryAssociatedToken = new PublicKey(decodedData.associated_token_address);
    const associatedToken = (friendly ? beneficiaryAssociatedToken.toBase58() : beneficiaryAssociatedToken);

    let nameBuffer = Buffer
        .alloc(decodedData.stream_name.length, decodedData.stream_name)
        .filter(function (elem, index) {
            return elem !== 0;
        });

    const termsId = friendly !== undefined ? id.toBase58() : id;
    const treasurerAddress = new PublicKey(decodedData.treasurer_address);
    const beneficiaryAddress = new PublicKey(decodedData.beneficiary_address);

    Object.assign(streamTerms, { id: termsId }, {
        initialized: decodedData.initialized ? true : false,
        memo: new TextDecoder().decode(nameBuffer),
        treasurerAddress: friendly !== undefined ? treasurerAddress.toBase58() : treasurerAddress,
        beneficiaryAddress: friendly !== undefined ? beneficiaryAddress.toBase58() : beneficiaryAddress,
        associatedToken: associatedToken,
        rateAmount: decodedData.rate_amount,
        rateIntervalInSeconds: rateIntervalInSeconds,
        rateCliffInSeconds: parseFloat(u64Number.fromBuffer(decodedData.rate_cliff_in_seconds).toString()),
        cliffVestAmount: decodedData.cliff_vest_amount,
        cliffVestPercent: decodedData.cliff_vest_percent,
        autoPauseInSeconds: autoPauseInSeconds
    });

    return streamTerms;
}

const parseActivityData = (
    signature: string,
    tx: ParsedConfirmedTransaction,
    tokens: TokenInfo[],
    friendly: boolean = true

): StreamActivity => {

    let streamActivity: StreamActivity = defaultStreamActivity;
    let signer = tx.transaction.message.accountKeys.filter(a => a.signer)[0];
    let lastIxIndex = tx.transaction.message.instructions.length - 1;
    let lastIx = tx.transaction.message.instructions[lastIxIndex] as PartiallyDecodedInstruction;
    let buffer = base58.decode(lastIx.data);
    let actionIndex = buffer.readUInt8(0);

    if ((actionIndex >= 1 && actionIndex <= 3) || actionIndex === 10 /*Transfer*/) {
        let blockTime = (tx.blockTime as number) * 1000; // mult by 1000 to add milliseconds
        let action = actionIndex === 3 ? 'withdrew' : 'deposited';
        let layoutBuffer = Buffer.alloc(buffer.length, buffer);
        let data: any,
            amount = 0;

        if (actionIndex === 1) {
            data = Layout.addFundsLayout.decode(layoutBuffer);
            amount = data.contribution_amount;
        } else if (actionIndex === 2) {
            // data = Layout.recoverFunds.decode(layoutBuffer);
            // amount = data.recover_amount;
        } else if (actionIndex === 3) {
            data = Layout.withdrawLayout.decode(layoutBuffer);
            amount = data.withdrawal_amount;
        } else { // Transfer
            data = Layout.transferLayout.decode(layoutBuffer);
            amount = data.amount;
        }

        let mint: PublicKey | string;

        if (tx.meta?.preTokenBalances?.length) {
            mint = (friendly === true ? tx.meta.preTokenBalances[0].mint : new PublicKey(tx.meta.preTokenBalances[0].mint));
        } else if (tx.meta?.postTokenBalances?.length) {
            mint = (friendly === true ? tx.meta.postTokenBalances[0].mint : new PublicKey(tx.meta.postTokenBalances[0].mint));
        } else {
            mint = 'Unknown Token';
        }

        let tokenInfo = tokens.find((t) => t.address === mint);

        Object.assign(streamActivity, {
            signature: signature,
            initializer: (friendly === true ? signer.pubkey.toBase58() : signer.pubkey),
            blockTime: blockTime,
            utcDate: new Date(blockTime).toUTCString(),
            action: action,
            amount: amount,
            mint: !tokenInfo ? mint : tokenInfo.address
        });
    }

    return streamActivity;
}

const parseTreasuryData = (
    id: PublicKey,
    treasuryData: Buffer,
    friendly: boolean = true

): TreasuryInfo => {

    let treasuryInfo: TreasuryInfo = defaultTreasuryInfo;
    let decodedData = Layout.treasuryLayout.decode(treasuryData);

    const treasuryId = friendly !== undefined ? id.toBase58() : id;
    const treasuryBlockHeight = parseFloat(u64Number.fromBuffer(decodedData.treasury_block_height).toString());
    const treasuryMint = new PublicKey(decodedData.treasury_mint_address);
    const treasuryMintAddress = (friendly ? treasuryMint.toBase58() : treasuryMint);
    const treasuryFrom = new PublicKey(decodedData.treasury_base_address);
    const treasuryFromAddress = (friendly ? treasuryFrom.toBase58() : treasuryFrom);

    Object.assign(treasuryInfo, { id: treasuryId }, {
        initialized: decodedData.initialized ? true : false,
        treasuryBlockHeight,
        treasuryMintAddress,
        treasuryFromAddress
    });

    return treasuryInfo;
}

export const getStream = async (
    connection: Connection,
    id: PublicKey,
    commitment?: any,
    friendly: boolean = true

): Promise<StreamInfo> => {

    let stream;
    let accountInfo = await connection.getAccountInfo(id, commitment);

    if (accountInfo?.data !== undefined && accountInfo?.data.length === Layout.streamLayout.span) {

        let signatures = await connection.getConfirmedSignaturesForAddress2(id, {}, 'confirmed');

        if (signatures.length > 0) {

            let slot = await connection.getSlot(commitment);
            let currentBlockTime = await connection.getBlockTime(slot);

            stream = Object.assign({}, parseStreamData(
                id,
                accountInfo?.data,
                currentBlockTime as number,
                friendly
            ));

            stream.transactionSignature = signatures[0].signature;
            stream.blockTime = signatures[0].blockTime as number;

            let terms = await getStreamTerms(
                accountInfo.owner,
                connection,
                stream.id as PublicKey
            );

            stream.isUpdatePending = terms !== undefined && terms.streamId === stream.id;
        }
    }

    return stream as StreamInfo;
}

export const getStreamTerms = async (
    programId: PublicKey,
    connection: Connection,
    streamId: PublicKey,
    commitment?: any,
    friendly: boolean = true

): Promise<StreamTermsInfo | undefined> => {

    let terms: StreamTermsInfo | undefined;
    const accounts = await connection.getProgramAccounts(programId, commitment);

    if (accounts === null || !accounts.length) {
        return terms;
    }

    for (let item of accounts) {
        if (item.account.data !== undefined && item.account.data.length === Layout.streamTermsLayout.span) {

            let info = Object.assign({}, parseStreamTermsData(
                item.pubkey,
                item.account.data,
                friendly
            ));

            if (streamId.toBase58() === info.streamId) {
                terms = info;
                break;
            }
        }
    }

    return terms;
}

export async function listStreams(
    connection: Connection,
    programId: PublicKey,
    treasurer?: PublicKey | undefined,
    beneficiary?: PublicKey | undefined,
    commitment?: any,
    friendly: boolean = true

): Promise<StreamInfo[]> {

    let streams: StreamInfo[] = [];
    const accounts = await connection.getProgramAccounts(programId, commitment);

    if (accounts === null || !accounts.length) {
        return streams;
    }

    let slot = await connection.getSlot(commitment);
    let currentBlockTime = await connection.getBlockTime(slot);

    for (let item of accounts) {
        if (item.account.data !== undefined && item.account.data.length === Layout.streamLayout.span) {

            let included = false;
            let info = Object.assign({}, parseStreamData(
                item.pubkey,
                item.account.data,
                currentBlockTime as number,
                friendly
            ));

            if ((treasurer && treasurer.toBase58() === info.treasurerAddress) || !treasurer) {
                included = true;
            } else if ((beneficiary && beneficiary.toBase58() === info.beneficiaryAddress) || !beneficiary) {
                included = true;
            }

            if (included && (info.startUtc as Date) !== undefined) {

                let startDateUtc = new Date(info.startUtc as string);
                let threeDaysAgo = new Date();
                threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

                if (startDateUtc.getTime() > threeDaysAgo.getTime()) {

                    let signatures = await connection.getConfirmedSignaturesForAddress2(
                        (friendly ? (info.id as string).toPublicKey() : (info.id as PublicKey)),
                        {}, commitment
                    );

                    if (signatures.length > 0) {
                        info.blockTime = signatures[0].blockTime as number;
                        info.transactionSignature = signatures[0].signature
                    }
                }
            }

            if (included) {
                streams.push(info);
            }

        }
    }

    let orderedStreams = streams.sort((a, b) => (b.blockTime - a.blockTime));

    return orderedStreams;
}

export async function getStreamContributors(
    connection: Connection,
    id: PublicKey,
    commitment?: any

): Promise<PublicKey[]> {

    let contributors: PublicKey[] = [];
    let commitmentValue = commitment !== undefined ? commitment as Finality : 'confirmed';
    let signatures = await connection.getConfirmedSignaturesForAddress2(id, {}, commitmentValue);

    for (let sign of signatures) {
        let tx = await connection.getParsedConfirmedTransaction(sign.signature, commitmentValue);

        if (tx !== null) {
            let lastIxIndex = tx.transaction.message.instructions.length - 1;
            let lastIx = tx.transaction.message.instructions[lastIxIndex] as PartiallyDecodedInstruction;

            if (lastIx.accounts.length) {
                contributors.push(lastIx.accounts[0]);
            }
        }
    }

    return contributors;
}

export async function listStreamActivity(
    connection: Connection,
    cluster: string | number,
    streamId: PublicKey,
    commitment?: Commitment | string,
    friendly: boolean = true

): Promise<any[]> {

    let activity: any = [];
    let commitmentValue = commitment !== undefined ? commitment as Finality : 'confirmed';
    let signatures = await connection.getConfirmedSignaturesForAddress2(streamId, {}, commitmentValue);
    let tokenList = await getTokenList(cluster);

    for (let sign of signatures) {
        let tx = await connection.getParsedConfirmedTransaction(sign.signature, commitmentValue);

        if (tx !== null) {
            activity.push(Object.assign({}, parseActivityData(
                sign.signature,
                tx,
                tokenList,
                friendly
            )));
        }
    }

    return activity.sort((a: { blockTime: number; }, b: { blockTime: number; }) => (b.blockTime - a.blockTime));
}

export async function getTreasury(
    programId: PublicKey,
    connection: Connection,
    id: PublicKey,
    commitment?: any,
    friendly: boolean = true

): Promise<TreasuryInfo> {

    let treasury;
    const accounts = await connection.getProgramAccounts(programId, commitment);

    if (accounts.length) {

        for (let item of accounts) {
            if (item.account.data !== undefined && item.account.data.length === Layout.treasuryLayout.span) {

                let info = Object.assign({}, parseTreasuryData(
                    item.pubkey,
                    item.account.data,
                    friendly
                ));

                if (id.toBase58() === info.id) {
                    treasury = info;
                    break;
                }
            }
        }
    }

    return treasury as TreasuryInfo;
}

export async function getTreasuryMints(
    connection: Connection,
    programId: PublicKey,
    treasury: PublicKey,
    commitment?: any

): Promise<PublicKey[]> {

    let mints: PublicKey[] = [];
    let commitmentValue = commitment !== undefined ? commitment as Finality : 'confirmed';
    let context = await connection.getParsedTokenAccountsByOwner(
        treasury,
        {
            programId
        },
        commitmentValue
    );

    for (let resp in context) {
        let tokenAccount = (resp as any).account;
        let parsedTokenAccount = await getTokenAccount(connection, tokenAccount.data)

        if (parsedTokenAccount !== null) {
            mints.push(parsedTokenAccount.mint);
        }
    }

    return mints;
}

export async function createMSPAddress(
    connection: Connection,
    programId: PublicKey,
    from: PublicKey

): Promise<[PublicKey, string, number]> {

    const slot = await connection.getSlot();
    const blockTime = await connection.getBlockTime(slot) as number;
    // const seed = blockTime.toString();
    // const seeds = [Buffer.from(seed)];
    // const seed = slot.toString();

    // let seed = from.toBase58() + slot.toString();
    // const seeds = [
    //     from.toBuffer(),
    //     Buffer.from(seed)
    // ];

    // const nounce = (await PublicKey.findProgramAddress(seeds, programId))[1];
    const key = await PublicKey.createWithSeed(from, blockTime.toString(), programId);

    // return [key, seed, nounce];
    return [key, blockTime.toString(), slot];
}

export async function findATokenAddress(
    walletAddress: PublicKey,
    tokenMintAddress: PublicKey

): Promise<PublicKey> {

    return (
        await PublicKey.findProgramAddress(
            [
                walletAddress.toBuffer(),
                TOKEN_PROGRAM_ID.toBuffer(),
                tokenMintAddress.toBuffer(),
            ],
            Constants.ASSOCIATED_TOKEN_PROGRAM_KEY
        )
    )[0];
}

export const getMintAccount = async (
    connection: Connection,
    pubKey: PublicKey | string

): Promise<MintInfo> => {

    const address = typeof pubKey === 'string' ? new PublicKey(pubKey) : pubKey;
    const info = await connection.getAccountInfo(address);

    if (info === null) {
        throw new Error('Failed to find mint account');
    }

    return deserializeMint(info.data);
};

export const deserializeMint = (data: Buffer): MintInfo => {
    if (data.length !== MintLayout.span) {
        throw new Error('Not a valid Mint');
    }

    const mintInfo = MintLayout.decode(data);

    if (mintInfo.mintAuthorityOption === 0) {
        mintInfo.mintAuthority = null;
    } else {
        mintInfo.mintAuthority = new PublicKey(mintInfo.mintAuthority);
    }

    mintInfo.supply = u64.fromBuffer(mintInfo.supply);
    mintInfo.isInitialized = mintInfo.isInitialized !== 0;

    if (mintInfo.freezeAuthorityOption === 0) {
        mintInfo.freezeAuthority = null;
    } else {
        mintInfo.freezeAuthority = new PublicKey(mintInfo.freezeAuthority);
    }

    return mintInfo as MintInfo;
};

export const getTokenAccount = async (
    connection: Connection,
    pubKey: PublicKey | string

): Promise<AccountInfo | null> => {

    const address = typeof pubKey === 'string' ? new PublicKey(pubKey) : pubKey;
    const info = await connection.getAccountInfo(address);

    if (info === null) {
        // throw new Error('Failed to find token account');
        return null;
    }

    return deserializeTokenAccount(info.data);
};

export const deserializeTokenAccount = (data: Buffer): AccountInfo => {
    if (data.length !== AccountLayout.span) {
        throw new Error('Not a valid Token');
    }

    const accountInfo = AccountLayout.decode(data);

    accountInfo.amount = u64.fromBuffer(accountInfo.amount);

    return accountInfo as AccountInfo;
};

export function convertLocalDateToUTCIgnoringTimezone(date: Date) {
    const timestamp = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds(),
    );

    return new Date(timestamp);
}

export async function getTokenList(
    cluster: string | number

): Promise<TokenInfo[]> {

    let chainId = 0;

    switch (cluster) {
        case 'https://api.mainnet-beta.solana.com' || 101: {
            chainId = 101;
            break;
        }
        case 'https://api.testnet.solana.com' || 102: {
            chainId = 102;
            break;
        }
        case 'https://api.devnet.solana.com' || 103: {
            chainId = 103;
            break;
        }
        default: {
            break;
        }
    }

    if (chainId === 0) return [] as Array<TokenInfo>;

    return MEAN_TOKEN_LIST.filter((t) => t.chainId === chainId);
}

export async function swapClient(
    connection: Connection,
    // cluster: string,
    wallet: Wallet,
    commitment: Commitment | string

): Promise<Swap> {

    let preflightCommitment = typeof commitment === 'string' ? commitment : 'finalized';
    let provider = new Provider(
        connection,
        wallet,
        {
            commitment: preflightCommitment as Commitment,
            preflightCommitment: preflightCommitment as Commitment
        }
    );

    // let tokenList = getTokenList(cluster);
    let tokenListContainer = await new TokenListProvider().resolve();
    let tokenList = tokenListContainer.filterByChainId(101).getList();
    let container = new TokenListContainer(tokenList);

    return new Swap(provider, container);
}

export const calculateWrapAmount = async (
    tokenInfo: AccountInfo,
    amount: number

): Promise<number> => {

    const wrappedAmount = tokenInfo.amount.toNumber() / LAMPORTS_PER_SOL;

    if (wrappedAmount < amount) {
        return amount - wrappedAmount;
    } else {
        return 0;
    }
}

export const calculateActionFees = async (
    connection: Connection,
    action: MSP_ACTIONS

): Promise<TransactionFees> => {

    let recentBlockhash = await connection.getRecentBlockhash(connection.commitment as Commitment),
        lamportsPerSignatureFee = recentBlockhash.feeCalculator.lamportsPerSignature,
        blockchainFee = 0,
        txFees: TransactionFees = {
            blockchainFee: 0.0,
            mspFlatFee: 0.0,
            mspPercentFee: 0.0
        };

    switch (action) {
        case MSP_ACTIONS.createStream: {
            let maxAccountsSize = (Layout.createStreamLayout.span + Layout.createTreasuryLayout.span) + 2 * AccountLayout.span;
            blockchainFee = await connection.getMinimumBalanceForRentExemption(maxAccountsSize);
            txFees.mspFlatFee = 0.025;
            break;
        }
        case MSP_ACTIONS.createStreamWithFunds: {
            let maxAccountsSize = (Layout.createStreamLayout.span + Layout.createTreasuryLayout.span + MintLayout.span) + 2 * AccountLayout.span;
            lamportsPerSignatureFee = recentBlockhash.feeCalculator.lamportsPerSignature * 2;
            blockchainFee = await connection.getMinimumBalanceForRentExemption(maxAccountsSize);
            txFees.mspPercentFee = 0.3;
            break;
        }
        case MSP_ACTIONS.oneTimePayment: {
            txFees.mspPercentFee = 0.3;
            break;
        }
        case MSP_ACTIONS.scheduleOneTimePayment: {
            let maxAccountsSize = (Layout.createStreamLayout.span + Layout.createTreasuryLayout.span) + 2 * AccountLayout.span;
            blockchainFee = await connection.getMinimumBalanceForRentExemption(maxAccountsSize);
            txFees.mspPercentFee = 0.3;
            break;
        }
        case MSP_ACTIONS.addFunds: {
            txFees.mspPercentFee = 0.3;
            break;
        }
        case MSP_ACTIONS.withdraw: {
            let maxAccountsSize = 2 * AccountLayout.span;
            blockchainFee = await connection.getMinimumBalanceForRentExemption(maxAccountsSize);
            txFees.mspPercentFee = 0.3;
            break;
        }
        case MSP_ACTIONS.closeStream: {
            txFees.mspFlatFee = 0.025;
            txFees.mspPercentFee = 0.3;
            break;
        }
        case MSP_ACTIONS.wrapSol: {
            let maxAccountsSize = 2 * AccountLayout.span;
            blockchainFee = await connection.getMinimumBalanceForRentExemption(maxAccountsSize);
            break;
        }
        default: {
            break;
        }
    }

    txFees.blockchainFee = (blockchainFee + lamportsPerSignatureFee) / LAMPORTS_PER_SOL;

    return txFees;
}

export const wrapSol = async (
    connection: Connection,
    from: PublicKey,
    amount: number

): Promise<Transaction> => {

    const ixs: TransactionInstruction[] = [];
    const tokenKey = await findATokenAddress(from, Constants.WSOL_TOKEN_MINT_KEY);
    const newAccount = new Account();
    const minimumWrappedAccountBalance = await connection.getMinimumBalanceForRentExemption(AccountLayout.span);

    ixs.push(
        SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: newAccount.publicKey,
            lamports: (minimumWrappedAccountBalance * 2) + amount * LAMPORTS_PER_SOL
        }),
        SystemProgram.allocate({
            accountPubkey: newAccount.publicKey,
            space: AccountLayout.span
        }),
        SystemProgram.assign({
            accountPubkey: newAccount.publicKey,
            programId: TOKEN_PROGRAM_ID
        }),
        Token.createInitAccountInstruction(
            TOKEN_PROGRAM_ID,
            Constants.WSOL_TOKEN_MINT_KEY,
            newAccount.publicKey,
            from
        )
    );

    const accountInfo = await connection.getAccountInfo(tokenKey);

    if (accountInfo === null) {
        ixs.push(
            await Instructions.createATokenAccountInstruction(
                tokenKey,
                from,
                from,
                Constants.WSOL_TOKEN_MINT_KEY
            ),
        );
    }

    ixs.push(
        Token.createTransferInstruction(
            TOKEN_PROGRAM_ID,
            newAccount.publicKey,
            tokenKey,
            from,
            [],
            (amount * LAMPORTS_PER_SOL)
        ),
        Token.createCloseAccountInstruction(
            TOKEN_PROGRAM_ID,
            newAccount.publicKey,
            from,
            from,
            []
        )
    )

    let tx = new Transaction().add(...ixs);
    tx.feePayer = from;
    let hash = await connection.getRecentBlockhash(connection.commitment as Commitment);
    tx.recentBlockhash = hash.blockhash;
    tx.partialSign(newAccount);

    return tx;
}

export const buildTransactionsMessageData = async (
    connection: Connection,
    transactions: Transaction[]

): Promise<string> => {

    let message = 'Sign this test message';
    // TODO: Implement
    return message;
}

export function encode(data: Buffer): string {
    return base64.fromByteArray(data);
}

export function decode(data: string): Buffer {
    return Buffer.from(base64.toByteArray(data));
}

// async function getMarketAddress(
//     tokenList: TokenListContainer,
//     usdxMint: PublicKey,
//     baseMint: PublicKey

// ): Promise<PublicKey> {

//     const market = tokenList.filterByClusterSlug(Constants.DEVNET_CLUSTER)
//         .getList()
//         .filter((t) => {
//             if (t.address !== baseMint?.toString()) {
//                 return false;
//             }
//             if (usdxMint.equals(USDC_PUBKEY)) {
//                 return t.extensions?.serumV3Usdc !== undefined;
//             } else if (usdxMint.equals(USDT_PUBKEY)) {
//                 return t.extensions?.serumV3Usdt !== undefined;
//             } else {
//                 return false;
//             }
//         })
//         .map((t) => {
//             if (usdxMint!.equals(USDC_PUBKEY)) {
//                 return new PublicKey(t.extensions!.serumV3Usdc as string);
//             } else {
//                 return new PublicKey(t.extensions!.serumV3Usdt as string);
//             }
//         })[0];

//     if (market === undefined) {
//         return null;
//     }

//     return market;
// }

/*
export async function swapTokens(
    connection: Connection,
    client: Swap,
    fromWallet: PublicKey,
    fromMint: PublicKey,
    toWallet: PublicKey,
    toMint: PublicKey,
    amount: number

): Promise<Array<TransactionSignature>> {

    // const serumDexKey = Constants.SERUM_DEX_KEY.toPublicKey();
    // const fromMarket = await Market.load(
    //     connection,
    //     fromMint,
    //     { commitment: connection.commitment },
    //     Constants.TOKEN_PROGRAM_ADDRESS.toPublicKey()
    // );

    // const toMarket = await Market.load(
    //     connection,
    //     toMint,
    //     { commitment: connection.commitment },
    //     Constants.TOKEN_PROGRAM_ADDRESS.toPublicKey()
    // );

    // const fromMintAccount = await getMintAccount(connection, fromMint);
    // const toMintAccount = await getMintAccount(connection, toMint);
    const bn = toNative(amount, 9);
    const minExpectedExRate = {
        rate: bn.mul(new BN(99)).div(new BN(100)), // 0.1%
        fromDecimals: 9,
        quoteDecimals: 6,
        strict: false
    };

    const txs = client.swap({
        fromMint: fromMint,
        toMint: toMint,
        // fromWallet,
        // toWallet,
        // fromMarket,
        // toMarket,
        amount: bn,
        minExchangeRate: minExpectedExRate
    });

    return txs;
}
*/