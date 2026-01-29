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
          color: 'text-accent-orange',
          bgColor: 'bg-accent-orange/10',
          borderColor: 'border-accent-orange',
          icon: '⏳',
          label: 'Pending',
          description: 'Awaiting batch execution',
        };
      case 'generating':
        return {
          color: 'text-accent-blue',
          bgColor: 'bg-accent-blue/10',
          borderColor: 'border-accent-blue',
          icon: '⚙️',
          label: 'Generating',
          description: 'Noir proof being generated...',
        };
      case 'verified':
        return {
          color: 'text-accent-green',
          bgColor: 'bg-accent-green/10',
          borderColor: 'border-accent-green',
          icon: '✓',
          label: 'Verified',
          description: 'Distribution proof verified',
        };
      default:
        return {
          color: 'text-qn-gray-400',
          bgColor: 'bg-qn-gray-100',
          borderColor: 'border-qn-gray-300',
          icon: '?',
          label: 'Unknown',
          description: 'Status unknown',
        };
    }
  };

  if (isLoading && !proofData) {
    return (
      <div className="bg-white border-2 border-qn-gray-300 p-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-qn-gray-300 border-t-qn-black animate-spin" />
          <span className="text-sm text-qn-gray-500 font-mono">Loading proof status...</span>
        </div>
      </div>
    );
  }

  if (error && !proofData) {
    return (
      <div className="bg-white border-2 border-accent-red p-3">
        <span className="text-sm text-accent-red font-mono">Error: {error}</span>
      </div>
    );
  }

  if (!proofData) return null;

  const statusConfig = getStatusConfig(proofData.status);

  // Compact mode
  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 ${statusConfig.bgColor} ${statusConfig.borderColor} border-2`}>
        <span className={`text-sm ${statusConfig.color}`}>{statusConfig.icon}</span>
        <span className={`text-sm font-bold uppercase tracking-wider ${statusConfig.color}`}>
          zkNoir: {statusConfig.label}
        </span>
        {proofData.proofHash && (
          <span className="text-xs text-qn-gray-400 font-mono">
            {proofData.proofHash.slice(0, 8)}...
          </span>
        )}
      </div>
    );
  }

  // Full mode
  return (
    <div className={`bg-white ${statusConfig.borderColor} border-2 p-4`} style={{ boxShadow: '2px 2px 0px 0px rgb(13, 13, 13)' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-lg ${statusConfig.color}`}>{statusConfig.icon}</span>
          <div>
            <h3 className="text-sm font-bold text-qn-black uppercase tracking-wide">
              zkNoir Proof Status
            </h3>
            <p className={`text-xs ${statusConfig.color} font-mono`}>
              {statusConfig.label}: {statusConfig.description}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-qn-gray-400 hover:text-qn-black font-bold uppercase"
        >
          {showDetails ? 'Hide' : 'Details'}
        </button>
      </div>

      {/* Proof Hash */}
      {proofData.proofHash && (
        <div className="mb-3">
          <span className="text-xs text-qn-gray-400 font-mono uppercase">Proof Hash:</span>
          <p className="text-sm text-qn-black font-mono">
            {proofData.proofHash}
          </p>
        </div>
      )}

      {/* Verification Badge */}
      {proofData.verified && (
        <div className="flex items-center gap-2 p-2 bg-accent-green/10 border-2 border-accent-green mb-3">
          <span className="text-accent-green font-bold">✓</span>
          <span className="text-sm text-accent-green font-bold uppercase tracking-wider">
            Proof Verified - Distribution is correct
          </span>
        </div>
      )}

      {/* Details Section */}
      {showDetails && proofData.status === 'verified' && (
        <div className="space-y-3 border-t-2 border-qn-black pt-3">
          {/* Circuit Info */}
          {proofData.circuitInfo && (
            <div className="text-xs">
              <span className="text-qn-gray-400 font-mono uppercase">Circuit:</span>
              <p className="text-qn-gray-600 font-mono">
                {proofData.circuitInfo.name} ({proofData.circuitInfo.type})
              </p>
              <p className="text-qn-gray-500 mt-1">
                {proofData.circuitInfo.purpose}
              </p>
            </div>
          )}

          {/* Public Inputs */}
          {proofData.publicInputsExplained && (
            <div className="text-xs">
              <span className="text-qn-gray-400 font-mono uppercase">Public Inputs:</span>
              <div className="mt-1 p-2 bg-qn-gray-100 border border-qn-gray-200 font-mono text-qn-gray-600">
                <p>Merkle Root: {proofData.publicInputsExplained.merkleRoot}</p>
                <p>Total USDC: {proofData.publicInputsExplained.totalUsdc}</p>
                <p>Total Shares: {proofData.publicInputsExplained.totalShares}</p>
              </div>
            </div>
          )}

          {/* Execution Info */}
          {proofData.executionInfo && (
            <div className="text-xs">
              <span className="text-qn-gray-400 font-mono uppercase">Execution:</span>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <div>
                  <span className="text-qn-gray-400 font-mono">USDC Spent</span>
                  <p className="text-qn-black font-bold font-mono">${proofData.executionInfo.actualUsdcSpent}</p>
                </div>
                <div>
                  <span className="text-qn-gray-400 font-mono">Shares</span>
                  <p className="text-qn-black font-bold font-mono">{proofData.executionInfo.actualSharesReceived}</p>
                </div>
                <div>
                  <span className="text-qn-gray-400 font-mono">Fill</span>
                  <p className="text-qn-black font-bold font-mono">{proofData.executionInfo.fillPercentage}%</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* What zkNoir proves */}
      <div className="mt-3 pt-3 border-t border-qn-gray-200">
        <p className="text-[10px] text-qn-gray-400 font-mono uppercase">
          zkNoir proves the relay distributed shares correctly: each participant received their proportional share based on their order commitment.
        </p>
      </div>
    </div>
  );
}
