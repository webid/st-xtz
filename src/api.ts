// API endpoints - filter server-side to get all relevant operations
const BAKERY_API_BASE = 'https://api.tzkt.io/v1/operations/staking?baker=tz3W7k9v3uniY1f2HQRKxymJybNvH3FgvZ5N&select=level,timestamp,action,amount&action.in=stake,unstake,finalize';
const STXTZ_API_BASE = 'https://api.tzkt.io/v1/operations/transactions?status=applied&target=KT1FRN2RmitUkyyovtjRMrU1G9zwKzgESXm8&entrypoint.in=deposit,request_withdrawal,finalize_withdrawal';

const PAGE_SIZE = 10000;

// Types
export interface StakingOperation {
  timestamp: string;
  type: 'stake' | 'unstake' | 'finalize';
  amount: number; // in TEZ (already converted from mutez)
  source: 'bakery' | 'stxtz';
  sender?: string; // wallet address (only for stxtz operations)
}

interface BakeryResponse {
  level: number;
  timestamp: string;
  action: 'stake' | 'unstake' | 'finalize';
  amount: number;
}

interface WithdrawalQueueItem {
  price: string;
  recipient: string;
  xtz_amount: string;
  block_level: string;
  stxtz_amount: string;
}

interface StorageDiff {
  action: string;
  content?: {
    value?: WithdrawalQueueItem;
  };
}

interface StXTZResponse {
  level: number;
  timestamp: string;
  amount: number;
  hash: string;
  counter: number;
  parameter: {
    entrypoint: string;
    value: string | object;
  };
  diffs?: StorageDiff[];
  sender?: {
    address: string;
  };
}

// LocalStorage key for caching withdrawal amounts
const WITHDRAWAL_CACHE_KEY = 'stxtz_withdrawal_cache';

