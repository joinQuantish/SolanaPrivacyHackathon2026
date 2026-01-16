import React, { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

interface Props {
  children: ReactNode;
}

export const WalletProvider: FC<Props> = ({ children }) => {
  // Use a reliable RPC endpoint for mainnet
  // Priority: env var > Alchemy demo > ExtrNode > Ankr
  const endpoint = useMemo(() => {
    const envRpc = import.meta.env.VITE_SOLANA_RPC_URL;
    if (envRpc) return envRpc;

    // Fallback chain of public RPCs
    const rpcs = [
      'https://solana-mainnet.g.alchemy.com/v2/demo',
      'https://solana-mainnet.rpc.extrnode.com',
      'https://rpc.ankr.com/solana',
    ];
    return rpcs[0];
  }, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
