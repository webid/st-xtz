import './style.css';
import { fetchBakeryStaking, fetchStXTZOperations, calculateStats, calculateWalletStats, fetchStXTZHolders } from './api';
import type { WalletStats, StXTZHolder } from './api';
import { createStakingChart, processChartData } from './chart';

// Format number with commas and 2 decimal places
function formatTez(amount: number): string {
  return amount.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }) + ' ꜩ';
}

// Format number with commas
function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

// Shorten wallet address
function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Render stats to the DOM
function renderStats(bakeryStats: ReturnType<typeof calculateStats>, stxtzStats: ReturnType<typeof calculateStats>, walletStats: WalletStats[]) {
  const statsContainer = document.getElementById('stats')!;
  const uniqueWallets = walletStats.length;
  
  statsContainer.innerHTML = `
    <div class="stats-grid">
      <div class="stat-section">
        <h3>Bakery Staking (Raw Protocol)</h3>
        <div class="stat-cards">
          <div class="stat-card stake">
            <span class="stat-label">Total Staked</span>
            <span class="stat-value">${formatTez(bakeryStats.totalStaked)}</span>
            <span class="stat-count">${formatNumber(bakeryStats.stakeCount)} operations</span>
          </div>
          <div class="stat-card unstake">
            <span class="stat-label">Total Unstaked</span>
            <span class="stat-value">${formatTez(bakeryStats.totalUnstaked)}</span>
            <span class="stat-count">${formatNumber(bakeryStats.unstakeCount)} operations</span>
          </div>
          <div class="stat-card finalize">
            <span class="stat-label">Total Finalized</span>
            <span class="stat-value">${formatTez(bakeryStats.totalFinalized)}</span>
            <span class="stat-count">${formatNumber(bakeryStats.finalizeCount)} finalizations</span>
          </div>
        </div>
      </div>
      
      <div class="stat-section">
        <h3>stXTZ Operations (Stacy.fi)</h3>
        <div class="stat-cards">
          <div class="stat-card stake">
            <span class="stat-label">Total Deposited</span>
            <span class="stat-value">${formatTez(stxtzStats.totalStaked)}</span>
            <span class="stat-count">${formatNumber(stxtzStats.stakeCount)} deposits</span>
          </div>
          <div class="stat-card unstake">
            <span class="stat-label">Withdrawals</span>
            <span class="stat-value">${formatTez(stxtzStats.totalUnstaked)}</span>
            <span class="stat-count">${formatNumber(stxtzStats.unstakeCount)} requests</span>
          </div>
          <div class="stat-card finalize">
            <span class="stat-label">Total Finalized</span>
            <span class="stat-value">${formatTez(stxtzStats.totalFinalized)}</span>
            <span class="stat-count">${formatNumber(stxtzStats.finalizeCount)} finalizations</span>
          </div>
          <div class="stat-card wallets">
            <span class="stat-label">Unique Wallets</span>
            <span class="stat-value">${formatNumber(uniqueWallets)}</span>
            <span class="stat-count">stXTZ users</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Render wallet leaderboard
function renderWalletLeaderboard(walletStats: WalletStats[], holders: StXTZHolder[]) {
  const container = document.getElementById('wallet-leaderboard')!;
  
  // Merge stats with holders
  const statsMap = new Map(walletStats.map(w => [w.address, w]));
  
  // Combine data: prioritize holders (because they have current balance)
  const leaderboardData = holders.map(holder => {
    const stats = statsMap.get(holder.account.address);
    return {
      address: holder.account.address,
      alias: holder.account.alias,
      balance: parseFloat(holder.balance) / 1_000_000, // Convert to TEZ (assuming standard 6 decimals for FA1.2)
      netPosition: stats ? stats.netPosition : 0,
      totalDeposited: stats ? stats.totalDeposited : 0,
      totalWithdrawn: stats ? stats.totalWithdrawn : 0
    };
  });
  
  // Add wallets from stats that aren't in holders (zero balance now)
  const holderAddresses = new Set(holders.map(h => h.account.address));
  const zeroBalanceWallets = walletStats
    .filter(w => !holderAddresses.has(w.address))
    .map(w => ({
      address: w.address,
      alias: undefined,
      balance: 0,
      netPosition: w.netPosition,
      totalDeposited: w.totalDeposited,
      totalWithdrawn: w.totalWithdrawn
    }));
    
  // Combine and sort by balance (descending)
  const fullList = [...leaderboardData, ...zeroBalanceWallets].sort((a, b) => b.balance - a.balance);
  
  let showAll = false;
  
  const renderTable = () => {
    const limit = showAll ? fullList.length : 10;
    const displayList = fullList.slice(0, limit);
    
    const rows = displayList.map((wallet, index) => `
      <tr>
        <td class="rank">${index + 1}</td>
        <td class="address">
          <a href="https://tzkt.io/${wallet.address}" target="_blank">
            ${wallet.alias ? wallet.alias : shortenAddress(wallet.address)}
          </a>
        </td>
        <td class="balance">${formatTez(wallet.balance)}</td>
        <td class="net-position ${wallet.netPosition >= 0 ? 'positive' : 'negative'}">
          ${wallet.netPosition >= 0 ? '+' : ''}${formatTez(wallet.netPosition)}
        </td>
        <td class="deposited">${formatTez(wallet.totalDeposited)}</td>
        <td class="withdrawn">${formatTez(wallet.totalWithdrawn)}</td>
      </tr>
    `).join('');
    
    container.innerHTML = `
      <h3>Top stXTZ Holders</h3>
      <div class="table-container">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Wallet</th>
              <th>Balance</th>
              <th>Net Flow</th>
              <th>Deposited</th>
              <th>Withdrawn</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <div class="leaderboard-controls">
        <button id="toggle-leaderboard" class="btn-secondary">
          ${showAll ? 'Show Less' : `Show All (${fullList.length})`}
        </button>
      </div>
    `;
    
    // Re-attach event listener
    document.getElementById('toggle-leaderboard')?.addEventListener('click', () => {
      showAll = !showAll;
      renderTable();
    });
  };
  
  renderTable();
}

// Show loading state
function showLoading() {
  document.getElementById('app')!.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading staking data...</p>
    </div>
  `;
}