// Load withdrawal cache from localStorage
function loadWithdrawalCache(): Record<string, number> {
  try {
    const cached = localStorage.getItem(WITHDRAWAL_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

// Save withdrawal cache to localStorage
function saveWithdrawalCache(cache: Record<string, number>): void {
  try {
    localStorage.setItem(WITHDRAWAL_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to save withdrawal cache:', error);
  }
}

// Helper: recursively find all objects with both xtz_amount and stxtz_amount
function findXtzAmountEntries(obj: any, results: Array<{xtz_amount: string, stxtz_amount: string}> = []): Array<{xtz_amount: string, stxtz_amount: string}> {
  if (!obj || typeof obj !== 'object') return results;
  
  // Check if this object has both xtz_amount and stxtz_amount
  if (obj.xtz_amount && obj.stxtz_amount) {
    results.push({ xtz_amount: obj.xtz_amount, stxtz_amount: obj.stxtz_amount });
  }
  
  // Recurse into arrays and objects
  if (Array.isArray(obj)) {
    for (const item of obj) {
      findXtzAmountEntries(item, results);
    }
  } else {
    for (const key of Object.keys(obj)) {
      findXtzAmountEntries(obj[key], results);
    }
  }
  
  return results;
}

// Fetch operation details by hash/counter to get xtz_amount from storage
async function fetchWithdrawalAmountByHash(hash: string, counter: number, expectedStxtzAmount: number): Promise<number | null> {
  // Use hash/counter format for direct lookup
  const url = `https://api.tzkt.io/v1/operations/transactions/${hash}/${counter}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // API may return single object or array - normalize to array
    const transactions: any[] = Array.isArray(data) ? data : [data];
    
    // Find the request_withdrawal transaction
    for (const tx of transactions) {
      if (tx.parameter?.entrypoint === 'request_withdrawal') {
        // First try: storage.pending_queue (expected location)
        const queue = tx.storage?.pending_queue;
        if (queue && Array.isArray(queue) && queue.length > 0) {
          const lastEntry = queue[queue.length - 1];
          if (lastEntry.xtz_amount && lastEntry.stxtz_amount) {
            // Verify this is our withdrawal by checking stxtz_amount matches
            const stxtz = parseInt(lastEntry.stxtz_amount, 10);
            if (stxtz === expectedStxtzAmount) {
              return parseInt(lastEntry.xtz_amount, 10);
            }
          }
        }
        
        // Second try: deep search for matching stxtz_amount
        const entries = findXtzAmountEntries(tx);
        if (entries.length > 0) {
          const match = entries.find(e => parseInt(e.stxtz_amount, 10) === expectedStxtzAmount);
          if (match) {
            return parseInt(match.xtz_amount, 10);
          }
          // No exact match - use last entry as fallback
          return parseInt(entries[entries.length - 1].xtz_amount, 10);
        }
      }
    }
    
    console.warn(`No xtz_amount found for ${hash}/${counter}`);
    return null;
  } catch (error) {
    console.warn(`Error fetching withdrawal by hash ${hash}:`, error);
    return null;
  }
}


// Generic paginated fetch function
async function fetchAllPages<T>(baseUrl: string, pageSize: number = PAGE_SIZE): Promise<T[]> {
  const allData: T[] = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const url = `${baseUrl}&limit=${pageSize}&offset=${offset}`;
    const response = await fetch(url);
    const data: T[] = await response.json();
    
    allData.push(...data);
    
    // If we got fewer results than page size, we've reached the end
    if (data.length < pageSize) {
      hasMore = false;
    } else {
      offset += pageSize;
    }
  }
  
  return allData;
}

// Fetch bakery staking operations with pagination
export async function fetchBakeryStaking(): Promise<StakingOperation[]> {
  const data = await fetchAllPages<BakeryResponse>(BAKERY_API_BASE);
  
  console.log(`Fetched ${data.length} total bakery records`);
  
  return data
    .filter(op => op.action === 'stake' || op.action === 'unstake' || op.action === 'finalize')
    .filter(op => op.amount > 0) // Ignore zero-amount operations
    .map(op => ({
      timestamp: op.timestamp,
      type: op.action as 'stake' | 'unstake' | 'finalize',
      amount: op.amount / 1_000_000, // Convert mutez to TEZ
      source: 'bakery' as const
    }));
}

// Fetch stXTZ proxy operations with pagination
export async function fetchStXTZOperations(): Promise<StakingOperation[]> {
  const data = await fetchAllPages<StXTZResponse>(STXTZ_API_BASE);
  
  console.log(`Fetched ${data.length} total stXTZ records`);
  
  const operations: StakingOperation[] = [];
  
  // Collect all withdrawal operations that need price conversion (fallback only)
  const withdrawals: { op: StXTZResponse; stxtzAmount: number }[] = [];
  
  // Track converted withdrawal amounts for matching analysis
  const convertedWithdrawals: number[] = [];
  
  for (const op of data) {
    const entrypoint = op.parameter.entrypoint;
    
    if (entrypoint === 'deposit') {
      // For deposits, amount is in TEZ (transaction amount field)
      operations.push({
        timestamp: op.timestamp,
        type: 'stake',
        amount: op.amount / 1_000_000,
        source: 'stxtz',
        sender: op.sender?.address
      });
    } else if (entrypoint === 'request_withdrawal') {
      // For request_withdrawal, amount is in stXTZ (needs price conversion)
      const stxtzAmount = typeof op.parameter.value === 'string' 
        ? parseInt(op.parameter.value, 10) 
        : 0;
      
      // Note: diffs don't work with TzKT API, so we use the stxtz amount
      // and will need price conversion. For now, track these for later conversion.
      if (stxtzAmount > 0) {
        withdrawals.push({ op, stxtzAmount });
      }
    } else if (entrypoint === 'finalize_withdrawal') {
      // For finalize_withdrawal, amount is in TEZ (transaction amount field)
      // Ignore zero-amount finalizes
      if (op.amount > 0) {
        operations.push({
          timestamp: op.timestamp,
          type: 'finalize',
          amount: op.amount / 1_000_000,
          source: 'stxtz',
          sender: op.sender?.address
        });
      }
    }
  }
  
  // Get finalize amounts for matching analysis
  const finalizeAmounts: number[] = operations
    .filter(op => op.type === 'finalize')
    .map(op => op.amount);
  
  // Load cache and process withdrawals with hash-based lookup
  const withdrawalCache = loadWithdrawalCache();
  let cacheHits = 0;
  let cacheMisses = 0;
  
  console.log(`Processing ${withdrawals.length} withdrawal requests...`);
  
  // Process withdrawals in batches to avoid overwhelming the API
  const BATCH_SIZE = 2; // Smaller batch size for rate limiting
  for (let i = 0; i < withdrawals.length; i += BATCH_SIZE) {
    const batch = withdrawals.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.all(
      batch.map(async ({ op, stxtzAmount }, index) => {
        const cacheKey = `${op.hash}-${op.level}`;
        
        // Check cache first
        if (withdrawalCache[cacheKey]) {
          cacheHits++;
          return {
            timestamp: op.timestamp,
            amount: withdrawalCache[cacheKey],
            sender: op.sender?.address
          };
        }
        
        // Delay before API call (stagger requests within batch)
        await new Promise(resolve => setTimeout(resolve, index * 300));
        
        // Fetch from API
        cacheMisses++;
        const xtzAmount = await fetchWithdrawalAmountByHash(op.hash, op.counter, stxtzAmount);
        
        if (xtzAmount !== null) {
          const amountInTez = xtzAmount / 1_000_000;
          withdrawalCache[cacheKey] = amountInTez;
          return {
            timestamp: op.timestamp,
            amount: amountInTez,
            sender: op.sender?.address
          };
        }
        
        // Fallback: use stxtz amount as 1:1 approximation
        const fallbackAmount = stxtzAmount / 1_000_000;
        console.warn(`Could not get xtz_amount for ${op.hash}, using stxtz as fallback: ${fallbackAmount.toFixed(2)} TEZ`);
        return {
          timestamp: op.timestamp,
          amount: fallbackAmount,
          sender: op.sender?.address
        };
      })
    );
    
    // Add results to operations
    for (const result of results) {
      operations.push({
        timestamp: result.timestamp,
        type: 'unstake',
        amount: result.amount,
        source: 'stxtz',
        sender: result.sender
      });
      convertedWithdrawals.push(result.amount);
    }
    
    // Delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < withdrawals.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Save updated cache
  saveWithdrawalCache(withdrawalCache);
  console.log(`Withdrawal processing complete: ${cacheHits} cache hits, ${cacheMisses} API lookups`);
  
  // Analyze matching between finalizes and withdrawal requests
  // Use a tolerance of 0.1 TEZ for floating point comparison
  const TOLERANCE = 0.1;
  let matchedFinalizes = 0;
  const unmatchedFinalizes: number[] = [];
  const matchableWithdrawals = [...convertedWithdrawals]; // Copy for matching
  
  for (const finalizeAmt of finalizeAmounts) {
    // Try to find a matching withdrawal request (within tolerance)
    const matchIndex = matchableWithdrawals.findIndex(
      w => Math.abs(w - finalizeAmt) < TOLERANCE
    );
    if (matchIndex >= 0) {
      matchedFinalizes++;
      // Remove matched withdrawal to prevent double-matching
      matchableWithdrawals.splice(matchIndex, 1);
    } else {
      unmatchedFinalizes.push(finalizeAmt);
    }
  }
  
  console.log(`Finalize matching stats:`);
  console.log(`  Total finalizes: ${finalizeAmounts.length}`);
  console.log(`  Matched to requests: ${matchedFinalizes}`);
  console.log(`  Unmatched: ${unmatchedFinalizes.length}`);
  if (unmatchedFinalizes.length > 0 && unmatchedFinalizes.length <= 10) {
    console.log(`  Unmatched amounts: ${unmatchedFinalizes.map(a => a.toFixed(2)).join(', ')} TEZ`);
  }
  
  return operations;
}

// Calculate stats from operations
export interface StakingStats {
  totalStaked: number;
  totalUnstaked: number;
  totalFinalized: number;
  stakeCount: number;
  unstakeCount: number;
  finalizeCount: number;
  netStaked: number;
}

export function calculateStats(operations: StakingOperation[]): StakingStats {
  const stakes = operations.filter(op => op.type === 'stake');
  const unstakes = operations.filter(op => op.type === 'unstake');
  const finalizes = operations.filter(op => op.type === 'finalize');
  
  const totalStaked = stakes.reduce((sum, op) => sum + op.amount, 0);
  const totalUnstaked = unstakes.reduce((sum, op) => sum + op.amount, 0);
  const totalFinalized = finalizes.reduce((sum, op) => sum + op.amount, 0);
  
  return {
    totalStaked,
    totalUnstaked,
    totalFinalized,
    stakeCount: stakes.length,
    unstakeCount: unstakes.length,
    finalizeCount: finalizes.length,
    netStaked: totalStaked - totalUnstaked
  };
}

// Wallet-level statistics
export interface WalletStats {
  address: string;
  totalDeposited: number;
  totalWithdrawn: number;
  totalFinalized: number;
  netPosition: number;
  depositCount: number;
  withdrawCount: number;
  finalizeCount: number;
}

export function calculateWalletStats(operations: StakingOperation[]): WalletStats[] {
  const walletMap = new Map<string, WalletStats>();
  
  for (const op of operations) {
    if (op.source !== 'stxtz' || !op.sender) continue;
    
    if (!walletMap.has(op.sender)) {
      walletMap.set(op.sender, {
        address: op.sender,
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalFinalized: 0,
        netPosition: 0,
        depositCount: 0,
        withdrawCount: 0,
        finalizeCount: 0
      });
    }
    
    const wallet = walletMap.get(op.sender)!;
    
    if (op.type === 'stake') {
      wallet.totalDeposited += op.amount;
      wallet.depositCount++;
    } else if (op.type === 'unstake') {
      wallet.totalWithdrawn += op.amount;
      wallet.withdrawCount++;
    } else if (op.type === 'finalize') {
      wallet.totalFinalized += op.amount;
      wallet.finalizeCount++;
    }
    
    wallet.netPosition = wallet.totalDeposited - wallet.totalWithdrawn;
  }
  
  // Sort by net position (highest first)
  return Array.from(walletMap.values()).sort((a, b) => b.netPosition - a.netPosition);
}
