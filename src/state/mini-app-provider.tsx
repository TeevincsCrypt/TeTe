'use client';

/**
 * Binds the framework-agnostic `lib/` layer to React.
 *
 * Everything under `lib/` is plain TypeScript with no React and no Next.js, so
 * the wallet integration stays testable and reusable. This file is the only
 * place the two meet, and it owns all Mini App session state.
 *
 * Two rules shape the effects below, both from the official pre-ship checklist:
 *   - No approval dialog fires on page load. Waiting for provider injection and
 *     reading consensus/block height/chain id prompt nothing, so they run on
 *     mount. `listAccounts` and `eth_requestAccounts` do prompt, so they only
 *     ever run from a button press.
 *   - Read-only calls are parallelised.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { EVM_DEFAULT_CHAIN_ID, NIMIQ_RPC_URL } from '@/lib/config/env';
import { findChain, normalizeChainId, usdtOn } from '@/lib/evm/chains';
import { readTokenBalance, type TokenBalance } from '@/lib/evm/erc20';
import {
  EvmProviderError,
  isEvmAvailable,
  readChainId,
  readEvmAccounts,
  requestEvmAccounts,
  switchChain,
} from '@/lib/evm/provider';
import { resolveLocale } from '@/lib/host/context';
import {
  getProvider,
  isInsideNimiqPay,
  readAccount,
  readChainStatus,
  requestAccounts,
} from '@/lib/nimiq/provider';
import { NimiqProviderError, type NimiqChainStatus } from '@/lib/nimiq/types';
import type { CapabilityStatus, LoadStatus } from '@/types';

export type HostStatus = 'checking' | 'ready' | 'unavailable';

/**
 * How long to wait for `window.nimiq` before concluding we are not running
 * inside Nimiq Pay. Short on purpose: the host context is injected before page
 * scripts, so this only covers the provider landing a beat late.
 */
const HOST_DETECT_GRACE_MS = 1_500;

interface NimiqState {
  status: LoadStatus;
  address: string | null;
  error: string | null;
  /** True when the user dismissed the Nimiq Pay dialog, rather than a failure. */
  rejected: boolean;
  chain: NimiqChainStatus | null;
  balanceLuna: number | null;
  balanceStatus: CapabilityStatus;
  balanceError: string | null;
}

interface EvmState {
  available: boolean;
  status: LoadStatus;
  address: string | null;
  error: string | null;
  rejected: boolean;
  chainId: string | null;
  usdt: TokenBalance | null;
  usdtStatus: CapabilityStatus;
  usdtError: string | null;
}

interface MiniAppContextValue {
  host: HostStatus;
  locale: string;
  /** Chain TeTe prefers for USDT stakes, from `NEXT_PUBLIC_EVM_DEFAULT_CHAIN_ID`. */
  preferredChainId: string;
  /** True when a Nimiq JSON-RPC endpoint is configured for balance reads. */
  hasNimiqRpc: boolean;
  nimiq: NimiqState;
  evm: EvmState;
  connectNimiq: () => Promise<void>;
  refreshNimiqBalance: () => Promise<void>;
  connectEvm: () => Promise<void>;
  switchToPreferredChain: () => Promise<void>;
}

const initialNimiq: NimiqState = {
  status: 'idle',
  address: null,
  error: null,
  rejected: false,
  chain: null,
  balanceLuna: null,
  balanceStatus: 'idle',
  balanceError: null,
};

const initialEvm: EvmState = {
  available: false,
  status: 'idle',
  address: null,
  error: null,
  rejected: false,
  chainId: null,
  usdt: null,
  usdtStatus: 'idle',
  usdtError: null,
};

const MiniAppContext = createContext<MiniAppContextValue | null>(null);