// Main app
async function init() {
  showLoading();
  
  try {
    // Fetch data from both APIs in parallel
    const [bakeryOps, stxtzOps, holders] = await Promise.all([
      fetchBakeryStaking(),
      fetchStXTZOperations(),
      fetchStXTZHolders()
    ]);
    
    console.log(`Fetched ${bakeryOps.length} bakery operations`);
    console.log(`Fetched ${bakeryOps.length} bakery operations`);
    console.log(`Fetched ${stxtzOps.length} stXTZ operations`);
    console.log(`Fetched ${holders.length} stXTZ holders`);
    
    // Calculate stats
    const bakeryStats = calculateStats(bakeryOps);
    const stxtzStats = calculateStats(stxtzOps);
    const walletStats = calculateWalletStats(stxtzOps);
    
    // Render the app
    document.getElementById('app')!.innerHTML = `
      <header>
        <h1>stXTZ Staking Dashboard</h1>
        <p class="subtitle">Visualizing staking activity for Stacy.fi</p>
      </header>
      
      <main>
        <section id="stats" class="stats-section"></section>
        
        <section class="chart-section">
          <div class="chart-container">
            <canvas id="stakingChart"></canvas>
          </div>
        </section>
        
        <section id="wallet-leaderboard"></section>
      </main>
      
      <footer>
        <p>
          <a href="https://bafo.fafolab.xyz/?address=tz3W7k9v3uniY1f2HQRKxymJybNvH3FgvZ5N" target="_blank">Baker: tz3W7k...vZ5N</a> | 
          <a href="https://better-call.dev/mainnet/KT1FRN2RmitUkyyovtjRMrU1G9zwKzgESXm8" target="_blank">Contract: KT1FRN...Xm8</a>
        </p>
        <p class="credit">Data powered by <a href="https://api.tzkt.io" target="_blank">TzKT API</a></p>
      </footer>
    `;
    
    // Render stats
    renderStats(bakeryStats, stxtzStats, walletStats);
    
    // Render wallet leaderboard
    renderWalletLeaderboard(walletStats, holders);
    
    // Process chart data with separate bakery and stXTZ operations
    const chartData = processChartData(bakeryOps, stxtzOps);
    
    // Create chart
    createStakingChart('stakingChart', chartData);
    
  } catch (error) {
    console.error('Failed to load data:', error);
    document.getElementById('app')!.innerHTML = `
      <div class="error">
        <h2>Failed to load data</h2>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <button onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

init();
