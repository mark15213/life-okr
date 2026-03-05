'use client';

import { useState } from 'react';
import { getProgressToNextLevel } from '@/lib/wealth-levels';

interface PushupCardProps {
  balance: number;
  cigarettes: number;
  exercises: number;
  onCigarette: () => Promise<void>;
  onExercise: () => Promise<void>;
}

export default function PushupCard({
  balance,
  cigarettes,
  exercises,
  onCigarette,
  onExercise,
}: PushupCardProps) {
  const [loading, setLoading] = useState(false);

  const handleCigarette = async () => {
    setLoading(true);
    await onCigarette();
    setLoading(false);
  };

  const handleExercise = async () => {
    setLoading(true);
    await onExercise();
    setLoading(false);
  };

  const { current, next, progress, remaining } = getProgressToNextLevel(balance);
  const redeemableAmount = balance < 0 ? Math.abs(balance) : 0;

  return (
    <div
      className={`relative rounded-3xl p-8 bg-gradient-to-br ${current.theme.gradient} border-4 ${current.theme.border} shadow-2xl ${current.theme.glow} transition-all duration-500`}
    >
      {/* Level Badge */}
      <div className="absolute -top-4 -right-4 bg-white rounded-full px-6 py-3 shadow-lg border-4 border-white">
        <span className="text-3xl">{current.emoji}</span>
        <span className="ml-2 font-bold text-gray-800">{current.name}</span>
      </div>

      {/* Balance Display */}
      <div className="text-center mb-6">
        <h2 className="text-white text-xl font-semibold mb-2">俯卧撑余额</h2>
        <div className="text-6xl font-bold text-white mb-2 animate-bounce">
          {balance}
        </div>
        {redeemableAmount > 0 && (
          <div className="text-2xl text-yellow-300 font-semibold animate-pulse">
            💰 可兑换 ¥{redeemableAmount}
          </div>
        )}
      </div>

      {/* Progress to Next Level */}
      {next && (
        <div className="mb-6">
          <div className="flex justify-between text-white text-sm mb-2">
            <span>距离 {next.emoji} {next.name}</span>
            <span>{Math.abs(remaining)} 俯卧撑</span>
          </div>
          <div className="w-full bg-white/30 rounded-full h-3 overflow-hidden">
            <div
              className="bg-white h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={handleCigarette}
          disabled={loading}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-4 px-6 rounded-2xl shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-2xl mr-2">🚬</span>
          <span>抽烟 +100</span>
        </button>
        <button
          onClick={handleExercise}
          disabled={loading}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-2xl shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-2xl mr-2">💪</span>
          <span>运动 -100</span>
        </button>
      </div>

      {/* Today's Stats */}
      <div className="bg-white/20 rounded-xl p-4 text-white">
        <div className="text-sm font-semibold mb-2">今日记录</div>
        <div className="flex justify-around">
          <div className="text-center">
            <div className="text-2xl font-bold">{cigarettes}</div>
            <div className="text-xs">支烟</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{exercises}</div>
            <div className="text-xs">次运动</div>
          </div>
        </div>
      </div>
    </div>
  );
}
