import "dotenv/config";
import {
  createUnlink,
  unlinkAccount,
  unlinkEvm,
  BurnerWallet,
} from "@unlink-xyz/sdk";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import bip39 from "bip39";

// ─── Constants ───────────────────────────────────────────────────────────────
const API_KEY = process.env.UNLINk_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ENGINE_URL = "https://staging-api.unlink.xyz";
const TEST_TOKEN = "0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7"; // Unlink test token (18 decimals)
const TRANSFER_AMOUNT = "1000000000000000000"; // 1 token
const RECIPIENT_ADDRESS = "0x000000000000000000000000000000000000dEaD"; // burn address as demo recipient

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(step, msg) {
  console.log(`\n[${"STEP " + step}] ${msg}`);
}

async function pollUntilDone(client, txId, label) {
  console.log(`  Polling ${label} (txId: ${txId})...`);
  const result = await client.pollTransactionStatus(txId, {
    intervalMs: 3000,
    timeoutMs: 120_000,
  });
  console.log(`  ${label} status: ${result.status}`);
  if (result.status === "failed") {
    throw new Error(`${label} failed! txId: ${txId}`);
  }
  return result;
}

async function waitForBalance(client, token, label) {
  console.log(`  Waiting for ${label} balance to appear...`);
  for (let i = 0; i < 20; i++) {
    const { balances } = await client.getBalances({ token });
    const bal = balances.find((b) => b.token === token);
    if (bal && BigInt(bal.amount) > 0n) {
      console.log(`  ${label} balance: ${bal.amount}`);
      return bal;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Timed out waiting for ${label} balance`);
}

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address, uint256) returns (bool)",
]);

// ─── Main Flow ───────────────────────────────────────────────────────────────
async function main() {
  // ── Step 1: Setup EVM wallet + Unlink account ─────────────────────────────
  log(1, "Setting up EVM wallet and Unlink account");

  const evmAccount = privateKeyToAccount(PRIVATE_KEY);
  console.log(`  EVM wallet: ${evmAccount.address}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  const walletClient = createWalletClient({
    account: evmAccount,
    chain: baseSepolia,
    transport: http(),
  });

  const mnemonic = bip39.generateMnemonic();
  console.log(`  Unlink mnemonic (save this in production): ${mnemonic}`);

  const account = unlinkAccount.fromMnemonic({ mnemonic });
  const evm = unlinkEvm.fromViem({ walletClient, publicClient });

  const client = createUnlink({
    apiKey: API_KEY,
    account,
    evm,
    engineUrl: ENGINE_URL,
  });

  const unlinkAddr = await client.getAddress();
  console.log(`  Unlink address: ${unlinkAddr}`);

  // ── Step 2: Approve Permit2 ───────────────────────────────────────────────
  log(2, "Ensuring ERC-20 approval for Permit2");

  const tokenBalance = await publicClient.readContract({
    address: TEST_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [evmAccount.address],
  });
  console.log(`  Token balance: ${Number(tokenBalance) / 1e18} tokens`);

  await client.ensureErc20Approval({ token: TEST_TOKEN, amount: TRANSFER_AMOUNT });
  console.log("  Permit2 approval OK.");

  // ── Step 3: Deposit into the privacy pool ─────────────────────────────────
  log(3, "Depositing 1 token into the privacy pool");

  const deposit = await client.deposit({
    token: TEST_TOKEN,
    amount: TRANSFER_AMOUNT,
  });
  console.log(`  Deposit txId: ${deposit.txId}`);

  await pollUntilDone(client, deposit.txId, "Deposit");
  await waitForBalance(client, TEST_TOKEN, "Pool");

  // ── Step 4: Create burner wallet ──────────────────────────────────────────
  log(4, "Creating burner wallet");

  const burner = await BurnerWallet.create();
  console.log(`  Burner address: ${burner.address}`);

  // ── Step 5: Fund burner from pool (private withdrawal) ────────────────────
  log(5, "Funding burner from privacy pool (sender = PRIVATE)");

  const accountKeys = await client.getAccountKeys();
  const envInfo = await client.getEnvironmentInfo();

  const fund = await burner.fundFromPool(client.client, {
    senderKeys: accountKeys,
    token: TEST_TOKEN,
    amount: TRANSFER_AMOUNT,
    environment: envInfo.name,
  });
  console.log(`  Fund txId: ${fund.txId}`);

  await pollUntilDone(client, fund.txId, "Burner fund");

  // Wait for burner to receive gas + tokens
  for (let i = 0; i < 40; i++) {
    const statusObj = await burner.getStatus(client.client);
    console.log(`  Burner status: ${statusObj.status}`);
    if (statusObj.status === "funded") break;
    if (statusObj.status === "gas_funding_failed") throw new Error("Gas funding failed");
    await new Promise((r) => setTimeout(r, 3000));
  }

  const burnerBalance = await publicClient.readContract({
    address: TEST_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [burner.address],
  });
  console.log(`  Burner token balance: ${Number(burnerBalance) / 1e18} tokens`);

  // ── Step 6: Transfer from burner to recipient ─────────────────────────────
  log(6, "Sending from burner to recipient (sender = BURNER, unlinkable)");

  const burnerWalletClient = createWalletClient({
    account: burner.toViemAccount(),
    chain: baseSepolia,
    transport: http(),
  });

  const txHash = await burnerWalletClient.writeContract({
    address: TEST_TOKEN,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [RECIPIENT_ADDRESS, burnerBalance],
  });
  console.log(`  Transfer tx: ${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`  Confirmed in block ${receipt.blockNumber}`);

  // ── Step 7: Dispose burner ────────────────────────────────────────────────
  log(7, "Disposing burner wallet");

  try {
    await burner.dispose(client.client);
  } catch {
    // dispose may fail if no deposit-back tx, that's OK
  }
  burner.deleteKey();
  console.log("  Burner key deleted.");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  PRIVATE TRANSFER COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Original sender : ${evmAccount.address}`);
  console.log(`  Burner (temp)   : ${burner.address}`);
  console.log(`  Recipient       : ${RECIPIENT_ADDRESS}`);
  console.log(`  Amount          : 1 TEST token`);
  console.log(`  On-chain link   : BROKEN (pool breaks the trace)`);
  console.log(`\n  Deposit into pool : sender visible, recipient hidden`);
  console.log(`  Pool -> burner    : sender hidden, burner visible`);
  console.log(`  Burner -> recipient: burner visible (disposable), recipient visible`);
  console.log(`  Net result: no on-chain path from original sender to recipient`);
  console.log(`\n  Explorer: https://sepolia.basescan.org/tx/${txHash}`);
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
