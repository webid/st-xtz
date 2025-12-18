import './style.css';
import { fetchBakeryStaking, fetchStXTZOperations, calculateStats } from './api';
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

// Render stats to the DOM
function renderStats(bakeryStats: ReturnType<typeof calculateStats>, stxtzStats: ReturnType<typeof calculateStats>) {
  const statsContainer = document.getElementById('stats')!;
  
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
        </div>
      </div>
    </div>
  `;
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
    const [bakeryOps, stxtzOps] = await Promise.all([
      fetchBakeryStaking(),
      fetchStXTZOperations()
    ]);
    
    console.log(`Fetched ${bakeryOps.length} bakery operations`);
    console.log(`Fetched ${stxtzOps.length} stXTZ operations`);
    
    // Calculate stats
    const bakeryStats = calculateStats(bakeryOps);
    const stxtzStats = calculateStats(stxtzOps);
    
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
    renderStats(bakeryStats, stxtzStats);
    
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
