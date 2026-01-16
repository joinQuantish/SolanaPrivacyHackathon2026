/**
 * ProofStatusCard - Displays zkNoir proof status for a batch
 *
 * Shows proof generation progress, verification status, and public inputs
 * Used in the mainnet demo to show zkNoir proof verification
 */

import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { getBatchProofStatus, type BatchProofResponse, type ProofStatus } from '../../api/proof';

interface ProofStatusCardProps {
  batchId: string;
  /** Poll interval in ms (default: 3000) */
  pollInterval?: number;
  /** Stop polling when verified */
  stopOnVerified?: boolean;
  /** Compact mode (less detail) */
  compact?: boolean;
}

export function ProofStatusCard({
  batchId,
  pollInterval = 3000,
  stopOnVerified = true,
  compact = false,
}: ProofStatusCardProps) {
  const [proofData, setProofData] = useState<BatchProofResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Fetch proof status
  const fetchStatus = async () => {
    try {
      const data = await getBatchProofStatus(batchId);
      setProofData(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch proof status');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchStatus();

    const interval = setInterval(async () => {
      const data = await fetchStatus();
      // Stop polling if verified and stopOnVerified is true
      if (stopOnVerified && data?.status === 'verified') {
        clearInterval(interval);
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [batchId, pollInterval, stopOnVerified]);

  // Status display config
  const getStatusConfig = (status: ProofStatus) => {
    switch (status) {
      case 'pending':
        return {
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/30',
          icon: '⏳',
          label: 'Pending',
          description: 'Awaiting batch execution',
        };
      case 'generating':
        return {
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/30',
          icon: '⚙️',
          label: 'Generating',
          description: 'Noir proof being generated...',
        };
      case 'verified':
        return {
          color: 'text-accent-green',
          bgColor: 'bg-accent-green/10',
          borderColor: 'border-accent-green/30',
          icon: '✓',
          label: 'Verified',
          description: 'Distribution proof verified',
        };
      default:
        return {
          color: 'text-obsidian-400',
          bgColor: 'bg-obsidian-700/10',
          borderColor: 'border-obsidian-600',
          icon: '?',
          label: 'Unknown',
          description: 'Status unknown',
        };
    }
  };

  if (isLoading && !proofData) {
    return (
      <Card className="border-obsidian-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-obsidian-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-obsidian-400">Loading proof status...</span>
        </div>
      </Card>
    );
  }

  if (error && !proofData) {
    return (
      <Card className="border-accent-red/30 bg-accent-red/5">
        <span className="text-sm text-accent-red">Error: {error}</span>
      </Card>
    );
  }

  if (!proofData) return null;

  const statusConfig = getStatusConfig(proofData.status);

  // Compact mode
  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${statusConfig.bgColor} ${statusConfig.borderColor} border`}>
        <span className={`text-sm ${statusConfig.color}`}>{statusConfig.icon}</span>
        <span className={`text-sm font-medium ${statusConfig.color}`}>
          zkNoir: {statusConfig.label}
        </span>
        {proofData.proofHash && (
          <span className="text-xs text-obsidian-500 font-mono">
            {proofData.proofHash.slice(0, 8)}...
          </span>
        )}
      </div>
    );
  }

  // Full mode
  return (
    <Card className={`${statusConfig.borderColor} ${statusConfig.bgColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-lg ${statusConfig.color}`}>{statusConfig.icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-obsidian-100">
              zkNoir Proof Status
            </h3>
            <p className={`text-xs ${statusConfig.color}`}>
              {statusConfig.label}: {statusConfig.description}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-obsidian-500 hover:text-obsidian-300"
        >
          {showDetails ? 'Hide' : 'Details'}
        </button>
      </div>

      {/* Proof Hash */}
      {proofData.proofHash && (
        <div className="mb-3">
          <span className="text-xs text-obsidian-500">Proof Hash:</span>
          <p className="text-sm text-obsidian-200 font-mono">
            {proofData.proofHash}
          </p>
        </div>
      )}

      {/* Verification Badge */}
      {proofData.verified && (
        <div className="flex items-center gap-2 p-2 bg-accent-green/20 rounded-lg mb-3">
          <span className="text-accent-green">✓</span>
          <span className="text-sm text-accent-green font-medium">
            Proof Verified - Distribution is correct
          </span>
        </div>
      )}

      {/* Details Section */}
      {showDetails && proofData.status === 'verified' && (
        <div className="space-y-3 border-t border-obsidian-700 pt-3">
          {/* Circuit Info */}
          {proofData.circuitInfo && (
            <div className="text-xs">
              <span className="text-obsidian-500">Circuit:</span>
              <p className="text-obsidian-300">
                {proofData.circuitInfo.name} ({proofData.circuitInfo.type})
              </p>
              <p className="text-obsidian-400 mt-1">
                {proofData.circuitInfo.purpose}
              </p>
            </div>
          )}

          {/* Public Inputs */}
          {proofData.publicInputsExplained && (
            <div className="text-xs">
              <span className="text-obsidian-500">Public Inputs:</span>
              <div className="mt-1 p-2 bg-obsidian-800 rounded font-mono text-obsidian-300">
                <p>Merkle Root: {proofData.publicInputsExplained.merkleRoot}</p>
                <p>Total USDC: {proofData.publicInputsExplained.totalUsdc}</p>
                <p>Total Shares: {proofData.publicInputsExplained.totalShares}</p>
              </div>
            </div>
          )}

          {/* Execution Info */}
          {proofData.executionInfo && (
            <div className="text-xs">
              <span className="text-obsidian-500">Execution:</span>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <div>
                  <span className="text-obsidian-500">USDC Spent</span>
                  <p className="text-obsidian-300">${proofData.executionInfo.actualUsdcSpent}</p>
                </div>
                <div>
                  <span className="text-obsidian-500">Shares</span>
                  <p className="text-obsidian-300">{proofData.executionInfo.actualSharesReceived}</p>
                </div>
                <div>
                  <span className="text-obsidian-500">Fill</span>
                  <p className="text-obsidian-300">{proofData.executionInfo.fillPercentage}%</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* What zkNoir proves */}
      <div className="mt-3 pt-3 border-t border-obsidian-700">
        <p className="text-[10px] text-obsidian-500">
          zkNoir proves the relay distributed shares correctly: each participant received their proportional share based on their order commitment.
        </p>
      </div>
    </Card>
  );
}