export function MiniAppProvider({ children }: { children: ReactNode }) {
  // `checking` on both server and first client render, so hydration matches.
  const [host, setHost] = useState<HostStatus>('checking');
  const [locale, setLocale] = useState('en');
  const [nimiq, setNimiq] = useState<NimiqState>(initialNimiq);
  const [evm, setEvm] = useState<EvmState>(initialEvm);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // --- Nimiq: wait for injection, then read node state. Neither prompts. -----
  useEffect(() => {
    let cancelled = false;
    setLocale(resolveLocale());

    if (isInsideNimiqPay()) {
      setHost('ready');
    } else {
      /**
       * `window.nimiqPay` is seeded before page scripts run, so its absence is
       * already strong evidence we are not inside Nimiq Pay. The wallet
       * provider itself can land slightly later though, so give it a short
       * grace period rather than the full `init()` timeout — sitting on a
       * splash screen for ten seconds is the wrong answer for someone who
       * simply opened the URL in a desktop browser.
       */
      const grace = setTimeout(() => {
        if (!cancelled && !isInsideNimiqPay()) setHost('unavailable');
      }, HOST_DETECT_GRACE_MS);

      // If the provider does turn up later, recover to the connected shell.
      getProvider()
        .then(() => {
          if (!cancelled) {
            clearTimeout(grace);
            setHost('ready');
          }
        })
        .catch(() => {
          if (!cancelled) setHost('unavailable');
        });
    }

    getProvider()
      .then(readChainStatus)
      .then((chain) => {
        if (!cancelled) setNimiq((prev) => ({ ...prev, chain }));
      })
      .catch(() => {
        /* Outside Nimiq Pay there is no node state to show. The UI already
           explains that the app must be opened inside Nimiq Pay. */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // --- EVM: detect the injected provider and read non-prompting state. ------
  useEffect(() => {
    let cancelled = false;
    if (!isEvmAvailable()) return;

    setEvm((prev) => ({ ...prev, available: true }));

    Promise.all([readEvmAccounts(), readChainId().catch(() => null)]).then(
      ([accounts, chainId]) => {
        if (cancelled) return;
        setEvm((prev) => ({
          ...prev,
          chainId: chainId ? normalizeChainId(chainId) : prev.chainId,
          // eth_accounts does not prompt: a non-empty result means the user has
          // already authorised this origin in a previous session.
          address: accounts[0] ?? prev.address,
          status: accounts[0] ? 'ready' : prev.status,
        }));
      },
    );

    const provider = window.ethereum;
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = (args[0] as string[] | undefined) ?? [];
      setEvm((prev) => ({
        ...prev,
        address: accounts[0] ?? null,
        status: accounts[0] ? 'ready' : 'idle',
        usdt: null,
        usdtStatus: 'idle',
      }));
    };
    const onChainChanged = (...args: unknown[]) => {
      const chainId = args[0] as string | undefined;
      setEvm((prev) => ({
        ...prev,
        chainId: chainId ? normalizeChainId(chainId) : prev.chainId,
        usdt: null,
        usdtStatus: 'idle',
      }));
    };

    provider?.on?.('accountsChanged', onAccountsChanged);
    provider?.on?.('chainChanged', onChainChanged);

    return () => {
      cancelled = true;
      provider?.removeListener?.('accountsChanged', onAccountsChanged);
      provider?.removeListener?.('chainChanged', onChainChanged);
    };
  }, []);

  const loadNimiqBalance = useCallback(async (address: string) => {
    if (!NIMIQ_RPC_URL) {
      // Not an error: the Mini App provider simply has no balance method, and
      // this deployment has not configured an RPC endpoint to read one from.
      setNimiq((prev) => ({ ...prev, balanceStatus: 'unsupported', balanceLuna: null }));
      return;
    }

    setNimiq((prev) => ({ ...prev, balanceStatus: 'loading', balanceError: null }));
    try {
      const account = await readAccount(address, NIMIQ_RPC_URL);
      if (!mounted.current) return;
      setNimiq((prev) => ({ ...prev, balanceLuna: account.balance, balanceStatus: 'ready' }));
    } catch (cause: unknown) {
      if (!mounted.current) return;
      setNimiq((prev) => ({
        ...prev,
        balanceStatus: 'error',
        balanceError:
          cause instanceof Error ? cause.message : 'Could not read the balance from the RPC node.',
      }));
    }
  }, []);

  const connectNimiq = useCallback(async () => {
    setNimiq((prev) => ({ ...prev, status: 'loading', error: null, rejected: false }));
    try {
      const accounts = await requestAccounts();
      const address = accounts[0];
      if (!address) throw new NimiqProviderError('failed', 'Nimiq Pay returned no account.');

      if (!mounted.current) return;
      setNimiq((prev) => ({ ...prev, status: 'ready', address }));
      setHost('ready');

      // Node state may not have loaded before the user connected; try again now.
      readChainStatus()
        .then((chain) => mounted.current && setNimiq((prev) => ({ ...prev, chain })))
        .catch(() => undefined);

      await loadNimiqBalance(address);
    } catch (cause: unknown) {
      if (!mounted.current) return;
      const rejected = cause instanceof NimiqProviderError && cause.kind === 'rejected';
      setNimiq((prev) => ({
        ...prev,
        status: 'error',
        rejected,
        error: cause instanceof Error ? cause.message : 'Could not connect to Nimiq Pay.',
      }));
    }
  }, [loadNimiqBalance]);

  const refreshNimiqBalance = useCallback(async () => {
    if (nimiq.address) await loadNimiqBalance(nimiq.address);
  }, [loadNimiqBalance, nimiq.address]);

  const loadUsdt = useCallback(async (address: string, chainId: string) => {
    const token = usdtOn(chainId);
    if (!token) {
      // Nimiq's documentation lists no USDT contract for this chain. Report
      // that plainly rather than calling an address we cannot verify.
      setEvm((prev) => ({ ...prev, usdtStatus: 'unsupported', usdt: null, usdtError: null }));
      return;
    }

    setEvm((prev) => ({ ...prev, usdtStatus: 'loading', usdtError: null }));
    try {
      const balance = await readTokenBalance(token, address);
      if (!mounted.current) return;
      setEvm((prev) => ({ ...prev, usdt: balance, usdtStatus: 'ready' }));
    } catch (cause: unknown) {
      if (!mounted.current) return;
      setEvm((prev) => ({
        ...prev,
        usdtStatus: 'error',
        usdtError: cause instanceof Error ? cause.message : 'Could not read the USDT balance.',
      }));
    }
  }, []);

  /**
   * Load the USDT balance whenever we have an address and a chain but no
   * balance yet. This is a read-only `eth_call`, so it never prompts.
   *
   * It covers three cases with one rule: a fresh connect, a returning session
   * where `eth_accounts` already authorised us on mount, and a chain switch
   * (which resets the balance to `idle`, since USDT is a different contract on
   * every chain).
   */
  useEffect(() => {
    if (evm.address && evm.chainId && evm.usdtStatus === 'idle') {
      void loadUsdt(evm.address, evm.chainId);
    }
  }, [evm.address, evm.chainId, evm.usdtStatus, loadUsdt]);

  const connectEvm = useCallback(async () => {
    setEvm((prev) => ({ ...prev, status: 'loading', error: null, rejected: false }));
    try {
      const [accounts, chainId] = [await requestEvmAccounts(), await readChainId()];
      const address = accounts[0];
      if (!address) throw new EvmProviderError('failed', 'Nimiq Pay returned no EVM account.');

      if (!mounted.current) return;
      // The effect above picks the balance up from here.
      setEvm((prev) => ({
        ...prev,
        status: 'ready',
        address,
        chainId: normalizeChainId(chainId),
        usdt: null,
        usdtStatus: 'idle',
      }));
    } catch (cause: unknown) {
      if (!mounted.current) return;
      const rejected = cause instanceof EvmProviderError && cause.kind === 'rejected';
      setEvm((prev) => ({
        ...prev,
        status: 'error',
        rejected,
        error: cause instanceof Error ? cause.message : 'Could not connect to the EVM wallet.',
      }));
    }
  }, []);

  const switchToPreferredChain = useCallback(async () => {
    setEvm((prev) => ({ ...prev, error: null, rejected: false }));
    try {
      await switchChain(EVM_DEFAULT_CHAIN_ID);
      const chainId = normalizeChainId(await readChainId());
      if (!mounted.current) return;
      // Resetting the balance to `idle` re-triggers the load effect above.
      setEvm((prev) => ({ ...prev, chainId, usdt: null, usdtStatus: 'idle' }));
    } catch (cause: unknown) {
      if (!mounted.current) return;
      const error = cause instanceof EvmProviderError ? cause : null;
      const chainName = findChain(EVM_DEFAULT_CHAIN_ID)?.name ?? EVM_DEFAULT_CHAIN_ID;
      setEvm((prev) => ({
        ...prev,
        rejected: error?.kind === 'rejected',
        error:
          error?.kind === 'chain-missing'
            ? `${chainName} is not configured in this wallet.`
            : (cause instanceof Error ? cause.message : 'Could not switch chain.'),
      }));
    }
  }, []);

  const value = useMemo<MiniAppContextValue>(
    () => ({
      host,
      locale,
      preferredChainId: normalizeChainId(EVM_DEFAULT_CHAIN_ID),
      hasNimiqRpc: Boolean(NIMIQ_RPC_URL),
      nimiq,
      evm,
      connectNimiq,
      refreshNimiqBalance,
      connectEvm,
      switchToPreferredChain,
    }),
    [host, locale, nimiq, evm, connectNimiq, refreshNimiqBalance, connectEvm, switchToPreferredChain],
  );

  return <MiniAppContext.Provider value={value}>{children}</MiniAppContext.Provider>;
}

export function useMiniApp(): MiniAppContextValue {
  const context = useContext(MiniAppContext);
  if (!context) throw new Error('useMiniApp must be used inside <MiniAppProvider>.');
  return context;
}
