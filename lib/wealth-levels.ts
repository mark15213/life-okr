export interface WealthLevel {
  name: string;
  emoji: string;
  minBalance: number;
  maxBalance: number;
  theme: {
    gradient: string;
    border: string;
    glow: string;
  };
}

export const WEALTH_LEVELS: WealthLevel[] = [
  {
    name: '小金库',
    emoji: '💰',
    minBalance: 0,
    maxBalance: -500,
    theme: {
      gradient: 'from-amber-600 to-amber-800',
      border: 'border-amber-500',
      glow: 'shadow-amber-500/50',
    },
  },
  {
    name: '储蓄达人',
    emoji: '💎',
    minBalance: -500,
    maxBalance: -1000,
    theme: {
      gradient: 'from-gray-400 to-gray-600',
      border: 'border-gray-400',
      glow: 'shadow-gray-400/50',
    },
  },
  {
    name: '理财高手',
    emoji: '🏆',
    minBalance: -1000,
    maxBalance: -2000,
    theme: {
      gradient: 'from-yellow-400 to-yellow-600',
      border: 'border-yellow-400',
      glow: 'shadow-yellow-400/50',
    },
  },
  {
    name: '财富自由',
    emoji: '👑',
    minBalance: -2000,
    maxBalance: -5000,
    theme: {
      gradient: 'from-purple-500 to-yellow-500',
      border: 'border-purple-400',
      glow: 'shadow-purple-400/50',
    },
  },
  {
    name: '大富翁',
    emoji: '🎰',
    minBalance: -5000,
    maxBalance: -Infinity,
    theme: {
      gradient: 'from-pink-500 via-purple-500 to-blue-500',
      border: 'border-pink-400',
      glow: 'shadow-pink-400/50',
    },
  },
];

export function getWealthLevel(balance: number): WealthLevel {
  // Balance is negative when you can redeem
  for (const level of WEALTH_LEVELS) {
    if (balance <= level.minBalance && balance > level.maxBalance) {
      return level;
    }
  }

  // Default to first level if balance is positive (in debt)
  return WEALTH_LEVELS[0];
}

export function getProgressToNextLevel(balance: number): {
  current: WealthLevel;
  next: WealthLevel | null;
  progress: number;
  remaining: number;
} {
  const current = getWealthLevel(balance);
  const currentIndex = WEALTH_LEVELS.indexOf(current);
  const next = currentIndex < WEALTH_LEVELS.length - 1 ? WEALTH_LEVELS[currentIndex + 1] : null;

  if (!next) {
    return { current, next: null, progress: 100, remaining: 0 };
  }

  const rangeSize = current.minBalance - next.minBalance;
  const progressInRange = current.minBalance - balance;
  const progress = Math.min(100, (progressInRange / rangeSize) * 100);
  const remaining = next.minBalance - balance;

  return { current, next, progress, remaining };
}
