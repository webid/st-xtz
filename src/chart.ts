import { Chart, registerables } from 'chart.js';
import type { StakingOperation } from './api';

// Register Chart.js components
Chart.register(...registerables);

export interface ChartData {
  labels: string[];
  bakeryStakes: number[];
  bakeryUnstakes: number[];
  stxtzDeposits: number[];
  stxtzWithdrawals: number[];
  bakeryBalance: number[];
  stxtzBalance: number[];
  bakeryFinalize: number[];
  stxtzFinalize: number[];
}

// Process operations into chart-friendly data (aggregated by day)
export function processChartData(bakeryOps: StakingOperation[], stxtzOps: StakingOperation[]): ChartData {
  // Combine all timestamps to get the full date range
  const allOps = [...bakeryOps, ...stxtzOps].filter(op => op.timestamp && op.type !== 'finalize');
  const sorted = allOps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Get all unique dates
  const allDates = new Set<string>();
  sorted.forEach(op => allDates.add(op.timestamp.split('T')[0]));
  const sortedDates = Array.from(allDates).sort();
  
  // Initialize data maps
  const dailyData = new Map<string, {
    bakeryStake: number;
    bakeryUnstake: number;
    bakeryFinalize: number;
    stxtzDeposit: number;
    stxtzWithdraw: number;
    stxtzFinalize: number;
  }>();
  
  sortedDates.forEach(date => {
    dailyData.set(date, { 
      bakeryStake: 0, bakeryUnstake: 0, bakeryFinalize: 0,
      stxtzDeposit: 0, stxtzWithdraw: 0, stxtzFinalize: 0 
    });
  });
  
  // Aggregate bakery operations (all types including finalize)
  bakeryOps.filter(op => op.timestamp).forEach(op => {
    const date = op.timestamp.split('T')[0];
    const existing = dailyData.get(date);
    if (existing) {
      if (op.type === 'stake') {
        existing.bakeryStake += op.amount;
      } else if (op.type === 'unstake') {
        existing.bakeryUnstake += op.amount;
      } else if (op.type === 'finalize') {
        existing.bakeryFinalize += op.amount;
      }
    }
  });
  
  // Aggregate stXTZ operations (all types including finalize)
  stxtzOps.filter(op => op.timestamp).forEach(op => {
    const date = op.timestamp.split('T')[0];
    const existing = dailyData.get(date);
    if (existing) {
      if (op.type === 'stake') {
        existing.stxtzDeposit += op.amount;
      } else if (op.type === 'unstake') {
        existing.stxtzWithdraw += op.amount;
      } else if (op.type === 'finalize') {
        existing.stxtzFinalize += op.amount;
      }
    }
  });
  
  const labels: string[] = [];
  const bakeryStakes: number[] = [];
  const bakeryUnstakes: number[] = [];
  const stxtzDeposits: number[] = [];
  const stxtzWithdrawals: number[] = [];
  const bakeryBalance: number[] = [];
  const stxtzBalance: number[] = [];
  const bakeryFinalize: number[] = [];
  const stxtzFinalize: number[] = [];
  
  let runningBakeryBalance = 0;
  let runningStxtzBalance = 0;
  
  sortedDates.forEach(date => {
    const data = dailyData.get(date)!;
    labels.push(date);
    bakeryStakes.push(data.bakeryStake);
    bakeryUnstakes.push(data.bakeryUnstake);
    bakeryFinalize.push(data.bakeryFinalize);
    stxtzDeposits.push(data.stxtzDeposit);
    stxtzWithdrawals.push(data.stxtzWithdraw);
    stxtzFinalize.push(data.stxtzFinalize);
    
    // Calculate cumulative balances: stake - finalize (actual withdrawn funds)
    // Unstake is like a pending withdrawal request, finalize is when funds actually leave
    runningBakeryBalance += data.bakeryStake - data.bakeryFinalize;
    runningStxtzBalance += data.stxtzDeposit - data.stxtzFinalize;
    bakeryBalance.push(runningBakeryBalance);
    stxtzBalance.push(runningStxtzBalance);
  });
  
  return { 
    labels, 
    bakeryStakes, bakeryUnstakes, bakeryFinalize,
    stxtzDeposits, stxtzWithdrawals, stxtzFinalize,
    bakeryBalance, stxtzBalance 
  };
}

// Create the staking chart
export function createStakingChart(canvasId: string, data: ChartData): Chart {
  const ctx = document.getElementById(canvasId) as HTMLCanvasElement;
  
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Bakery Stakes',
          data: data.bakeryStakes,
          backgroundColor: 'rgba(74, 158, 255, 0.7)',
          borderColor: 'rgba(74, 158, 255, 1)',
          borderWidth: 1,
          stack: 'bakery',
          yAxisID: 'y'
        },
        {
          label: 'Bakery Unstakes',
          data: data.bakeryUnstakes,
          backgroundColor: 'rgba(255, 100, 100, 0.7)',
          borderColor: 'rgba(255, 100, 100, 1)',
          borderWidth: 1,
          stack: 'bakery',
          yAxisID: 'y'
        },
        {
          label: 'Stacy.fi Deposits',
          data: data.stxtzDeposits,
          backgroundColor: 'rgba(160, 160, 160, 0.7)',
          borderColor: 'rgba(160, 160, 160, 1)',
          borderWidth: 1,
          stack: 'stxtz',
          yAxisID: 'y'
        },
        {
          label: 'Stacy.fi Withdrawals',
          data: data.stxtzWithdrawals,
          backgroundColor: 'rgba(255, 150, 150, 0.7)',
          borderColor: 'rgba(255, 150, 150, 1)',
          borderWidth: 1,
          stack: 'stxtz',
          yAxisID: 'y'
        },
        {
          label: 'Stacy.fi Balance',
          data: data.stxtzBalance,
          type: 'line',
          borderColor: 'rgba(255, 165, 0, 1)',
          backgroundColor: 'rgba(255, 165, 0, 0.1)',
          borderWidth: 2,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: 'yBalance'
        },
        {
          label: 'Bakery Balance',
          data: data.bakeryBalance,
          type: 'line',
          borderColor: 'rgba(74, 200, 255, 1)',
          backgroundColor: 'rgba(74, 200, 255, 0.1)',
          borderWidth: 2,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: 'yBalance'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#808080',
            font: { size: 11 },
            boxWidth: 12,
            padding: 12
          }
        },
        title: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = Math.abs(context.raw as number);
              return `${context.dataset.label}: ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} ꜩ`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: '#555',
            font: { size: 10 },
            maxRotation: 45
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.03)'
          }
        },
        y: {
          stacked: true,
          position: 'left',
          beginAtZero: true,
          ticks: {
            color: '#555',
            font: { size: 10 },
            callback: (value) => {
              const num = Number(value);
              if (Math.abs(num) >= 1000000) {
                return `${(num / 1000000).toFixed(1)}M`;
              } else if (Math.abs(num) >= 1000) {
                return `${(num / 1000).toFixed(0)}K`;
              }
              return num.toString();
            }
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.03)'
          }
        },
        yBalance: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          min: 0,
          ticks: {
            color: '#888',
            font: { size: 10 },
            callback: (value) => {
              const num = Number(value);
              if (Math.abs(num) >= 1000000) {
                return `${(num / 1000000).toFixed(1)}M`;
              } else if (Math.abs(num) >= 1000) {
                return `${(num / 1000).toFixed(0)}K`;
              }
              return num.toString();
            }
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });
}
